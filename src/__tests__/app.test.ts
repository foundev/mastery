import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { MasteryApp } from '../app';
import { GOALS_KEY, SESSIONS_KEY, ACTIVE_SESSION_KEY } from '../constants';
import { hoursToMilliseconds } from '../time';

const TEMPLATE_HTML = `
  <button id="openAddGoalFab" type="button"></button>
  <button id="openAddGoalToolbar" type="button"></button>
  <button id="openAnalyticsBtn" type="button"></button>
  <button id="exportBtn" type="button"></button>
  <input id="importInput" type="file" />
  <button id="importBtn" type="button"></button>
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
    expect(items.length).toBe(1);
    expect(items[0].querySelector('h3')?.textContent).toBe('Stored Goal');
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
    vi.advanceTimersByTime(30 * 60 * 1000); // 30 minutes
    click('.stopBtn');
    const sessions = JSON.parse(window.localStorage.getItem(SESSIONS_KEY) ?? '[]');
    expect(sessions.length).toBe(1);
    expect(sessions[0].duration).toBeGreaterThan(0);
    const updatedGoals = JSON.parse(window.localStorage.getItem(GOALS_KEY) ?? '[]');
    expect(updatedGoals[0].totalTimeSpent).toBeGreaterThan(0);
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
});
