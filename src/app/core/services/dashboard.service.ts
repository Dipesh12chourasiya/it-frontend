import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DashboardCandidate {
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  trustScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  status: string;
  connectionStatus: 'ONLINE' | 'OFFLINE' | 'RECONNECTING';
  lastActivity: string | null;
  statistics: {
    totalTabSwitches: number;
    totalWindowBlurs: number;
    totalCopyEvents: number;
    totalPasteEvents: number;
    totalFullscreenExits: number;
    totalDevtoolsOpens: number;
    totalNoFaceEvents: number;
    totalMultipleFaceEvents: number;
    totalFaceAwayEvents: number;
    totalMonitoringEvents: number;
  };
  recentEvents: {
    _id: string;
    eventType: string;
    timestamp: string;
  }[];
}

export interface InterviewDashboardResponse {
  interview: any;
  candidates: DashboardCandidate[];
}

export interface CandidateDashboardResponse {
  candidate: {
    _id: string;
    name: string;
    email: string;
    role: string;
  };
  trustScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  sessions: any[];
  statistics: {
    totalTabSwitches: number;
    totalWindowBlurs: number;
    totalCopyEvents: number;
    totalPasteEvents: number;
    totalFullscreenExits: number;
    totalDevtoolsOpens: number;
    totalNoFaceEvents: number;
    totalMultipleFaceEvents: number;
    totalFaceAwayEvents: number;
    totalMonitoringEvents: number;
  };
  recentEvents: any[];
}

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/dashboard`;

  /**
   * Get full dashboard data for an interview
   */
  getInterviewDashboard(interviewId: string): Observable<{ success: boolean; data: InterviewDashboardResponse }> {
    return this.http.get<{ success: boolean; data: InterviewDashboardResponse }>(
      `${this.baseUrl}/interview/${interviewId}`
    );
  }

  /**
   * Get detailed dashboard data for a single candidate
   */
  getCandidateDashboard(candidateId: string): Observable<{ success: boolean; data: CandidateDashboardResponse }> {
    return this.http.get<{ success: boolean; data: CandidateDashboardResponse }>(
      `${this.baseUrl}/candidate/${candidateId}`
    );
  }
}
