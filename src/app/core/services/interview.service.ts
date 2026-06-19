import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Interview } from '../models/interview.model';

@Injectable({
  providedIn: 'root'
})
export class InterviewService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/interviews`;

  /**
   * Create a new interview (Recruiter only)
   */
  createInterview(interviewData: Partial<Interview>): Observable<{ success: boolean; message: string; data: Interview }> {
    return this.http.post<{ success: boolean; message: string; data: Interview }>(this.apiUrl, interviewData);
  }

  /**
   * Get all interviews created by the recruiter (Recruiter only)
   */
  getInterviews(): Observable<{ success: boolean; data: Interview[] }> {
    return this.http.get<{ success: boolean; data: Interview[] }>(this.apiUrl);
  }

  /**
   * Get details of a single interview (Recruiter only)
   */
  getInterviewById(id: string): Observable<{ success: boolean; data: Interview }> {
    return this.http.get<{ success: boolean; data: Interview }>(`${this.apiUrl}/${id}`);
  }

  /**
   * Update an interview (Recruiter only)
   */
  updateInterview(id: string, interviewData: Partial<Interview>): Observable<{ success: boolean; message: string; data: Interview }> {
    return this.http.put<{ success: boolean; message: string; data: Interview }>(`${this.apiUrl}/${id}`, interviewData);
  }

  /**
   * Delete an interview (Recruiter only)
   */
  deleteInterview(id: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.apiUrl}/${id}`);
  }

  /**
   * Join an interview by its code (Candidate / all auth users)
   */
  joinInterview(interviewCode: string): Observable<{ success: boolean; message: string; data: Interview }> {
    return this.http.post<{ success: boolean; message: string; data: Interview }>(`${this.apiUrl}/join`, { interviewCode });
  }
}
