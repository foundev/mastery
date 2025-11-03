export interface Goal {
  id: string;
  title: string;
  description: string;
  totalHours: number;
  totalTimeSpent: number;
  isActive: boolean;
  startTime?: number;
  createdAt: number;
}

export interface GoalSession {
  goalId: string;
  startTime: number;
  endTime: number;
  duration: number;
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

export type AchievementCategory = 'streak' | 'daily-hours';

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  threshold: number;
}

export interface AchievementRecord {
  id: string;
  unlockedAt: number;
  seen: boolean;
}
