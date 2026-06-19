import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { InterviewService } from '../../../../core/services/interview.service';
import { Interview } from '../../../../core/models/interview.model';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-join',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './join.html',
  styleUrl: './join.css',
})
export class Join {
  private readonly fb = inject(FormBuilder);
  private readonly interviewService = inject(InterviewService);

  readonly joinForm: FormGroup = this.fb.group({
    interviewCode: ['', [
      Validators.required, 
      Validators.minLength(6), 
      Validators.maxLength(6),
      Validators.pattern('^[a-zA-Z0-9]+$')
    ]]
  });

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly joinedInterview = signal<Interview | null>(null);

  onSubmit(): void {
    if (this.joinForm.invalid) {
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.joinedInterview.set(null);

    const code = this.joinForm.value.interviewCode.toUpperCase().trim();

    this.interviewService.joinInterview(code).subscribe({
      next: (response) => {
        this.joinedInterview.set(response.data);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.error?.message || 'Invalid Interview Code. Please check and try again.');
      }
    });
  }

  resetJoin(): void {
    this.joinedInterview.set(null);
    this.joinForm.reset();
  }
}
