import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnDestroy,
  NgZone,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-split-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './split-panel.html',
  styleUrl: './split-panel.css',
})
export class SplitPanel implements OnDestroy {
  @Input() initialRatio = 50;
  @Output() ratioChange = new EventEmitter<number>();

  private readonly ngZone = inject(NgZone);
  private isDragging = false;

  ratio = 50;
  isResizing = false;

  constructor() {
    this.ratio = this.initialRatio;
  }

  onDividerMouseDown(event: MouseEvent): void {
    event.preventDefault();
    this.isDragging = true;
    this.isResizing = true;

    const container = (event.target as HTMLElement).parentElement;
    if (!container) return;

    this.ngZone.runOutsideAngular(() => {
      const onMove = (e: MouseEvent) => {
        if (!this.isDragging) return;
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = (x / rect.width) * 100;
        this.ratio = Math.min(80, Math.max(20, pct));
      };

      const onUp = () => {
        this.isDragging = false;
        this.isResizing = false;
        this.ratioChange.emit(this.ratio);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  ngOnDestroy(): void {
    this.isDragging = false;
  }
}
