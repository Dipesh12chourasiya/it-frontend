import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { InterviewService } from '../../../../core/services/interview.service';

@Component({
  selector: 'app-create-interview',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './create-interview.html',
  styleUrl: './create-interview.css',
})
export class CreateInterview {
  private readonly fb = inject(FormBuilder);
  private readonly interviewService = inject(InterviewService);
  private readonly router = inject(Router);

  readonly createForm: FormGroup = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    description: ['', [Validators.required, Validators.minLength(5)]],
    startTime: ['', [Validators.required]],
    endTime: ['', [Validators.required]]
  }, { validators: this.dateTimeValidator });

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  onSubmit(): void {
    if (this.createForm.invalid) {
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const formVal = this.createForm.value;
    const payload = {
      title: formVal.title,
      description: formVal.description,
      startTime: new Date(formVal.startTime).toISOString(),
      endTime: new Date(formVal.endTime).toISOString()
    };

    this.interviewService.createInterview(payload).subscribe({
      next: () => {
        this.router.navigate(['/interviews']);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to create interview. Please check inputs.');
      }
    });
  }

  private dateTimeValidator(form: any): { [key: string]: boolean } | null {
    const start = form.get('startTime')?.value;
    const end = form.get('endTime')?.value;
    if (start && end && new Date(end) <= new Date(start)) {
      return { 'invalidDates': true };
    }
    return null;
  }
}
