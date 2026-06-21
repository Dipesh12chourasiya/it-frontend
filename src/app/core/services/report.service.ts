import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { InterviewReport } from '../models/report.model';

@Injectable({
  providedIn: 'root',
})
export class ReportService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/reports`;

  /**
   * Generate a rule-based risk report for a candidate in a given interview.
   */
  getInterviewReport(
    interviewId: string,
    candidateId: string
  ): Observable<{ success: boolean; data: InterviewReport }> {
    return this.http.get<{ success: boolean; data: InterviewReport }>(
      `${this.baseUrl}/interview/${interviewId}`,
      { params: { candidateId } }
    );
  }

  /**
   * Download PDF report for a candidate via Angular HttpClient.
   * The authInterceptor automatically attaches the JWT token.
   */
  downloadPdfReport(interviewId: string, candidateId: string): void {
    const url = `${this.baseUrl}/interview/${interviewId}/pdf`;

    this.http
      .get(url, {
        params: { candidateId },
        responseType: 'blob',
        observe: 'response',
      })
      .subscribe({
        next: (response) => {
          const blob = response.body!;
          const blobUrl = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = `interview-report-${interviewId}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(blobUrl);
        },
        error: (err) => {
          console.error('[Report] PDF download failed:', err);
        },
      });
  }
}
