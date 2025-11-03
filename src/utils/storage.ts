import { Goal, TimeSession } from '../types';

const GOALS_STORAGE_KEY = 'goal-tracker-goals';
const SESSIONS_STORAGE_KEY = 'goal-tracker-sessions';
const ACTIVE_SESSION_KEY = 'goal-tracker-active-session';

export const storage = {
  getGoals(): Goal[] {
    try {
      const stored = localStorage.getItem(GOALS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading goals from localStorage:', error);
      return [];
    }
  },

  saveGoals(goals: Goal[]): void {
    try {
      localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(goals));
    } catch (error) {
      console.error('Error saving goals to localStorage:', error);
    }
  },

  getSessions(): TimeSession[] {
    try {
      const stored = localStorage.getItem(SESSIONS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading sessions from localStorage:', error);
      return [];
    }
  },

  saveSessions(sessions: TimeSession[]): void {
    try {
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    } catch (error) {
      console.error('Error saving sessions to localStorage:', error);
    }
  },

  addSession(session: TimeSession): void {
    const sessions = this.getSessions();
    sessions.push(session);
    this.saveSessions(sessions);
  },

  saveActiveSession(session: { goalId: string; startTime: number; lastUpdated?: number } | null) {
    try {
      if (session) {
        localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(ACTIVE_SESSION_KEY);
      }
    } catch (error) {
      console.error('Error saving active session:', error);
    }
  },

  getActiveSession(): { goalId: string; startTime: number; lastUpdated?: number } | null {
    try {
      const s = localStorage.getItem(ACTIVE_SESSION_KEY);
      return s ? JSON.parse(s) : null;
    } catch (error) {
      console.error('Error loading active session:', error);
      return null;
    }
  },
};

const BACKUP_VERSION = 1 as const;

type ActiveSessionBackup = { goalId: string; startTime: number; lastUpdated?: number } | null;
type BackupPayload = {
  version: number;
  exportedAt: number;
  goals: Goal[];
  sessions: TimeSession[];
  activeSession: ActiveSessionBackup;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidActiveSession(value: unknown): value is Exclude<ActiveSessionBackup, null> {
  if (!isObject(value)) return false;
  const goalId = (value as Record<string, unknown>).goalId;
  const startTime = (value as Record<string, unknown>).startTime;
  const lastUpdated = (value as Record<string, unknown>).lastUpdated;
  const goalIdOk = typeof goalId === 'string' && goalId.length > 0;
  const startTimeOk = typeof startTime === 'number' && Number.isFinite(startTime);
  const lastUpdatedOk = typeof lastUpdated === 'undefined' || (typeof lastUpdated === 'number' && Number.isFinite(lastUpdated));
  return goalIdOk && startTimeOk && lastUpdatedOk;
}

export function exportAll(): string {
  const payload: BackupPayload = {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    goals: storage.getGoals(),
    sessions: storage.getSessions(),
    activeSession: storage.getActiveSession(),
  };
  return JSON.stringify(payload);
}

export function importAll(json: string): { ok: true } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(json) as Partial<BackupPayload> | unknown;
    if (!isObject(parsed)) {
      return { ok: false, error: 'Invalid backup file format' };
    }

    const version = (parsed as Record<string, unknown>).version;
    if (typeof version !== 'number') {
      return { ok: false, error: 'Backup missing version' };
    }

    // Basic forward compatibility: accept same or lower major version
    if (Math.floor(version) > Math.floor(BACKUP_VERSION)) {
      return { ok: false, error: 'Backup version is newer than this app supports' };
    }

    const goals = (parsed as Record<string, unknown>).goals;
    const sessions = (parsed as Record<string, unknown>).sessions;
    const activeSession = (parsed as Record<string, unknown>).activeSession as unknown;

    if (!Array.isArray(goals) || !Array.isArray(sessions)) {
      return { ok: false, error: 'Backup missing goals or sessions arrays' };
    }

    if (!(activeSession === null || isValidActiveSession(activeSession))) {
      return { ok: false, error: 'Backup active session is invalid' };
    }

    // Write to storage
    storage.saveGoals(goals as Goal[]);
    storage.saveSessions(sessions as TimeSession[]);
    storage.saveActiveSession((activeSession as ActiveSessionBackup) ?? null);

    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'Failed to parse backup JSON' };
  }
}