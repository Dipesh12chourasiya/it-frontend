import { Component, signal, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { InterviewService } from '../../../../core/services/interview.service';
import { Interview } from '../../../../core/models/interview.model';

@Component({
  selector: 'app-interviews',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './interviews.html',
  styleUrl: './interviews.css',
})
export class Interviews implements OnInit {
  private readonly interviewService = inject(InterviewService);

  readonly interviews = signal<Interview[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.loadInterviews();
  }

  loadInterviews(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.interviewService.getInterviews().subscribe({
      next: (response) => {
        this.interviews.set(response.data || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load interviews. Please try again.');
      }
    });
  }

  deleteInterview(id: string): void {
    if (!confirm('Are you sure you want to delete this interview, sir?')) {
      return;
    }

    this.interviewService.deleteInterview(id).subscribe({
      next: () => {
        this.interviews.update((list) => list.filter((item) => item._id !== id));
      },
      error: (err) => {
        alert(err.error?.message || 'Failed to delete interview.');
      }
    });
  }

  copyCode(code: string): void {
    navigator.clipboard.writeText(code).then(() => {
      alert('Access code copied to clipboard, sir.');
    });
  }
}
