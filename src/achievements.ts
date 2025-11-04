import type { AchievementDefinition, Goal } from './types';

export const GOAL_PROGRESS_THRESHOLDS = [25, 50, 75, 100];

const GOAL_PREFIX = 'goal:';
const PROGRESS_SEGMENT = ':progress:';

function encodeGoalProgressId(goalId: string, percent: number): string {
  return `${GOAL_PREFIX}${encodeURIComponent(goalId)}${PROGRESS_SEGMENT}${percent}`;
}

function decodeGoalProgressId(id: string): { goalId: string; percent: number } | null {
  if (!id.startsWith(GOAL_PREFIX)) {
    return null;
  }
  const progressIndex = id.lastIndexOf(PROGRESS_SEGMENT);
  if (progressIndex === -1) {
    return null;
  }
  const encodedGoalId = id.substring(GOAL_PREFIX.length, progressIndex);
  const percentText = id.substring(progressIndex + PROGRESS_SEGMENT.length);
  const percent = Number(percentText);
  if (!Number.isFinite(percent)) {
    return null;
  }
  try {
    const goalId = decodeURIComponent(encodedGoalId);
    return { goalId, percent };
  } catch {
    return null;
  }
}

function createGoalProgressDefinition(goal: Goal, percent: number): AchievementDefinition {
  return {
    id: encodeGoalProgressId(goal.id, percent),
    goalId: goal.id,
    title: `${percent}% Complete`,
    description: `Reach ${percent}% of planned hours for "${goal.title}".`,
    category: 'goal-progress',
    threshold: percent
  };
}

export function buildAchievementDefinitionsForGoal(goal: Goal): AchievementDefinition[] {
  return GOAL_PROGRESS_THRESHOLDS.map((percent) => createGoalProgressDefinition(goal, percent));
}

export function buildAchievementDefinitions(goals: Goal[]): AchievementDefinition[] {
  return goals.flatMap((goal) => buildAchievementDefinitionsForGoal(goal));
}

export function resolveAchievementDefinition(
  id: string,
  goals: Goal[]
): AchievementDefinition | undefined {
  const decoded = decodeGoalProgressId(id);
  if (!decoded) {
    return undefined;
  }
  const goal = goals.find((item) => item.id === decoded.goalId);
  if (goal) {
    return createGoalProgressDefinition(goal, decoded.percent);
  }
  return {
    id,
    goalId: decoded.goalId,
    title: `${decoded.percent}% Complete`,
    description: `Reach ${decoded.percent}% of planned hours for this goal.`,
    category: 'goal-progress',
    threshold: decoded.percent
  };
}

export function sortAchievements(
  definitions: AchievementDefinition[],
  goals: Goal[]
): AchievementDefinition[] {
  const titleMap = new Map(goals.map((goal) => [goal.id, goal.title.toLowerCase()]));
  return definitions.slice().sort((a, b) => {
    const titleA = titleMap.get(a.goalId) ?? '';
    const titleB = titleMap.get(b.goalId) ?? '';
    if (titleA === titleB) {
      return a.threshold - b.threshold;
    }
    return titleA.localeCompare(titleB);
  });
}

export function decodeGoalAchievementId(
  id: string
): { goalId: string; percent: number } | null {
  return decodeGoalProgressId(id);
}
