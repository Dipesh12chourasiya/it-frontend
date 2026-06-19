import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { InterviewService } from '../../../../core/services/interview.service';
import { Interview } from '../../../../core/models/interview.model';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-interview-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './interview-detail.html',
  styleUrl: './interview-detail.css',
})
export class InterviewDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly interviewService = inject(InterviewService);

  readonly interview = signal<Interview | null>(null);
  readonly isLoading = signal(false);
  readonly isUpdating = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadInterview(id);
    } else {
      this.errorMessage.set('Invalid interview ID, sir.');
    }
  }

  loadInterview(id: string): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.interviewService.getInterviewById(id).subscribe({
      next: (response) => {
        this.interview.set(response.data);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to fetch interview details.');
      }
    });
  }

  updateStatus(newStatus: any): void {
    const current = this.interview();
    if (!current) return;

    this.isUpdating.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.interviewService.updateInterview(current._id, { status: newStatus }).subscribe({
      next: (response) => {
        this.interview.set(response.data);
        this.isUpdating.set(false);
        this.successMessage.set('Interview status updated successfully, sir.');
        setTimeout(() => this.successMessage.set(null), 3000);
      },
      error: (err) => {
        this.isUpdating.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to update interview status.');
      }
    });
  }

  copyCode(code: string): void {
    navigator.clipboard.writeText(code).then(() => {
      this.successMessage.set('Access code copied to clipboard, sir.');
      setTimeout(() => this.successMessage.set(null), 3000);
    });
  }
}
