/**
 * Report Types — Sprint 12
 * Rule-based AI risk report for recruiter-facing interview analysis.
 */

export interface ReportStatistics {
  tabSwitches: number;
  copyEvents: number;
  pasteEvents: number;
  fullscreenExits: number;
  noFaceEvents: number;
  multipleFaceEvents: number;
  faceAwayEvents: number;
  interviewDurationMinutes: number;
}

export interface InterviewReport {
  interviewSummary: string;
  riskSummary: string;
  behaviorAnalysis: string;
  finalRecommendation: string;
  trustScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  statistics: ReportStatistics;
}
