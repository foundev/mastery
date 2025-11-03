# Mastery App – Agent Notes

## Purpose
Mastery-focused goal tracking with live timers, manual time entry, analytics, and intelligent estimates. Single-file implementation (`index.html` + Vite build) using PicoCSS and ECharts with localStorage persistence, compiled from modular TypeScript.

## Architecture
- UI: PicoCSS components, lightweight custom styles, responsive goal cards with active-state highlighting.
- Data model:
  - Goal: { id, title, description, totalHours, totalTimeSpent(ms), isActive, startTime?, createdAt }
  - Session: { goalId, startTime, endTime, duration(ms) }
- Storage keys:
  - `goal-tracker-goals`
  - `goal-tracker-sessions`
  - `goal-tracker-active-session`
  - `goal-tracker-last-backup`
  - `goal-tracker-achievements`
- Charts: ECharts (bundled via Vite)
  - Per-goal: daily bar + cumulative line (Progress modal)
  - Global: daily trend line; time-by-goal pie (Analytics modal)

## Key UX
- FAB opens Add Goal modal with template suggestions.
- Goal cards: Start/Stop, Add Time (modal), Progress (modal), Delete (confirmation). Active card gets a prominent border to denote the running session.
- Live session ticker; on Stop, session persisted and totalTimeSpent updated. Header shows last backup time; achievements toast when milestones unlocked.
- Estimated completion from median of recent daily hours; autobuild uses Vite, testing via Vitest.

## Decisions
- Single running timer at a time to avoid overlapping sessions.
- Persist active session on visibility change/unload; restore on load. Achievements evaluate on stop/manual additions.
- Validate Add Time against 24h/day across all goals. Achievements cover streaks (90d, 365d, yearly) and daily hour milestones (1/2/4/8/12h).
- Use vanilla JS + modular TypeScript compiled via Vite; no external state management.

## Follow-ups / Ideas
- Export/import data (JSON file download/upload). (Implemented)
- Tags/categories and filters.
- Weekly/monthly rollups and heatmap calendar.
- Achievements view (modal) summarises unlocked/locked awards.
- Responsive layout tweaks for mobile toolbar and controls.
- Active session indicator removed from header per UX feedback; rely on card styling.
- Reminders/streaks. (Achievements implemented for streaks)
- PWA install + offline icons/manifest, background sync refresh. (Implemented)

## Testing notes
- Manual: start a timer, switch tabs, return — ticker continues; stop adds a session.
- Add Time validation: cannot exceed 24h when combined with existing day’s sessions.
- Charts: resize on modal open and window resize.

## Changelog (agent)
- v1: Rebuilt standalone with PicoCSS, ECharts, modals (Add Goal, Add Time, Progress, Analytics), storage, estimates, delete confirm.
- v2: Migrated to Vite + TypeScript modules, added analytics/achievements/toasts/backups, PWA support.
- v3: Added responsive tweaks, single active timer enforcement with card highlight, simplified header indicator.

