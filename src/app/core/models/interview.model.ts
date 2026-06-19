export interface Interview {
  _id: string;
  title: string;
  description: string;
  recruiterId: string;
  interviewCode: string;
  startTime: string;
  endTime: string;
  status: "scheduled" | "active" | "completed";
  createdAt?: string;
  updatedAt?: string;
}
