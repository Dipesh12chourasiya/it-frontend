import { Component, OnInit, OnDestroy, signal, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionService } from '../../../../core/services/session.service';
import { AuthService } from '../../../../core/services/auth.service';
import { MonitoringService } from '../../../../core/services/monitoring.service';
import { FaceMonitoringService } from '../../../../core/services/face-monitoring.service';
import { SocketService } from '../../../../core/services/socket.service';
import { WorkspaceService, WorkspaceData } from '../../../../core/services/workspace.service';
import { Session } from '../../../../core/models/session.model';
import { Interview } from '../../../../core/models/interview.model';
import { CodeEditor } from '../../components/code-editor/code-editor';
import { Whiteboard } from '../../components/whiteboard/whiteboard';

const SPLIT_RATIO_KEY = 'ig_split_ratio';

export interface Participant {
  id: string;
  name: string;
  role: string;
  stream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  isLocal: boolean;
}

@Component({
  selector: 'app-interview-room',
  standalone: true,
  imports: [CommonModule, CodeEditor, Whiteboard],
  templateUrl: './interview-room.html',
  styleUrl: './interview-room.css',
})
export class InterviewRoom implements OnInit, OnDestroy {
  @ViewChild(CodeEditor) codeEditor!: CodeEditor;
  @ViewChild(Whiteboard) whiteboard!: Whiteboard;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sessionService = inject(SessionService);
  private readonly authService = inject(AuthService);
  private readonly monitoringService = inject(MonitoringService);
  private readonly faceMonitoringService = inject(FaceMonitoringService);
  private readonly socketService = inject(SocketService);
  private readonly workspaceService = inject(WorkspaceService);

  // ─── Core signals ──────────────────────────────────────────────────────
  readonly isLoading = signal<boolean>(true);
  readonly errorMessage = signal<string | null>(null);
  readonly session = signal<Session | null>(null);
  readonly interview = signal<Interview | null>(null);
  readonly elapsedTime = signal<string>('00:00:00');
  readonly connectionStatus = signal<string>('Connecting...');
  readonly trustScore = signal<number>(100);

  // ─── Participant signals ───────────────────────────────────────────────
  readonly participants = signal<Participant[]>([]);

  // ─── WebRTC signals ────────────────────────────────────────────────────
  readonly localStreamSignal = signal<MediaStream | null>(null);
  readonly remoteStreamSignal = signal<MediaStream | null>(null);
  readonly isMuted = signal<boolean>(false);
  readonly isCameraOff = signal<boolean>(false);
  readonly isFullscreen = signal<boolean>(false);

  // ─── Workspace signals ─────────────────────────────────────────────────
  readonly workspaceLanguage = signal<string>('javascript');
  readonly workspaceCode = signal<string>('');
  readonly isSaving = signal<boolean>(false);

  // ─── Split panel ───────────────────────────────────────────────────────
  splitRatio = 50;
  private isDraggingDivider = false;

  readonly currentUser = this.authService.currentUser;

  private timerInterval: any;
  private currentInterviewId: string | null = null;
  private localStream: MediaStream | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private iceCandidatesQueue: RTCIceCandidateInit[] = [];

  // Auto-save
  private autoSaveInterval: any = null;
  private pendingCodeSave: string | null = null;
  private pendingWhiteboardSave: Record<string, any> | null = null;
  private readonly AUTO_SAVE_DEBOUNCE_MS = 3000;

  // ── Code-change debounce ───────────────────────────────────────────────
  // Without this, every single keystroke triggers a socket.emit().
  // On a fast typist that's ~15-20 events/second per client.  The server
  // broadcasts each one to every other peer, who then calls setValue(),
  // which triggers their own onChange, which emits back — an echo storm.
  //
  // Debouncing the outgoing emission means rapid typing batches into a
  // single emit every CODE_EMIT_DEBOUNCE_MS, and the
  // `setValue()` guard in the editor prevents the echo from re-emitting.
  private codeEmitTimer: any = null;
  private readonly CODE_EMIT_DEBOUNCE_MS = 150; // 150 ms — feels instant
  private lastEmittedCode: string = '';

  private fullscreenChangeHandler = () => {
    this.isFullscreen.set(!!document.fullscreenElement);
  };

  ngOnInit(): void {
    const interviewId = this.route.snapshot.paramMap.get('interviewId');
    if (!interviewId) {
      this.errorMessage.set('Invalid request. No Interview ID specified.');
      this.isLoading.set(false);
      return;
    }
    this.currentInterviewId = interviewId;

    const saved = localStorage.getItem(SPLIT_RATIO_KEY);
    if (saved) {
      const val = parseFloat(saved);
      if (!isNaN(val) && val >= 20 && val <= 80) {
        this.splitRatio = val;
      }
    }

    document.addEventListener('fullscreenchange', this.fullscreenChangeHandler);
    this.startInterviewSession(interviewId);
  }

  ngOnDestroy(): void {
    this.clearTimer();
    this.clearCodeEmitTimer();
    this.stopAutoSave();
    this.monitoringService.stopMonitoring();
    this.faceMonitoringService.stopMonitoring();
    this.cleanupWebRTC();

    document.removeEventListener('fullscreenchange', this.fullscreenChangeHandler);
    document.removeEventListener('mousemove', this.onDividerMouseMove);
    document.removeEventListener('mouseup', this.onDividerMouseUp);

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    if (this.currentInterviewId) {
      this.socketService.leaveInterview(this.currentInterviewId);
      this.socketService.emit('workspace-leave', this.currentInterviewId);
    }

    this.socketService.off('trust-score-updated');
    this.socketService.off('peer-joined');
    this.socketService.off('peer-left');
    this.socketService.off('webrtc-offer');
    this.socketService.off('webrtc-answer');
    this.socketService.off('webrtc-ice-candidate');
    this.socketService.off('workspace-sync');
    this.socketService.off('code-change');
    this.socketService.off('whiteboard-change');
    this.socketService.off('connect');
    this.socketService.disconnect();
  }

  // ─── Participant Management ────────────────────────────────────────────

  private addLocalParticipant(): void {
    const user = this.currentUser();
    if (!user) return;

    const p: Participant = {
      id: user._id,
      name: user.name,
      role: user.role,
      stream: this.localStreamSignal(),
      isMuted: false,
      isCameraOff: false,
      isLocal: true,
    };
    this.participants.update(list => [...list.filter(x => !x.isLocal), p]);
  }

  private addRemoteParticipant(name: string, role: string): void {
    // Check if this remote participant already exists to avoid duplicates
    const existing = this.participants().find(p => !p.isLocal && p.name === name);
    if (existing) return;

    const p: Participant = {
      id: `remote-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      role,
      stream: this.remoteStreamSignal(),
      isMuted: false,
      isCameraOff: false,
      isLocal: false,
    };
    this.participants.update(list => [...list, p]);
  }

  private updateLocalParticipantStream(): void {
    this.participants.update(list =>
      list.map(p => p.isLocal ? { ...p, stream: this.localStreamSignal() } : p)
    );
  }

  private updateLocalParticipantMute(): void {
    this.participants.update(list =>
      list.map(p => p.isLocal ? { ...p, isMuted: this.isMuted() } : p)
    );
  }

  private updateLocalParticipantCamera(): void {
    this.participants.update(list =>
      list.map(p => p.isLocal ? { ...p, isCameraOff: this.isCameraOff() } : p)
    );
  }

  private updateRemoteParticipantStream(): void {
    this.participants.update(list =>
      list.map(p => !p.isLocal ? { ...p, stream: this.remoteStreamSignal() } : p)
    );
  }

  private removeRemoteParticipant(name?: string): void {
    if (name) {
      this.participants.update(list => list.filter(p => p.isLocal || p.name !== name));
    } else {
      this.participants.update(list => list.filter(p => p.isLocal));
    }
  }

  // ─── Split Panel Drag ──────────────────────────────────────────────────

  onDividerMouseDown(event: MouseEvent): void {
    event.preventDefault();
    this.isDraggingDivider = true;
    document.addEventListener('mousemove', this.onDividerMouseMove);
    document.addEventListener('mouseup', this.onDividerMouseUp);
  }

  private onDividerMouseMove = (e: MouseEvent): void => {
    if (!this.isDraggingDivider) return;
    const workspaceEl = document.querySelector('.workspace-area') as HTMLElement;
    if (!workspaceEl) return;
    const rect = workspaceEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = (x / rect.width) * 100;
    this.splitRatio = Math.min(80, Math.max(20, pct));
  };

  private onDividerMouseUp = (): void => {
    this.isDraggingDivider = false;
    document.removeEventListener('mousemove', this.onDividerMouseMove);
    document.removeEventListener('mouseup', this.onDividerMouseUp);
    localStorage.setItem(SPLIT_RATIO_KEY, String(this.splitRatio));
  };

  // ─── Media ─────────────────────────────────────────────────────────────

  private async setupLocalMedia(): Promise<void> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      this.localStreamSignal.set(this.localStream);
      this.addLocalParticipant();
      this.setupLocalStreamWatchers();
    } catch (err) {
      console.error('[WebRTC] Camera/Microphone access failed:', err);
      this.errorMessage.set(
        'Access to camera or microphone was denied. Please grant permissions and reload.'
      );
    }
  }

  private setupLocalStreamWatchers(): void {
    this.localStreamSignal.set(this.localStream);
  }

  // ─── WebRTC signaling ──────────────────────────────────────────────────

  private setupSignalingListeners(): void {
    this.socketService.listen<{ userName: string; role: string }>('peer-joined', (data) => {
      console.log(`[WebRTC] Peer joined: ${data.userName} (${data.role}). Initiating call...`);
      this.addRemoteParticipant(data.userName || 'Participant', data.role || 'candidate');
      this.initiateCall();
    });

    this.socketService.listen<{ userName?: string }>('peer-left', (data) => {
      console.log(`[WebRTC] Peer left: ${data?.userName}`);
      this.removeRemoteParticipant(data?.userName);
      this.remoteStreamSignal.set(null);
      this.peerConnection?.close();
      this.peerConnection = null;
      this.iceCandidatesQueue = [];
    });

    this.socketService.listen<{ offer: RTCSessionDescriptionInit; senderId: string; userName?: string; role?: string }>(
      'webrtc-offer',
      async (data) => {
        console.log(`[WebRTC] Offer received from: ${data.userName} (${data.role})`);
        await this.handleOffer(data.offer, data.userName, data.role);
      }
    );

    this.socketService.listen<{ answer: RTCSessionDescriptionInit }>(
      'webrtc-answer',
      async (data) => {
        console.log('[WebRTC] Answer received');
        await this.handleAnswer(data.answer);
      }
    );

    this.socketService.listen<{ candidate: RTCIceCandidateInit }>(
      'webrtc-ice-candidate',
      async (data) => {
        console.log('[WebRTC] ICE candidate received');
        await this.handleIceCandidate(data.candidate);
      }
    );
  }

  private createPeerConnection(): RTCPeerConnection {
    console.log('[WebRTC] Creating new PeerConnection');
    const pc = new RTCPeerConnection({
      // ── ICE servers ─────────────────────────────────────────────────
      // Google STUN is free and covers ~85 % of NAT scenarios.
      // For symmetric NATs (corporate firewalls, some mobile carriers)
      // you MUST add a TURN server.  The free Metered TURN below
      // works for dev/staging; replace with your own for production.
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        // Free Metered TURN (replace with your own for production)
        // https://www.metered.ca/tools/openrelay/
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        {
          urls: 'turns:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
      ],
    });

    if (this.localStream) {
      const tracks = this.localStream.getTracks();
      console.log(`[WebRTC] Adding ${tracks.length} local tracks:`, tracks.map(t => t.kind));
      tracks.forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    } else {
      console.warn('[WebRTC] No local stream available when creating peer connection');
    }

    pc.ontrack = (event) => {
      console.log(`[WebRTC] Track received: ${event.track.kind} (${event.track.id})`);
      let remoteStream = this.remoteStreamSignal();
      if (!remoteStream) remoteStream = new MediaStream();
      if (!remoteStream.getTracks().find((t) => t.id === event.track.id)) {
        remoteStream.addTrack(event.track);
        const newStream = new MediaStream(remoteStream.getTracks());
        this.remoteStreamSignal.set(newStream);
        this.updateRemoteParticipantStream();
        console.log(`[WebRTC] Remote stream now has ${newStream.getTracks().length} tracks`);
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

    pc.onicecandidateerror = (event) => {
      console.warn('[WebRTC] ICE candidate error:', event.errorCode, event.errorText);
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', pc.connectionState);
      if (pc.connectionState === 'disconnected') {
        console.warn('[WebRTC] Peer disconnected — waiting for ICE restart...');
        // Give ICE a moment to recover before tearing down
        setTimeout(() => {
          if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            console.error('[WebRTC] Peer connection failed, cleaning up remote stream');
            this.remoteStreamSignal.set(null);
            this.updateRemoteParticipantStream();
          }
        }, 5000);
      }
      if (pc.connectionState === 'failed') {
        console.error('[WebRTC] Connection failed — cleaning up');
        this.remoteStreamSignal.set(null);
        this.updateRemoteParticipantStream();
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE connection state:', pc.iceConnectionState);
    };

    this.peerConnection = pc;
    return pc;
  }

  private async initiateCall(): Promise<void> {
    console.log('[WebRTC] Initiating call...');
    const pc = this.createPeerConnection();
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('[WebRTC] Offer created and local description set');
      if (this.currentInterviewId) {
        this.socketService.emit('webrtc-offer', {
          interviewId: this.currentInterviewId,
          offer,
        });
        console.log('[WebRTC] Offer sent');
      }
    } catch (err) {
      console.error('[WebRTC] Failed to create offer:', err);
    }
  }

  private async handleOffer(offer: RTCSessionDescriptionInit, senderName?: string, senderRole?: string): Promise<void> {
    console.log(`[WebRTC] Handling offer from: ${senderName} (${senderRole})`);
    this.peerConnection?.close();
    const pc = this.createPeerConnection();

    // Add remote participant if not already present
    if (senderName) {
      const existing = this.participants().find(p => !p.isLocal && p.name === senderName);
      if (!existing) {
        console.log(`[WebRTC] Adding remote participant: ${senderName}`);
        this.addRemoteParticipant(senderName, senderRole || 'candidate');
      }
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      console.log('[WebRTC] Remote description set successfully');
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log('[WebRTC] Answer created and local description set');
      if (this.currentInterviewId) {
        this.socketService.emit('webrtc-answer', {
          interviewId: this.currentInterviewId,
          answer,
        });
        console.log('[WebRTC] Answer sent');
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
    this.participants.set([]);
  }

  // ─── Controls ──────────────────────────────────────────────────────────

  toggleMute(): void {
    if (!this.localStream) return;
    const tracks = this.localStream.getAudioTracks();
    tracks.forEach((t) => (t.enabled = !t.enabled));
    this.isMuted.set(!tracks[0]?.enabled);
    this.updateLocalParticipantMute();
  }

  toggleCamera(): void {
    if (!this.localStream) return;
    const tracks = this.localStream.getVideoTracks();
    tracks.forEach((t) => (t.enabled = !t.enabled));
    this.isCameraOff.set(!tracks[0]?.enabled);
    this.updateLocalParticipantCamera();
  }

  async toggleFullscreen(): Promise<void> {
    if (!document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
        this.isFullscreen.set(true);
      } catch (err) {
        console.error('[Fullscreen] Failed:', err);
      }
    } else {
      try {
        await document.exitFullscreen();
        this.isFullscreen.set(false);
      } catch (err) {
        console.error('[Fullscreen] Failed:', err);
      }
    }
  }

  // ─── Workspace ─────────────────────────────────────────────────────────

  private setupWorkspaceListeners(): void {
    this.socketService.listen<WorkspaceData & { interviewId: string }>(
      'workspace-sync',
      (data) => {
        this.workspaceLanguage.set(data.language);
        this.workspaceCode.set(data.code);
        if (this.codeEditor) {
          this.codeEditor.updateCode(data.code);
        }
        if (this.whiteboard && data.whiteboardData) {
          this.whiteboard.updateFromExternal(data.whiteboardData);
        }
      }
    );

    this.socketService.listen<{
      interviewId: string;
      code: string;
      language: string;
      senderId: string;
      senderSocketId: string;
    }>(
      'code-change',
      (data) => {
        // ── Double-guard echo prevention ──────────────────────────────
        //
        // 1. Server uses `socket.to()` which already excludes the
        //    sender from the broadcast.
        // 2. Client checks senderId as a second safety net against
        //    reconnection race conditions or duplicate events.
        const currentUserId = this.currentUser()?._id;
        if (data.senderId === currentUserId) return;

        console.log(`[CodeSync] Received code-change from ${data.senderId} (${data.code.length} chars)`);

        this.workspaceCode.set(data.code);
        this.workspaceLanguage.set(data.language);
        if (this.codeEditor) {
          this.codeEditor.updateCode(data.code);
        }
      }
    );

    this.socketService.listen<{
      interviewId: string;
      whiteboardData: any;
      senderId: string;
      senderSocketId: string;
    }>(
      'whiteboard-change',
      (data) => {
        if (data.senderId === this.currentUser()?._id) return;
        if (this.whiteboard) {
          this.whiteboard.updateFromExternal(data.whiteboardData);
        }
      }
    );
  }

  private joinWorkspace(): void {
    if (!this.currentInterviewId) return;
    this.socketService.emit('workspace-join', this.currentInterviewId);
    this.setupWorkspaceListeners();
    this.startAutoSave();
  }

  onCodeChange(code: string): void {
    this.workspaceCode.set(code);
    this.pendingCodeSave = code;

    // ── Debounced socket emission ───────────────────────────────────────
    //
    // Rapid typing generates ~15-20 onDidChangeModelContent events per
    // second.  Emitting each one would flood the server and trigger an
    // echo storm (remote peer receives → setValue() → onChange → emit → …).
    //
    // By debouncing to 150ms, a burst of keystrokes becomes ONE socket
    // emit.  The remote peer's editor.updateCode() uses a
    // `_isRemoteUpdate` flag to suppress the onChange echo, breaking the
    // loop entirely.
    //
    // The timer is cleared on each keystroke, so only the LAST keystroke
    // in a burst is actually sent — no stale intermediate states.
    if (this.codeEmitTimer) {
      clearTimeout(this.codeEmitTimer);
    }

    this.codeEmitTimer = setTimeout(() => {
      // Skip if the code hasn't changed since last emit
      if (code === this.lastEmittedCode) return;
      this.lastEmittedCode = code;

      if (this.currentInterviewId) {
        this.socketService.emit('code-change', {
          interviewId: this.currentInterviewId,
          code,
          language: this.workspaceLanguage(),
        });
      }
    }, this.CODE_EMIT_DEBOUNCE_MS);
  }

  /**
   * Called when Monaco Editor fires its onDidPaste event.
   * The global document paste listener is blocked by Monaco calling preventDefault(),
   * so we manually report the paste event from here.
   */
  onCodePaste(): void {
    this.monitoringService.reportEvent('PASTE');
  }

  onLanguageChange(language: string): void {
    this.workspaceLanguage.set(language);
    if (this.currentInterviewId) {
      this.socketService.emit('code-change', {
        interviewId: this.currentInterviewId,
        code: this.workspaceCode(),
        language,
      });
    }
  }

  onWhiteboardChange(data: Record<string, any>): void {
    if (this.currentInterviewId) {
      this.socketService.emit('whiteboard-change', {
        interviewId: this.currentInterviewId,
        whiteboardData: data,
      });
    }
    this.pendingWhiteboardSave = data;
  }

  // ─── Auto-save ─────────────────────────────────────────────────────────

  private startAutoSave(): void {
    this.autoSaveInterval = setInterval(() => {
      this.flushAutoSave();
    }, this.AUTO_SAVE_DEBOUNCE_MS);
  }

  private stopAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
    this.flushAutoSave();
  }

  private flushAutoSave(): void {
    if (!this.currentInterviewId) return;

    const hasCodeChange = this.pendingCodeSave !== null;
    const hasWhiteboardChange = this.pendingWhiteboardSave !== null;
    if (!hasCodeChange && !hasWhiteboardChange) return;

    this.isSaving.set(true);

    const payload: { code?: string; language?: string; whiteboardData?: Record<string, any> } = {};
    if (hasCodeChange) {
      payload.code = this.pendingCodeSave!;
      payload.language = this.workspaceLanguage();
      this.pendingCodeSave = null;
    }
    if (hasWhiteboardChange) {
      payload.whiteboardData = this.pendingWhiteboardSave!;
      this.pendingWhiteboardSave = null;
    }

    this.socketService.emit('workspace-save', {
      interviewId: this.currentInterviewId,
      ...payload,
    });

    setTimeout(() => this.isSaving.set(false), 500);
  }

  // ─── Session initialization ────────────────────────────────────────────

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

            if (typeof sessionData.score === 'number') {
              this.trustScore.set(sessionData.score);
            }

            this.startTimer(sessionData.joinedAt);

            const candidateId = this.currentUser()?._id;
            if (candidateId) {
              this.monitoringService.startMonitoring(interviewId, candidateId);
            }

            await this.setupLocalMedia();

            // Start AI face monitoring using the existing local camera stream
            if (this.localStream && candidateId) {
              this.faceMonitoringService.startMonitoring(
                this.localStream,
                interviewId,
                candidateId
              );
            }

            this.socketService.connect();
            this.setupSignalingListeners();

            this.socketService.listen('connect', () => {
              this.connectionStatus.set('Connected');
              this.socketService.joinInterview(interviewId);
              this.joinWorkspace();
            });

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
              this.joinWorkspace();
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

  // ─── Timer ─────────────────────────────────────────────────────────────

  private startTimer(joinedAt: string): void {
    this.clearTimer();
    const joinedTime = new Date(joinedAt).getTime();
    this.timerInterval = setInterval(() => {
      const diff = Date.now() - joinedTime;
      if (diff < 0) { this.elapsedTime.set('00:00:00'); return; }
      const hrs = Math.floor(diff / 3600000);
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

  private clearCodeEmitTimer(): void {
    if (this.codeEmitTimer) {
      clearTimeout(this.codeEmitTimer);
      this.codeEmitTimer = null;
    }
  }

  // ─── Leave ─────────────────────────────────────────────────────────────

  leaveInterview(): void {
    const activeSession = this.session();
    if (!activeSession) {
      this.router.navigate(['/dashboard']);
      return;
    }

    this.isLoading.set(true);
    this.clearCodeEmitTimer();
    this.stopAutoSave();
    this.monitoringService.stopMonitoring();
    this.faceMonitoringService.stopMonitoring();

    if (this.currentInterviewId) {
      this.socketService.leaveInterview(this.currentInterviewId);
      this.socketService.emit('workspace-leave', this.currentInterviewId);
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

  get trustScoreColor(): string {
    const score = this.trustScore();
    if (score >= 80) return '#22c55e';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
  }

  getParticipantInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }
}
