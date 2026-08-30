# Changelog — WorkUnity Agent Portal

All notable changes to `agent-cabinet-v2.html` are recorded here. This file covers the Agent Portal only — it is unrelated to the marketing site's own history in this repository.

## v2.1.0 — Remove the Training Check gate

- Dropped the 5-question Training quiz that used to sit between the Rules gate and the dashboard. Accepting the six rules now leads straight to the dashboard.
- Removed the now-unused quiz code (`QUIZ`, `renderTrainingGate`, `setQuizAnswer`, `checkQuiz`, `retryQuiz`, `finishTraining`) and its CSS, and dropped the `trainingCompletedAt` field from the agent data model, including its read-out on the admin agent detail view.
- The Rules-gate button now reads "Accept and continue" instead of "Continue to training".

## v2.0.0 — Initial full build

Complete from-scratch build of the Agent Portal as a single self-contained HTML file: vanilla JS and CSS, no framework, no build step, no backend, `localStorage`-backed.

**Foundation**
- Design tokens (navy/teal palette, badge colors) with a full dark-theme override set and a persistent theme toggle, present on the login screen as well as the app shell.
- Login with two demo accounts (agent, admin), session persisted across reloads.
- Versioned, idempotent `migrateDB()` — seeds a full demo dataset on first load, backfills missing keys on later schema additions without touching existing data.
- Seed data: 3 agents (Pakistan, India, Bangladesh — one deliberately un-onboarded so the Rules/Training gates are exercised on first login), 3 vacancies (two open + verified, one pending verification), 33 candidates spread across every status, compliance flag, and permit-expiry scenario the app needs to demonstrate.

**Agent side**
- Rules-acceptance gate and a 5-question Training quiz, both required before the dashboard unlocks; wrong answers are shown inline with a retry.
- Dashboard: KPIs, level progress toward the next network tier, coordinator contact, alerts, active-vacancy table, recent activity, network leaderboard, and a performance block with rejection reasons.
- Vacancy browser: region filter chips that hide empty regions; only vacancies that are both `open` and compliance-`verified` are ever shown or submittable.
- Submit Candidate: auto-fills specialty from the chosen vacancy, blocks duplicate passport numbers, requires both the expectations and consent checkboxes, and automatically waitlists a submission if the vacancy's quota is already full.
- My Candidates: search and filter, CSV export (passport numbers masked), and a read-only candidate detail view — status timeline, WhatsApp link, and an editable 4-item quality checklist, with no status control or incident button anywhere in reach.
- My Commissions: earned/paid/pending totals and a per-milestone breakdown, with no way for an agent to mark anything paid.
- Notification bell (unread badge, mark-all-read), scoped so an agent only ever sees notifications addressed to them.

**Admin side**
- Network-wide dashboard: candidate funnel, compliance-mix donut, needs-attention feed (stale submissions, Red-compliance candidates, open incidents, expiring/expired permits, vacancies still pending verification), vacancy quota table, agent leaderboard.
- Vacancy CRUD: create, edit, close/reopen, and delete (delete is only offered once a vacancy has zero candidates against it); per-vacancy detail view with a per-agent submission breakdown.
- Candidate management: the only place a candidate's status or compliance can change, and every change requires a written note and is recorded to that candidate's status history. Includes a "Mark as Confirmed" action (the only way a submission gets its independent WorkUnity confirmation), a "Report Incident" action (creates an incident record and flips the candidate to Red/Incident), and quota-checked waitlist activation.
- Agent management: per-agent stats and level progress, plus manual level/status/violation-count overrides. Suspending an agent here blocks that agent's next login.
- Incidents register with an open/closed filter and a close action.
- Network-wide Commissions page with **Mark Paid** (notifies the affected agent) — the counterpart to the agent-side, pay-button-free version.
- Compliance Calendar: permits expiring within 30 days, and per-arrived-candidate check-in tracking for day 7/30/90 welfare calls plus day-30/90 retention confirmation — checking a retention box is what advances that candidate's retention figure live, which in turn is what unlocks their 30-/90-day commission milestones.

**Verification**
- Every phase was built, then exercised end-to-end in a real browser (Playwright) before moving to the next: onboarding gates, vacancy visibility rules, submission/duplicate/waitlist paths, every admin workflow, dark theme and 390px layouts across every single screen in both roles, and a full Reset Demo Data round-trip.
- Final pass: zero Cyrillic in the UI, zero `console.log` calls, zero dead functions or CSS, every inline event handler resolves to a real function, and all thirteen of the app's core business rules (see `AGENT-PORTAL-README.md`) verified directly against running code, not just inspected.
