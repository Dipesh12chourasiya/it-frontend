import { Component, Input, Output, EventEmitter, inject, signal, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import type { InterviewProblem } from '../../models/problem.model';

@Component({
  selector: 'app-problem-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './problem-modal.html',
  styleUrl: './problem-modal.css',
})
export class ProblemModal implements OnChanges {
  @Input() open = false;
  @Input() existingProblem: InterviewProblem | null = null;
  @Input() isSubmitting = false;
  @Output() close = new EventEmitter<void>();
  @Output() submitForm = new EventEmitter<{ title: string; description: string; examples?: string; constraints?: string }>();

  private readonly fb = inject(FormBuilder);
  readonly form: FormGroup;

  constructor() {
    this.form = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
      description: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(5000)]],
      examples: ['', [Validators.maxLength(5000)]],
      constraints: ['', [Validators.maxLength(3000)]],
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.populateForm();
    }
    if (changes['existingProblem'] && this.existingProblem) {
      this.populateForm();
    }
  }

  private populateForm(): void {
    if (this.existingProblem) {
      this.form.patchValue({
        title: this.existingProblem.title,
        description: this.existingProblem.description,
        examples: this.existingProblem.examples || '',
        constraints: this.existingProblem.constraints || '',
      });
    } else {
      this.form.reset();
    }
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    const { title, description, examples, constraints } = this.form.value;
    this.submitForm.emit({
      title,
      description,
      examples: examples?.trim() || undefined,
      constraints: constraints?.trim() || undefined,
    });
  }

  onOverlayClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) {
      this.close.emit();
    }
  }
}
