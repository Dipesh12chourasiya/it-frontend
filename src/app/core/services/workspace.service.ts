import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface WorkspaceData {
  language: string;
  code: string;
  whiteboardData: Record<string, any>;
}

@Injectable({
  providedIn: 'root',
})
export class WorkspaceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/workspace`;

  /**
   * Get workspace data for an interview
   */
  getWorkspace(interviewId: string): Observable<{ success: boolean; data: WorkspaceData }> {
    return this.http.get<{ success: boolean; data: WorkspaceData }>(
      `${this.baseUrl}/${interviewId}`
    );
  }

  /**
   * Update workspace data
   */
  updateWorkspace(interviewId: string, data: Partial<WorkspaceData>): Observable<{ success: boolean; data: WorkspaceData }> {
    return this.http.put<{ success: boolean; data: WorkspaceData }>(
      `${this.baseUrl}/${interviewId}`,
      data
    );
  }
}
