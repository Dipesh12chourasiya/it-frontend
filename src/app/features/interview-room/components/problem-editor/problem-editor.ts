import { Component, Input, Output, EventEmitter, inject, signal, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ProblemService } from '../../services/problem.service';
import type { InterviewProblem } from '../../models/problem.model';

@Component({
  selector: 'app-problem-editor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './problem-editor.html',
  styleUrl: './problem-editor.css',
})
export class ProblemEditor implements OnInit, OnChanges {
  @Input() roomId: string = '';
  @Input() existingProblem: InterviewProblem | null = null;
  @Output() notification = new EventEmitter<string>();

  private readonly fb = inject(FormBuilder);
  private readonly problemService = inject(ProblemService);

  readonly form: FormGroup;
  readonly isEditing = signal<boolean>(false);
  readonly isSubmitting = signal<boolean>(false);
  readonly showDeleteConfirm = signal<boolean>(false);

  constructor() {
    this.form = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
      description: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(5000)]],
      examples: ['', [Validators.maxLength(5000)]],
      constraints: ['', [Validators.maxLength(3000)]],
    });
  }

  ngOnInit(): void {
    this.populateFormIfEditing();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['existingProblem']) {
      this.populateFormIfEditing();
    }
  }

  private populateFormIfEditing(): void {
    if (this.existingProblem) {
      this.form.patchValue({
        title: this.existingProblem.title,
        description: this.existingProblem.description,
        examples: this.existingProblem.examples || '',
        constraints: this.existingProblem.constraints || '',
      });
      this.isEditing.set(true);
    } else {
      this.form.reset();
      this.isEditing.set(false);
    }
  }

  onSubmit(): void {
    if (this.form.invalid || !this.roomId) return;

    this.isSubmitting.set(true);
    const { title, description, examples, constraints } = this.form.value;

    if (this.isEditing() && this.existingProblem) {
      // Update existing problem
      this.problemService.updateProblem(
        { title, description, examples: examples || undefined, constraints: constraints || undefined },
        this.roomId
      );
      this.notification.emit('Problem updated successfully');
    } else {
      // Create new problem
      this.problemService.createProblem(
        { title, description, examples: examples || undefined, constraints: constraints || undefined },
        this.roomId
      );
      this.notification.emit('Problem shared successfully');
    }

    this.isSubmitting.set(false);
  }

  onDelete(): void {
    if (!this.roomId) return;
    this.problemService.deleteProblem(this.roomId);
    this.showDeleteConfirm.set(false);
    this.notification.emit('Problem deleted successfully');
  }

  onCancel(): void {
    this.form.reset();
    this.isEditing.set(false);
    this.showDeleteConfirm.set(false);
  }
}
