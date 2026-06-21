import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReportService } from '../../../../core/services/report.service';
import { DashboardService } from '../../../../core/services/dashboard.service';
import { InterviewReport } from '../../../../core/models/report.model';
import { DashboardCandidate } from '../../../../core/services/dashboard.service';

@Component({
  selector: 'app-report-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './report-detail.html',
  styleUrl: './report-detail.css',
})
export class ReportDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly reportService = inject(ReportService);
  private readonly dashboardService = inject(DashboardService);

  readonly report = signal<InterviewReport | null>(null);
  readonly candidates = signal<DashboardCandidate[]>([]);
  readonly selectedCandidateId = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly isLoadingReport = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly interviewId = signal<string | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('interviewId');
    if (!id) {
      this.errorMessage.set('Invalid interview ID.');
      return;
    }
    this.interviewId.set(id);
    this.loadCandidates(id);
  }

  private loadCandidates(interviewId: string): void {
    this.isLoading.set(true);
    this.dashboardService.getInterviewDashboard(interviewId).subscribe({
      next: (res) => {
        this.candidates.set(res.data.candidates);
        this.isLoading.set(false);

        // Auto-select first candidate if available
        if (res.data.candidates.length > 0) {
          const firstCandidate = res.data.candidates[0];
          const cid = typeof firstCandidate.candidateId === 'object'
            ? (firstCandidate.candidateId as any)._id
            : firstCandidate.candidateId;
          this.selectCandidate(cid);
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load candidates.');
      },
    });
  }

  selectCandidate(candidateId: string): void {
    this.selectedCandidateId.set(candidateId);
    const ivId = this.interviewId();
    if (!ivId) return;

    this.isLoadingReport.set(true);
    this.errorMessage.set(null);

    this.reportService.getInterviewReport(ivId, candidateId).subscribe({
      next: (res) => {
        this.report.set(res.data);
        this.isLoadingReport.set(false);
      },
      error: (err) => {
        this.isLoadingReport.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to generate report.');
      },
    });
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

  getScoreBarColor(score: number): string {
    if (score >= 80) return 'bg-success';
    if (score >= 50) return 'bg-warning';
    return 'bg-danger';
  }

  getCandidateId(candidate: DashboardCandidate): string {
    const id = candidate.candidateId;
    return typeof id === 'object' && id !== null ? (id as any)._id : id;
  }

  exportReport(): void {
    const ivId = this.interviewId();
    const cid = this.selectedCandidateId();
    if (ivId && cid) {
      this.reportService.downloadPdfReport(ivId, cid);
    }
  }
}
