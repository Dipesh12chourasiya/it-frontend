import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionService } from '../../../../core/services/session.service';
import { AuthService } from '../../../../core/services/auth.service';
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

  // Core component signals
  readonly isLoading = signal<boolean>(true);
  readonly errorMessage = signal<string | null>(null);
  readonly session = signal<Session | null>(null);
  readonly interview = signal<Interview | null>(null);
  readonly elapsedTime = signal<string>('00:00:00');
  readonly connectionStatus = signal<string>('Connected');
  readonly trustScore = signal<number>(100);

  readonly currentUser = this.authService.currentUser;

  private timerInterval: any;

  ngOnInit(): void {
    const interviewId = this.route.snapshot.paramMap.get('interviewId');
    if (!interviewId) {
      this.errorMessage.set('Invalid request. No Interview ID specified, sir.');
      this.isLoading.set(false);
      return;
    }

    this.startInterviewSession(interviewId);
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  /**
   * Triggers the start of an interview session on the backend
   */
  private startInterviewSession(interviewId: string): void {
    this.sessionService.startSession(interviewId).subscribe({
      next: (res) => {
        this.session.set(res.data);
        
        // Fetch full interview details so we have title/description
        this.sessionService.getSessionById(res.data._id).subscribe({
          next: (detailsRes) => {
            const sessionData = detailsRes.data;
            if (typeof sessionData.interviewId !== 'string') {
              this.interview.set(sessionData.interviewId as Interview);
            }
            this.startTimer(sessionData.joinedAt);
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

  /**
   * Initializes the visual clock timer
   */
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

      const formatted = [
        String(hrs).padStart(2, '0'),
        String(mins).padStart(2, '0'),
        String(secs).padStart(2, '0')
      ].join(':');

      this.elapsedTime.set(formatted);
    }, 1000);
  }

  private clearTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  /**
   * Leaves the active interview session, updating status on backend
   */
  leaveInterview(): void {
    const activeSession = this.session();
    if (!activeSession) {
      this.router.navigate(['/dashboard']);
      return;
    }

    this.isLoading.set(true);
    this.sessionService.endSession(activeSession._id).subscribe({
      next: () => {
        this.clearTimer();
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        console.error('Failed to end session gracefully:', err);
        // Fallback to dashboard regardless
        this.router.navigate(['/dashboard']);
      }
    });
  }
}
