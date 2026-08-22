export type MissionActivity = "running" | "idle" | "blocked";

export type MissionObservation = {
  activity: MissionActivity;
  event_type: string;
  session_id: string;
  event_count: number;
};

export type MissionObserver = {
  observe(event: unknown): Promise<MissionObservation | { ignored: string; session_id?: string }>;
  stats(): {
    root_session_id?: string;
    child_session_ids: string[];
    event_count: number;
    unique_event_count: number;
  };
};

export function createMissionObserver(options?: {
  notify?: (observation: MissionObservation) => Promise<void>;
  log?: (message: string) => void;
}): MissionObserver;

export const ACTIVITIES: ReadonlySet<MissionActivity>;
