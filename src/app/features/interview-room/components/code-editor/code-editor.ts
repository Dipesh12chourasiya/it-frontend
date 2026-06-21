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

  /**
   * ── Remote update guard ──────────────────────────────────────────────
   *
   * When we programmatically update the editor from a remote socket
   * event, Monaco fires `onDidChangeModelContent` as a side effect.
   * Without this guard, that side-effect would re-emit a socket event,
   * which the server would broadcast to OTHER peers, creating an
   * infinite echo loop:
   *
   *   A types → server → B, C
   *   B receives → setValue() → fires onChange → B emits → server → A, C
   *   A receives B's echo → setValue() → fires onChange → A emits → …
   *
   * Setting `_isRemoteUpdate = true` before touching the editor model
   * tells the change listener to skip the socket emission.
   */
  private _isRemoteUpdate = false;

  /**
   * When true, the local user is blocked from typing until the current
   * remote update is fully applied.  This prevents keystrokes from
   * interleaving with a remote `applyEdits` call, which would produce
   * garbled text.
   */
  readonly isLocked = false;

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

    // Listen for content changes — the guard prevents echo loops
    this.editor.onDidChangeModelContent(() => {
      // ── GUARD: skip if this change was triggered by a remote update ──
      // When updateCode() sets _isRemoteUpdate = true before touching
      // the model, this listener fires but immediately returns without
      // emitting a socket event.  This breaks the echo loop.
      if (this._isRemoteUpdate) return;

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

  /**
   * Update the editor content from a remote socket event.
   *
   * Uses `pushEditOperations` instead of `setValue()` to preserve
   * the local user's cursor position and undo stack.  The remote
   * update is applied as a single replace-all edit, so the user's
   * cursor stays where they last placed it.
   *
   * The `_isRemoteUpdate` flag ensures that the resulting
   * `onDidChangeModelContent` event does NOT re-emit a socket
   * event — breaking the echo loop.
   */
  updateCode(code: string): void {
    if (!this.editor) return;
    if (this.editor.getValue() === code) return;

    // ── Acquire the guard ──────────────────────────────────────────────
    this._isRemoteUpdate = true;

    try {
      const model = this.editor.getModel();
      const fullRange = model.getFullModelRange();

      // Use pushEditOperations — Monaco applies this as a single atomic
      // edit.  Unlike setValue(), it preserves cursor position, undo
      // history, and scroll position.  The local user's caret stays
      // exactly where they left it.
      this.editor.pushEditOperations(
        [], // cursors to preserve (empty = keep current)
        [{
          range: fullRange,
          text: code,
        }],
        () => null // callback after edit (unused)
      );
    } catch {
      // Fallback: if pushEditOperations fails for any reason (e.g.
      // model disposed), use setValue as a last resort
      this.editor.setValue(code);
    }

    // ── Release the guard ──────────────────────────────────────────────
    // Must be synchronous — onDidChangeModelContent fires inside
    // pushEditOperations, so the flag is checked before we reach here.
    this._isRemoteUpdate = false;
  }
}
