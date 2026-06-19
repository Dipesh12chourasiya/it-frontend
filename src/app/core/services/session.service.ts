import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Session } from '../models/session.model';

@Injectable({
  providedIn: 'root'
})
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/sessions`;

  /**
   * Start a new candidate interview session
   */
  startSession(interviewId: string): Observable<{ success: boolean; message: string; data: Session }> {
    return this.http.post<{ success: boolean; message: string; data: Session }>(`${this.apiUrl}/start`, { interviewId });
  }

  /**
   * End an active candidate interview session
   */
  endSession(sessionId: string): Observable<{ success: boolean; message: string; data: Session }> {
    return this.http.post<{ success: boolean; message: string; data: Session }>(`${this.apiUrl}/end`, { sessionId });
  }

  /**
   * Get an active session for the current candidate and interview
   */
  getActiveSession(interviewId: string): Observable<{ success: boolean; data: Session | null }> {
    return this.http.get<{ success: boolean; data: Session | null }>(`${this.apiUrl}/active/${interviewId}`);
  }

  /**
   * Get details of a single session
   */
  getSessionById(id: string): Observable<{ success: boolean; data: Session }> {
    return this.http.get<{ success: boolean; data: Session }>(`${this.apiUrl}/${id}`);
  }
}
