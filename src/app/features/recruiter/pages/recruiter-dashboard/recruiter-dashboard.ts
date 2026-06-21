import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DashboardService, DashboardCandidate, InterviewDashboardResponse } from '../../../../core/services/dashboard.service';
import { SocketService, CandidateEvent, MonitoringEventData, TrustScoreData } from '../../../../core/services/socket.service';
import { InterviewService } from '../../../../core/services';
import { ReportService } from '../../../../core/services/report.service';
import { Interview } from '../../../../core/models/interview.model';


@Component({
  selector: 'app-recruiter-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './recruiter-dashboard.html',
  styleUrl: './recruiter-dashboard.css',
})
export class RecruiterDashboard implements OnInit, OnDestroy {
  private readonly dashboardService = inject(DashboardService);
  private readonly socketService = inject(SocketService);
  private readonly interviewService = inject(InterviewService);
  private readonly reportService = inject(ReportService);

  readonly interviews = signal<Interview[]>([]);
  readonly selectedInterviewId = signal<string | null>(null);
  readonly dashboardData = signal<InterviewDashboardResponse | null>(null);
  readonly liveEvents = signal<LiveEvent[]>([]);
  readonly isLoading = signal(false);
  readonly isLoadingDashboard = signal(false);
  readonly selectedCandidateId = signal<string | null>(null);

  // Computed values
  readonly selectedInterview = computed(() => {
    const id = this.selectedInterviewId();
    return this.interviews().find(iv => iv._id === id) || null;
  });

  readonly totalEvents = computed(() => {
    const data = this.dashboardData();
    if (!data) return 0;
    return data.candidates.reduce((sum, c) => sum + c.statistics.totalMonitoringEvents, 0);
  });

  readonly onlineCount = computed(() => {
    const data = this.dashboardData();
    if (!data) return 0;
    return data.candidates.filter(c => c.connectionStatus === 'ONLINE').length;
  });

  readonly avgScore = computed(() => {
    const data = this.dashboardData();
    if (!data || data.candidates.length === 0) return 0;
    const total = data.candidates.reduce((sum, c) => sum + c.trustScore, 0);
    return Math.round(total / data.candidates.length);
  });

  private eventIdCounter = 0;
  private refreshInterval: any = null;

  readonly eventMeta: Record<string, { icon: string; color: string; label: string }> = {
    TAB_SWITCH: { icon: '⚠️', color: 'text-warning', label: 'Tab Switch' },
    WINDOW_BLUR: { icon: '🔴', color: 'text-danger', label: 'Window Blur' },
    COPY: { icon: '📋', color: 'text-warning', label: 'Copy Detected' },
    PASTE: { icon: '📝', color: 'text-danger', label: 'Paste Detected' },
    FULLSCREEN_EXIT: { icon: '🖥️', color: 'text-danger', label: 'Fullscreen Exit' },
    DEVTOOLS_OPEN: { icon: '🛠️', color: 'text-danger', label: 'DevTools Opened' },
    NO_FACE: { icon: '👁️', color: 'text-danger', label: 'No Face Detected' },
    MULTIPLE_FACE: { icon: '👥', color: 'text-danger', label: 'Multiple Faces' },
    FACE_AWAY: { icon: '↪️', color: 'text-warning', label: 'Looking Away' },
    CANDIDATE_JOINED: { icon: '🟢', color: 'text-success', label: 'Candidate Joined' },
    CANDIDATE_LEFT: { icon: '🔴', color: 'text-danger', label: 'Candidate Left' },
  };

  ngOnInit(): void {
    this.loadInterviews();
  }

  ngOnDestroy(): void {
    this.cleanupSocket();
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  private loadInterviews(): void {
    this.interviewService.getInterviews().subscribe({
      next: (res) => {
        this.interviews.set(res.data);
      },
      error: (err) => {
        console.error('Failed to load interviews:', err);
      },
    });
  }

  selectInterview(interviewId: string): void {
    this.cleanupSocket();
    this.liveEvents.set([]);
    this.selectedCandidateId.set(null);
    this.selectedInterviewId.set(interviewId);

    this.loadDashboard(interviewId);
    this.connectSocket(interviewId);

    // Auto-refresh every 10 seconds
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    this.refreshInterval = setInterval(() => {
      this.loadDashboard(interviewId);
    }, 10000);
  }

  private loadDashboard(interviewId: string): void {
    this.isLoadingDashboard.set(true);
    this.dashboardService.getInterviewDashboard(interviewId).subscribe({
      next: (res) => {
        this.dashboardData.set(res.data);
        this.isLoadingDashboard.set(false);
      },
      error: (err) => {
        console.error('Failed to load dashboard:', err);
        this.isLoadingDashboard.set(false);
      },
    });
  }

  private connectSocket(interviewId: string): void {
    this.socketService.connect();

    const tryJoin = () => {
      if (this.socketService.isConnected()) {
        this.socketService.joinInterview(interviewId);
        this.setupSocketListeners();
      } else {
        this.socketService.listen('connect', () => {
          this.socketService.joinInterview(interviewId);
          this.setupSocketListeners();
        });
      }
    };

    tryJoin();
  }

  private setupSocketListeners(): void {
    this.socketService.listen<CandidateEvent>('candidate-joined', (data) => {
      this.pushLiveEvent({
        id: `live-${this.eventIdCounter++}`,
        type: 'candidate-joined',
        candidateName: data.candidateName,
        candidateEmail: data.candidateEmail,
        interviewId: data.interviewId,
        timestamp: data.timestamp,
        icon: '🟢',
        color: 'text-success',
        label: `${data.candidateName} joined`,
      });
    });

    this.socketService.listen<CandidateEvent>('candidate-left', (data) => {
      this.pushLiveEvent({
        id: `live-${this.eventIdCounter++}`,
        type: 'candidate-left',
        candidateName: data.candidateName,
        candidateEmail: data.candidateEmail,
        interviewId: data.interviewId,
        timestamp: data.timestamp,
        icon: '🔴',
        color: 'text-danger',
        label: `${data.candidateName} left`,
      });
    });

    this.socketService.listen<MonitoringEventData>('monitoring-event', (data) => {
      const meta = this.eventMeta[data.eventType] || { icon: '❓', color: 'text-text-muted', label: data.eventType };
      const candidateName = typeof data.candidateId === 'object' ? data.candidateId.name : 'Unknown';
      this.pushLiveEvent({
        id: `live-${this.eventIdCounter++}`,
        type: 'monitoring',
        candidateName,
        interviewId: typeof data.interviewId === 'string' ? data.interviewId : '',
        timestamp: data.timestamp,
        icon: meta.icon,
        color: meta.color,
        label: `${candidateName} — ${meta.label}`,
      });
    });

    this.socketService.listen<TrustScoreData & { eventType: string }>('trust-score-updated', (data) => {
      // Update the dashboard data in real-time
      const current = this.dashboardData();
      if (current) {
        const updatedCandidates = current.candidates.map(c => {
          const cId = typeof c.candidateId === 'object' ? (c.candidateId as any)._id : c.candidateId;
          if (cId === data.candidateId) {
            return {
              ...c,
              trustScore: data.score,
              riskLevel: data.score >= 80 ? 'LOW' : data.score >= 50 ? 'MEDIUM' : 'HIGH' as 'LOW' | 'MEDIUM' | 'HIGH',
            };
          }
          return c;
        });
        this.dashboardData.set({ ...current, candidates: updatedCandidates });
      }
    });
  }

  private pushLiveEvent(event: LiveEvent): void {
    this.liveEvents.update(prev => [event, ...prev].slice(0, 100));
  }

  private cleanupSocket(): void {
    const prevId = this.selectedInterviewId();
    if (prevId) {
      this.socketService.leaveInterview(prevId);
    }
    this.socketService.off('candidate-joined');
    this.socketService.off('candidate-left');
    this.socketService.off('monitoring-event');
    this.socketService.off('trust-score-updated');
    this.socketService.off('connect');
  }

  selectCandidate(candidateId: string | null): void {
    this.selectedCandidateId.set(candidateId);
  }

  getRiskColor(riskLevel: string): string {
    switch (riskLevel) {
      case 'LOW': return 'text-success';
      case 'MEDIUM': return 'text-warning';
      case 'HIGH': return 'text-danger';
      default: return 'text-text-muted';
    }
  }

  getRiskBg(riskLevel: string): string {
    switch (riskLevel) {
      case 'LOW': return 'bg-success/10 border-success/20';
      case 'MEDIUM': return 'bg-warning/10 border-warning/20';
      case 'HIGH': return 'bg-danger/10 border-danger/20';
      default: return 'bg-text-muted/10 border-border-default';
    }
  }

  getConnectionColor(status: string): string {
    switch (status) {
      case 'ONLINE': return 'bg-success';
      case 'RECONNECTING': return 'bg-warning';
      case 'OFFLINE': return 'bg-text-muted';
      default: return 'bg-text-muted';
    }
  }

  getConnectionLabel(status: string): string {
    switch (status) {
      case 'ONLINE': return 'Online';
      case 'RECONNECTING': return 'Reconnecting';
      case 'OFFLINE': return 'Offline';
      default: return 'Unknown';
    }
  }

  formatTime(timestamp: string | null): string {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  formatTimeShort(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  getScoreBarWidth(score: number): string {
    return `${score}%`;
  }

  getScoreBarColor(score: number): string {
    if (score >= 80) return 'bg-success';
    if (score >= 50) return 'bg-warning';
    return 'bg-danger';
  }

  refreshDashboard(): void {
    const id = this.selectedInterviewId();
    if (id) {
      this.loadDashboard(id);
    }
  }

  clearLiveEvents(): void {
    this.liveEvents.set([]);
  }

  getCandidateId(candidate: DashboardCandidate): string {
    const id = candidate.candidateId;
    return typeof id === 'object' && id !== null ? (id as any)._id : id;
  }

  downloadPdf(candidate: DashboardCandidate, event: Event): void {
    event.stopPropagation();
    const interviewId = this.selectedInterviewId();
    const candidateId = this.getCandidateId(candidate);
    if (interviewId && candidateId) {
      this.reportService.downloadPdfReport(interviewId, candidateId);
    }
  }
}

interface LiveEvent {
  id: string;
  type: 'candidate-joined' | 'candidate-left' | 'monitoring';
  candidateName: string;
  candidateEmail?: string;
  interviewId: string;
  timestamp: string;
  icon: string;
  color: string;
  label: string;
}
