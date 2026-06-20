import { Injectable, inject, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type MonitoringEventType =
  | 'TAB_SWITCH'
  | 'WINDOW_BLUR'
  | 'COPY'
  | 'PASTE'
  | 'FULLSCREEN_EXIT'
  | 'DEVTOOLS_OPEN';

@Injectable({
  providedIn: 'root',
})
export class MonitoringService {
  private readonly http = inject(HttpClient);
  private readonly ngZone = inject(NgZone);
  private readonly baseUrl = `${environment.apiUrl}/monitoring`;

  private interviewId: string | null = null;
  private candidateId: string | null = null;
  private isMonitoring = false;

  // Debounce map: eventType → last fired timestamp (ms)
  private readonly debounceTimes: Partial<Record<MonitoringEventType, number>> = {};
  private readonly debounceThresholdMs = 2000;

  // Stored listener references for proper cleanup
  private visibilityChangeListener: (() => void) | null = null;
  private windowBlurListener: (() => void) | null = null;
  private copyListener: ((e: Event) => void) | null = null;
  private pasteListener: ((e: Event) => void) | null = null;
  private fullscreenChangeListener: (() => void) | null = null;

  /**
   * Start monitoring for a candidate in a given interview.
   * Registers all browser event listeners.
   */
  startMonitoring(interviewId: string, candidateId: string): void {
    if (this.isMonitoring) {
      this.stopMonitoring();
    }

    this.interviewId = interviewId;
    this.candidateId = candidateId;
    this.isMonitoring = true;

    this.ngZone.runOutsideAngular(() => {
      // TAB_SWITCH — document visibility changes (e.g., user switches tabs)
      this.visibilityChangeListener = () => {
        if (document.visibilityState === 'hidden') {
          this.ngZone.run(() => this.sendEvent('TAB_SWITCH'));
        }
      };
      document.addEventListener('visibilitychange', this.visibilityChangeListener);

      // WINDOW_BLUR — main window loses focus
      this.windowBlurListener = () => {
        this.ngZone.run(() => this.sendEvent('WINDOW_BLUR'));
      };
      window.addEventListener('blur', this.windowBlurListener);

      // COPY
      this.copyListener = (e: Event) => {
        this.ngZone.run(() => this.sendEvent('COPY'));
      };
      document.addEventListener('copy', this.copyListener);

      // PASTE
      this.pasteListener = (e: Event) => {
        this.ngZone.run(() => this.sendEvent('PASTE'));
      };
      document.addEventListener('paste', this.pasteListener);

      // FULLSCREEN_EXIT
      this.fullscreenChangeListener = () => {
        if (!document.fullscreenElement) {
          this.ngZone.run(() => this.sendEvent('FULLSCREEN_EXIT'));
        }
      };
      document.addEventListener('fullscreenchange', this.fullscreenChangeListener);
    });

    console.log('[Monitoring] Engine started, sir. Listening for events.');
  }

  /**
   * Remove all browser event listeners and stop sending events.
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) return;

    if (this.visibilityChangeListener) {
      document.removeEventListener('visibilitychange', this.visibilityChangeListener);
    }
    if (this.windowBlurListener) {
      window.removeEventListener('blur', this.windowBlurListener);
    }
    if (this.copyListener) {
      document.removeEventListener('copy', this.copyListener);
    }
    if (this.pasteListener) {
      document.removeEventListener('paste', this.pasteListener);
    }
    if (this.fullscreenChangeListener) {
      document.removeEventListener('fullscreenchange', this.fullscreenChangeListener);
    }

    this.isMonitoring = false;
    this.interviewId = null;
    this.candidateId = null;
    console.log('[Monitoring] Engine stopped, sir.');
  }

  /**
   * Manually fire a monitoring event (e.g., from fullscreen button logic in component).
   */
  reportEvent(eventType: MonitoringEventType): void {
    this.sendEvent(eventType);
  }

  /**
   * Retrieve all monitoring events for a given interview from the REST API.
   */
  getEvents(interviewId: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/events/${interviewId}`);
  }

  /**
   * Debounce and POST the event to the backend API.
   */
  private sendEvent(eventType: MonitoringEventType): void {
    if (!this.isMonitoring || !this.interviewId || !this.candidateId) return;

    const now = Date.now();
    const lastFired = this.debounceTimes[eventType] ?? 0;
    if (now - lastFired < this.debounceThresholdMs) {
      return; // Duplicate within debounce window — skip
    }
    this.debounceTimes[eventType] = now;

    console.log(`[Monitoring] Event detected: ${eventType}`);

    this.http
      .post(`${this.baseUrl}/event`, {
        interviewId: this.interviewId,
        candidateId: this.candidateId,
        eventType,
      })
      .subscribe({
        error: (err) =>
          console.error(`[Monitoring] Failed to log event ${eventType}:`, err),
      });
  }
}
