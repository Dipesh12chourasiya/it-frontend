import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  FaceDetectionResult,
  FaceMonitoringConfig,
  FaceMonitoringEventType,
  FaceDirection,
  DEFAULT_FACE_MONITORING_CONFIG,
} from '../models/face-monitoring.types';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class FaceMonitoringService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/monitoring`;

  private localStream: MediaStream | null = null;
  private analysisInterval: ReturnType<typeof setInterval> | null = null;
  private isActive = false;
  private interviewId: string | null = null;
  private candidateId: string | null = null;
  private config: FaceMonitoringConfig = DEFAULT_FACE_MONITORING_CONFIG;

  // Debounce map to prevent duplicate event spam
  private lastEventTimes: Partial<Record<FaceMonitoringEventType, number>> = {};
  private readonly EVENT_DEBOUNCE_MS = 4000;

  // FaceLandmarker instance (lazy-loaded)
  private faceLandmarker: any = null;
  private isModelLoading = false;
  private modelLoadFailed = false;
  private modelReady = false;

  // Persistent hidden video element for frame capture
  private hiddenVideo: HTMLVideoElement | null = null;

  // Stable reference for RAF-based analysis
  private rafId: number | null = null;
  private lastAnalysisTime = 0;

  /**
   * Start face monitoring using an existing WebRTC MediaStream.
   * Does NOT open a second camera — reuses the stream already active.
   */
  startMonitoring(
    stream: MediaStream,
    interviewId: string,
    candidateId: string,
    config?: Partial<FaceMonitoringConfig>
  ): void {
    if (this.isActive) {
      this.stopMonitoring();
    }

    this.localStream = stream;
    this.interviewId = interviewId;
    this.candidateId = candidateId;
    this.isActive = true;
    this.config = { ...DEFAULT_FACE_MONITORING_CONFIG, ...config };

    this.initHiddenVideo();
    this.loadModel().then(() => {
      if (this.isActive) {
        this.startAnalysisLoop();
      }
    });

    console.log('[FaceMonitoring] Started — analyzing every', this.config.analysisIntervalMs, 'ms');
  }

  /**
   * Stop all face monitoring, release resources.
   */
  stopMonitoring(): void {
    this.isActive = false;

    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.hiddenVideo) {
      this.hiddenVideo.srcObject = null;
      this.hiddenVideo.remove();
      this.hiddenVideo = null;
    }

    this.localStream = null;
    this.interviewId = null;
    this.candidateId = null;
    this.lastEventTimes = {};

    console.log('[FaceMonitoring] Stopped');
  }

  /**
   * Update the active stream reference (e.g., if camera toggled off/on).
   */
  updateStream(stream: MediaStream): void {
    this.localStream = stream;
    if (this.hiddenVideo) {
      this.hiddenVideo.srcObject = stream;
    }
  }

  /**
   * Check if the service is currently running.
   */
  get running(): boolean {
    return this.isActive;
  }

  // ─── Private: Hidden Video Setup ────────────────────────────────────────

  private initHiddenVideo(): void {
    this.hiddenVideo = document.createElement('video');
    this.hiddenVideo.setAttribute('playsinline', '');
    this.hiddenVideo.setAttribute('muted', '');
    this.hiddenVideo.muted = true;
    this.hiddenVideo.style.cssText =
      'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';

    if (this.localStream) {
      this.hiddenVideo.srcObject = this.localStream;
    }

    document.body.appendChild(this.hiddenVideo);

    this.hiddenVideo.play().catch(() => {
      // Autoplay blocked — will retry on next frame
    });
  }

  // ─── Private: Model Loading ─────────────────────────────────────────────

  private async loadModel(): Promise<void> {
    if (this.modelReady || this.modelLoadFailed || this.isModelLoading) {
      return;
    }

    this.isModelLoading = true;

    try {
      const vision = await import('@mediapipe/tasks-vision');
      const { FaceLandmarker, FilesetResolver } = vision;

      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 3,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputFaceBlendshapes: false,
      });

      this.modelReady = true;
      this.isModelLoading = false;
      console.log('[FaceMonitoring] FaceLandmarker model loaded successfully');
    } catch (err) {
      console.error('[FaceMonitoring] Failed to load face landmarker model:', err);
      this.isModelLoading = false;
      this.modelLoadFailed = true;
    }
  }

  // ─── Private: Analysis Loop (interval-based) ────────────────────────────

  private startAnalysisLoop(): void {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
    }

    this.analysisInterval = setInterval(() => {
      if (!this.isActive || !this.localStream || !this.modelReady || !this.hiddenVideo) {
        return;
      }

      this.analyzeFrame();
    }, this.config.analysisIntervalMs);
  }

  private analyzeFrame(): void {
    if (!this.localStream || !this.faceLandmarker || !this.hiddenVideo) {
      return;
    }

    // Check if camera track is active
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack || !videoTrack.enabled) {
      this.reportEvent('NO_FACE', {
        faceCount: 0,
        faceDirection: 'center',
        isNoFace: true,
        isMultipleFaces: false,
        isFaceAway: false,
      });
      return;
    }

    // Ensure video is playing
    if (this.hiddenVideo.readyState < 2) {
      this.hiddenVideo.play().catch(() => {});
      return;
    }

    try {
      const now = performance.now();
      const results = this.faceLandmarker.detectForVideo(this.hiddenVideo, now);
      const result = this.interpretResults(results);
      this.processDetection(result);
    } catch (err) {
      if (this.config.enableLogging) {
        console.warn('[FaceMonitoring] Frame analysis error:', err);
      }
    }
  }

  // ─── Private: Interpret MediaPipe Results ────────────────────────────────

  private interpretResults(results: any): FaceDetectionResult {
    const faceCount = results.faceLandmarks?.length || 0;
    const isNoFace = faceCount === 0;
    const isMultipleFaces = faceCount > 1;

    let faceDirection: FaceDirection = 'center';
    let isFaceAway = false;

    if (faceCount >= 1 && results.faceLandmarks) {
      const landmarks = results.faceLandmarks[0];
      faceDirection = this.determineFaceDirection(landmarks);
      isFaceAway = faceDirection !== 'center';
    }

    return {
      faceCount,
      faceDirection,
      isNoFace,
      isMultipleFaces,
      isFaceAway,
    };
  }

  /**
   * Determine face direction from facial landmarks.
   * Uses nose tip (1) position relative to left/right eye positions
   * to determine if the face is looking away.
   */
  private determineFaceDirection(landmarks: any[]): FaceDirection {
    if (!landmarks || landmarks.length < 468) return 'center';

    // Key landmarks:
    // 1 = nose tip
    // 33 = right eye inner corner
    // 263 = left eye inner corner
    // 0 = forehead center (bridge of nose between brows)
    // 152 = chin

    const noseTip = landmarks[1];
    const rightEyeInner = landmarks[33];
    const leftEyeInner = landmarks[263];
    const forehead = landmarks[0];
    const chin = landmarks[152];

    if (!noseTip || !rightEyeInner || !leftEyeInner || !forehead || !chin) {
      return 'center';
    }

    // Horizontal: nose position relative to center of eyes
    const eyeCenterX = (rightEyeInner.x + leftEyeInner.x) / 2;
    const horizontalOffset = (noseTip.x - eyeCenterX) / (leftEyeInner.x - rightEyeInner.x || 1);

    // Vertical: nose position relative to forehead-chin line
    const verticalOffset = (noseTip.y - (forehead.y + chin.y) / 2) / ((chin.y - forehead.y) || 1);

    const threshold = this.config.gazeThresholdDegrees / 100;

    // Check looking left or right
    if (horizontalOffset < -threshold) return 'right';
    if (horizontalOffset > threshold) return 'left';

    // Check looking down
    if (verticalOffset > threshold) return 'down';

    return 'center';
  }

  // ─── Private: Process Detection & Send Events ───────────────────────────

  private processDetection(result: FaceDetectionResult): void {
    if (result.isNoFace) {
      this.reportEvent('NO_FACE', result);
    } else if (result.isMultipleFaces) {
      this.reportEvent('MULTIPLE_FACE', result);
    } else if (result.isFaceAway) {
      this.reportEvent('FACE_AWAY', result);
    }
  }

  private reportEvent(eventType: FaceMonitoringEventType, details: FaceDetectionResult): void {
    if (!this.interviewId || !this.candidateId) return;

    // Debounce: prevent duplicate events within the window
    const now = Date.now();
    const lastFired = this.lastEventTimes[eventType] ?? 0;
    if (now - lastFired < this.EVENT_DEBOUNCE_MS) {
      return;
    }
    this.lastEventTimes[eventType] = now;

    if (this.config.enableLogging) {
      console.log(`[FaceMonitoring] Event: ${eventType}`, details);
    }

    // Send to backend via existing monitoring API
    this.http
      .post(`${this.baseUrl}/event`, {
        interviewId: this.interviewId,
        candidateId: this.candidateId,
        eventType,
      })
      .subscribe({
        error: (err) =>
          console.error(`[FaceMonitoring] Failed to log ${eventType}:`, err),
      });
  }
}
