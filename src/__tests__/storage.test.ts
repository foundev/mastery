import { beforeEach, describe, expect, it } from 'vitest';
import {
  appendSession,
  getActiveSession,
  getLastBackup,
  loadGoals,
  loadSessions,
  saveActiveSession,
  saveGoals,
  saveLastBackup,
  saveSessions
} from '../storage';
import type { Goal, GoalSession } from '../types';
import { GOALS_KEY, SESSIONS_KEY, ACTIVE_SESSION_KEY } from '../constants';

function readRaw(key: string): any {
  const raw = window.localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

describe('storage helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns empty goal list when storage missing or corrupted', () => {
    expect(loadGoals()).toEqual([]);
    window.localStorage.setItem(GOALS_KEY, '{"this":"is not an array"}');
    expect(loadGoals()).toEqual([]);
  });

  it('sanitises stored goal objects', () => {
    const malformed = [
      {
        id: null,
        title: null,
        description: null,
        totalHours: 'not-a-number',
        totalTimeSpent: '10',
        isActive: 'truthy-string',
        startTime: 'nope',
        createdAt: 'yesterday'
      }
    ];
    window.localStorage.setItem(GOALS_KEY, JSON.stringify(malformed));
    const [goal] = loadGoals();
    expect(goal.title).toBe('Untitled');
    expect(goal.totalHours).toBe(60);
    expect(goal.totalTimeSpent).toBe(10);
    expect(goal.isActive).toBeTypeOf('boolean');
    expect(goal.startTime).toBeUndefined();
    expect(goal.createdAt).toBeTypeOf('number');
  });

  it('persists and loads goals correctly', () => {
    const goals: Goal[] = [
      {
        id: 'g1',
        title: 'Ship app',
        description: 'Finish everything',
        totalHours: 100,
        totalTimeSpent: 50_000,
        isActive: false,
        createdAt: Date.now()
      }
    ];
    saveGoals(goals);
    expect(loadGoals()).toEqual(goals);
  });

  it('appends sessions to existing list', () => {
    const initial: GoalSession[] = [
      { goalId: 'g1', startTime: 0, endTime: 1000, duration: 1000 }
    ];
    saveSessions(initial);
    appendSession({ goalId: 'g2', startTime: 10, endTime: 20, duration: 10 });
    expect(loadSessions()).toHaveLength(2);
  });

  it('filters malformed sessions when loading', () => {
    const data = [
      { goalId: 'ok', startTime: 1, endTime: 2, duration: 1 },
      { goalId: null, startTime: 'bad', endTime: 2, duration: 1 }
    ];
    window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(data));
    const sessions = loadSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].goalId).toBe('ok');
  });

  it('saves and clears active session', () => {
    saveActiveSession({ goalId: 'g1', startTime: 100, lastUpdated: 200 });
    expect(readRaw(ACTIVE_SESSION_KEY)).toEqual({ goalId: 'g1', startTime: 100, lastUpdated: 200 });
    expect(getActiveSession()).toEqual({ goalId: 'g1', startTime: 100, lastUpdated: 200 });
    saveActiveSession(null);
    expect(getActiveSession()).toBeNull();
    expect(window.localStorage.getItem(ACTIVE_SESSION_KEY)).toBeNull();
  });

  it('stores and retrieves last backup timestamp', () => {
    expect(getLastBackup()).toBeNull();
    saveLastBackup(123456);
    expect(getLastBackup()).toBe(123456);
  });
});
