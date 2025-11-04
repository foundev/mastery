import { ACTIVE_SESSION_KEY, GOALS_KEY, SESSIONS_KEY } from './constants';
import { appendSession, getActiveSession, getLastBackup, loadAchievements, loadGoals, loadSessions, saveAchievements, saveActiveSession, saveGoals, saveLastBackup } from './storage';
import { formatDuration, formatHMS, hoursToMilliseconds, millisecondsToHours, estimateCompletion, validateDailyLimit, formatTimeSince } from './time';
import { hideModal, showModal } from './ui/modals';
import { GOAL_TEMPLATES } from './templates';
import { renderProgressChart, renderAnalyticsCharts } from './charts';
import { buildAchievementDefinitions, resolveAchievementDefinition } from './achievements';
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
    close: requireElement<HTMLButtonElement>('achievementsClose'),
    pagination: requireElement<HTMLDivElement>('achievementsPagination'),
    status: requireElement<HTMLSpanElement>('achievementsPageStatus'),
    prev: requireElement<HTMLButtonElement>('achievementsPrev'),
    next: requireElement<HTMLButtonElement>('achievementsNext')
  };
  private readonly achievementToast = requireElement<HTMLDivElement>('achievementToast');

  private achievements: AchievementRecord[] = [];
  private achievementDefinitions: AchievementDefinition[] = [];
  private achievementsPage = 1;
  private readonly achievementsPageSize = 6;

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
    this.achievementsModal.prev.addEventListener('click', () => this.changeAchievementsPage(-1));
    this.achievementsModal.next.addEventListener('click', () => this.changeAchievementsPage(1));
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
    this.achievementsPage = 1;
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

      startBtn.disabled = goal.isActive;
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

  private getUnlockedAchievements(): { record: AchievementRecord; definition: AchievementDefinition }[] {
    const definitionMap = new Map(this.achievementDefinitions.map((definition) => [definition.id, definition]));
    return this.achievements
      .map((record) => {
        const definition = definitionMap.get(record.id) ?? resolveAchievementDefinition(record.id, this.goals);
        if (!definition) {
          return null;
        }
        return { record, definition };
      })
      .filter((value): value is { record: AchievementRecord; definition: AchievementDefinition } => value !== null)
      .sort((a, b) => b.record.unlockedAt - a.record.unlockedAt);
  }

  private changeAchievementsPage(offset: number): void {
    const unlocked = this.getUnlockedAchievements();
    if (unlocked.length === 0) {
      this.achievementsPage = 1;
      this.renderAchievementsView();
      return;
    }
    const totalPages = Math.max(1, Math.ceil(unlocked.length / this.achievementsPageSize));
    const nextPage = Math.min(totalPages, Math.max(1, this.achievementsPage + offset));
    if (nextPage !== this.achievementsPage) {
      this.achievementsPage = nextPage;
      this.renderAchievementsView();
    }
  }

  private renderAchievementsView(): void {
    const list = this.achievementsModal.list;
    const pagination = this.achievementsModal.pagination;
    const status = this.achievementsModal.status;
    const prev = this.achievementsModal.prev;
    const next = this.achievementsModal.next;
    list.innerHTML = '';

    const unlocked = this.getUnlockedAchievements();

    if (unlocked.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'No awards unlocked yet. Track progress to earn your first one.';
      list.appendChild(empty);
      pagination.style.display = 'none';
      return;
    }

    const totalPages = Math.max(1, Math.ceil(unlocked.length / this.achievementsPageSize));
    if (this.achievementsPage > totalPages) {
      this.achievementsPage = totalPages;
    }
    const startIndex = (this.achievementsPage - 1) * this.achievementsPageSize;
    const pageItems = unlocked.slice(startIndex, startIndex + this.achievementsPageSize);
    const goalTitles = new Map(this.goals.map((goal) => [goal.id, goal.title]));

    const fragment = document.createDocumentFragment();
    pageItems.forEach(({ record, definition }) => {
      const card = document.createElement('article');
      card.className = 'achievement-card';

      const header = document.createElement('div');
      header.className = 'achievement-header';

      const icon = document.createElement('span');
      icon.className = 'achievement-icon';
      icon.textContent = '🏆';

      const heading = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = definition.title;
      heading.appendChild(title);

      header.appendChild(icon);
      header.appendChild(heading);

      const description = document.createElement('p');
      description.className = 'achievement-description';
      description.textContent = definition.description;

      const meta = document.createElement('div');
      meta.className = 'achievement-meta';

      const unlockedLabel = document.createElement('span');
      unlockedLabel.className = 'achievement-date';
      unlockedLabel.textContent = `Unlocked ${new Date(record.unlockedAt).toLocaleDateString()}`;

      const goalLabel = document.createElement('span');
      const goalTitle = goalTitles.get(definition.goalId) ?? 'Goal removed';
      goalLabel.textContent = `Goal • ${goalTitle}`;

      meta.append(unlockedLabel, goalLabel);

      card.append(header, description, meta);
      fragment.appendChild(card);
    });

    list.appendChild(fragment);

    pagination.style.display = 'flex';
    status.textContent = `Page ${this.achievementsPage} of ${totalPages}`;
    prev.disabled = this.achievementsPage <= 1;
    next.disabled = this.achievementsPage >= totalPages;
  }

  private evaluateAchievements(notify: boolean): void {
    const definitions = buildAchievementDefinitions(this.goals);
    const definitionMap = new Map<string, AchievementDefinition>();
    definitions.forEach((def) => definitionMap.set(def.id, def));

    const validGoalIds = new Set(this.goals.map((goal) => goal.id));
    const records = this.achievements.filter((record) => validGoalIds.has(record.goalId));
    const recordMap = new Map(records.map((record) => [record.id, record]));
    const goalMap = new Map(this.goals.map((goal) => [goal.id, goal]));

    definitions.forEach((definition) => {
      const goal = goalMap.get(definition.goalId);
      if (!goal) {
        return;
      }
      const totalMs = hoursToMilliseconds(goal.totalHours);
      if (!(totalMs > 0)) {
        return;
      }
      const completionRatio = goal.totalTimeSpent / totalMs;
      const requiredRatio = definition.threshold / 100;
      if (completionRatio >= requiredRatio && !recordMap.has(definition.id)) {
        const record: AchievementRecord = {
          id: definition.id,
          goalId: goal.id,
          unlockedAt: Date.now(),
          seen: false
        };
        records.push(record);
        recordMap.set(record.id, record);
      }
    });

    for (const record of records) {
      if (!definitionMap.has(record.id)) {
        const resolved = resolveAchievementDefinition(record.id, this.goals);
        if (resolved) {
          definitionMap.set(resolved.id, resolved);
        }
      }
    }

    this.achievementDefinitions = Array.from(definitionMap.values());
    this.achievements = records;
    saveAchievements(records);

    if (notify) {
      const unseen = records.filter((record) => !record.seen);
      const unseenDefinitions = unseen
        .map((record) => definitionMap.get(record.id) ?? resolveAchievementDefinition(record.id, this.goals))
        .filter((definition): definition is AchievementDefinition => Boolean(definition));

      if (unseenDefinitions.length > 0) {
        this.showAchievementCelebration(unseenDefinitions);
        unseen.forEach((record) => {
          record.seen = true;
        });
        saveAchievements(records);
      }
    }

    this.renderAchievementsView();
  }

  private showAchievementCelebration(definitions: AchievementDefinition[]): void {
    if (definitions.length === 0) return;
    const toast = this.achievementToast;
    const items = definitions
      .map(
        (definition) =>
          `<li><strong>${definition.title}</strong><span>${definition.description}</span></li>`
      )
      .join('');
    toast.innerHTML = `
      <div class="achievement-toast-content">
        <h3>${definitions.length > 1 ? 'New Achievements!' : 'New Achievement!'}</h3>
        <ul>${items}</ul>
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
