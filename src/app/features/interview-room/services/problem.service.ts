import { Injectable, inject, signal } from '@angular/core';
import { SocketService } from '../../../core/services/socket.service';
import type {
  InterviewProblem,
  CreateProblemPayload,
  UpdateProblemPayload,
  ProblemSyncData,
} from '../models/problem.model';

@Injectable({
  providedIn: 'root',
})
export class ProblemService {
  private readonly socketService = inject(SocketService);

  // ── State signals ──────────────────────────────────────────────────
  readonly currentProblem = signal<InterviewProblem | null>(null);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly notification = signal<string | null>(null);

  private notificationTimer: any = null;

  // ── Socket event listeners ─────────────────────────────────────────

  /**
   * Initialize socket listeners for problem events.
   * Call once when the interview room connects.
   */
  setupListeners(): void {
    // Listen for problem sync (create, update, delete, or initial load)
    this.socketService.listen<ProblemSyncData>('problem:sync', (data) => {
      this.currentProblem.set(data.problem);
      this.loading.set(false);
    });

    // Listen for problem errors
    this.socketService.listen<{ success: boolean; message: string; code?: string }>(
      'problem:error',
      (data) => {
        this.error.set(data.message);
        this.loading.set(false);
        this.showNotification(data.message, 4000);
      }
    );
  }

  /**
   * Clean up socket listeners when leaving the room.
   */
  removeListeners(): void {
    this.socketService.off('problem:sync');
    this.socketService.off('problem:error');
    this.currentProblem.set(null);
    this.error.set(null);
  }

  // ── Actions ────────────────────────────────────────────────────────

  /**
   * Create a new problem. Recruiter only.
   */
  createProblem(payload: Omit<CreateProblemPayload, 'roomId'>, roomId: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.socketService.emit('problem:create', {
      roomId,
      ...payload,
    });
  }

  /**
   * Update the existing problem. Recruiter only.
   */
  updateProblem(payload: Omit<UpdateProblemPayload, 'roomId'>, roomId: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.socketService.emit('problem:update', {
      roomId,
      ...payload,
    });
  }

  /**
   * Delete the current problem. Recruiter only.
   */
  deleteProblem(roomId: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.socketService.emit('problem:delete', { roomId });
  }

  /**
   * Request the latest problem from the server.
   * Called on room join / reconnect for refresh recovery.
   */
  getCurrentProblem(roomId: string): void {
    this.socketService.emit('problem:get', { roomId });
  }

  // ── Notifications ──────────────────────────────────────────────────

  showNotification(message: string, durationMs = 3000): void {
    if (this.notificationTimer) {
      clearTimeout(this.notificationTimer);
    }
    this.notification.set(message);
    this.notificationTimer = setTimeout(() => {
      this.notification.set(null);
    }, durationMs);
  }
}
