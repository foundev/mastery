# Mastery App – Agent Notes

## Purpose
Mastery-focused goal tracking with live timers, manual time entry, analytics, and intelligent estimates. Single-file implementation (`standalone.html`) using PicoCSS and ECharts with localStorage persistence.

## Architecture
- UI: PicoCSS components, lightweight custom styles.
- Data model:
  - Goal: { id, title, description, totalHours, totalTimeSpent(ms), isActive, startTime?, createdAt }
  - Session: { goalId, startTime, endTime, duration(ms) }
- Storage keys:
  - `goal-tracker-goals`
  - `goal-tracker-sessions`
  - `goal-tracker-active-session`
- Charts: ECharts
  - Per-goal: daily bar + cumulative line (Progress modal)
  - Global: daily trend line; time-by-goal pie (Analytics modal)

## Key UX
- FAB opens Add Goal modal with template suggestions.
- Goal cards: Start/Stop, Add Time (modal), Progress (modal), Delete (confirmation).
- Live session ticker; on Stop, session persisted and totalTimeSpent updated.
- Estimated completion from median of recent daily hours.

## Decisions
- Single running timer at a time to avoid overlapping sessions.
- Persist active session on visibility change/unload; restore on load.
- Validate Add Time against 24h/day across all goals.
- Use vanilla JS to keep portable and dependency-free.

## Follow-ups / Ideas
- Export/import data (JSON file download/upload).
- Tags/categories and filters.
- Weekly/monthly rollups and heatmap calendar.
- Reminders/streaks.
- PWA install + offline icons/manifest.

## Testing notes
- Manual: start a timer, switch tabs, return — ticker continues; stop adds a session.
- Add Time validation: cannot exceed 24h when combined with existing day’s sessions.
- Charts: resize on modal open and window resize.

## Changelog (agent)
- v1: Rebuilt standalone with PicoCSS, ECharts, modals (Add Goal, Add Time, Progress, Analytics), storage, estimates, delete confirm.

