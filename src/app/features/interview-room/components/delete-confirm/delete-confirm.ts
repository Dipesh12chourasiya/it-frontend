import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-delete-confirm',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './delete-confirm.html',
  styleUrl: './delete-confirm.css',
})
export class DeleteConfirm {
  @Input() open = false;
  @Input() isSubmitting = false;
  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();

  onOverlayClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('dc-overlay')) {
      this.close.emit();
    }
  }
}
