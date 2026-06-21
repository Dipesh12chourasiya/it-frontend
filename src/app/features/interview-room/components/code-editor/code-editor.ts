import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  Output,
  EventEmitter,
  Input,
  inject,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

declare const monaco: any;

@Component({
  selector: 'app-code-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './code-editor.html',
  styleUrl: './code-editor.css',
})
export class CodeEditor implements OnInit, OnDestroy {
  @ViewChild('editorContainer', { static: true }) editorContainer!: ElementRef;
  @Input() initialCode = '';
  @Input() initialLanguage = 'javascript';
  @Output() codeChange = new EventEmitter<string>();
  @Output() languageChange = new EventEmitter<string>();
  @Output() pasteDetected = new EventEmitter<void>();

  private readonly ngZone = inject(NgZone);
  private editor: any = null;
  private isInitialized = false;

  readonly languages = [
    { value: 'javascript', label: 'JavaScript' },
    { value: 'typescript', label: 'TypeScript' },
    { value: 'python', label: 'Python' },
    { value: 'java', label: 'Java' },
    { value: 'cpp', label: 'C++' },
  ];

  selectedLanguage = this.initialLanguage;

  ngOnInit(): void {
    this.loadMonaco();
  }

  ngOnDestroy(): void {
    if (this.editor) {
      this.editor.dispose();
    }
  }

  private loadMonaco(): void {
    const onGotAmdLoader = () => {
      (window as any).require.config({
        paths: { vs: 'assets/monaco/vs' },
      });

      (window as any).require(['vs/editor/editor.main'], () => {
        this.ngZone.run(() => {
          this.initEditor();
        });
      });
    };

    if (!(window as any).require) {
      const loaderScript = document.createElement('script');
      loaderScript.type = 'text/javascript';
      loaderScript.src = 'assets/monaco/vs/loader.js';
      loaderScript.addEventListener('load', onGotAmdLoader);
      document.body.appendChild(loaderScript);
    } else {
      onGotAmdLoader();
    }
  }

  private initEditor(): void {
    if (this.isInitialized) return;

    // Define custom dark theme
    monaco.editor.defineTheme('interviewGuardDark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'C586C0' },
        { token: 'string', foreground: 'CE9178' },
        { token: 'number', foreground: 'B5CEA8' },
        { token: 'type', foreground: '4EC9B0' },
      ],
      colors: {
        'editor.background': '#0f172a',
        'editor.foreground': '#f8fafc',
        'editor.lineHighlightBackground': '#1e293b',
        'editor.selectionBackground': '#6366f140',
        'editorCursor.foreground': '#6366f1',
        'editorLineNumber.foreground': '#64748b',
        'editorLineNumber.activeForeground': '#f8fafc',
      },
    });

    this.editor = monaco.editor.create(this.editorContainer.nativeElement, {
      value: this.initialCode,
      language: this.selectedLanguage,
      theme: 'interviewGuardDark',
      automaticLayout: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      padding: { top: 16, bottom: 16 },
      lineNumbers: 'on',
      renderLineHighlight: 'all',
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      bracketPairColorization: { enabled: true },
    });

    // Listen for content changes
    this.editor.onDidChangeModelContent(() => {
      const code = this.editor.getValue();
      this.codeChange.emit(code);
    });

    // Listen for paste events inside Monaco (it calls preventDefault on native paste)
    this.editor.onDidPaste(() => {
      this.pasteDetected.emit();
    });

    this.isInitialized = true;
  }

  onLanguageChange(lang: string): void {
    this.selectedLanguage = lang;
    if (this.editor) {
      const model = this.editor.getModel();
      monaco.editor.setModelLanguage(model, lang);
    }
    this.languageChange.emit(lang);
  }

  updateCode(code: string): void {
    if (this.editor && this.editor.getValue() !== code) {
      const position = this.editor.getPosition();
      this.editor.setValue(code);
      if (position) {
        this.editor.setPosition(position);
      }
    }
  }
}
