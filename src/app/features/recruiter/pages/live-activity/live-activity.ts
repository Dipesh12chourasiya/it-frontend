import { Component, OnInit, OnDestroy, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SocketService, CandidateEvent, MonitoringEventData } from '../../../../core/services/socket.service';
import { MonitoringService } from '../../../../core/services';
import { InterviewService } from '../../../../core/services';
import { Interview } from '../../../../core/models/interview.model';

interface LiveEvent {
  id: string;
  type: 'candidate-joined' | 'candidate-left' | 'monitoring';
  eventType?: string;
  candidateName: string;
  candidateEmail?: string;
  interviewId: string;
  timestamp: string;
  icon: string;
  color: string;
}

@Component({
  selector: 'app-live-activity',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './live-activity.html',
})
export class LiveActivity implements OnInit, OnDestroy {
  private readonly socketService = inject(SocketService);
  private readonly interviewService = inject(InterviewService);
  private readonly monitoringService = inject(MonitoringService);

  readonly interviews = signal<Interview[]>([]);
  readonly selectedInterviewId = signal<string | null>(null);
  readonly liveEvents = signal<LiveEvent[]>([]);
  readonly isLoading = signal<boolean>(true);

  readonly eventCount = computed(() => this.liveEvents().length);

  private eventIdCounter = 0;

  // Event type display mappings
  private readonly eventMeta: Record<string, { icon: string; color: string; label: string }> = {
    TAB_SWITCH: { icon: '⚠️', color: 'text-warning', label: 'Tab Switch' },
    WINDOW_BLUR: { icon: '🔴', color: 'text-danger', label: 'Window Blur' },
    COPY: { icon: '📋', color: 'text-warning', label: 'Copy Detected' },
    PASTE: { icon: '📝', color: 'text-warning', label: 'Paste Detected' },
    FULLSCREEN_EXIT: { icon: '🖥️', color: 'text-danger', label: 'Fullscreen Exit' },
  };

  ngOnInit(): void {
    this.loadInterviews();
  }

  ngOnDestroy(): void {
    this.cleanupSocket();
  }

  /**
   * Load all recruiter interviews to populate the selector
   */
  private loadInterviews(): void {
    this.interviewService.getInterviews().subscribe({
      next: (res: { data: Interview[] }) => {
        this.interviews.set(res.data);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  /**
   * Select an interview to monitor in real-time
   */
  selectInterview(interviewId: string): void {
    // Leave previous room if any
    this.cleanupSocket();
    this.liveEvents.set([]);

    this.selectedInterviewId.set(interviewId);

    // Connect and join interview room
    this.socketService.connect();

    // Wait for connection, then join and listen
    const tryJoin = () => {
      if (this.socketService.isConnected()) {
        this.socketService.joinInterview(interviewId);
        this.setupListeners();
        this.loadExistingEvents(interviewId);
      } else {
        // Retry after socket connects
        this.socketService.listen('connect', () => {
          this.socketService.joinInterview(interviewId);
          this.setupListeners();
          this.loadExistingEvents(interviewId);
        });
      }
    };

    tryJoin();
  }

  /**
   * Load historical monitoring events from the REST API
   */
  private loadExistingEvents(interviewId: string): void {
    this.monitoringService.getEvents(interviewId).subscribe({
      next: (res) => {
        const historical: LiveEvent[] = res.data.map((ev: any) => {
          const meta = this.eventMeta[ev.eventType] || { icon: '❓', color: 'text-text-muted', label: ev.eventType };
          const candidateName = typeof ev.candidateId === 'object' ? ev.candidateId.name : 'Unknown';
          return {
            id: `hist-${this.eventIdCounter++}`,
            type: 'monitoring' as const,
            eventType: meta.label,
            candidateName,
            interviewId: ev.interviewId,
            timestamp: ev.timestamp,
            icon: meta.icon,
            color: meta.color,
          };
        });
        this.liveEvents.update((prev) => [...historical, ...prev]);
      },
    });
  }

  /**
   * Subscribe to real-time socket events
   */
  private setupListeners(): void {
    this.socketService.listen<CandidateEvent>('candidate-joined', (data) => {
      this.pushEvent({
        id: `live-${this.eventIdCounter++}`,
        type: 'candidate-joined',
        candidateName: data.candidateName,
        candidateEmail: data.candidateEmail,
        interviewId: data.interviewId,
        timestamp: data.timestamp,
        icon: '🟢',
        color: 'text-success',
      });
    });

    this.socketService.listen<CandidateEvent>('candidate-left', (data) => {
      this.pushEvent({
        id: `live-${this.eventIdCounter++}`,
        type: 'candidate-left',
        candidateName: data.candidateName,
        candidateEmail: data.candidateEmail,
        interviewId: data.interviewId,
        timestamp: data.timestamp,
        icon: '🔴',
        color: 'text-danger',
      });
    });

    this.socketService.listen<MonitoringEventData>('monitoring-event', (data) => {
      const meta = this.eventMeta[data.eventType] || { icon: '❓', color: 'text-text-muted', label: data.eventType };
      const candidateName = typeof data.candidateId === 'object' ? data.candidateId.name : 'Unknown';
      this.pushEvent({
        id: `live-${this.eventIdCounter++}`,
        type: 'monitoring',
        eventType: meta.label,
        candidateName,
        interviewId: typeof data.interviewId === 'string' ? data.interviewId : '',
        timestamp: data.timestamp,
        icon: meta.icon,
        color: meta.color,
      });
    });
  }

  private pushEvent(event: LiveEvent): void {
    // Prepend (newest first), cap at 100 events
    this.liveEvents.update((prev) => [event, ...prev].slice(0, 100));
  }

  private cleanupSocket(): void {
    const prevId = this.selectedInterviewId();
    if (prevId) {
      this.socketService.leaveInterview(prevId);
    }
    this.socketService.off('candidate-joined');
    this.socketService.off('candidate-left');
    this.socketService.off('monitoring-event');
    this.socketService.off('connect');
  }

  getEventLabel(event: LiveEvent): string {
    switch (event.type) {
      case 'candidate-joined':
        return `${event.candidateName} joined the interview`;
      case 'candidate-left':
        return `${event.candidateName} left the interview`;
      case 'monitoring':
        return `${event.candidateName} — ${event.eventType}`;
      default:
        return 'Unknown event';
    }
  }

  clearEvents(): void {
    this.liveEvents.set([]);
  }
}
