import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../../core/services/auth.service';
import {
  DashboardService,
  RecruiterOverviewResponse,
} from '../../../../core/services/dashboard.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dashboardService = inject(DashboardService);

  readonly currentUser = this.authService.currentUser;

  /** Recruiter overview data — null until API responds */
  readonly overview = signal<RecruiterOverviewResponse | null>(null);
  readonly isLoadingOverview = signal(false);

  ngOnInit(): void {
    if (this.currentUser()?.role === 'recruiter') {
      this.loadOverview();
    }
  }

  private loadOverview(): void {
    this.isLoadingOverview.set(true);
    this.dashboardService.getRecruiterOverview().subscribe({
      next: (res) => {
        this.overview.set(res.data);
        this.isLoadingOverview.set(false);
      },
      error: (err) => {
        console.error('[Dashboard] Failed to load overview:', err);
        this.isLoadingOverview.set(false);
      },
    });
  }

  onLogout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  formatTime(timestamp: string | null): string {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  getScoreColor(score: number): string {
    if (score >= 80) return 'text-success';
    if (score >= 50) return 'text-warning';
    return 'text-danger';
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'active': return 'text-success';
      case 'left': return 'text-text-muted';
      case 'completed': return 'text-primary';
      default: return 'text-text-muted';
    }
  }
}
