import {
  Component,
  OnInit,
  OnDestroy,
  Output,
  EventEmitter,
  Input,
  ViewChild,
  AfterViewInit,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-whiteboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './whiteboard.html',
  styleUrl: './whiteboard.css',
})
export class Whiteboard implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @Input() initialData: Record<string, any> = {};
  @Output() whiteboardChange = new EventEmitter<Record<string, any>>();

  private ctx: CanvasRenderingContext2D | null = null;
  private isDrawing = false;

  // Start coordinates — set on mousedown, never changed during drag
  private startX = 0;
  private startY = 0;

  // Current coordinates — updated on mousemove
  private currentX = 0;
  private currentY = 0;

  currentTool = 'pen';
  currentColor = '#ffffff';
  currentSize = 3;

  private elements: DrawElement[] = [];
  private redoStack: DrawElement[] = [];
  private currentPath: DrawElement | null = null;
  private rafId: number | null = null;
  private needsPreviewRedraw = false;

  // Text input state
  showTextInput = false;
  textInputX = 0;
  textInputY = 0;
  textInputValue = '';

  readonly tools = [
    { id: 'pen', icon: '✏️', label: 'Pen' },
    { id: 'text', icon: 'T', label: 'Text' },
    { id: 'arrow', icon: '→', label: 'Arrow' },
    { id: 'rect', icon: '□', label: 'Rectangle' },
    { id: 'circle', icon: '○', label: 'Circle' },
    { id: 'eraser', icon: '⌫', label: 'Eraser' },
  ];

  readonly colors = ['#ffffff', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7'];
  readonly sizes = [2, 3, 5, 8];

  // Bound handlers for cleanup
  private boundMouseDown = this.onMouseDown.bind(this);
  private boundMouseMove = this.onMouseMove.bind(this);
  private boundMouseUp = this.onMouseUp.bind(this);
  private boundTouchStart = this.onTouchStart.bind(this);
  private boundTouchMove = this.onTouchMove.bind(this);
  private boundTouchEnd = this.onTouchEnd.bind(this);
  private boundResize = this.resizeCanvas.bind(this);

  ngOnInit(): void {
    if (this.initialData && this.initialData['elements']) {
      this.elements = this.initialData['elements'];
    }
  }

  ngAfterViewInit(): void {
    this.initCanvas();
    this.redraw();
  }

  ngOnDestroy(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      canvas.removeEventListener('mousedown', this.boundMouseDown);
      canvas.removeEventListener('mousemove', this.boundMouseMove);
      canvas.removeEventListener('mouseup', this.boundMouseUp);
      canvas.removeEventListener('mouseleave', this.boundMouseUp);
      canvas.removeEventListener('touchstart', this.boundTouchStart);
      canvas.removeEventListener('touchmove', this.boundTouchMove);
      canvas.removeEventListener('touchend', this.boundTouchEnd);
    }
    window.removeEventListener('resize', this.boundResize);
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
  }

  private initCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d');
    this.resizeCanvas();

    canvas.addEventListener('mousedown', this.boundMouseDown);
    canvas.addEventListener('mousemove', this.boundMouseMove);
    canvas.addEventListener('mouseup', this.boundMouseUp);
    canvas.addEventListener('mouseleave', this.boundMouseUp);
    canvas.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.boundTouchEnd, { passive: false });
    window.addEventListener('resize', this.boundResize);
  }

  private resizeCanvas(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (parent) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      this.redraw();
    }
  }

  // ─── Mouse Events ──────────────────────────────────────────────────────

  private getCanvasCoords(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  private onMouseDown(e: MouseEvent): void {
    const { x, y } = this.getCanvasCoords(e);

    if (this.currentTool === 'text') {
      // If text input is already showing, ignore further clicks until user submits or cancels
      if (this.showTextInput) return;

      this.showTextInput = true;
      this.textInputX = x;
      this.textInputY = y;

      // Focus the input after Angular renders it
      setTimeout(() => {
        const input = document.querySelector('.text-input-overlay .text-input') as HTMLInputElement;
        if (input) input.focus();
      }, 50);

      return;
    }

    this.isDrawing = true;
    this.startX = x;
    this.startY = y;
    this.currentX = x;
    this.currentY = y;

    if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
      this.currentPath = {
        type: 'path',
        points: [{ x, y }],
        color: this.currentTool === 'eraser' ? '#0f172a' : this.currentColor,
        size: this.currentTool === 'eraser' ? this.currentSize * 5 : this.currentSize,
      };
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isDrawing) return;

    const { x, y } = this.getCanvasCoords(e);
    this.currentX = x;
    this.currentY = y;

    if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
      if (this.currentPath && this.currentPath.points) {
        this.currentPath.points.push({ x, y });

        // Incremental draw — only draw the new segment, no full redraw
        if (this.ctx) {
          const pts = this.currentPath.points;
          const len = pts.length;
          if (len >= 2) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = this.currentPath.color;
            this.ctx.lineWidth = this.currentPath.size;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.moveTo(pts[len - 2].x, pts[len - 2].y);
            this.ctx.lineTo(pts[len - 1].x, pts[len - 1].y);
            this.ctx.stroke();
          }
        }
      }
    } else {
      // Shape preview — schedule a single redraw per frame
      this.needsPreviewRedraw = true;
      if (this.rafId === null) {
        this.rafId = requestAnimationFrame(() => {
          this.rafId = null;
          if (this.needsPreviewRedraw) {
            this.needsPreviewRedraw = false;
            this.redrawWithPreview();
          }
        });
      }
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    const { x, y } = this.getCanvasCoords(e);

    if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
      if (this.currentPath) {
        this.elements.push(this.currentPath);
        this.currentPath = null;
      }
    } else if (this.currentTool === 'rect' || this.currentTool === 'circle' || this.currentTool === 'arrow') {
      // Use startX/startY (mousedown position) — NOT lastX/lastY
      this.elements.push({
        type: this.currentTool as DrawElement['type'],
        x1: this.startX,
        y1: this.startY,
        x2: x,
        y2: y,
        color: this.currentColor,
        size: this.currentSize,
      });
    }

    this.redraw();
    this.emitChange();
  }

  // ─── Touch Events ──────────────────────────────────────────────────────

  private getTouchCoords(e: TouchEvent): { x: number; y: number } {
    const touch = e.touches[0] || e.changedTouches[0];
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
  }

  private onTouchStart(e: TouchEvent): void {
    e.preventDefault();
    const { x, y } = this.getTouchCoords(e);

    if (this.currentTool === 'text') {
      this.showTextInput = true;
      this.textInputX = x;
      this.textInputY = y;
      return;
    }

    this.isDrawing = true;
    this.startX = x;
    this.startY = y;
    this.currentX = x;
    this.currentY = y;

    if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
      this.currentPath = {
        type: 'path',
        points: [{ x, y }],
        color: this.currentTool === 'eraser' ? '#0f172a' : this.currentColor,
        size: this.currentTool === 'eraser' ? this.currentSize * 5 : this.currentSize,
      };
    }
  }

  private onTouchMove(e: TouchEvent): void {
    e.preventDefault();
    if (!this.isDrawing) return;

    const { x, y } = this.getTouchCoords(e);
    this.currentX = x;
    this.currentY = y;

    if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
      if (this.currentPath && this.currentPath.points) {
        this.currentPath.points.push({ x, y });

        if (this.ctx) {
          const pts = this.currentPath.points;
          const len = pts.length;
          if (len >= 2) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = this.currentPath.color;
            this.ctx.lineWidth = this.currentPath.size;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.moveTo(pts[len - 2].x, pts[len - 2].y);
            this.ctx.lineTo(pts[len - 1].x, pts[len - 1].y);
            this.ctx.stroke();
          }
        }
      }
    } else {
      this.needsPreviewRedraw = true;
      if (this.rafId === null) {
        this.rafId = requestAnimationFrame(() => {
          this.rafId = null;
          if (this.needsPreviewRedraw) {
            this.needsPreviewRedraw = false;
            this.redrawWithPreview();
          }
        });
      }
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    if (!this.isDrawing) return;
    this.isDrawing = false;

    const { x, y } = this.getTouchCoords(e);

    if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
      if (this.currentPath) {
        this.elements.push(this.currentPath);
        this.currentPath = null;
      }
    } else if (this.currentTool === 'rect' || this.currentTool === 'circle' || this.currentTool === 'arrow') {
      this.elements.push({
        type: this.currentTool as DrawElement['type'],
        x1: this.startX,
        y1: this.startY,
        x2: x,
        y2: y,
        color: this.currentColor,
        size: this.currentSize,
      });
    }

    this.redraw();
    this.emitChange();
  }

  // ─── Drawing ───────────────────────────────────────────────────────────

  private redraw(): void {
    if (!this.ctx || !this.canvasRef) return;

    const canvas = this.canvasRef.nativeElement;
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const element of this.elements) {
      this.drawElement(element);
    }
  }

  /** Redraw all elements + current shape preview (called via requestAnimationFrame) */
  private redrawWithPreview(): void {
    this.redraw();

    if (!this.isDrawing) return;

    const tool = this.currentTool;
    if (tool === 'rect' || tool === 'circle' || tool === 'arrow') {
      this.drawShape(
        tool,
        this.startX,
        this.startY,
        this.currentX,
        this.currentY,
        this.currentColor,
        this.currentSize
      );
    }
  }

  private drawElement(element: DrawElement): void {
    if (element.type === 'path') {
      this.drawPath(element);
    } else if (element.type === 'text') {
      this.drawText(element);
    } else {
      this.drawShape(
        element.type,
        element.x1!,
        element.y1!,
        element.x2!,
        element.y2!,
        element.color,
        element.size
      );
    }
  }

  private drawShape(
    type: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    size: number
  ): void {
    if (!this.ctx) return;

    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = size;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    if (type === 'rect') {
      const w = x2 - x1;
      const h = y2 - y1;
      this.ctx.strokeRect(x1, y1, w, h);
    } else if (type === 'circle') {
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      this.ctx.beginPath();
      this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      this.ctx.stroke();
    } else if (type === 'arrow') {
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();

      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLength = Math.min(20, Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) / 3);
      this.ctx.beginPath();
      this.ctx.moveTo(x2, y2);
      this.ctx.lineTo(
        x2 - headLength * Math.cos(angle - Math.PI / 6),
        y2 - headLength * Math.sin(angle - Math.PI / 6)
      );
      this.ctx.moveTo(x2, y2);
      this.ctx.lineTo(
        x2 - headLength * Math.cos(angle + Math.PI / 6),
        y2 - headLength * Math.sin(angle + Math.PI / 6)
      );
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  private drawPath(element: DrawElement): void {
    if (!this.ctx || !element.points || element.points.length < 2) return;

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.strokeStyle = element.color;
    this.ctx.lineWidth = element.size;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.ctx.moveTo(element.points[0].x, element.points[0].y);
    for (let i = 1; i < element.points.length; i++) {
      this.ctx.lineTo(element.points[i].x, element.points[i].y);
    }
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawText(element: DrawElement): void {
    if (!this.ctx || !element.text) return;

    this.ctx.save();
    this.ctx.fillStyle = element.color;
    this.ctx.font = `${element.size}px sans-serif`;
    this.ctx.fillText(element.text, element.x1!, element.y1!);
    this.ctx.restore();
  }

  // ─── Public API ────────────────────────────────────────────────────────

  selectTool(toolId: string): void {
    this.currentTool = toolId;
  }

  selectColor(color: string): void {
    this.currentColor = color;
  }

  selectSize(size: number): void {
    this.currentSize = size;
  }

  addText(): void {
    if (this.textInputValue.trim()) {
      this.elements.push({
        type: 'text',
        x1: this.textInputX,
        y1: this.textInputY,
        text: this.textInputValue,
        color: this.currentColor,
        size: this.currentSize * 5,
      });
      this.textInputValue = '';
      this.showTextInput = false;
      this.redraw();
      this.emitChange();
    }
  }

  undo(): void {
    if (this.elements.length > 0) {
      this.redoStack.push(this.elements.pop()!);
      this.redraw();
      this.emitChange();
    }
  }

  redo(): void {
    if (this.redoStack.length > 0) {
      this.elements.push(this.redoStack.pop()!);
      this.redraw();
      this.emitChange();
    }
  }

  clearCanvas(): void {
    this.elements = [];
    this.redoStack = [];
    this.redraw();
    this.emitChange();
  }

  updateFromExternal(data: Record<string, any>): void {
    if (data && data['elements']) {
      this.elements = data['elements'];
      this.redraw();
    }
  }

  getData(): Record<string, any> {
    return { elements: this.elements };
  }

  private emitChange(): void {
    this.whiteboardChange.emit({ elements: this.elements });
  }
}

interface DrawElement {
  type: 'path' | 'rect' | 'circle' | 'arrow' | 'text';
  points?: { x: number; y: number }[];
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  text?: string;
  color: string;
  size: number;
}
