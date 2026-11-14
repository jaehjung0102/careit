export type UserRole = "admin" | "caregiver" | "family";

export type RecordingStatus =
  | "draft"
  | "processing"
  | "completed"
  | "failed";

export interface Recording {
  id: string;
  title: string;
  residentId: string;
  status: RecordingStatus;
  createdAt: string;
}
