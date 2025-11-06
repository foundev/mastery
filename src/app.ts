import { ACTIVE_SESSION_KEY, GOALS_KEY, SESSIONS_KEY } from './constants';
import { appendSession, getActiveSession, getLastBackup, loadAchievements, loadGoals, loadSessions, saveAchievements, saveActiveSession, saveGoals, saveLastBackup, saveSessions } from './storage';
import {
  calculateDailyStreak,
  formatDuration,
  formatHMS,
  hoursToMilliseconds,
  millisecondsToHours,
  estimateCompletion,
  validateDailyLimit,
  formatTimeSince
} from './time';
import { hideModal, showModal } from './ui/modals';
import { GOAL_TEMPLATES } from './templates';
import { renderProgressChart, renderAnalyticsCharts } from './charts';
import { buildAchievementDefinitions, resolveAchievementDefinition } from './achievements';
import { requireElement, requireTemplate } from './dom';
import { syncManager } from './sync';
import { webrtcManager } from './webrtc';
import type { Goal, GoalSession, AchievementDefinition, AchievementRecord } from './types';
import QRCode from 'qrcode';
import QrScanner from 'qr-scanner';
import qrScannerWorkerUrl from 'qr-scanner/qr-scanner-worker.min.js?url';

QrScanner.WORKER_PATH = qrScannerWorkerUrl;

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
  private readonly archivedSection = requireElement<HTMLDivElement>('archivedSection');
  private readonly archivedList = requireElement<HTMLDivElement>('archivedList');
  private readonly archivedEmpty = requireElement<HTMLParagraphElement>('archivedEmpty');
  private readonly archivedGoalTemplate = requireTemplate('archivedGoalItemTmpl');

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

  private readonly p2pModal = {
    modal: requireElement<HTMLDivElement>('p2pSyncModal'),
    statusText: requireElement<HTMLSpanElement>('p2p_status_text'),
    disconnectedView: requireElement<HTMLDivElement>('p2p_disconnected_view'),
    initiatorView: requireElement<HTMLDivElement>('p2p_initiator_view'),
    responderView: requireElement<HTMLDivElement>('p2p_responder_view'),
    connectedView: requireElement<HTMLDivElement>('p2p_connected_view'),
    createOfferBtn: requireElement<HTMLButtonElement>('p2p_create_offer_btn'),
    respondBtn: requireElement<HTMLButtonElement>('p2p_respond_btn'),
    offerCode: requireElement<HTMLTextAreaElement>('p2p_offer_code'),
    copyOfferBtn: requireElement<HTMLButtonElement>('p2p_copy_offer_btn'),
    answerInput: requireElement<HTMLTextAreaElement>('p2p_answer_input'),
    completeBtn: requireElement<HTMLButtonElement>('p2p_complete_btn'),
    offerInput: requireElement<HTMLTextAreaElement>('p2p_offer_input'),
    createAnswerBtn: requireElement<HTMLButtonElement>('p2p_create_answer_btn'),
    answerDisplay: requireElement<HTMLDivElement>('p2p_answer_display'),
    answerCode: requireElement<HTMLTextAreaElement>('p2p_answer_code'),
    copyAnswerBtn: requireElement<HTMLButtonElement>('p2p_copy_answer_btn'),
    offerQrWrapper: requireElement<HTMLDivElement>('p2p_offer_qr_wrapper'),
    offerQrCanvas: requireElement<HTMLCanvasElement>('p2p_offer_qr'),
    answerQrWrapper: requireElement<HTMLDivElement>('p2p_answer_qr_wrapper'),
    answerQrCanvas: requireElement<HTMLCanvasElement>('p2p_answer_qr'),
    offerScanBtn: requireElement<HTMLButtonElement>('p2p_offer_scan_btn'),
    offerScanSection: requireElement<HTMLDivElement>('p2p_offer_scan'),
    offerScanVideo: requireElement<HTMLVideoElement>('p2p_offer_scan_video'),
    offerScanStatus: requireElement<HTMLParagraphElement>('p2p_offer_scan_status'),
    answerScanBtn: requireElement<HTMLButtonElement>('p2p_answer_scan_btn'),
    answerScanSection: requireElement<HTMLDivElement>('p2p_answer_scan'),
    answerScanVideo: requireElement<HTMLVideoElement>('p2p_answer_scan_video'),
    answerScanStatus: requireElement<HTMLParagraphElement>('p2p_answer_scan_status'),
    syncNowBtn: requireElement<HTMLButtonElement>('p2p_sync_now_btn'),
    disconnectBtn: requireElement<HTMLButtonElement>('p2p_disconnect_btn'),
    closeBtn: requireElement<HTMLButtonElement>('p2p_close_btn')
  };

  private achievements: AchievementRecord[] = [];
  private achievementDefinitions: AchievementDefinition[] = [];
  private achievementsPage = 1;
  private readonly achievementsPageSize = 6;

  private progressCharts: ProgressCharts = {};
  private analyticsCharts: AnalyticsCharts = {};
  private offerScanner: QrScanner | null = null;
  private answerScanner: QrScanner | null = null;
  private offerScannerActive = false;
  private answerScannerActive = false;

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
    this.setupP2PSyncModal();
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
    const p2pSyncBtn = document.getElementById('openP2PSyncBtn');
    p2pSyncBtn?.addEventListener('click', () => this.openP2PSync());
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
    if (!goal || goal.isArchived) {
      saveActiveSession(null);
      return;
    }
    goal.isActive = true;
    goal.startTime = saved.startTime;
    goal.lastModified = Date.now();
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
    const instanceId = syncManager.createSyncData([], [], [], null).instanceId;
    const session: GoalSession = {
      id: crypto.randomUUID(),
      goalId: this.addTimeGoalId,
      startTime,
      endTime: endTime.getTime(),
      duration,
      instanceId
    };
    appendSession(session);

    const goal = this.goals.find((g) => g.id === this.addTimeGoalId);
    if (goal) {
      goal.totalTimeSpent += duration;
      goal.lastModified = Date.now();
      saveGoals(this.goals);
    }

    this.closeAddTimeModal();
    this.renderGoals();
    this.evaluateAchievements(true);
  }

  private addGoal(title: string, totalHours: number, description: string): void {
    const now = Date.now();
    const goal: Goal = {
      id: crypto.randomUUID(),
      title,
      description,
      totalHours,
      totalTimeSpent: 0,
      isActive: false,
      isArchived: false,
      createdAt: now,
      lastModified: now,
      instanceId: syncManager.createSyncData([], [], [], null).instanceId
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

  private archiveGoal(goalId: string): void {
    const goal = this.goals.find((g) => g.id === goalId);
    if (!goal) return;
    if (goal.isActive) {
      this.stopGoal();
    }
    this.goals = this.goals.map((g) =>
      g.id === goalId
        ? {
            ...g,
            isActive: false,
            startTime: undefined,
            isArchived: true,
            lastModified: Date.now()
          }
        : g
    );
    saveGoals(this.goals);
    this.renderGoals();
  }

  private restoreGoal(goalId: string): void {
    const index = this.goals.findIndex((g) => g.id === goalId);
    if (index === -1) return;
    const [goal] = this.goals.splice(index, 1);
    const restored: Goal = {
      ...goal,
      isArchived: false,
      isActive: false,
      startTime: undefined,
      lastModified: Date.now()
    };
    this.goals.unshift(restored);
    saveGoals(this.goals);
    this.renderGoals();
  }

  private startGoal(goalId: string): void {
    // ensure only one session running
    const active = this.goals.find((g) => g.isActive);
    if (active && active.id === goalId) {
      return;
    }
    if (active && active.id !== goalId) {
      this.stopGoal();
    }
    const goalIndex = this.goals.findIndex((g) => g.id === goalId);
    if (goalIndex === -1) return;
    if (this.goals[goalIndex].isArchived) return;
    const [goal] = this.goals.splice(goalIndex, 1);
    const now = Date.now();
    goal.isActive = true;
    goal.startTime = now;
    goal.lastModified = now;
    this.goals.unshift(goal);
    saveGoals(this.goals);
    saveActiveSession({
      goalId: goal.id,
      startTime: goal.startTime,
      lastUpdated: now
    });
    this.renderGoals();
  }

  private stopGoal(): void {
    const now = Date.now();
    let changed = false;
    const instanceId = syncManager.createSyncData([], [], [], null).instanceId;
    this.goals = this.goals.map((goal) => {
      if (goal.isActive && goal.startTime) {
        const duration = now - goal.startTime;
        const session: GoalSession = {
          id: crypto.randomUUID(),
          goalId: goal.id,
          startTime: goal.startTime,
          endTime: now,
          duration,
          instanceId
        };
        appendSession(session);
        changed = true;
        return {
          ...goal,
          isActive: false,
          startTime: undefined,
          totalTimeSpent: goal.totalTimeSpent + duration,
          lastModified: now
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
    const anyActive = this.goals.some((goal) => goal.isActive && !goal.isArchived);
    if (anyActive && this.tickHandle == null) {
      this.tickHandle = window.setInterval(() => this.updateLiveTimers(), 1000);
    } else if (!anyActive && this.tickHandle != null) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
  }

  private updateLiveTimers(): void {
    const activeGoals = this.goals.filter((goal) => goal.isActive && !goal.isArchived && goal.startTime);
    activeGoals.forEach((goal) => {
      const node = this.goalsList.querySelector<HTMLElement>(`.goal[data-goal-id="${goal.id}"]`);
      if (!node) return;
      const live = node.querySelector<HTMLElement>('.liveTimer');
      if (live) {
        live.textContent = formatHMS((Date.now() - (goal.startTime ?? Date.now())) / 1000);
      }
    });
  }

  private renderGoals(): void {
    this.goalsList.innerHTML = '';
    this.archivedList.innerHTML = '';

    const allSessions = loadSessions();
    const sessionsByGoal = new Map<string, GoalSession[]>();
    allSessions.forEach((session) => {
      if (!sessionsByGoal.has(session.goalId)) {
        sessionsByGoal.set(session.goalId, []);
      }
      sessionsByGoal.get(session.goalId)?.push(session);
    });

    const now = Date.now();
    const activeGoals = this.goals.filter((goal) => !goal.isArchived);
    const archivedGoals = this.goals.filter((goal) => goal.isArchived);

    activeGoals.forEach((goal) => {
      const node = document.importNode(this.goalTemplate.content, true);
      const root = node.querySelector('.goal') as HTMLElement | null;
      const title = node.querySelector('h3');
      const progressBar = node.querySelector<HTMLElement>('.progress > span');
      const meta = node.querySelector<HTMLElement>('.meta');
      const liveTimer = node.querySelector<HTMLElement>('.liveTimer');
      const startBtn = node.querySelector<HTMLButtonElement>('.startBtn');
      const stopBtn = node.querySelector<HTMLButtonElement>('.stopBtn');
      const addTimeBtn = node.querySelector<HTMLButtonElement>('.addTimeBtn');
      const progressBtn = node.querySelector<HTMLButtonElement>('.progressBtn');
      const archiveBtn = node.querySelector<HTMLButtonElement>('.archiveBtn');
      const deleteBtn = node.querySelector<HTMLButtonElement>('.deleteBtn');

      if (
        !root ||
        !title ||
        !progressBar ||
        !meta ||
        !liveTimer ||
        !startBtn ||
        !stopBtn ||
        !addTimeBtn ||
        !progressBtn ||
        !archiveBtn ||
        !deleteBtn
      ) {
        return;
      }

      root.dataset.goalId = goal.id;
      title.textContent = goal.title;
      const percent =
        goal.totalHours > 0
          ? Math.min(100, (millisecondsToHours(goal.totalTimeSpent) / goal.totalHours) * 100)
          : 0;
      progressBar.style.width = `${percent}%`;
      const goalSessions = sessionsByGoal.get(goal.id) ?? [];
      const combinedSessions =
        goal.isActive && goal.startTime
          ? [
              ...goalSessions,
              {
                goalId: goal.id,
                startTime: goal.startTime,
                endTime: now,
                duration: now - goal.startTime
              }
            ]
          : goalSessions;
      const streak = calculateDailyStreak(combinedSessions, now);
      const streakLabel = `Streak: ${streak} ${streak === 1 ? 'day' : 'days'}`;
      meta.textContent = `${millisecondsToHours(goal.totalTimeSpent).toFixed(1)} / ${goal.totalHours} h (${percent.toFixed(0)}%) • ${streakLabel}`;
      liveTimer.textContent =
        goal.isActive && goal.startTime
          ? formatHMS((Date.now() - goal.startTime) / 1000)
          : '00:00:00';

      startBtn.disabled = goal.isActive;
      stopBtn.disabled = !goal.isActive;
      archiveBtn.disabled = goal.isActive;
      archiveBtn.title = goal.isActive
        ? 'Stop the timer before archiving'
        : 'Archive Goal';

      if (goal.isActive) {
        root.classList.add('active');
      } else {
        root.classList.remove('active');
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
      archiveBtn.addEventListener('click', () => this.archiveGoal(goal.id));
      deleteBtn.addEventListener('click', () => this.openDeleteModal(goal.id, goal.title));

      this.goalsList.appendChild(node);
    });

    archivedGoals.forEach((goal) => {
      const node = document.importNode(this.archivedGoalTemplate.content, true);
      const root = node.querySelector('.goal') as HTMLElement | null;
      const title = node.querySelector('h3');
      const progressBar = node.querySelector<HTMLElement>('.progress > span');
      const meta = node.querySelector<HTMLElement>('.meta');
      const progressBtn = node.querySelector<HTMLButtonElement>('.progressBtn');
      const restoreBtn = node.querySelector<HTMLButtonElement>('.restoreBtn');
      const deleteBtn = node.querySelector<HTMLButtonElement>('.deleteBtn');
      const badge = node.querySelector<HTMLElement>('.archivedBadge');

      if (!root || !title || !progressBar || !meta || !progressBtn || !restoreBtn || !deleteBtn || !badge) {
        return;
      }

      root.dataset.goalId = goal.id;
      title.textContent = goal.title;
      const percent =
        goal.totalHours > 0
          ? Math.min(100, (millisecondsToHours(goal.totalTimeSpent) / goal.totalHours) * 100)
          : 0;
      progressBar.style.width = `${percent}%`;
      const goalSessions = sessionsByGoal.get(goal.id) ?? [];
      const streak = calculateDailyStreak(goalSessions, now);
      const streakLabel = `Streak: ${streak} ${streak === 1 ? 'day' : 'days'}`;
      meta.textContent = `${millisecondsToHours(goal.totalTimeSpent).toFixed(1)} / ${goal.totalHours} h (${percent.toFixed(0)}%) • ${streakLabel}`;
      badge.textContent = 'Archived';

      const ariaProgress = root.querySelector('.progress') as HTMLElement | null;
      if (ariaProgress) {
        ariaProgress.setAttribute('aria-valuemin', '0');
        ariaProgress.setAttribute('aria-valuemax', String(Math.max(1, goal.totalHours)));
        ariaProgress.setAttribute(
          'aria-valuenow',
          millisecondsToHours(goal.totalTimeSpent).toFixed(1)
        );
      }

      restoreBtn.addEventListener('click', () => this.restoreGoal(goal.id));
      progressBtn.addEventListener('click', () => this.openProgressModal(goal.id));
      deleteBtn.addEventListener('click', () => this.openDeleteModal(goal.id, goal.title));

      this.archivedList.appendChild(node);
    });

    this.archivedSection.style.display = archivedGoals.length > 0 ? '' : 'none';
    this.archivedEmpty.style.display = archivedGoals.length > 0 ? '' : 'none';

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

  private setupP2PSyncModal(): void {
    // Setup WebRTC state change callback
    webrtcManager.setOnStateChange((state) => {
      this.updateP2PStatus(state);
    });

    // Setup sync received callback
    webrtcManager.setOnSyncReceived((remoteData) => {
      this.handleP2PSync(remoteData);
    });

    // Setup error callback
    webrtcManager.setOnError((error) => {
      alert(`P2P Error: ${error}`);
    });

    // Button handlers
    this.p2pModal.createOfferBtn.addEventListener('click', () => this.createP2POffer());
    this.p2pModal.respondBtn.addEventListener('click', () => this.showP2PResponder());
    this.p2pModal.copyOfferBtn.addEventListener('click', () => this.copyToClipboard(this.p2pModal.offerCode.value));
    this.p2pModal.completeBtn.addEventListener('click', () => this.completeP2PConnection());
    this.p2pModal.createAnswerBtn.addEventListener('click', () => this.createP2PAnswer());
    this.p2pModal.copyAnswerBtn.addEventListener('click', () => this.copyToClipboard(this.p2pModal.answerCode.value));
    this.setScanButtonState(this.p2pModal.offerScanBtn, false);
    this.setScanButtonState(this.p2pModal.answerScanBtn, false);
    this.p2pModal.offerScanBtn.addEventListener('click', () => this.toggleOfferScan());
    this.p2pModal.answerScanBtn.addEventListener('click', () => this.toggleAnswerScan());
    this.p2pModal.syncNowBtn.addEventListener('click', () => this.syncP2PNow());
    this.p2pModal.disconnectBtn.addEventListener('click', () => this.disconnectP2P());
    this.p2pModal.closeBtn.addEventListener('click', () => {
      hideModal(this.p2pModal.modal);
      void this.stopOfferScan();
      void this.stopAnswerScan();
    });
  }

  private setScanButtonState(button: HTMLButtonElement, active: boolean): void {
    if (active) {
      button.classList.remove('btn-outline');
      button.classList.add('btn-danger');
      button.innerHTML = `<span class="material-symbols-outlined" style="vertical-align:middle;">pause_circle</span>Stop Scanning`;
    } else {
      button.classList.add('btn-outline');
      button.classList.remove('btn-danger');
      button.innerHTML = `<span class="material-symbols-outlined" style="vertical-align:middle;">qr_code_scanner</span>Scan QR`;
    }
  }

  private toggleOfferScan(): void {
    if (this.offerScannerActive) {
      void this.stopOfferScan();
    } else {
      void this.startOfferScan();
    }
  }

  private toggleAnswerScan(): void {
    if (this.answerScannerActive) {
      void this.stopAnswerScan();
    } else {
      void this.startAnswerScan();
    }
  }

  private async startOfferScan(): Promise<void> {
    if (this.offerScannerActive) {
      return;
    }
    if (this.answerScannerActive) {
      await this.stopAnswerScan();
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      this.p2pModal.offerScanSection.style.display = 'block';
      this.p2pModal.offerScanStatus.textContent = 'Camera access is not available in this environment.';
      this.setScanButtonState(this.p2pModal.offerScanBtn, false);
      return;
    }
    try {
      const hasCamera = await QrScanner.hasCamera();
      if (!hasCamera) {
        this.p2pModal.offerScanSection.style.display = 'block';
        this.p2pModal.offerScanStatus.textContent = 'No camera detected. Paste the code instead.';
        this.setScanButtonState(this.p2pModal.offerScanBtn, false);
        return;
      }
    } catch (error) {
      console.error('Failed to check camera availability', error);
      this.p2pModal.offerScanSection.style.display = 'block';
      this.p2pModal.offerScanStatus.textContent = 'Unable to access camera information.';
      this.setScanButtonState(this.p2pModal.offerScanBtn, false);
      return;
    }

    this.setScanButtonState(this.p2pModal.offerScanBtn, true);
    this.p2pModal.offerScanSection.style.display = 'block';
    this.p2pModal.offerScanStatus.textContent = 'Initializing camera...';

    try {
      this.offerScanner = new QrScanner(
        this.p2pModal.offerScanVideo,
        (result) => {
          void this.handleOfferScanResult(result);
        },
        {
          highlightScanRegion: true,
          highlightCodeOutline: true,
          maxScansPerSecond: 5,
          returnDetailedScanResult: true
        }
      );
      await this.offerScanner.start();
      this.offerScannerActive = true;
      this.p2pModal.offerScanStatus.textContent = 'Align the offer QR code within the frame.';
    } catch (error) {
      console.error('Offer QR scanning failed', error);
      const message = `Unable to start the camera (${error instanceof Error ? error.message : 'unknown error'}).`;
      await this.stopOfferScan(message);
    }
  }

  private async startAnswerScan(): Promise<void> {
    if (this.answerScannerActive) {
      return;
    }
    if (this.offerScannerActive) {
      await this.stopOfferScan();
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      this.p2pModal.answerScanSection.style.display = 'block';
      this.p2pModal.answerScanStatus.textContent = 'Camera access is not available in this environment.';
      this.setScanButtonState(this.p2pModal.answerScanBtn, false);
      return;
    }
    try {
      const hasCamera = await QrScanner.hasCamera();
      if (!hasCamera) {
        this.p2pModal.answerScanSection.style.display = 'block';
        this.p2pModal.answerScanStatus.textContent = 'No camera detected. Paste the code instead.';
        this.setScanButtonState(this.p2pModal.answerScanBtn, false);
        return;
      }
    } catch (error) {
      console.error('Failed to check camera availability', error);
      this.p2pModal.answerScanSection.style.display = 'block';
      this.p2pModal.answerScanStatus.textContent = 'Unable to access camera information.';
      this.setScanButtonState(this.p2pModal.answerScanBtn, false);
      return;
    }

    this.setScanButtonState(this.p2pModal.answerScanBtn, true);
    this.p2pModal.answerScanSection.style.display = 'block';
    this.p2pModal.answerScanStatus.textContent = 'Initializing camera...';

    try {
      this.answerScanner = new QrScanner(
        this.p2pModal.answerScanVideo,
        (result) => {
          void this.handleAnswerScanResult(result);
        },
        {
          highlightScanRegion: true,
          highlightCodeOutline: true,
          maxScansPerSecond: 5,
          returnDetailedScanResult: true
        }
      );
      await this.answerScanner.start();
      this.answerScannerActive = true;
      this.p2pModal.answerScanStatus.textContent = 'Align the answer QR code within the frame.';
    } catch (error) {
      console.error('Answer QR scanning failed', error);
      const message = `Unable to start the camera (${error instanceof Error ? error.message : 'unknown error'}).`;
      await this.stopAnswerScan(message);
    }
  }

  private async stopOfferScan(message?: string): Promise<void> {
    if (this.offerScanner) {
      try {
        await this.offerScanner.stop();
      } catch (error) {
        console.warn('Failed to stop offer scanner', error);
      }
      this.offerScanner.destroy();
      this.offerScanner = null;
    }
    this.offerScannerActive = false;
    this.p2pModal.offerScanVideo.srcObject = null;
    this.setScanButtonState(this.p2pModal.offerScanBtn, false);
    if (message) {
      this.p2pModal.offerScanSection.style.display = 'block';
      this.p2pModal.offerScanStatus.textContent = message;
    } else {
      this.p2pModal.offerScanSection.style.display = 'none';
      this.p2pModal.offerScanStatus.textContent = '';
    }
  }

  private async stopAnswerScan(message?: string): Promise<void> {
    if (this.answerScanner) {
      try {
        await this.answerScanner.stop();
      } catch (error) {
        console.warn('Failed to stop answer scanner', error);
      }
      this.answerScanner.destroy();
      this.answerScanner = null;
    }
    this.answerScannerActive = false;
    this.p2pModal.answerScanVideo.srcObject = null;
    this.setScanButtonState(this.p2pModal.answerScanBtn, false);
    if (message) {
      this.p2pModal.answerScanSection.style.display = 'block';
      this.p2pModal.answerScanStatus.textContent = message;
    } else {
      this.p2pModal.answerScanSection.style.display = 'none';
      this.p2pModal.answerScanStatus.textContent = '';
    }
  }

  private extractScanValue(result: unknown): string {
    if (typeof result === 'string') {
      return result.trim();
    }
    if (result && typeof result === 'object' && 'data' in result) {
      const data = (result as { data?: unknown }).data;
      if (typeof data === 'string') {
        return data.trim();
      }
    }
    return '';
  }

  private async handleOfferScanResult(result: unknown): Promise<void> {
    const value = this.extractScanValue(result);
    if (!value) {
      return;
    }
    this.p2pModal.offerInput.value = value;
    await this.stopOfferScan('Offer code detected and inserted automatically.');
  }

  private async handleAnswerScanResult(result: unknown): Promise<void> {
    const value = this.extractScanValue(result);
    if (!value) {
      return;
    }
    this.p2pModal.answerInput.value = value;
    await this.stopAnswerScan('Answer code detected and inserted automatically.');
  }

  private async renderQrPreview(
    wrapper: HTMLElement,
    canvas: HTMLCanvasElement,
    value: string | null
  ): Promise<void> {
    if (!value) {
      wrapper.style.display = 'none';
      canvas.width = 0;
      canvas.height = 0;
      canvas.setAttribute('aria-hidden', 'true');
      return;
    }

    try {
      wrapper.style.display = 'grid';
      await QRCode.toCanvas(canvas, value, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 220
      });
      canvas.setAttribute('aria-hidden', 'false');
    } catch (error) {
      console.error('Failed to render QR code', error);
      wrapper.style.display = 'none';
      canvas.setAttribute('aria-hidden', 'true');
    }
  }

  private openP2PSync(): void {
    this.updateP2PStatus(webrtcManager.getState());
    if (!this.p2pModal.offerCode.value) {
      void this.renderQrPreview(this.p2pModal.offerQrWrapper, this.p2pModal.offerQrCanvas, null);
    }
    if (!this.p2pModal.answerCode.value) {
      void this.renderQrPreview(this.p2pModal.answerQrWrapper, this.p2pModal.answerQrCanvas, null);
    }
    showModal(this.p2pModal.modal);
  }

  private updateP2PStatus(state: string): void {
    const statusColors: Record<string, string> = {
      disconnected: '#f1f5f9',
      connecting: '#fef3c7',
      connected: '#d1fae5',
      failed: '#fee2e2'
    };

    const statusText: Record<string, string> = {
      disconnected: 'Disconnected',
      connecting: 'Connecting...',
      connected: 'Connected',
      failed: 'Connection Failed'
    };

    this.p2pModal.statusText.textContent = statusText[state] || state;
    const statusBadge = this.p2pModal.statusText.parentElement;
    if (statusBadge) {
      statusBadge.style.background = statusColors[state] || '#f1f5f9';
    }

    this.p2pModal.disconnectedView.style.display = state === 'disconnected' ? 'block' : 'none';
    this.p2pModal.connectedView.style.display = state === 'connected' ? 'block' : 'none';

    if (state === 'failed') {
      this.p2pModal.disconnectedView.style.display = 'block';
    }

    if (state === 'connected') {
      void this.stopOfferScan();
      void this.stopAnswerScan();
    }
  }

  private async createP2POffer(): Promise<void> {
    try {
      const offerCode = await webrtcManager.createOffer();
      this.p2pModal.offerCode.value = offerCode;
      await this.renderQrPreview(this.p2pModal.offerQrWrapper, this.p2pModal.offerQrCanvas, offerCode);
      this.p2pModal.disconnectedView.style.display = 'none';
      this.p2pModal.initiatorView.style.display = 'block';
      this.p2pModal.responderView.style.display = 'none';
      await this.stopOfferScan();
      await this.stopAnswerScan();
    } catch (error) {
      alert(`Failed to create offer: ${error}`);
      await this.renderQrPreview(this.p2pModal.offerQrWrapper, this.p2pModal.offerQrCanvas, null);
    }
  }

  private showP2PResponder(): void {
    this.p2pModal.disconnectedView.style.display = 'none';
    this.p2pModal.responderView.style.display = 'block';
    this.p2pModal.initiatorView.style.display = 'none';
    void this.renderQrPreview(this.p2pModal.offerQrWrapper, this.p2pModal.offerQrCanvas, null);
  }

  private async completeP2PConnection(): Promise<void> {
    const answerCode = this.p2pModal.answerInput.value.trim();
    if (!answerCode) {
      alert('Please paste the answer code');
      return;
    }

    try {
      await webrtcManager.applyAnswer(answerCode);
      this.p2pModal.initiatorView.style.display = 'none';
      await this.stopAnswerScan();
    } catch (error) {
      alert(`Failed to complete connection: ${error}`);
    }
  }

  private async createP2PAnswer(): Promise<void> {
    const offerCode = this.p2pModal.offerInput.value.trim();
    if (!offerCode) {
      alert('Please paste the offer code');
      return;
    }

    try {
      const answerCode = await webrtcManager.createAnswer(offerCode);
      this.p2pModal.answerCode.value = answerCode;
      this.p2pModal.answerDisplay.style.display = 'block';
      await this.renderQrPreview(this.p2pModal.answerQrWrapper, this.p2pModal.answerQrCanvas, answerCode);
      await this.stopOfferScan();
    } catch (error) {
      alert(`Failed to create answer: ${error}`);
      await this.renderQrPreview(this.p2pModal.answerQrWrapper, this.p2pModal.answerQrCanvas, null);
    }
  }

  private syncP2PNow(): void {
    try {
      // Get local data
      const localData = syncManager.createSyncData(
        loadGoals(),
        loadSessions(),
        loadAchievements(),
        getActiveSession()
      );

      // Send to peer (which will trigger their onSyncReceived callback)
      webrtcManager.requestSync(localData);

      alert('Sync initiated! Waiting for peer response...');
    } catch (error) {
      alert(`Sync failed: ${error}`);
    }
  }

  private handleP2PSync(remoteData: any): void {
    try {
      // Validate the received data
      if (!syncManager.validateSyncData(remoteData)) {
        alert('Received invalid sync data from peer');
        return;
      }

      // Get local data
      const localData = syncManager.createSyncData(
        loadGoals(),
        loadSessions(),
        loadAchievements(),
        getActiveSession()
      );

      // Merge with remote
      const mergeResult = syncManager.merge(localData, remoteData);

      // Save merged data
      saveGoals(mergeResult.goals);
      saveSessions(mergeResult.sessions);
      saveAchievements(mergeResult.achievements);
      saveActiveSession(mergeResult.activeSession);

      // Reload and re-render
      this.goals = loadGoals();
      this.renderGoals();
      this.evaluateAchievements(false);

      // Show result
      if (mergeResult.conflicts.length > 0) {
        alert(`P2P Sync complete!\n\n${mergeResult.conflicts.length} conflicts resolved.`);
      } else {
        alert('P2P Sync complete! No conflicts.');
      }
    } catch (error) {
      alert(`Sync processing failed: ${error}`);
    }
  }

  private disconnectP2P(): void {
    webrtcManager.disconnect();
    this.p2pModal.initiatorView.style.display = 'none';
    this.p2pModal.responderView.style.display = 'none';
    this.p2pModal.connectedView.style.display = 'none';
    this.p2pModal.answerDisplay.style.display = 'none';
    this.p2pModal.offerCode.value = '';
    this.p2pModal.answerInput.value = '';
    this.p2pModal.offerInput.value = '';
    this.p2pModal.answerCode.value = '';
    void this.renderQrPreview(this.p2pModal.offerQrWrapper, this.p2pModal.offerQrCanvas, null);
    void this.renderQrPreview(this.p2pModal.answerQrWrapper, this.p2pModal.answerQrCanvas, null);
    void this.stopOfferScan();
    void this.stopAnswerScan();
  }

  private copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      alert('Copied to clipboard!');
    }).catch(() => {
      alert('Failed to copy. Please copy manually.');
    });
  }

  private exportBackup(): void {
    // Create sync data with all current state
    const syncData = syncManager.createSyncData(
      loadGoals(),
      loadSessions(),
      loadAchievements(),
      getActiveSession()
    );

    const blob = new Blob([JSON.stringify(syncData, null, 2)], { type: 'application/json' });
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

      // Validate sync data
      if (!syncManager.validateSyncData(parsed)) {
        alert('Invalid backup format.');
        return;
      }

      // Create local sync data
      const localData = syncManager.createSyncData(
        loadGoals(),
        loadSessions(),
        loadAchievements(),
        getActiveSession()
      );

      // Get stats for confirmation message
      const remoteStats = syncManager.getSyncStats(parsed);
      const localStats = syncManager.getSyncStats(localData);

      const message = `Import backup and merge with local data?\n\n` +
        `Local: ${localStats.goalCount} goals, ${localStats.sessionCount} sessions, ${localStats.achievementCount} achievements\n` +
        `Remote: ${remoteStats.goalCount} goals, ${remoteStats.sessionCount} sessions, ${remoteStats.achievementCount} achievements\n\n` +
        `Data will be intelligently merged using timestamps.`;

      if (!confirm(message)) {
        return;
      }

      // Merge the data
      const mergeResult = syncManager.merge(localData, parsed);

      // Save merged data
      saveGoals(mergeResult.goals);
      saveSessions(mergeResult.sessions);
      saveAchievements(mergeResult.achievements);
      saveActiveSession(mergeResult.activeSession);

      // Reload and re-render
      this.goals = loadGoals();
      this.renderGoals();
      this.evaluateAchievements(false);
      saveLastBackup(Date.now());
      this.updateBackupStatus();

      // Show conflict summary if any
      if (mergeResult.conflicts.length > 0) {
        const conflictSummary = mergeResult.conflicts
          .slice(0, 5)
          .map(c => `- ${c.type} "${c.id.substring(0, 8)}..." resolved using ${c.resolution}`)
          .join('\n');

        const moreText = mergeResult.conflicts.length > 5
          ? `\n... and ${mergeResult.conflicts.length - 5} more conflicts`
          : '';

        alert(`Import successful!\n\n${mergeResult.conflicts.length} conflicts resolved:\n${conflictSummary}${moreText}`);
      } else {
        alert('Import successful! No conflicts detected.');
      }
    } catch (error) {
      alert(`Import failed: ${error instanceof Error ? error.message : 'Invalid JSON backup'}`);
    }
  }
}

export function initApp(): MasteryApp {
  return new MasteryApp();
}
