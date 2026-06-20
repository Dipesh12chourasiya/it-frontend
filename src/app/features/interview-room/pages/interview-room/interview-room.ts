import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionService } from '../../../../core/services/session.service';
import { AuthService } from '../../../../core/services/auth.service';
import { MonitoringService } from '../../../../core/services/monitoring.service';
import { SocketService } from '../../../../core/services/socket.service';
import { Session } from '../../../../core/models/session.model';
import { Interview } from '../../../../core/models/interview.model';

@Component({
  selector: 'app-interview-room',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './interview-room.html',
})
export class InterviewRoom implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sessionService = inject(SessionService);
  private readonly authService = inject(AuthService);
  private readonly monitoringService = inject(MonitoringService);
  private readonly socketService = inject(SocketService);

  // Core signals
  readonly isLoading = signal<boolean>(true);
  readonly errorMessage = signal<string | null>(null);
  readonly session = signal<Session | null>(null);
  readonly interview = signal<Interview | null>(null);
  readonly elapsedTime = signal<string>('00:00:00');
  readonly connectionStatus = signal<string>('Connecting...');
  readonly trustScore = signal<number>(100);

  // WebRTC signals
  readonly localStreamSignal = signal<MediaStream | null>(null);
  readonly remoteStreamSignal = signal<MediaStream | null>(null);
  readonly isMuted = signal<boolean>(false);
  readonly isCameraOff = signal<boolean>(false);
  readonly isFullscreen = signal<boolean>(false);

  readonly currentUser = this.authService.currentUser;

  private timerInterval: any;
  private currentInterviewId: string | null = null;
  private localStream: MediaStream | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private iceCandidatesQueue: RTCIceCandidateInit[] = [];

  // Fullscreen change listener reference for cleanup
  private fullscreenChangeHandler = () => {
    this.isFullscreen.set(!!document.fullscreenElement);
  };

  ngOnInit(): void {
    const interviewId = this.route.snapshot.paramMap.get('interviewId');
    if (!interviewId) {
      this.errorMessage.set('Invalid request. No Interview ID specified, sir.');
      this.isLoading.set(false);
      return;
    }
    this.currentInterviewId = interviewId;
    document.addEventListener('fullscreenchange', this.fullscreenChangeHandler);
    this.startInterviewSession(interviewId);
  }

  ngOnDestroy(): void {
    this.clearTimer();
    this.monitoringService.stopMonitoring();
    this.cleanupWebRTC();

    document.removeEventListener('fullscreenchange', this.fullscreenChangeHandler);

    // Exit fullscreen if still active
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    if (this.currentInterviewId) {
      this.socketService.leaveInterview(this.currentInterviewId);
    }

    this.socketService.off('trust-score-updated');
    this.socketService.off('peer-joined');
    this.socketService.off('peer-left');
    this.socketService.off('webrtc-offer');
    this.socketService.off('webrtc-answer');
    this.socketService.off('webrtc-ice-candidate');
    this.socketService.off('connect');
    this.socketService.disconnect();
  }

  // ─── Media ───────────────────────────────────────────────────────────────

  private async setupLocalMedia(): Promise<void> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      this.localStreamSignal.set(this.localStream);
    } catch (err) {
      console.error('[WebRTC] Camera/Microphone access failed:', err);
      this.errorMessage.set(
        'Access to camera or microphone was denied, sir. Please grant permissions and reload.'
      );
    }
  }

  // ─── WebRTC signaling ─────────────────────────────────────────────────────

  private setupSignalingListeners(): void {
    this.socketService.listen('peer-joined', () => {
      console.log('[WebRTC] Peer joined. Initiating call...');
      this.initiateCall();
    });

    this.socketService.listen('peer-left', () => {
      console.log('[WebRTC] Peer left.');
      this.remoteStreamSignal.set(null);
      this.peerConnection?.close();
      this.peerConnection = null;
      this.iceCandidatesQueue = [];
    });

    this.socketService.listen<{ offer: RTCSessionDescriptionInit }>(
      'webrtc-offer',
      async (data) => {
        await this.handleOffer(data.offer);
      }
    );

    this.socketService.listen<{ answer: RTCSessionDescriptionInit }>(
      'webrtc-answer',
      async (data) => {
        await this.handleAnswer(data.answer);
      }
    );

    this.socketService.listen<{ candidate: RTCIceCandidateInit }>(
      'webrtc-ice-candidate',
      async (data) => {
        await this.handleIceCandidate(data.candidate);
      }
    );
  }

  private createPeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    if (this.localStream) {
      console.log(
        '[WebRTC] Adding local tracks:',
        this.localStream.getTracks().map((t) => t.kind)
      );
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    pc.ontrack = (event) => {
      console.log('[WebRTC] Remote track received:', event.track.kind);

      let remoteStream = this.remoteStreamSignal();
      if (!remoteStream) remoteStream = new MediaStream();

      if (!remoteStream.getTracks().find((t) => t.id === event.track.id)) {
        remoteStream.addTrack(event.track);
        this.remoteStreamSignal.set(new MediaStream(remoteStream.getTracks()));
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && this.currentInterviewId) {
        this.socketService.emit('webrtc-ice-candidate', {
          interviewId: this.currentInterviewId,
          candidate: event.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', pc.connectionState);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.remoteStreamSignal.set(null);
      }
    };

    this.peerConnection = pc;
    return pc;
  }

  private async initiateCall(): Promise<void> {
    const pc = this.createPeerConnection();
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (this.currentInterviewId) {
        this.socketService.emit('webrtc-offer', {
          interviewId: this.currentInterviewId,
          offer,
        });
      }
    } catch (err) {
      console.error('[WebRTC] Failed to create offer:', err);
    }
  }

  private async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    this.peerConnection?.close();
    const pc = this.createPeerConnection();
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (this.currentInterviewId) {
        this.socketService.emit('webrtc-answer', {
          interviewId: this.currentInterviewId,
          answer,
        });
      }
      await this.processIceCandidatesQueue();
    } catch (err) {
      console.error('[WebRTC] Failed to handle offer:', err);
    }
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) return;
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      await this.processIceCandidatesQueue();
    } catch (err) {
      console.error('[WebRTC] Failed to set remote description:', err);
    }
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this.peerConnection?.remoteDescription) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('[WebRTC] ICE candidate error:', err);
      }
    } else {
      this.iceCandidatesQueue.push(candidate);
    }
  }

  private async processIceCandidatesQueue(): Promise<void> {
    if (!this.peerConnection?.remoteDescription) return;
    while (this.iceCandidatesQueue.length > 0) {
      const candidate = this.iceCandidatesQueue.shift();
      if (candidate) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('[WebRTC] Queued ICE candidate error:', err);
        }
      }
    }
  }

  private cleanupWebRTC(): void {
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.localStreamSignal.set(null);
    this.peerConnection?.close();
    this.peerConnection = null;
    this.remoteStreamSignal.set(null);
    this.iceCandidatesQueue = [];
  }

  // ─── Controls ─────────────────────────────────────────────────────────────

  toggleMute(): void {
    if (!this.localStream) return;
    const tracks = this.localStream.getAudioTracks();
    tracks.forEach((t) => (t.enabled = !t.enabled));
    this.isMuted.set(!tracks[0]?.enabled);
  }

  toggleCamera(): void {
    if (!this.localStream) return;
    const tracks = this.localStream.getVideoTracks();
    tracks.forEach((t) => (t.enabled = !t.enabled));
    this.isCameraOff.set(!tracks[0]?.enabled);
  }

  async toggleFullscreen(): Promise<void> {
    if (!document.fullscreenElement) {
      const el = document.documentElement;
      try {
        await el.requestFullscreen();
        this.isFullscreen.set(true);
      } catch (err) {
        console.error('[Fullscreen] Failed to enter fullscreen, sir:', err);
      }
    } else {
      try {
        await document.exitFullscreen();
        this.isFullscreen.set(false);
        // FULLSCREEN_EXIT is also fired by the browser's fullscreenchange event
        // which MonitoringService handles. We don't duplicate-report here.
      } catch (err) {
        console.error('[Fullscreen] Failed to exit fullscreen, sir:', err);
      }
    }
  }

  onScreenShareClick(): void {
    console.log('[UI] Screen share clicked — implementation pending, sir.');
  }

  // ─── Session initialization ───────────────────────────────────────────────

  private startInterviewSession(interviewId: string): void {
    this.sessionService.startSession(interviewId).subscribe({
      next: (res) => {
        this.session.set(res.data);

        this.sessionService.getSessionById(res.data._id).subscribe({
          next: async (detailsRes) => {
            const sessionData = detailsRes.data;
            if (typeof sessionData.interviewId !== 'string') {
              this.interview.set(sessionData.interviewId as Interview);
            }

            // Initialise trust score from persisted session value
            if (typeof sessionData.score === 'number') {
              this.trustScore.set(sessionData.score);
            }

            this.startTimer(sessionData.joinedAt);

            // Start monitoring engine
            const candidateId = this.currentUser()?._id;
            if (candidateId) {
              this.monitoringService.startMonitoring(interviewId, candidateId);
            }

            // Setup WebRTC media
            await this.setupLocalMedia();

            // Connect socket + join room
            this.socketService.connect();
            this.setupSignalingListeners();

            this.socketService.listen('connect', () => {
              this.connectionStatus.set('Connected');
              this.socketService.joinInterview(interviewId);
            });

            // Listen for live trust-score updates
            this.socketService.listen<{ candidateId: string; score: number; eventType: string }>(
              'trust-score-updated',
              (data) => {
                if (data.candidateId === this.currentUser()?._id) {
                  this.trustScore.set(data.score);
                }
              }
            );

            if (this.socketService.isConnected()) {
              this.connectionStatus.set('Connected');
              this.socketService.joinInterview(interviewId);
            }

            this.isLoading.set(false);
          },
          error: (err) => {
            console.error('Failed to load session details:', err);
            this.errorMessage.set(err.error?.message || 'Failed to retrieve session details.');
            this.isLoading.set(false);
          },
        });
      },
      error: (err) => {
        console.error('Failed to start session:', err);
        this.errorMessage.set(err.error?.message || 'Failed to initialize session room.');
        this.isLoading.set(false);
      },
    });
  }

  // ─── Timer ────────────────────────────────────────────────────────────────

  private startTimer(joinedAt: string): void {
    this.clearTimer();
    const joinedTime = new Date(joinedAt).getTime();
    this.timerInterval = setInterval(() => {
      const diff = Date.now() - joinedTime;
      if (diff < 0) { this.elapsedTime.set('00:00:00'); return; }
      const hrs  = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      this.elapsedTime.set(
        [hrs, mins, secs].map((n) => String(n).padStart(2, '0')).join(':')
      );
    }, 1000);
  }

  private clearTimer(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  // ─── Leave ────────────────────────────────────────────────────────────────

  leaveInterview(): void {
    const activeSession = this.session();
    if (!activeSession) {
      this.router.navigate(['/dashboard']);
      return;
    }

    this.isLoading.set(true);
    this.monitoringService.stopMonitoring();

    if (this.currentInterviewId) {
      this.socketService.leaveInterview(this.currentInterviewId);
    }

    this.sessionService.endSession(activeSession._id).subscribe({
      next: () => {
        this.clearTimer();
        this.cleanupWebRTC();
        this.socketService.disconnect();
        this.router.navigate(['/dashboard']);
      },
      error: () => this.router.navigate(['/dashboard']),
    });
  }

  // ─── Trust score color helper ─────────────────────────────────────────────

  get trustScoreColor(): string {
    const score = this.trustScore();
    if (score >= 80) return '#22c55e';    // green
    if (score >= 50) return '#f59e0b';    // amber
    return '#ef4444';                      // red
  }
}
