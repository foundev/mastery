import { ACHIEVEMENTS_KEY, ACTIVE_SESSION_KEY, GOALS_KEY, INSTANCE_ID_KEY, LAST_BACKUP_KEY, SESSIONS_KEY } from './constants';
import type { ActiveSession, Goal, GoalSession, AchievementRecord } from './types';

const DEFAULT_TOTAL_HOURS = 60;

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function getInstanceId(): string {
  let instanceId = localStorage.getItem(INSTANCE_ID_KEY);
  if (!instanceId) {
    instanceId = crypto.randomUUID();
    localStorage.setItem(INSTANCE_ID_KEY, instanceId);
  }
  return instanceId;
}

function sanitizeGoal(raw: any): Goal {
  const now = Date.now();
  const instanceId = getInstanceId();
  return {
    id: String(raw?.id ?? crypto.randomUUID()),
    title: String(raw?.title ?? 'Untitled'),
    description: String(raw?.description ?? ''),
    totalHours: Number.isFinite(Number(raw?.totalHours))
      ? Number(raw.totalHours)
      : DEFAULT_TOTAL_HOURS,
    totalTimeSpent: Number.isFinite(Number(raw?.totalTimeSpent))
      ? Number(raw.totalTimeSpent)
      : 0,
    isActive: Boolean(raw?.isActive),
    isArchived: Boolean(raw?.isArchived),
    startTime: isNumber(raw?.startTime) ? raw.startTime : undefined,
    createdAt: isNumber(raw?.createdAt) ? raw.createdAt : now,
    lastModified: isNumber(raw?.lastModified) ? raw.lastModified : now,
    instanceId: String(raw?.instanceId ?? instanceId)
  };
}

export function loadGoals(): Goal[] {
  try {
    const raw = localStorage.getItem(GOALS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => sanitizeGoal(item));
  } catch {
    return [];
  }
}

export function saveGoals(goals: Goal[]): void {
  localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}

export function loadSessions(): GoalSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const instanceId = getInstanceId();
    return parsed
      .map((value) => ({
        id: String(value?.id ?? crypto.randomUUID()),
        goalId: String(value?.goalId ?? ''),
        startTime: Number(value?.startTime ?? 0),
        endTime: Number(value?.endTime ?? 0),
        duration: Number(value?.duration ?? 0),
        instanceId: String(value?.instanceId ?? instanceId)
      }))
      .filter(
        (session) =>
          session.goalId &&
          isNumber(session.startTime) &&
          isNumber(session.endTime) &&
          isNumber(session.duration)
      );
  } catch {
    return [];
  }
}

export function saveSessions(sessions: GoalSession[]): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function appendSession(session: GoalSession): void {
  const sessions = loadSessions();
  sessions.push(session);
  saveSessions(sessions);
}

export function saveActiveSession(session: ActiveSession | null): void {
  if (session) {
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  }
}

export function getActiveSession(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const goalId = String((parsed as ActiveSession).goalId ?? '');
    const startTime = Number((parsed as ActiveSession).startTime ?? 0);
    const lastUpdated = Number((parsed as ActiveSession).lastUpdated ?? 0);
    if (!goalId || !isNumber(startTime) || !isNumber(lastUpdated)) return null;
    return { goalId, startTime, lastUpdated };
  } catch {
    return null;
  }
}

export function saveLastBackup(timestamp: number): void {
  localStorage.setItem(LAST_BACKUP_KEY, String(timestamp));
}

export function getLastBackup(): number | null {
  const raw = localStorage.getItem(LAST_BACKUP_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function loadAchievements(): AchievementRecord[] {
  try {
    const raw = localStorage.getItem(ACHIEVEMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const instanceId = getInstanceId();
    return parsed
      .map((value) => {
        const id = String(value?.id ?? '');
        const goalId = String(value?.goalId ?? '');
        if (!id || !goalId) {
          return null;
        }
        const unlockedAtRaw = Number(value?.unlockedAt ?? Date.now());
        const unlockedAt = Number.isFinite(unlockedAtRaw) ? unlockedAtRaw : Date.now();
        return {
          id,
          goalId,
          unlockedAt,
          seen: Boolean(value?.seen),
          instanceId: String(value?.instanceId ?? instanceId)
        };
      })
      .filter((record): record is AchievementRecord => Boolean(record?.id && record.goalId));
  } catch {
    return [];
  }
}

export function saveAchievements(records: AchievementRecord[]): void {
  localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(records));
}
