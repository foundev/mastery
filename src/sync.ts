import type { Goal, GoalSession, AchievementRecord, ActiveSession, SyncData, SyncConflict } from './types';
import { getInstanceId } from './storage';

export interface MergeResult {
  goals: Goal[];
  sessions: GoalSession[];
  achievements: AchievementRecord[];
  activeSession: ActiveSession | null;
  conflicts: SyncConflict[];
}

/**
 * SyncManager handles merging data from multiple instances
 * Uses Last-Write-Wins (LWW) for conflict resolution based on timestamps
 */
export class SyncManager {
  private instanceId: string;

  constructor() {
    this.instanceId = getInstanceId();
  }

  /**
   * Create a SyncData snapshot of current state
   */
  createSyncData(
    goals: Goal[],
    sessions: GoalSession[],
    achievements: AchievementRecord[],
    activeSession: ActiveSession | null
  ): SyncData {
    return {
      version: 1,
      instanceId: this.instanceId,
      exportedAt: Date.now(),
      goals,
      sessions,
      achievements,
      activeSession
    };
  }

  /**
   * Merge remote data with local data
   * Returns merged result with conflict information
   */
  merge(local: SyncData, remote: SyncData): MergeResult {
    const conflicts: SyncConflict[] = [];

    // Merge goals using Last-Write-Wins strategy
    const goals = this.mergeGoals(local.goals, remote.goals, conflicts);

    // Merge sessions (deduplicate by ID)
    const sessions = this.mergeSessions(local.sessions, remote.sessions);

    // Merge achievements (deduplicate by ID)
    const achievements = this.mergeAchievements(local.achievements, remote.achievements);

    // Handle active session conflict
    const activeSession = this.mergeActiveSession(local.activeSession, remote.activeSession);

    return {
      goals,
      sessions,
      achievements,
      activeSession,
      conflicts
    };
  }

  /**
   * Merge goals using Last-Write-Wins based on lastModified timestamp
   */
  private mergeGoals(localGoals: Goal[], remoteGoals: Goal[], conflicts: SyncConflict[]): Goal[] {
    const goalsMap = new Map<string, Goal>();

    // Add all local goals
    for (const goal of localGoals) {
      goalsMap.set(goal.id, goal);
    }

    // Merge remote goals
    for (const remoteGoal of remoteGoals) {
      const localGoal = goalsMap.get(remoteGoal.id);

      if (!localGoal) {
        // New goal from remote
        goalsMap.set(remoteGoal.id, remoteGoal);
      } else {
        // Conflict: same goal exists in both
        // Use Last-Write-Wins based on lastModified
        if (remoteGoal.lastModified > localGoal.lastModified) {
          // Remote is newer
          conflicts.push({
            type: 'goal',
            id: remoteGoal.id,
            local: localGoal,
            remote: remoteGoal,
            resolution: 'remote'
          });
          goalsMap.set(remoteGoal.id, remoteGoal);
        } else if (remoteGoal.lastModified < localGoal.lastModified) {
          // Local is newer
          conflicts.push({
            type: 'goal',
            id: localGoal.id,
            local: localGoal,
            remote: remoteGoal,
            resolution: 'local'
          });
          // Keep local (already in map)
        } else {
          // Same timestamp - prefer based on instanceId (deterministic)
          const useRemote = remoteGoal.instanceId > localGoal.instanceId;
          conflicts.push({
            type: 'goal',
            id: remoteGoal.id,
            local: localGoal,
            remote: remoteGoal,
            resolution: useRemote ? 'remote' : 'local'
          });
          if (useRemote) {
            goalsMap.set(remoteGoal.id, remoteGoal);
          }
        }
      }
    }

    return Array.from(goalsMap.values());
  }

  /**
   * Merge sessions by deduplicating by ID
   * Sessions are immutable, so same ID = identical session
   */
  private mergeSessions(localSessions: GoalSession[], remoteSessions: GoalSession[]): GoalSession[] {
    const sessionsMap = new Map<string, GoalSession>();

    // Add all local sessions
    for (const session of localSessions) {
      sessionsMap.set(session.id, session);
    }

    // Add remote sessions (deduplicate)
    for (const session of remoteSessions) {
      if (!sessionsMap.has(session.id)) {
        sessionsMap.set(session.id, session);
      }
    }

    // Sort by startTime for consistent ordering
    return Array.from(sessionsMap.values()).sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Merge achievements by deduplicating by ID
   * Achievements are immutable once unlocked
   */
  private mergeAchievements(
    localAchievements: AchievementRecord[],
    remoteAchievements: AchievementRecord[]
  ): AchievementRecord[] {
    const achievementsMap = new Map<string, AchievementRecord>();

    // Add all local achievements
    for (const achievement of localAchievements) {
      achievementsMap.set(achievement.id, achievement);
    }

    // Add remote achievements (deduplicate)
    for (const achievement of remoteAchievements) {
      const existing = achievementsMap.get(achievement.id);
      if (!existing) {
        achievementsMap.set(achievement.id, achievement);
      } else {
        // If both exist, prefer the one with earlier unlock time
        if (achievement.unlockedAt < existing.unlockedAt) {
          achievementsMap.set(achievement.id, achievement);
        }
      }
    }

    return Array.from(achievementsMap.values());
  }

  /**
   * Merge active sessions - prefer the most recently updated one
   */
  private mergeActiveSession(
    local: ActiveSession | null,
    remote: ActiveSession | null
  ): ActiveSession | null {
    if (!local && !remote) return null;
    if (!local) return remote;
    if (!remote) return local;

    // Both exist - prefer most recently updated
    return remote.lastUpdated > local.lastUpdated ? remote : local;
  }

  /**
   * Validate sync data structure
   */
  validateSyncData(data: any): data is SyncData {
    if (!data || typeof data !== 'object') return false;
    if (typeof data.version !== 'number') return false;
    if (typeof data.instanceId !== 'string') return false;
    if (typeof data.exportedAt !== 'number') return false;
    if (!Array.isArray(data.goals)) return false;
    if (!Array.isArray(data.sessions)) return false;
    if (!Array.isArray(data.achievements)) return false;
    return true;
  }

  /**
   * Get statistics about sync data
   */
  getSyncStats(data: SyncData): {
    goalCount: number;
    sessionCount: number;
    achievementCount: number;
    totalTimeSpent: number;
    lastModified: number;
  } {
    const totalTimeSpent = data.goals.reduce((sum, goal) => sum + goal.totalTimeSpent, 0);
    const lastModified = Math.max(
      ...data.goals.map(g => g.lastModified),
      ...data.sessions.map(s => s.startTime),
      0
    );

    return {
      goalCount: data.goals.length,
      sessionCount: data.sessions.length,
      achievementCount: data.achievements.length,
      totalTimeSpent,
      lastModified
    };
  }
}

// Export singleton instance
export const syncManager = new SyncManager();
