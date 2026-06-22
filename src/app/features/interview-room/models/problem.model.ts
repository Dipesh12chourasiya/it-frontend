// ── Problem types ──────────────────────────────────────────────────────

/** The active problem stored on the server and synced via Socket.IO */
export interface InterviewProblem {
  title: string;
  description: string;
  examples?: string;
  constraints?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Payload sent by recruiter to create a new problem */
export interface CreateProblemPayload {
  roomId: string;
  title: string;
  description: string;
  examples?: string;
  constraints?: string;
}

/** Payload sent by recruiter to update an existing problem */
export interface UpdateProblemPayload {
  roomId: string;
  title?: string;
  description?: string;
  examples?: string;
  constraints?: string;
}

/** Server broadcast when problem state changes */
export interface ProblemSyncData {
  roomId: string;
  problem: InterviewProblem | null;
  updatedAt: string;
}

/** Structured error from the server */
export interface ProblemErrorResponse {
  success: false;
  message: string;
  code?: string;
}
