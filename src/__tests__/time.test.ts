import { describe, expect, it, vi, afterEach } from 'vitest';
import type { Goal, GoalSession } from '../types';
import { estimateCompletion, formatDuration, formatHMS, hoursToMilliseconds, validateDailyLimit } from '../time';

describe('time helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats time as HH:MM:SS', () => {
    expect(formatHMS(3723)).toEqual('01:02:03');
    expect(formatHMS(-10)).toEqual('00:00:00');
  });

  it('formats duration with hours and minutes', () => {
    expect(formatDuration(3_600_000 + 1_800_000)).toEqual('1h 30m 0s');
    expect(formatDuration(61_000)).toEqual('1m 1s');
  });

  it('converts between hours and milliseconds', () => {
    expect(hoursToMilliseconds(2)).toBe(7_200_000);
    expect(hoursToMilliseconds(0)).toBe(0);
  });

  it('validates daily limit with overflow', () => {
    const base = Date.UTC(2024, 4, 1);
    const sessions: GoalSession[] = [
      { goalId: 'g', startTime: base, endTime: base + hoursToMilliseconds(20), duration: hoursToMilliseconds(20) }
    ];
    const result = validateDailyLimit(sessions, 5, new Date(base));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('24-hour daily limit');
  });

  it('allows valid manual addition under daily limit', () => {
    const base = Date.UTC(2024, 4, 1);
    const sessions: GoalSession[] = [
      { goalId: 'g', startTime: base, endTime: base + hoursToMilliseconds(2), duration: hoursToMilliseconds(2) }
    ];
    const result = validateDailyLimit(sessions, 2, new Date(base));
    expect(result.ok).toBe(true);
  });

  it('estimates completion date based on median recent effort', () => {
    vi.useFakeTimers();
    const now = new Date('2024-05-20T12:00:00Z');
    vi.setSystemTime(now);

    const goal: Goal = {
      id: 'goal-1',
      title: 'Test Goal',
      description: '',
      totalHours: 50,
      totalTimeSpent: hoursToMilliseconds(10),
      isActive: false,
      createdAt: now.getTime()
    };

    const day = 24 * 60 * 60 * 1000;
    const sessions: GoalSession[] = [
      { goalId: 'goal-1', startTime: now.getTime() - day, endTime: now.getTime() - day + hoursToMilliseconds(3), duration: hoursToMilliseconds(3) },
      { goalId: 'goal-1', startTime: now.getTime() - 2 * day, endTime: now.getTime() - 2 * day + hoursToMilliseconds(2), duration: hoursToMilliseconds(2) },
      { goalId: 'goal-1', startTime: now.getTime() - 3 * day, endTime: now.getTime() - 3 * day + hoursToMilliseconds(4), duration: hoursToMilliseconds(4) }
    ];

    const estimate = estimateCompletion(goal, sessions);
    expect(estimate).not.toBeNull();
    if (estimate) {
      const diffDays = Math.round((estimate.getTime() - now.getTime()) / day);
      expect(diffDays).toBeGreaterThan(0);
      expect(diffDays).toBeLessThanOrEqual(20);
    }
  });
});
