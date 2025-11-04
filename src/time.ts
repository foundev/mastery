import type { DailyLimitValidation, Goal, GoalSession } from './types';

const MS_PER_DAY = 86_400_000;

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function formatDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(key: string): number {
  const [year, month, day] = key.split('-').map((value) => Number.parseInt(value, 10));
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

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

export function calculateDailyStreak(
  sessions: GoalSession[],
  now: number = Date.now()
): number {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return 0;
  }

  const todayStart = startOfDay(now);
  const todayKey = formatDateKey(todayStart);
  const dayKeys = new Set<string>();

  sessions.forEach((session) => {
    const rawStart = Number(session.startTime);
    const rawEnd = Number(session.endTime);
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) {
      return;
    }
    const sessionEnd = Math.min(rawEnd, now);
    const sessionStart = Math.min(rawStart, sessionEnd);
    if (sessionEnd <= sessionStart) {
      return;
    }

    let cursor = startOfDay(sessionStart);
    const lastDay = startOfDay(sessionEnd);
    while (cursor <= lastDay) {
      const dayStart = cursor;
      const dayEnd = dayStart + MS_PER_DAY;
      const overlapStart = Math.max(sessionStart, dayStart);
      const overlapEnd = Math.min(sessionEnd, dayEnd);
      if (overlapEnd - overlapStart > 0) {
        dayKeys.add(formatDateKey(dayStart));
      }
      cursor += MS_PER_DAY;
    }
  });

  const filtered = Array.from(dayKeys).filter((key) => key <= todayKey);
  if (filtered.length === 0) {
    return 0;
  }

  filtered.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));

  let streak = 1;
  let previous = parseDateKey(filtered[0]);

  for (let index = 1; index < filtered.length; index += 1) {
    const current = parseDateKey(filtered[index]);
    if (previous - current === MS_PER_DAY) {
      streak += 1;
      previous = current;
    } else {
      break;
    }
  }

  return streak;
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
