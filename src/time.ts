import type { DailyLimitValidation, Goal, GoalSession } from './types';

export function millisecondsToHours(ms: number): number {
  return ms / 3_600_000;
}

export function hoursToMilliseconds(hours: number): number {
  return hours * 3_600_000;
}

export function formatHMS(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return [hours, minutes, remaining]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remaining}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remaining}s`;
  }
  return `${remaining}s`;
}

export function estimateCompletion(
  goal: Goal,
  sessions: GoalSession[]
): Date | null {
  const goalSessions = sessions.filter((session) => session.goalId === goal.id);
  if (goalSessions.length < 2) return null;

  const recent = goalSessions
    .slice()
    .sort((a, b) => b.startTime - a.startTime)
    .slice(0, 7);

  const dailyTotals = new Map<string, number>();
  for (const session of recent) {
    const key = new Date(session.startTime).toDateString();
    const hours = millisecondsToHours(session.duration);
    dailyTotals.set(key, (dailyTotals.get(key) ?? 0) + hours);
  }

  const values = Array.from(dailyTotals.values()).sort((a, b) => a - b);
  if (values.length === 0) return null;

  const mid = Math.floor(values.length / 2);
  const median =
    values.length % 2 === 0
      ? (values[mid - 1] + values[mid]) / 2
      : values[mid];

  if (median <= 0) return null;

  const spentHours = millisecondsToHours(goal.totalTimeSpent);
  const remaining = goal.totalHours - spentHours;
  if (remaining <= 0) return null;

  const days = Math.ceil(remaining / median);
  const estimate = new Date();
  estimate.setDate(estimate.getDate() + days);
  return estimate;
}

export function validateDailyLimit(
  allSessions: GoalSession[],
  newHours: number,
  targetDate: Date
): DailyLimitValidation {
  const targetKey = targetDate.toDateString();
  const sessionsForDay = allSessions.filter(
    (session) =>
      new Date(session.startTime).toDateString() === targetKey ||
      new Date(session.endTime).toDateString() === targetKey
  );

  const currentTotal = sessionsForDay.reduce(
    (total, session) => total + millisecondsToHours(session.duration),
    0
  );
  const combined = currentTotal + newHours;

  if (combined > 24) {
    const projectCount = new Set(sessionsForDay.map((session) => session.goalId))
      .size;
    const projectText =
      projectCount > 1
        ? `across ${projectCount} projects`
        : 'for this project';
    return {
      ok: false,
      message: `Adding ${newHours} hours would exceed the 24-hour daily limit for ${targetKey}. You already have ${currentTotal.toFixed(
        1
      )} hours logged ${projectText}.`
    };
  }

  return { ok: true };
}

export function formatTimeSince(timestamp: number): string {
  const now = Date.now();
  if (!Number.isFinite(timestamp)) return 'Never';
  const diffMs = now - timestamp;
  if (diffMs < 0) return 'In the future';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Moments ago';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return diffMin === 1 ? '1 minute ago' : `${diffMin} minutes ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return diffWeeks === 1 ? '1 week ago' : `${diffWeeks} weeks ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`;
  const diffYears = Math.floor(diffDays / 365);
  return diffYears === 1 ? '1 year ago' : `${diffYears} years ago`;
}
