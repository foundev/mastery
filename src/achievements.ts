import type { AchievementDefinition, Goal, GoalAchievementStats } from './types';

const GLOBAL_STREAK_BASE: AchievementDefinition[] = [
  {
    id: 'streak-90',
    title: 'Consistency Spark',
    description: 'Log progress for 90 days in a row.',
    category: 'streak',
    threshold: 90,
    goalTitle: 'All Goals'
  },
  {
    id: 'streak-365',
    title: 'Year One Hero',
    description: 'Keep your streak alive for a full year.',
    category: 'streak',
    threshold: 365,
    goalTitle: 'All Goals'
  }
];

const GLOBAL_DAILY_HOUR_THRESHOLDS = [1, 2, 4, 8, 12];
const GOAL_STREAK_THRESHOLDS = [7, 14, 30, 60, 90, 180, 365];
const GOAL_TOTAL_TIME_THRESHOLDS = [5, 10, 25, 50, 100, 250];

function createDailyHourDefinitions(): AchievementDefinition[] {
  return GLOBAL_DAILY_HOUR_THRESHOLDS.map((hours) => ({
    id: `hours-${hours}`,
    title: `${hours} Hour${hours === 1 ? '' : 's'} In A Day`,
    description: `Log at least ${hours} hour${hours === 1 ? '' : 's'} in a single day.`,
    category: 'daily-hours',
    threshold: hours,
    goalTitle: 'All Goals'
  }));
}

function createYearlyStreakDefinitions(maxYears: number): AchievementDefinition[] {
  const defs: AchievementDefinition[] = [];
  for (let year = 2; year <= maxYears; year++) {
    const days = year * 365;
    defs.push({
      id: `streak-${days}`,
      title: `${year} Year${year === 1 ? '' : 's'} Unbroken`,
      description: `Maintain your streak for ${year} consecutive year${year === 1 ? '' : 's'}.`,
      category: 'streak',
      threshold: days,
      goalTitle: 'All Goals'
    });
  }
  return defs;
}

function extendThresholds(base: number[], achieved: number, increment: number): number[] {
  const thresholds = new Set(base);
  if (achieved <= 0 || increment <= 0) {
    return Array.from(thresholds).sort((a, b) => a - b);
  }
  let current = Math.max(...base);
  while (achieved > current) {
    current += increment;
    thresholds.add(current);
  }
  return Array.from(thresholds).sort((a, b) => a - b);
}

function buildGoalStreakDefinitions(goal: Pick<Goal, 'id' | 'title'>, stats: GoalAchievementStats): AchievementDefinition[] {
  const thresholds = extendThresholds(GOAL_STREAK_THRESHOLDS, stats.longestStreak, 365);
  return thresholds.map((days) => ({
    id: `goal-${goal.id}-streak-${days}`,
    title: `${goal.title}: ${days}-Day Streak`,
    description: `Log progress on ${goal.title} for ${days} consecutive day${days === 1 ? '' : 's'}.`,
    category: 'goal-streak',
    threshold: days,
    goalId: goal.id,
    goalTitle: goal.title
  }));
}

function buildGoalTimeDefinitions(goal: Pick<Goal, 'id' | 'title'>, stats: GoalAchievementStats): AchievementDefinition[] {
  const thresholds = extendThresholds(GOAL_TOTAL_TIME_THRESHOLDS, stats.totalHours, 100);
  return thresholds.map((hours) => ({
    id: `goal-${goal.id}-hours-${hours}`,
    title: `${goal.title}: ${hours} Hour${hours === 1 ? '' : 's'} Logged`,
    description: `Accumulate ${hours} hour${hours === 1 ? '' : 's'} on ${goal.title}.`,
    category: 'goal-total-time',
    threshold: hours,
    goalId: goal.id,
    goalTitle: goal.title
  }));
}

export function buildGlobalAchievementDefinitions(longestStreak: number): AchievementDefinition[] {
  const definitions: AchievementDefinition[] = [...GLOBAL_STREAK_BASE];
  const maxYears = Math.max(2, Math.ceil(longestStreak / 365));
  definitions.push(...createYearlyStreakDefinitions(maxYears));
  definitions.push(...createDailyHourDefinitions());
  return definitions;
}

export const buildAchievementDefinitions = buildGlobalAchievementDefinitions;

export function buildGoalAchievementDefinitions(
  goal: Pick<Goal, 'id' | 'title'>,
  stats: GoalAchievementStats
): AchievementDefinition[] {
  return [...buildGoalStreakDefinitions(goal, stats), ...buildGoalTimeDefinitions(goal, stats)];
}

export function resolveAchievementDefinition(
  id: string,
  getGoalTitle?: (goalId: string) => string | undefined
): AchievementDefinition | undefined {
  if (id.startsWith('streak-')) {
    const days = Number(id.substring('streak-'.length));
    if (Number.isFinite(days)) {
      if (days === 90 || days === 365) {
        return GLOBAL_STREAK_BASE.find((def) => def.id === id);
      }
      const years = Math.round(days / 365);
      return {
        id,
        title: `${years} Year${years === 1 ? '' : 's'} Unbroken`,
        description: `Maintain your streak for ${years} consecutive year${years === 1 ? '' : 's'}.`,
        category: 'streak',
        threshold: days,
        goalTitle: 'All Goals'
      };
    }
  }
  if (id.startsWith('hours-')) {
    const hours = Number(id.substring('hours-'.length));
    if (Number.isFinite(hours)) {
      return {
        id,
        title: `${hours} Hour${hours === 1 ? '' : 's'} In A Day`,
        description: `Log at least ${hours} hour${hours === 1 ? '' : 's'} in a single day.`,
        category: 'daily-hours',
        threshold: hours,
        goalTitle: 'All Goals'
      };
    }
  }
  if (id.startsWith('goal-')) {
    const parts = id.split('-');
    if (parts.length >= 4) {
      const threshold = Number(parts[parts.length - 1]);
      const type = parts[parts.length - 2];
      const goalId = parts.slice(1, parts.length - 2).join('-');
      if (!Number.isFinite(threshold)) {
        return undefined;
      }
      const goalTitle = getGoalTitle?.(goalId) ?? `Former Goal (${goalId})`;
      if (type === 'streak') {
        return {
          id,
          title: `${goalTitle}: ${threshold}-Day Streak`,
          description: `Log progress on ${goalTitle} for ${threshold} consecutive day${threshold === 1 ? '' : 's'}.`,
          category: 'goal-streak',
          threshold,
          goalId,
          goalTitle
        };
      }
      if (type === 'hours') {
        return {
          id,
          title: `${goalTitle}: ${threshold} Hour${threshold === 1 ? '' : 's'} Logged`,
          description: `Accumulate ${threshold} hour${threshold === 1 ? '' : 's'} on ${goalTitle}.`,
          category: 'goal-total-time',
          threshold,
          goalId,
          goalTitle
        };
      }
    }
  }
  return undefined;
}

export function sortAchievements(definitions: AchievementDefinition[]): AchievementDefinition[] {
  return definitions
    .slice()
    .sort((a, b) => {
      const goalTitleA = a.goalTitle ?? (a.goalId ? '' : 'All Goals');
      const goalTitleB = b.goalTitle ?? (b.goalId ? '' : 'All Goals');
      if (goalTitleA !== goalTitleB) {
        return goalTitleA.localeCompare(goalTitleB);
      }
      if (a.category === b.category) {
        return a.threshold - b.threshold;
      }
      return a.category < b.category ? -1 : 1;
    });
}
