import type { AchievementCategory, AchievementDefinition } from './types';

const STREAK_BASE: AchievementDefinition[] = [
  {
    id: 'streak-90',
    title: 'Consistency Spark',
    description: 'Log progress for 90 days in a row.',
    category: 'streak',
    threshold: 90
  },
  {
    id: 'streak-365',
    title: 'Year One Hero',
    description: 'Keep your streak alive for a full year.',
    category: 'streak',
    threshold: 365
  }
];

const HOURS_THRESHOLDS = [1, 2, 4, 8, 12];

function createDailyHourDefinitions(): AchievementDefinition[] {
  return HOURS_THRESHOLDS.map((hours) => ({
    id: `hours-${hours}`,
    title: `${hours} Hour${hours === 1 ? '' : 's'} In A Day`,
    description: `Log at least ${hours} hour${hours === 1 ? '' : 's'} in a single day.`,
    category: 'daily-hours' as AchievementCategory,
    threshold: hours
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
      threshold: days
    });
  }
  return defs;
}

export function buildAchievementDefinitions(longestStreak: number): AchievementDefinition[] {
  const definitions: AchievementDefinition[] = [...STREAK_BASE];
  const maxYears = Math.max(2, Math.ceil(longestStreak / 365));
  definitions.push(...createYearlyStreakDefinitions(maxYears));
  definitions.push(...createDailyHourDefinitions());
  return definitions;
}

export function resolveAchievementDefinition(id: string): AchievementDefinition | undefined {
  if (id.startsWith('streak-')) {
    const days = Number(id.substring('streak-'.length));
    if (Number.isFinite(days)) {
      if (days === 90 || days === 365) {
        return STREAK_BASE.find((def) => def.id === id);
      }
      const years = Math.round(days / 365);
      return {
        id,
        title: `${years} Year${years === 1 ? '' : 's'} Unbroken`,
        description: `Maintain your streak for ${years} consecutive year${years === 1 ? '' : 's'}.`,
        category: 'streak',
        threshold: days
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
        threshold: hours
      };
    }
  }
  return undefined;
}

export function sortAchievements(definitions: AchievementDefinition[]): AchievementDefinition[] {
  return definitions.slice().sort((a, b) => {
    if (a.category === b.category) {
      return a.threshold - b.threshold;
    }
    return a.category < b.category ? -1 : 1;
  });
}
