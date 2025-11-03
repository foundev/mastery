import { ACTIVE_SESSION_KEY, GOALS_KEY, LEGACY_GLOBAL_ACHIEVEMENT_GOAL_ID, SESSIONS_KEY } from './constants';
import { appendSession, getActiveSession, getLastBackup, loadAchievements, loadGoals, loadSessions, saveAchievements, saveActiveSession, saveGoals, saveLastBackup } from './storage';
import { formatDuration, formatHMS, hoursToMilliseconds, millisecondsToHours, estimateCompletion, validateDailyLimit, formatTimeSince } from './time';
import { hideModal, showModal } from './ui/modals';
import { GOAL_TEMPLATES } from './templates';
import { renderProgressChart, renderAnalyticsCharts } from './charts';
import { buildAchievementDefinitions, resolveAchievementDefinition, sortAchievements } from './achievements';
import { requireElement, requireTemplate } from './dom';
import type { Goal, GoalSession, AchievementDefinition, AchievementRecord } from './types';

interface ProgressCharts {
  resize?: () => void;
}

interface AnalyticsCharts {
  resize?: () => void;
}

export class MasteryApp {
  private goals: Goal[] = [];
  private tickHandle: number | null = null;
  private addTimeGoalId: string | null = null;
  private deleteGoalId: string | null = null;
  private backupStatusTimer: number | null = null;
  private toastTimeout: number | null = null;

  private readonly goalsList = requireElement<HTMLDivElement>('goalsList');
  private readonly goalTemplate = requireTemplate('goalItemTmpl');

  private readonly modals = {
    addGoal: requireElement<HTMLDivElement>('addGoalModal'),
    addTime: requireElement<HTMLDivElement>('addTimeModal'),
    progress: requireElement<HTMLDivElement>('progressModal'),
    delete: requireElement<HTMLDivElement>('deleteModal'),
    analytics: requireElement<HTMLDivElement>('analyticsModal')
  };

  private readonly addGoalForm = {
    title: requireElement<HTMLInputElement>('ag_title'),
    description: requireElement<HTMLTextAreaElement>('ag_desc'),
    hours: requireElement<HTMLInputElement>('ag_hours'),
    suggestions: requireElement<HTMLDivElement>('ag_suggestions'),
    submit: requireElement<HTMLButtonElement>('ag_submit'),
    cancel: requireElement<HTMLButtonElement>('ag_cancel')
  };

  private readonly addTimeForm = {
    hours: requireElement<HTMLInputElement>('atm_hours'),
    date: requireElement<HTMLInputElement>('atm_date'),
    submit: requireElement<HTMLButtonElement>('atm_submit'),
    cancel: requireElement<HTMLButtonElement>('atm_cancel'),
    error: requireElement<HTMLDivElement>('atm_error')
  };

  private readonly progressViews = {
    stats: requireElement<HTMLDivElement>('pm_stats'),
    chart: requireElement<HTMLDivElement>('pm_chart'),
    close: requireElement<HTMLButtonElement>('pm_close'),
    title: requireElement<HTMLHeadingElement>('progressTitle')
  };

  private readonly analyticsViews = {
    trend: requireElement<HTMLDivElement>('an_trend'),
    pie: requireElement<HTMLDivElement>('an_pie'),
    close: requireElement<HTMLButtonElement>('an_close')
  };

  private readonly deleteViews = {
    question: requireElement<HTMLParagraphElement>('del_question'),
    warning: requireElement<HTMLParagraphElement>('del_warning'),
    confirm: requireElement<HTMLButtonElement>('del_confirm'),
    cancel: requireElement<HTMLButtonElement>('del_cancel')
  };

  private readonly backupStatus = requireElement<HTMLSpanElement>('backupStatus');
  private readonly achievementsModal = {
    modal: requireElement<HTMLDivElement>('achievementsModal'),
    list: requireElement<HTMLDivElement>('achievementsList'),
    filter: requireElement<HTMLSelectElement>('achievementsFilter'),
    empty: requireElement<HTMLDivElement>('achievementsEmpty'),
    close: requireElement<HTMLButtonElement>('achievementsClose')
  };
  private readonly achievementToast = requireElement<HTMLDivElement>('achievementToast');

  private achievements: AchievementRecord[] = [];
  private achievementDefinitionsByGoal = new Map<string, AchievementDefinition[]>();
  private achievementsFilterValue = 'all';

  private progressCharts: ProgressCharts = {};
  private analyticsCharts: AnalyticsCharts = {};

  constructor() {
    this.achievements = loadAchievements();
    this.goals = loadGoals();
    this.restoreActiveSession();
    this.bindGlobalButtons();
    this.setupAddGoalModal();
    this.setupAddTimeModal();
    this.setupDeleteModal();
    this.setupProgressModal();
    this.setupAnalyticsModal();
    this.setupAchievementsModal();
    this.setupBackupControls();
    this.setupPersistence();
    this.renderGoals();
    this.updateBackupStatus();
    this.startBackupStatusTimer();
    this.evaluateAchievements(true);
  }

  private bindGlobalButtons(): void {
    requireElement<HTMLButtonElement>('openAddGoalFab').addEventListener('click', () => this.openAddGoalModal());
    const analyticsBtn = document.getElementById('openAnalyticsBtn');
    analyticsBtn?.addEventListener('click', () => this.openAnalytics());
    const achievementsBtn = document.getElementById('openAchievementsBtn');
    achievementsBtn?.addEventListener('click', () => this.openAchievements());
  }

  private setupBackupControls(): void {
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importInput = document.getElementById('importInput') as HTMLInputElement | null;

    exportBtn?.addEventListener('click', () => this.exportBackup());
    if (importBtn && importInput) {
      importBtn.addEventListener('click', () => importInput.click());
      importInput.addEventListener('change', async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          this.importBackup(text);
        } catch {
          alert('Failed to read backup file.');
        } finally {
          importInput.value = '';
        }
      });
    }
  }

  private updateBackupStatus(): void {
    const last = getLastBackup();
    if (last) {
      this.backupStatus.textContent = `Last backup: ${formatTimeSince(last)}`;
    } else {
      this.backupStatus.textContent = 'No backup yet';
    }
  }

  private startBackupStatusTimer(): void {
    if (this.backupStatusTimer !== null) {
      window.clearInterval(this.backupStatusTimer);
    }
    this.backupStatusTimer = window.setInterval(() => this.updateBackupStatus(), 60_000);
  }

  private setupPersistence(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') return;
      const active = this.goals.find((goal) => goal.isActive && goal.startTime);
      if (active && active.startTime) {
        saveActiveSession({
          goalId: active.id,
          startTime: active.startTime,
          lastUpdated: Date.now()
        });
      }
    });

    window.addEventListener('beforeunload', () => {
      const active = this.goals.find((goal) => goal.isActive && goal.startTime);
      if (active && active.startTime) {
        saveActiveSession({
          goalId: active.id,
          startTime: active.startTime,
          lastUpdated: Date.now()
        });
      }
    });
  }

  private setupAddGoalModal(): void {
    const titleInput = this.addGoalForm.title;
    const hoursInput = this.addGoalForm.hours;
    const suggestions = this.addGoalForm.suggestions;

    titleInput.addEventListener('input', () => {
      this.renderTemplateSuggestions(titleInput.value);
      this.validateAddGoalForm();
    });
    hoursInput.addEventListener('input', () => this.validateAddGoalForm());

    this.addGoalForm.cancel.addEventListener('click', () => this.closeAddGoalModal());
    this.addGoalForm.submit.addEventListener('click', () => {
      const title = this.addGoalForm.title.value.trim();
      const description = this.addGoalForm.description.value.trim();
      const totalHours = Math.max(0.1, Number(this.addGoalForm.hours.value));
      this.addGoal(title, totalHours, description);
      this.closeAddGoalModal();
      suggestions.innerHTML = '';
      suggestions.style.display = 'none';
    });
  }

  private setupAddTimeModal(): void {
    const today = new Date().toISOString().split('T')[0];
    this.addTimeForm.date.setAttribute('max', today);
    this.addTimeForm.hours.addEventListener('input', () => {
      const hours = Number(this.addTimeForm.hours.value);
      this.addTimeForm.submit.disabled = !(hours > 0);
      if (hours > 0) {
        this.addTimeForm.error.style.display = 'none';
      }
    });
    this.addTimeForm.cancel.addEventListener('click', () => this.closeAddTimeModal());
    this.addTimeForm.submit.addEventListener('click', () => this.handleManualTimeSubmit());
  }

  private setupDeleteModal(): void {
    this.deleteViews.cancel.addEventListener('click', () => hideModal(this.modals.delete));
    this.deleteViews.confirm.addEventListener('click', () => {
      if (this.deleteGoalId) {
        this.deleteGoal(this.deleteGoalId);
      }
      this.deleteGoalId = null;
      hideModal(this.modals.delete);
    });
  }

  private setupProgressModal(): void {
    this.progressViews.close.addEventListener('click', () => {
      hideModal(this.modals.progress);
      this.progressCharts.resize = undefined;
    });
  }

  private setupAnalyticsModal(): void {
    this.analyticsViews.close.addEventListener('click', () => {
      hideModal(this.modals.analytics);
      if (this.analyticsCharts.resize) {
        window.removeEventListener('resize', this.analyticsCharts.resize);
      }
      this.analyticsCharts.resize = undefined;
    });
  }

  private setupAchievementsModal(): void {
    this.achievementsModal.close.addEventListener('click', () => hideModal(this.achievementsModal.modal));
    this.achievementsModal.filter.addEventListener('change', (event) => {
      const value = (event.target as HTMLSelectElement).value;
      this.achievementsFilterValue = value;
      this.renderAchievementsView();
    });
  }

  private restoreActiveSession(): void {
    const saved = getActiveSession();
    if (!saved) return;
    const goal = this.goals.find((g) => g.id === saved.goalId);
    if (!goal) {
      saveActiveSession(null);
      return;
    }
    goal.isActive = true;
    goal.startTime = saved.startTime;
    saveGoals(this.goals);
  }

  private renderTemplateSuggestions(query: string): void {
    const container = this.addGoalForm.suggestions;
    container.innerHTML = '';
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) {
      container.style.display = 'none';
      return;
    }

    const matches = GOAL_TEMPLATES.filter(
      (template) =>
        template.title.toLowerCase().includes(normalized) ||
        template.keywords.some((keyword) => keyword.includes(normalized))
    );

    if (matches.length === 0) {
      container.style.display = 'none';
      return;
    }

    const fragment = document.createDocumentFragment();
    matches.slice(0, 20).forEach((template) => {
      const item = document.createElement('div');
      item.className = 'suggestion-item';
      item.innerHTML = `
        <div><strong>${template.title}</strong></div>
        <div class="small muted">${template.description}</div>
        <div class="small muted">${template.hours} hours • ${template.category}</div>
      `;
      item.addEventListener('click', () => {
        this.addGoalForm.title.value = template.title;
        this.addGoalForm.description.value = template.description;
        this.addGoalForm.hours.value = String(template.hours);
        container.style.display = 'none';
        this.validateAddGoalForm();
      });
      fragment.appendChild(item);
    });
    container.appendChild(fragment);
    container.style.display = 'block';
  }

  private validateAddGoalForm(): void {
    const titleValid = this.addGoalForm.title.value.trim().length > 0;
    const hoursValid = Number(this.addGoalForm.hours.value) > 0;
    this.addGoalForm.submit.disabled = !(titleValid && hoursValid);
  }

  private openAddGoalModal(): void {
    this.addGoalForm.title.value = '';
    this.addGoalForm.description.value = '';
    this.addGoalForm.hours.value = '';
    this.addGoalForm.suggestions.innerHTML = '';
    this.addGoalForm.suggestions.style.display = 'none';
    this.addGoalForm.submit.disabled = true;
    showModal(this.modals.addGoal);
    setTimeout(() => this.addGoalForm.title.focus(), 0);
  }

  private closeAddGoalModal(): void {
    hideModal(this.modals.addGoal);
  }

  private openAddTimeModal(goalId: string): void {
    this.addTimeGoalId = goalId;
    this.addTimeForm.hours.value = '';
    this.addTimeForm.date.value = '';
    this.addTimeForm.submit.disabled = true;
    this.addTimeForm.error.style.display = 'none';
    showModal(this.modals.addTime);
    setTimeout(() => this.addTimeForm.hours.focus(), 0);
  }

  private closeAddTimeModal(): void {
    hideModal(this.modals.addTime);
  }

  private openProgressModal(goalId: string): void {
    const goal = this.goals.find((g) => g.id === goalId);
    if (!goal) return;

    this.progressViews.title.textContent = `Progress: ${goal.title}`;
    const sessions = loadSessions().filter((session) => session.goalId === goal.id);
    const activeDelta =
      goal.isActive && goal.startTime ? Date.now() - goal.startTime : 0;
    const totalTime = goal.totalTimeSpent + activeDelta;
    const totalHoursSpent = millisecondsToHours(totalTime);
    const remainingHours = Math.max(0, goal.totalHours - totalHoursSpent);
    const progressPct =
      goal.totalHours > 0 ? Math.min(100, (totalHoursSpent / goal.totalHours) * 100) : 0;
    const estimate = estimateCompletion(goal, loadSessions());

    const estimateText = estimate
      ? `<div><strong>Estimated completion:</strong> ${estimate.toLocaleDateString()}</div>`
      : '';
    this.progressViews.stats.innerHTML = `
      <div><strong>Total time:</strong> ${formatDuration(totalTime)} (${totalHoursSpent.toFixed(1)}h / ${goal.totalHours}h)</div>
      <div><strong>Progress:</strong> ${progressPct.toFixed(1)}%</div>
      <div><strong>Remaining:</strong> ${remainingHours.toFixed(1)}h</div>
      ${estimateText}
    `;

    showModal(this.modals.progress);
    setTimeout(() => {
      const chart = renderProgressChart(this.progressViews.chart, sessions, goal.title, goal.totalHours);
      const resize = () => chart.resize();
      this.progressCharts.resize = resize;
      window.addEventListener('resize', resize, { once: true });
    }, 100);
  }

  private openDeleteModal(goalId: string, title: string): void {
    this.deleteGoalId = goalId;
    this.deleteViews.question.textContent = `Are you sure you want to delete "${title}"?`;
    showModal(this.modals.delete);
  }

  private openAnalytics(): void {
    showModal(this.modals.analytics);
    setTimeout(() => {
      const sessions = loadSessions();
      const { trend, pie } = renderAnalyticsCharts(
        this.analyticsViews.trend,
        this.analyticsViews.pie,
        sessions,
        this.goals
      );
      const resize = () => {
        trend.resize();
        pie.resize();
      };
      if (this.analyticsCharts.resize) {
        window.removeEventListener('resize', this.analyticsCharts.resize);
      }
      this.analyticsCharts.resize = resize;
      window.addEventListener('resize', resize, { once: true });
    }, 50);
  }

  private openAchievements(): void {
    this.renderAchievementsView();
    showModal(this.achievementsModal.modal);
  }

  private handleManualTimeSubmit(): void {
    if (!this.addTimeGoalId) return;
    const hours = Number(this.addTimeForm.hours.value);
    if (!(hours > 0)) return;

    const targetDate = this.addTimeForm.date.value
      ? new Date(this.addTimeForm.date.value)
      : new Date();
    const allSessions = loadSessions();
    const validation = validateDailyLimit(allSessions, hours, targetDate);
    if (!validation.ok) {
      this.addTimeForm.error.textContent = validation.message ?? 'Unable to add time.';
      this.addTimeForm.error.style.display = 'block';
      return;
    }

    const duration = hoursToMilliseconds(hours);
    const endTime = new Date(targetDate);
    const startTime = endTime.getTime() - duration;
    const session: GoalSession = {
      goalId: this.addTimeGoalId,
      startTime,
      endTime: endTime.getTime(),
      duration
    };
    appendSession(session);

    const goal = this.goals.find((g) => g.id === this.addTimeGoalId);
    if (goal) {
      goal.totalTimeSpent += duration;
      saveGoals(this.goals);
    }

    this.closeAddTimeModal();
    this.renderGoals();
    this.evaluateAchievements(true);
  }

  private addGoal(title: string, totalHours: number, description: string): void {
    const goal: Goal = {
      id: crypto.randomUUID(),
      title,
      description,
      totalHours,
      totalTimeSpent: 0,
      isActive: false,
      createdAt: Date.now()
    };
    this.goals.push(goal);
    saveGoals(this.goals);
    this.renderGoals();
    this.evaluateAchievements(false);
  }

  private deleteGoal(goalId: string): void {
    const goal = this.goals.find((g) => g.id === goalId);
    if (goal?.isActive) {
      this.stopGoal();
    }
    this.goals = this.goals.filter((g) => g.id !== goalId);
    saveGoals(this.goals);
    this.renderGoals();
    this.evaluateAchievements(false);
  }

  private startGoal(goalId: string): void {
    // ensure only one session running
    const active = this.goals.find((g) => g.isActive);
    if (active && active.id !== goalId) {
      return;
    }
    if (active && active.id === goalId) {
      return;
    }
    const goal = this.goals.find((g) => g.id === goalId);
    if (!goal) return;
    goal.isActive = true;
    goal.startTime = Date.now();
    saveGoals(this.goals);
    saveActiveSession({
      goalId: goal.id,
      startTime: goal.startTime,
      lastUpdated: Date.now()
    });
    this.renderGoals();
  }

  private stopGoal(): void {
    const now = Date.now();
    let changed = false;
    this.goals = this.goals.map((goal) => {
      if (goal.isActive && goal.startTime) {
        const duration = now - goal.startTime;
        const session: GoalSession = {
          goalId: goal.id,
          startTime: goal.startTime,
          endTime: now,
          duration
        };
        appendSession(session);
        changed = true;
        return {
          ...goal,
          isActive: false,
          startTime: undefined,
          totalTimeSpent: goal.totalTimeSpent + duration
        };
      }
      return goal;
    });
    if (changed) {
      saveGoals(this.goals);
    }
    saveActiveSession(null);
    this.renderGoals();
    this.evaluateAchievements(changed);
  }

  private ensureTicker(): void {
    const anyActive = this.goals.some((goal) => goal.isActive);
    if (anyActive && this.tickHandle == null) {
      this.tickHandle = window.setInterval(() => this.updateLiveTimers(), 1000);
    } else if (!anyActive && this.tickHandle != null) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
  }

  private updateLiveTimers(): void {
    const goalNodes = this.goalsList.querySelectorAll<HTMLElement>('.goal');
    this.goals.forEach((goal, index) => {
      if (!goal.isActive || !goal.startTime) return;
      const live = goalNodes[index]?.querySelector<HTMLElement>('.liveTimer');
      if (live) {
        live.textContent = formatHMS((Date.now() - goal.startTime) / 1000);
      }
    });
  }

  private renderGoals(): void {
    this.goalsList.innerHTML = '';

    this.goals.forEach((goal) => {
      const node = document.importNode(this.goalTemplate.content, true);
      const root = node.querySelector('.goal') as HTMLElement;
      const title = node.querySelector('h3');
      const progressBar = node.querySelector<HTMLElement>('.progress > span');
      const meta = node.querySelector<HTMLElement>('.meta');
      const liveTimer = node.querySelector<HTMLElement>('.liveTimer');
      const startBtn = node.querySelector<HTMLButtonElement>('.startBtn');
      const stopBtn = node.querySelector<HTMLButtonElement>('.stopBtn');
      const addTimeBtn = node.querySelector<HTMLButtonElement>('.addTimeBtn');
      const progressBtn = node.querySelector<HTMLButtonElement>('.progressBtn');
      const deleteBtn = node.querySelector<HTMLButtonElement>('.deleteBtn');

      if (!root || !title || !progressBar || !meta || !liveTimer || !startBtn || !stopBtn || !addTimeBtn || !progressBtn || !deleteBtn) {
        return;
      }

      title.textContent = goal.title;
      const percent =
        goal.totalHours > 0
          ? Math.min(100, (millisecondsToHours(goal.totalTimeSpent) / goal.totalHours) * 100)
          : 0;
      progressBar.style.width = `${percent}%`;
      meta.textContent = `${millisecondsToHours(goal.totalTimeSpent).toFixed(1)} / ${goal.totalHours} h (${percent.toFixed(0)}%)`;
      liveTimer.textContent =
        goal.isActive && goal.startTime
          ? formatHMS((Date.now() - goal.startTime) / 1000)
          : '00:00:00';

      startBtn.disabled = goal.isActive || this.goals.some((g) => g.isActive && g.id !== goal.id);
      stopBtn.disabled = !goal.isActive;

      if (goal.isActive) {
        root.classList.add('active');
      }

      const ariaProgress = root.querySelector('.progress') as HTMLElement | null;
      if (ariaProgress) {
        ariaProgress.setAttribute('aria-valuemin', '0');
        ariaProgress.setAttribute('aria-valuemax', String(Math.max(1, goal.totalHours)));
        ariaProgress.setAttribute(
          'aria-valuenow',
          millisecondsToHours(goal.totalTimeSpent).toFixed(1)
        );
      }

      startBtn.addEventListener('click', () => this.startGoal(goal.id));
      stopBtn.addEventListener('click', () => this.stopGoal());
      addTimeBtn.addEventListener('click', () => this.openAddTimeModal(goal.id));
      progressBtn.addEventListener('click', () => this.openProgressModal(goal.id));
      deleteBtn.addEventListener('click', () => this.openDeleteModal(goal.id, goal.title));

      this.goalsList.appendChild(node);
    });

    this.ensureTicker();
  }

  private getGoalBaseTitle(goalId: string): string {
    if (goalId === LEGACY_GLOBAL_ACHIEVEMENT_GOAL_ID) {
      return 'Legacy awards';
    }
    const goal = this.goals.find((g) => g.id === goalId);
    if (goal) {
      return goal.title;
    }
    const record = this.achievements.find((entry) => entry.goalId === goalId && entry.goalTitle);
    if (record?.goalTitle) {
      return record.goalTitle;
    }
    return goalId;
  }

  private formatGoalDisplayName(goalId: string): string {
    if (goalId === LEGACY_GLOBAL_ACHIEVEMENT_GOAL_ID) {
      return 'Legacy awards';
    }
    const base = this.getGoalBaseTitle(goalId);
    const exists = this.goals.some((goal) => goal.id === goalId);
    return exists ? base : `${base} (Archived)`;
  }

  private getAchievementFilterOptions(): { id: string; label: string }[] {
    const keys = Array.from(this.achievementDefinitionsByGoal.keys());
    if (keys.length === 0) {
      return [];
    }
    const options: { id: string; label: string }[] = [];
    const remaining = new Set(keys);
    this.goals.forEach((goal) => {
      if (remaining.has(goal.id)) {
        options.push({ id: goal.id, label: goal.title });
        remaining.delete(goal.id);
      }
    });
    const extras: { id: string; label: string }[] = [];
    remaining.forEach((goalId) => {
      const label = this.formatGoalDisplayName(goalId);
      extras.push({ id: goalId, label });
    });
    extras.sort((a, b) => a.label.localeCompare(b.label));
    return [...options, ...extras];
  }

  private createAchievementGrid(goalId: string): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'achievements-grid';
    const definitions = this.achievementDefinitionsByGoal.get(goalId) ?? [];
    const recordsById = new Map(
      this.achievements
        .filter((record) => record.goalId === goalId)
        .map((record) => [record.id, record] as const)
    );
    definitions.forEach((definition) => {
      const record = recordsById.get(definition.id);
      const card = document.createElement('div');
      card.className = `achievement-card ${record ? 'unlocked' : 'locked'}`;
      const status = record
        ? `Unlocked ${new Date(record.unlockedAt).toLocaleDateString()}`
        : 'Locked';
      card.innerHTML = `
        <div class="achievement-header">
          <span class="achievement-icon" aria-hidden="true">${definition.category === 'streak' ? '🔥' : '⚡'}</span>
          <div>
            <strong>${definition.title}</strong>
            <div class="achievement-status">${status}</div>
          </div>
        </div>
        <p class="achievement-description">${definition.description}</p>
      `;
      grid.appendChild(card);
    });
    return grid;
  }

  private createAchievementSection(goalId: string): HTMLElement {
    const section = document.createElement('section');
    section.className = 'achievement-section';
    const heading = document.createElement('h4');
    heading.textContent = this.formatGoalDisplayName(goalId);
    section.appendChild(heading);
    section.appendChild(this.createAchievementGrid(goalId));
    return section;
  }

  private renderAchievementsView(): void {
    const { list, empty, filter } = this.achievementsModal;
    const options = this.getAchievementFilterOptions();
    const availableIds = new Set(options.map((option) => option.id));
    if (this.achievementsFilterValue !== 'all' && !availableIds.has(this.achievementsFilterValue)) {
      this.achievementsFilterValue = 'all';
    }

    filter.innerHTML = '';
    const selectFragment = document.createDocumentFragment();
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All goals';
    selectFragment.appendChild(allOption);
    options.forEach((option) => {
      const opt = document.createElement('option');
      opt.value = option.id;
      opt.textContent = option.label;
      selectFragment.appendChild(opt);
    });
    filter.appendChild(selectFragment);
    filter.value = this.achievementsFilterValue;
    filter.disabled = options.length === 0;

    list.innerHTML = '';
    if (options.length === 0) {
      empty.style.display = 'block';
      list.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    list.style.display = '';

    const targetIds =
      this.achievementsFilterValue === 'all'
        ? options.map((option) => option.id)
        : [this.achievementsFilterValue];

    const fragment = document.createDocumentFragment();
    targetIds.forEach((goalId) => {
      fragment.appendChild(this.createAchievementSection(goalId));
    });
    list.appendChild(fragment);
  }

  private computeAchievementStats(sessions: GoalSession[]): { longestStreak: number; maxDailyHours: number } {
    if (sessions.length === 0) {
      return { longestStreak: 0, maxDailyHours: 0 };
    }

    const dayTotals = new Map<number, number>();
    sessions.forEach((session) => {
      const day = new Date(session.startTime);
      day.setHours(0, 0, 0, 0);
      const key = day.getTime();
      const hours = millisecondsToHours(session.duration);
      dayTotals.set(key, (dayTotals.get(key) ?? 0) + hours);
    });

    const sortedDays = Array.from(dayTotals.keys()).sort((a, b) => a - b);
    const DAY_MS = 86_400_000;
    const DST_FLEX = 3_600_000;
    let longest = 0;
    let current = 0;
    let previous: number | null = null;
    for (const dayMs of sortedDays) {
      if (previous === null) {
        current = 1;
      } else {
        const diff = dayMs - previous;
        if (diff >= DAY_MS - DST_FLEX && diff <= DAY_MS + DST_FLEX) {
          current += 1;
        } else if (dayMs !== previous) {
          current = 1;
        }
      }
      longest = Math.max(longest, current);
      previous = dayMs;
    }
    if (longest === 0 && sortedDays.length > 0) {
      longest = 1;
    }

    let maxHours = 0;
    dayTotals.forEach((hours) => {
      if (hours > maxHours) {
        maxHours = hours;
      }
    });

    return { longestStreak: longest, maxDailyHours: maxHours };
  }

  private evaluateAchievements(notify: boolean): void {
    const sessions = loadSessions();
    const records = [...this.achievements];
    const recordKey = (goalId: string, achievementId: string) => `${goalId}::${achievementId}`;
    const recordMap = new Map<string, AchievementRecord>();
    records.forEach((record) => {
      recordMap.set(recordKey(record.goalId, record.id), record);
    });

    const goalIds = new Set<string>();
    this.goals.forEach((goal) => goalIds.add(goal.id));
    sessions.forEach((session) => {
      if (session.goalId) {
        goalIds.add(session.goalId);
      }
    });
    records.forEach((record) => {
      if (record.goalId) {
        goalIds.add(record.goalId);
      }
    });

    const sessionsByGoal = new Map<string, GoalSession[]>();
    sessions.forEach((session) => {
      if (!sessionsByGoal.has(session.goalId)) {
        sessionsByGoal.set(session.goalId, []);
      }
      sessionsByGoal.get(session.goalId)!.push(session);
    });

    const statsByGoal = new Map<string, { longestStreak: number; maxDailyHours: number }>();
    const definitionMaps = new Map<string, Map<string, AchievementDefinition>>();

    const findGoalTitle = (goalId: string): string => this.getGoalBaseTitle(goalId);

    goalIds.forEach((goalId) => {
      const goalSessions = sessionsByGoal.get(goalId) ?? [];
      const stats = this.computeAchievementStats(goalSessions);
      statsByGoal.set(goalId, stats);
      const definitions = buildAchievementDefinitions(stats.longestStreak);
      definitionMaps.set(goalId, new Map(definitions.map((def) => [def.id, def])));
    });

    goalIds.forEach((goalId) => {
      const defMap = definitionMaps.get(goalId);
      if (!defMap) return;
      const stats = statsByGoal.get(goalId) ?? { longestStreak: 0, maxDailyHours: 0 };
      defMap.forEach((definition) => {
        const key = recordKey(goalId, definition.id);
        if (recordMap.has(key)) {
          return;
        }
        const meetsThreshold =
          definition.category === 'streak'
            ? stats.longestStreak >= definition.threshold
            : stats.maxDailyHours >= definition.threshold;
        if (meetsThreshold) {
          const record: AchievementRecord = {
            id: definition.id,
            goalId,
            goalTitle: findGoalTitle(goalId),
            unlockedAt: Date.now(),
            seen: false
          };
          records.push(record);
          recordMap.set(key, record);
        }
      });
    });

    records.forEach((record) => {
      let defMap = definitionMaps.get(record.goalId);
      if (!defMap) {
        defMap = new Map<string, AchievementDefinition>();
        definitionMaps.set(record.goalId, defMap);
      }
      if (!defMap.has(record.id)) {
        const resolved = resolveAchievementDefinition(record.id);
        if (resolved) {
          defMap.set(resolved.id, resolved);
        }
      }
      if (!record.goalTitle || record.goalTitle.trim().length === 0) {
        record.goalTitle = findGoalTitle(record.goalId);
      }
    });

    const sortedDefinitionMap = new Map<string, AchievementDefinition[]>();
    definitionMaps.forEach((map, goalId) => {
      sortedDefinitionMap.set(goalId, sortAchievements(Array.from(map.values())));
    });

    this.achievementDefinitionsByGoal = sortedDefinitionMap;
    this.achievements = records;
    saveAchievements(records);

    if (notify) {
      const unseen = records.filter((record) => !record.seen);
      const unseenItems = unseen
        .map((record) => {
          const definition =
            definitionMaps.get(record.goalId)?.get(record.id) ?? resolveAchievementDefinition(record.id);
          if (!definition) {
            return null;
          }
          const goalTitle = record.goalTitle ?? findGoalTitle(record.goalId);
          return { record, definition, goalTitle };
        })
        .filter(
          (
            item
          ): item is { record: AchievementRecord; definition: AchievementDefinition; goalTitle: string } =>
            Boolean(item)
        );

      if (unseenItems.length > 0) {
        this.showAchievementCelebration(
          unseenItems.map((item) => ({ definition: item.definition, goalTitle: item.goalTitle }))
        );
        unseenItems.forEach((item) => {
          item.record.seen = true;
          if (!item.record.goalTitle) {
            item.record.goalTitle = item.goalTitle;
          }
        });
        saveAchievements(records);
      }
    }

    this.renderAchievementsView();
  }

  private showAchievementCelebration(items: { definition: AchievementDefinition; goalTitle: string }[]): void {
    if (items.length === 0) return;
    const toast = this.achievementToast;
    const listItems = items
      .map(
        ({ definition, goalTitle }) =>
          `<li><strong>${definition.title}</strong><span>${goalTitle} • ${definition.description}</span></li>`
      )
      .join('');
    toast.innerHTML = `
      <div class="achievement-toast-content">
        <h3>${items.length > 1 ? 'New Achievements!' : 'New Achievement!'}</h3>
        <ul>${listItems}</ul>
        <button type="button" class="toast-close">Nice!</button>
      </div>
    `;
    toast.classList.add('visible');

    const clearContent = () => {
      toast.classList.remove('visible');
      window.setTimeout(() => {
        toast.innerHTML = '';
      }, 250);
    };

    const cancelTimeout = () => {
      if (this.toastTimeout !== null) {
        window.clearTimeout(this.toastTimeout);
        this.toastTimeout = null;
      }
    };

    const hide = () => {
      cancelTimeout();
      clearContent();
    };

    cancelTimeout();
    const closeButton = toast.querySelector<HTMLButtonElement>('.toast-close');
    closeButton?.addEventListener('click', hide, { once: true });
    this.toastTimeout = window.setTimeout(() => {
      this.toastTimeout = null;
      clearContent();
    }, 6000);
  }

  private exportBackup(): void {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      goals: loadGoals(),
      sessions: loadSessions(),
      activeSession: getActiveSession()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `mastery-backup-${timestamp}.json`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      anchor.remove();
    }, 0);
    saveLastBackup(Date.now());
    this.updateBackupStatus();
  }

  private importBackup(jsonText: string): void {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed || typeof parsed !== 'object') {
        alert('Invalid backup format.');
        return;
      }
      const { goals, sessions, activeSession } = parsed as {
        goals?: Goal[];
        sessions?: GoalSession[];
        activeSession?: any;
      };
      if (!Array.isArray(goals) || !Array.isArray(sessions)) {
        alert('Backup missing goals or sessions arrays.');
        return;
      }
      if (!confirm('Importing will replace your current data. Continue?')) {
        return;
      }
      localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
      if (activeSession) {
        localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(activeSession));
      } else {
        localStorage.removeItem(ACTIVE_SESSION_KEY);
      }
      this.goals = loadGoals();
      this.renderGoals();
      this.evaluateAchievements(false);
      saveLastBackup(Date.now());
      this.updateBackupStatus();
      alert('Backup imported successfully.');
    } catch {
      alert('Invalid JSON backup.');
    }
  }
}

export function initApp(): MasteryApp {
  return new MasteryApp();
}
