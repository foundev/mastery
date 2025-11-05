export interface Goal {
  id: string;
  title: string;
  description: string;
  totalHours: number;
  totalTimeSpent: number;
  isActive: boolean;
  isArchived: boolean;
  startTime?: number;
  createdAt: number;
  lastModified: number;
  instanceId: string;
}

export interface GoalSession {
  id: string;
  goalId: string;
  startTime: number;
  endTime: number;
  duration: number;
  instanceId: string;
}

export interface ActiveSession {
  goalId: string;
  startTime: number;
  lastUpdated: number;
}

export interface GoalTemplate {
  id: string;
  title: string;
  description: string;
  hours: number;
  category: string;
  keywords: string[];
}

export interface DailyLimitValidation {
  ok: boolean;
  message?: string;
}

export type AchievementCategory = 'goal-progress';

export interface AchievementDefinition {
  id: string;
  goalId: string;
  title: string;
  description: string;
  category: AchievementCategory;
  threshold: number;
}

export interface AchievementRecord {
  id: string;
  goalId: string;
  unlockedAt: number;
  seen: boolean;
  instanceId: string;
}

export interface SyncData {
  version: number;
  instanceId: string;
  exportedAt: number;
  goals: Goal[];
  sessions: GoalSession[];
  achievements: AchievementRecord[];
  activeSession: ActiveSession | null;
}

export interface SyncConflict {
  type: 'goal' | 'session' | 'achievement';
  id: string;
  local: any;
  remote: any;
  resolution: 'local' | 'remote' | 'merge';
}
