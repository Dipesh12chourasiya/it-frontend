import { Injectable, inject, NgZone, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { TokenService } from './token.service';

export interface CandidateEvent {
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  interviewId: string;
  timestamp: string;
}

export interface MonitoringEventData {
  _id: string;
  interviewId: string;
  candidateId: { _id: string; name: string; email: string; role: string } | string;
  eventType: 'TAB_SWITCH' | 'WINDOW_BLUR' | 'COPY' | 'PASTE' | 'FULLSCREEN_EXIT' | 'NO_FACE' | 'MULTIPLE_FACE' | 'FACE_AWAY';
  timestamp: string;
}

export interface TrustScoreData {
  candidateId: string;
  candidateName: string;
  score: number;
}

/**
 * Derive the Socket.IO server URL from the REST API base URL.
 *
 * Production backend lives at https://interview-guard-ai-api.onrender.com
 * and Socket.IO is served from the same origin — so we strip /api/v1
 * and use the bare origin (protocol + host).
 *
 * Development backend lives at http://localhost:5000
 */
function getSocketUrl(): string {
  const apiUrl = environment.apiUrl; // e.g. "https://…onrender.com/api/v1"
  // Remove trailing /api/v1 (or any /api/vX) to get the bare origin
  const origin = apiUrl.replace(/\/api\/v\d+\/?$/, '');
  console.log(`[Socket] Connecting to: ${origin}`);
  return origin;
}

@Injectable({
  providedIn: 'root',
})
export class SocketService {
  private socket: Socket | null = null;
  private readonly tokenService = inject(TokenService);
  private readonly ngZone = inject(NgZone);

  readonly isConnected = signal<boolean>(false);

  /**
   * Connect to the Socket.IO server with JWT authentication
   */
  connect(): void {
    if (this.socket?.connected) return;

    const token = this.tokenService.getToken();
    if (!token) {
      console.warn('[Socket] No auth token available, skipping connection');
      return;
    }

    const url = getSocketUrl();

    this.ngZone.runOutsideAngular(() => {
      this.socket = io(url, {
        auth: { token },
        // Prefer WebSocket; fall back to long-polling if WSS is unavailable
        transports: ['websocket', 'polling'],
        // Reconnect automatically with exponential back-off
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
      });

      this.socket.on('connect', () => {
        this.ngZone.run(() => this.isConnected.set(true));
        console.log('[Socket] Connected:', this.socket?.id);
      });

      this.socket.on('disconnect', (reason) => {
        this.ngZone.run(() => this.isConnected.set(false));
        console.log('[Socket] Disconnected —', reason);
      });

      this.socket.on('connect_error', (err) => {
        console.error('[Socket] Connection error:', err.message);
      });

      this.socket.io.on('reconnect_attempt', (attempt) => {
        console.log(`[Socket] Reconnection attempt #${attempt}`);
      });

      this.socket.io.on('reconnect', () => {
        console.log('[Socket] Reconnected successfully');
      });
    });
  }

  /**
   * Disconnect from Socket.IO
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected.set(false);
    }
  }

  /**
   * Emit an event to the server
   */
  emit(event: string, data?: any): void {
    if (!this.socket?.connected) {
      console.warn(`[Socket] Cannot emit "${event}" — not connected`);
      return;
    }
    this.socket.emit(event, data);
  }

  /**
   * Listen for an event from the server, running the callback inside Angular zone
   */
  listen<T = any>(event: string, callback: (data: T) => void): void {
    if (!this.socket) {
      console.warn(`[Socket] Cannot listen for "${event}" — not connected`);
      return;
    }
    this.socket.on(event, (data: T) => {
      this.ngZone.run(() => callback(data));
    });
  }

  /**
   * Remove a specific event listener
   */
  off(event: string): void {
    this.socket?.off(event);
  }

  /**
   * Join an interview room
   */
  joinInterview(interviewId: string): void {
    this.emit('join-interview', interviewId);
  }

  /**
   * Leave an interview room
   */
  leaveInterview(interviewId: string): void {
    this.emit('leave-interview', interviewId);
  }
}
