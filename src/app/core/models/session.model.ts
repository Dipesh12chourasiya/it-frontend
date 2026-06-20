import { Interview } from './interview.model';

export interface Session {
  _id: string;
  interviewId: string | Interview;
  candidateId: string | { _id: string; name: string; email: string; role: string };
  joinedAt: string;
  leftAt?: string;
  status: 'waiting' | 'active' | 'completed' | 'left';
  score: number;
  createdAt?: string;
  updatedAt?: string;
}
