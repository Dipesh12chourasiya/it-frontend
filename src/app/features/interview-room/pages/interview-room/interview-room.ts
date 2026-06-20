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

  // Core component signals
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

  readonly currentUser = this.authService.currentUser;

  private timerInterval: any;
  private currentInterviewId: string | null = null;
  private localStream: MediaStream | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private iceCandidatesQueue: RTCIceCandidateInit[] = [];

  ngOnInit(): void {
    const interviewId = this.route.snapshot.paramMap.get('interviewId');
    if (!interviewId) {
      this.errorMessage.set('Invalid request. No Interview ID specified, sir.');
      this.isLoading.set(false);
      return;
    }

    this.currentInterviewId = interviewId;
    this.startInterviewSession(interviewId);
  }

  ngOnDestroy(): void {
    this.clearTimer();
    this.monitoringService.stopMonitoring();
    this.cleanupWebRTC();

    // Leave socket room and disconnect
    if (this.currentInterviewId) {
      this.socketService.leaveInterview(this.currentInterviewId);
    }
    
    // Clean socket event listeners
    this.socketService.off('trust-score-updated');
    this.socketService.off('peer-joined');
    this.socketService.off('peer-left');
    this.socketService.off('webrtc-offer');
    this.socketService.off('webrtc-answer');
    this.socketService.off('webrtc-ice-candidate');
    this.socketService.off('connect');
    this.socketService.disconnect();
  }

  private async setupLocalMedia(): Promise<void> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      this.localStreamSignal.set(this.localStream);
    } catch (err) {
      console.error('[WebRTC] Camera/Microphone access failed:', err);
      this.errorMessage.set('Access to camera or microphone was denied, sir. Please grant permissions and reload.');
    }
  }

  private setupSignalingListeners(): void {
    // Other peer joined: we are the existing peer, initiate connection
    this.socketService.listen('peer-joined', () => {
      console.log('[WebRTC] Other peer joined. Initiating connection, sir...');
      this.initiateCall();
    });

    // Other peer left: clean up connection, wait for re-join
    this.socketService.listen('peer-left', () => {
      console.log('[WebRTC] Peer left the session.');
      this.remoteStreamSignal.set(null);
      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
      }
      this.iceCandidatesQueue = [];
    });

    // Received offer from peer
    this.socketService.listen<{ offer: RTCSessionDescriptionInit }>('webrtc-offer', async (data) => {
      console.log('[WebRTC] Received offer, creating answer...');
      await this.handleOffer(data.offer);
    });

    // Received answer from peer
    this.socketService.listen<{ answer: RTCSessionDescriptionInit }>('webrtc-answer', async (data) => {
      console.log('[WebRTC] Received answer, establishing WebRTC tunnel...');
      await this.handleAnswer(data.answer);
    });

    // Received ICE candidate
    this.socketService.listen<{ candidate: RTCIceCandidateInit }>('webrtc-ice-candidate', async (data) => {
      await this.handleIceCandidate(data.candidate);
    });
  }

  private createPeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    // Attach local stream tracks to RTCPeerConnection
    if (this.localStream) {
      console.log('[WebRTC Debug] Adding local tracks to connection, sir:', this.localStream.getTracks().map(t => t.kind));
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    } else {
      console.warn('[WebRTC Debug] No local stream available during RTCPeerConnection creation.');
    }

    // Handle incoming stream tracks
    pc.ontrack = (event) => {
      console.log('[WebRTC Debug] Received remote track event:', event.track.kind, 'ID:', event.track.id);
      
      let remoteStream = this.remoteStreamSignal();
      if (!remoteStream) {
        remoteStream = new MediaStream();
      }

      // Add the remote track to our stream if it's not already added
      if (!remoteStream.getTracks().find(t => t.id === event.track.id)) {
        remoteStream.addTrack(event.track);
        
        // Instantiate a new MediaStream to force Angular change detection and DOM video/audio srcObject re-binding
        this.remoteStreamSignal.set(new MediaStream(remoteStream.getTracks()));
        console.log('[WebRTC Debug] Re-bound remote stream with track:', event.track.kind);
        this.debugPeerConnection();
      }
    };

    // Emit ICE candidates to the socket signaling room
    pc.onicecandidate = (event) => {
      if (event.candidate && this.currentInterviewId) {
        this.socketService.emit('webrtc-ice-candidate', {
          interviewId: this.currentInterviewId,
          candidate: event.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC Debug] Connection state changed: ${pc.connectionState}`);
      this.debugPeerConnection();
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.remoteStreamSignal.set(null);
      }
    };

    this.peerConnection = pc;
    return pc;
  }

  private debugPeerConnection(): void {
    if (!this.peerConnection) {
      console.log('[WebRTC Debug] Peer connection is uninitialized.');
      return;
    }
    const senders = this.peerConnection.getSenders();
    console.log('[WebRTC Debug] Senders (Tracks Sent):', senders.map(s => `${s.track?.kind} (enabled: ${s.track?.enabled}, readyState: ${s.track?.readyState})`));
    const receivers = this.peerConnection.getReceivers();
    console.log('[WebRTC Debug] Receivers (Tracks Received):', receivers.map(r => `${r.track?.kind} (enabled: ${r.track?.enabled}, readyState: ${r.track?.readyState})`));
  }

  onScreenShareClick(): void {
    console.log('[UI Action] Screen share button clicked, sir.');
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
    if (this.peerConnection) {
      this.peerConnection.close();
    }

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
      console.error('[WebRTC] Failed to handle offer and answer:', err);
    }
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (this.peerConnection) {
      try {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        await this.processIceCandidatesQueue();
      } catch (err) {
        console.error('[WebRTC] Failed to set remote description from answer:', err);
      }
    }
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this.peerConnection && this.peerConnection.remoteDescription) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('[WebRTC] Error adding ICE candidate:', err);
      }
    } else {
      this.iceCandidatesQueue.push(candidate);
    }
  }

  private async processIceCandidatesQueue(): Promise<void> {
    if (this.peerConnection && this.peerConnection.remoteDescription) {
      while (this.iceCandidatesQueue.length > 0) {
        const candidate = this.iceCandidatesQueue.shift();
        if (candidate) {
          try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error('[WebRTC] Error adding queued ICE candidate:', err);
          }
        }
      }
    }
  }

  toggleMute(): void {
    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      this.isMuted.set(!audioTracks[0]?.enabled);
    }
  }

  toggleCamera(): void {
    if (this.localStream) {
      const videoTracks = this.localStream.getVideoTracks();
      videoTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      this.isCameraOff.set(!videoTracks[0]?.enabled);
    }
  }

  private cleanupWebRTC(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
      this.localStreamSignal.set(null);
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.remoteStreamSignal.set(null);
    this.iceCandidatesQueue = [];
  }

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
            this.startTimer(sessionData.joinedAt);

            // Start browser activity monitoring
            const candidateId = this.currentUser()?._id;
            if (candidateId) {
              this.monitoringService.startMonitoring(interviewId, candidateId);
            }

            // Grab media stream before connecting sockets for seamless call initialization
            await this.setupLocalMedia();

            // Connect socket, initialize signaling listeners and join
            this.socketService.connect();
            this.setupSignalingListeners();

            this.socketService.listen('connect', () => {
              this.connectionStatus.set('Connected');
              this.socketService.joinInterview(interviewId);
            });

            // Listen for trust score updates from the server
            this.socketService.listen<{ candidateId: string; score: number }>('trust-score-updated', (data) => {
              if (data.candidateId === this.currentUser()?._id) {
                this.trustScore.set(data.score);
              }
            });

            // Mirror socket connection state
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
          }
        });
      },
      error: (err) => {
        console.error('Failed to start interview session:', err);
        this.errorMessage.set(err.error?.message || 'Failed to initialize session room.');
        this.isLoading.set(false);
      }
    });
  }

  private startTimer(joinedAt: string): void {
    this.clearTimer();
    const joinedTime = new Date(joinedAt).getTime();

    this.timerInterval = setInterval(() => {
      const now = Date.now();
      const diff = now - joinedTime;

      if (diff < 0) {
        this.elapsedTime.set('00:00:00');
        return;
      }

      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);

      this.elapsedTime.set(
        [String(hrs).padStart(2, '0'), String(mins).padStart(2, '0'), String(secs).padStart(2, '0')].join(':')
      );
    }, 1000);
  }

  private clearTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

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
        this.socketService.disconnect();
        this.router.navigate(['/dashboard']);
      },
      error: () => {
        this.router.navigate(['/dashboard']);
      }
    });
  }
}
