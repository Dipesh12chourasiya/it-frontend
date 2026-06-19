import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class MonitoringService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/monitoring`;

  /**
   * Retrieve monitoring events for a given interview
   */
  getEvents(interviewId: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/events/${interviewId}`);
  }

  /**
   * Start monitoring for a candidate (placeholder).
   */
  startMonitoring(interviewId: string, candidateId: string): void {
    // Placeholder: could POST a start signal to backend if needed.
  }

  /**
   * Stop monitoring for the current candidate (placeholder).
   */
  stopMonitoring(): void {
    // Placeholder: could inform backend to stop sending events.
  }
}
