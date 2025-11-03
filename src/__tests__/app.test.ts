import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { MasteryApp } from '../app';
import { GOALS_KEY, SESSIONS_KEY, ACTIVE_SESSION_KEY, LAST_BACKUP_KEY, ACHIEVEMENTS_KEY } from '../constants';
import { hoursToMilliseconds } from '../time';

const TEMPLATE_HTML = `
  <header class="appbar">
    <nav>
      <button id="openAnalyticsBtn" type="button"></button>
      <button id="openAchievementsBtn" type="button"></button>
      <button id="exportBtn" type="button"></button>
      <input id="importInput" type="file" />
      <button id="importBtn" type="button"></button>
      <span id="backupStatus">No backup yet</span>
    </nav>
  </header>
  <div id="activeSessionIndicator">
    <div class="indicator-body">
      <span id="activeSessionIcon"></span>
      <span id="activeSessionText">No active goal</span>
    </div>
    <button id="activeSessionStop" type="button" disabled></button>
  </div>
  <div id="achievementToast"></div>
  <button id="openAddGoalFab" type="button"></button>
  <main>
    <div id="goalsList"></div>
  </main>
  <template id="goalItemTmpl">
    <div class="goal">
      <div class="stack">
        <h3></h3>
        <div class="progress" role="progressbar" aria-label="Goal progress"><span></span></div>
        <div class="meta muted small"></div>
        <div class="controls">
          <button class="btn btn-primary startBtn" type="button"><span class="label">Start</span></button>
          <button class="btn btn-danger stopBtn" type="button" disabled><span class="label">Stop</span></button>
          <button class="btn btn-outline addTimeBtn" type="button"><span class="label">Add</span></button>
          <button class="btn btn-outline progressBtn" type="button"><span class="label">Progress</span></button>
          <button class="btn btn-outline deleteBtn" type="button"><span class="label">Delete</span></button>
        </div>
      </div>
      <div class="right muted small liveTimer">00:00:00</div>
    </div>
  </template>
  <div id="addGoalModal" class="modal-backdrop" aria-hidden="true">
    <div class="modal">
      <main>
        <input id="ag_title" />
        <textarea id="ag_desc"></textarea>
        <input id="ag_hours" type="number" />
        <div id="ag_suggestions"></div>
      </main>
      <footer>
        <button id="ag_cancel" type="button"></button>
        <button id="ag_submit" type="button" disabled></button>
      </footer>
    </div>
  </div>
  <div id="addTimeModal" class="modal-backdrop" aria-hidden="true">
    <div class="modal">
      <div id="atm_error" style="display:none;"></div>
      <input id="atm_hours" type="number" />
      <input id="atm_date" type="date" />
      <button id="atm_cancel" type="button"></button>
      <button id="atm_submit" type="button" disabled></button>
    </div>
  </div>
  <div id="progressModal" class="modal-backdrop" aria-hidden="true">
    <div class="modal">
      <h3 id="progressTitle"></h3>
      <div id="pm_stats"></div>
      <div id="pm_chart"></div>
      <button id="pm_close" type="button"></button>
    </div>
  </div>
  <div id="analyticsModal" class="modal-backdrop" aria-hidden="true">
    <div class="modal">
      <div id="an_trend"></div>
      <div id="an_pie"></div>
      <button id="an_close" type="button"></button>
    </div>
  </div>
  <div id="achievementsModal" class="modal-backdrop" aria-hidden="true">
    <div class="modal">
      <div id="achievementsList"></div>
      <button id="achievementsClose" type="button"></button>
    </div>
  </div>
  <div id="deleteModal" class="modal-backdrop" aria-hidden="true">
    <div class="modal">
      <strong id="del_question"></strong>
      <p id="del_warning"></p>
      <button id="del_cancel" type="button"></button>
      <button id="del_confirm" type="button"></button>
    </div>
  </div>
`;

function click(selector: string) {
  const el = document.querySelector(selector);
  if (!el) {
    throw new Error(`Element ${selector} not found`);
  }
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function inputValue(selector: string, value: string) {
  const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (!el) {
    throw new Error(`Element ${selector} not found`);
  }
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('MasteryApp integration', () => {
  let uuidMock: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-20T12:00:00Z'));
    document.body.innerHTML = TEMPLATE_HTML;
    window.localStorage.clear();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
    let counter = 0;
    uuidMock = vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => `uuid-${++counter}`);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    uuidMock?.mockRestore();
  });

  it('renders existing goals from storage', () => {
    const storedGoal = {
      id: 'goal-1',
      title: 'Stored Goal',
      description: '',
      totalHours: 10,
      totalTimeSpent: hoursToMilliseconds(2),
      isActive: false,
      createdAt: Date.now()
    };
    window.localStorage.setItem(GOALS_KEY, JSON.stringify([storedGoal]));
    new MasteryApp();
    const items = document.querySelectorAll('.goal');
    expect(document.getElementById('backupStatus')?.textContent).toBe('No backup yet');
    expect(items.length).toBe(1);
    expect(items[0].querySelector('h3')?.textContent).toBe('Stored Goal');
    expect(document.getElementById('activeSessionIndicator')?.classList.contains('has-active')).toBe(false);
    expect(document.getElementById('activeSessionText')?.textContent).toContain('No active');
  });

  it('adds a new goal via modal workflow', () => {
    window.localStorage.setItem(GOALS_KEY, JSON.stringify([]));
    const app = new MasteryApp();
    click('#openAddGoalFab');
    inputValue('#ag_title', 'New Goal');
    inputValue('#ag_hours', '100');
    inputValue('#ag_desc', 'Focus time');
    click('#ag_submit');
    const goals = JSON.parse(window.localStorage.getItem(GOALS_KEY) ?? '[]');
    expect(goals.length).toBe(1);
    expect(goals[0].title).toBe('New Goal');
    expect(document.querySelectorAll('.goal').length).toBe(1);
    expect(app).toBeInstanceOf(MasteryApp);
  });

  it('starts and stops a session, recording duration', () => {
    const goal = {
      id: 'goal-1',
      title: 'Timer Goal',
      description: '',
      totalHours: 10,
      totalTimeSpent: 0,
      isActive: false,
      createdAt: Date.now()
    };
    window.localStorage.setItem(GOALS_KEY, JSON.stringify([goal]));
    window.localStorage.setItem(SESSIONS_KEY, JSON.stringify([]));
    const app = new MasteryApp();
    click('.startBtn');
    expect(window.localStorage.getItem(ACTIVE_SESSION_KEY)).not.toBeNull();
    const indicator = document.getElementById('activeSessionIndicator');
    const stopControl = document.getElementById('activeSessionStop') as HTMLButtonElement | null;
    expect(indicator?.classList.contains('has-active')).toBe(true);
    expect(stopControl?.disabled).toBe(false);
    vi.advanceTimersByTime(30 * 60 * 1000); // 30 minutes
    stopControl?.click();
    const sessions = JSON.parse(window.localStorage.getItem(SESSIONS_KEY) ?? '[]');
    expect(sessions.length).toBe(1);
    expect(sessions[0].duration).toBeGreaterThan(0);
    const updatedGoals = JSON.parse(window.localStorage.getItem(GOALS_KEY) ?? '[]');
    expect(updatedGoals[0].totalTimeSpent).toBeGreaterThan(0);
    expect(indicator?.classList.contains('has-active')).toBe(false);
    expect(app).toBeInstanceOf(MasteryApp);
  });

  it('allows manual time entry with validation feedback reset', () => {
    const goal = {
      id: 'goal-1',
      title: 'Manual Time',
      description: '',
      totalHours: 10,
      totalTimeSpent: 0,
      isActive: false,
      createdAt: Date.now()
    };
    window.localStorage.setItem(GOALS_KEY, JSON.stringify([goal]));
    window.localStorage.setItem(SESSIONS_KEY, JSON.stringify([]));
    new MasteryApp();
    click('.addTimeBtn');
    inputValue('#atm_hours', '1.5');
    click('#atm_submit');
    const updatedGoals = JSON.parse(window.localStorage.getItem(GOALS_KEY) ?? '[]');
    expect(updatedGoals[0].totalTimeSpent).toBe(hoursToMilliseconds(1.5));
    const sessions = JSON.parse(window.localStorage.getItem(SESSIONS_KEY) ?? '[]');
    expect(sessions.length).toBe(1);
  });

  it('updates backup timestamp after exporting data', () => {
    window.localStorage.setItem(GOALS_KEY, JSON.stringify([]));
    window.localStorage.setItem(SESSIONS_KEY, JSON.stringify([]));
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    new MasteryApp();
    click('#exportBtn');
    anchorClick.mockRestore();
    const saved = window.localStorage.getItem(LAST_BACKUP_KEY);
    expect(saved).not.toBeNull();
    const statusText = document.getElementById('backupStatus')?.textContent ?? '';
    expect(statusText).toMatch(/Last backup:/);
  });

  it('restarts ticker when goal already active from storage', () => {
    const startTime = Date.now() - 5 * 60 * 1000;
    const goal = {
      id: 'goal-1',
      title: 'Active Goal',
      description: '',
      totalHours: 10,
      totalTimeSpent: 0,
      isActive: true,
      startTime,
      createdAt: Date.now()
    };
    window.localStorage.setItem(GOALS_KEY, JSON.stringify([goal]));
    window.localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({ goalId: goal.id, startTime, lastUpdated: startTime }));
    new MasteryApp();
    vi.advanceTimersByTime(1000);
    const liveText = document.querySelector('.liveTimer')?.textContent;
    expect(liveText).not.toBe('00:00:00');
  });

  it('unlocks hourly achievements and shows toast', () => {
    const goal = {
      id: 'goal-1',
      title: 'Daily Focus',
      description: '',
      totalHours: 100,
      totalTimeSpent: 0,
      isActive: false,
      createdAt: Date.now()
    };
    window.localStorage.setItem(GOALS_KEY, JSON.stringify([goal]));
    window.localStorage.setItem(SESSIONS_KEY, JSON.stringify([]));
    new MasteryApp();

    click('.addTimeBtn');
    inputValue('#atm_hours', '2');
    click('#atm_submit');

    const toast = document.getElementById('achievementToast');
    expect(toast?.classList.contains('visible')).toBe(true);

    const storedRaw = window.localStorage.getItem(ACHIEVEMENTS_KEY);
    expect(storedRaw).not.toBeNull();
    const stored = JSON.parse(storedRaw ?? '[]');
    const hoursAchievement = stored.find((record: any) => record.id === 'hours-1');
    expect(hoursAchievement).toBeTruthy();
    expect(hoursAchievement.seen).toBe(true);
  });

  it('only announces streak achievements once', () => {
    const sessions: any[] = [];
    const base = Date.UTC(2024, 4, 20);
    for (let i = 0; i < 90; i++) {
      const start = base - i * 24 * 60 * 60 * 1000;
      sessions.push({
        goalId: 'goal-1',
        startTime: start,
        endTime: start + 60 * 60 * 1000,
        duration: 60 * 60 * 1000
      });
    }
    window.localStorage.setItem(GOALS_KEY, JSON.stringify([]));
    window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));

    new MasteryApp();
    const toast = document.getElementById('achievementToast');
    expect(toast?.classList.contains('visible')).toBe(true);
    toast?.querySelector<HTMLButtonElement>('.toast-close')?.click();
    vi.runOnlyPendingTimers();

    const storedRaw = window.localStorage.getItem(ACHIEVEMENTS_KEY);
    expect(storedRaw).not.toBeNull();
    const stored = JSON.parse(storedRaw ?? '[]');
    const ids = stored.map((record: any) => record.id);
    expect(ids).toContain('streak-90');
    const streak90 = stored.find((record: any) => record.id === 'streak-90');
    expect(streak90?.seen).toBe(true);

    document.body.innerHTML = TEMPLATE_HTML;
    new MasteryApp();
    const toastAgain = document.getElementById('achievementToast');
    expect(toastAgain?.classList.contains('visible')).toBe(false);
  });

});
