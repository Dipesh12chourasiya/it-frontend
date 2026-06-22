import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { InterviewProblem } from '../../models/problem.model';

@Component({
  selector: 'app-problem-viewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './problem-viewer.html',
  styleUrl: './problem-viewer.css',
})
export class ProblemViewer {
  @Input() problem: InterviewProblem | null = null;
  @Input() isRecruiter: boolean = false;

  get formattedDate(): string {
    if (!this.problem) return '';
    const d = new Date(this.problem.updatedAt);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
