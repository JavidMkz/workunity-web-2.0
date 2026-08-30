# WorkUnity Agent Portal (v2)

An internal, single-page web app for WorkUnity's recruiting agent network. This is a **separate product** from the public marketing site in this repository (`index.html`, `partners.html`, etc.) — it lives entirely in one file, `agent-cabinet-v2.html`, and has its own independent data, users, and purpose.

WorkUnity is a labor-migration company. Its product is **risk removal, not people supply**: agents find and submit candidates, but every payment, every status change, and every compliance decision runs through WorkUnity directly. The portal's data model and workflow exist to make that separation of duties impossible to bypass.

## Running it

No build step, no dependencies, no backend.

- Double-click `agent-cabinet-v2.html`, or open it with `file://` in any modern browser, **or**
- Serve the repo root with any static file server (e.g. `npx http-server`) and open `/agent-cabinet-v2.html`.

All data lives in the browser's `localStorage` under the key `wu_agent_portal_v2`. Nothing is sent to a server.

### Demo credentials

| Role | Email | Password | Notes |
|---|---|---|---|
| Agent | `agent@workunity.com` | `agent123` | Ahmed Khan, Pakistan. Starts un-onboarded — logging in shows the one-time "How This Works" introduction before the dashboard unlocks. |
| Admin | `admin@workunity.com` | `admin123` | Compliance admin — full access to every agent, vacancy, and candidate. |

An admin can restore the app to this exact starting state at any time via **Reset Demo Data** in the sidebar (admin-only, asks for confirmation first).

## What's in the box

**Agent side:** dashboard (KPIs, level progress, coordinator contact, active vacancies, recent activity, network leaderboard, rejection-reason breakdown), vacancy browser (region filters, only open + verified vacancies ever appear), submit-candidate form (duplicate-passport check, required consent/expectations checkboxes, automatic waitlisting if a vacancy's quota is full), My Candidates (search/filter, CSV export, read-only detail view with a status timeline and an editable quality checklist), My Commissions (earned/paid/pending, no way to mark anything paid), and a "How This Works" page explaining the portal's own mechanics (candidate flow, confirmation, waitlist, levels).

**Admin side:** network-wide dashboard (funnel, compliance mix, needs-attention feed, vacancy quotas, leaderboard), vacancy CRUD (create/edit/close/delete, per-agent submission breakdown), candidate management (the only place status or compliance can change — every change requires a written note and is logged), agent management (level/status/violations), an incidents register, network-wide commissions with **Mark Paid**, and a compliance calendar (permit-expiry tracking plus welfare check-in / retention-confirmation checkboxes for 7/30/90-day milestones).

## The rule the whole app is built around

Agents propose; only WorkUnity admin/compliance disposes. Concretely, the code enforces:

1. A vacancy is visible or submittable to agents **only** when it is both `open` and `verified` — never one without the other.
2. Vacancy quota counts exclude Rejected, Duplicate, and waitlisted candidates.
3. A duplicate passport number blocks a new submission outright.
4. Every new submission starts as `status: New`, `compliance: Yellow`, with `consentAt` stamped to the moment of submission.
5. Every status or compliance change — anywhere in the app — writes a timestamped, attributed entry to the candidate's status history, with a required note.
6. Passport numbers are masked everywhere they're displayed, including CSV exports (`WU•••001` style) — never shown in full except deliberately (`maskPassport`).
7. The agent's candidate view is strictly read-only: no status dropdown, no incident button. Only the admin edit view has either.
8. The onboarding gate blocks an agent from reaching the dashboard (and therefore from submitting anything) until they've clicked through the one-time "How This Works" introduction.
9. Activating a waitlisted candidate re-checks the vacancy's live quota first; it refuses if the quota is still full.
10. `permitExpiry` is computed the instant a candidate's status is set to Arrived (permit issue date + 60 days), not lazily on next page load.
11. Every commission row carries the submitting agent's ID; an agent's Commissions page only ever shows their own rows, while admin sees the whole network.
12. The notification bell is absent from the login screen and during the onboarding gates; **Reset Demo Data** only ever appears for admin.
13. Both leaderboards (agent dashboard and admin dashboard) rank by candidates Arrived first, then by conversion rate.

Money mechanics: an agent's commission is a percentage of that vacancy's flat `agentFee`, split across three results-only milestones — 30% on Arrival, 30% on 30-day retention, 40% on 90-day retention (they sum to the full fee). None of it is payable for a submission alone, and an agent can never mark their own commission paid — that action exists only on the admin Commissions page.

## Notes for whoever maintains this next

- **One file, one script tag, no framework.** Every screen is a plain JS function that returns an HTML string; `render()` rewrites `#app`'s `innerHTML` on every state change. Handlers are wired via inline `onclick`/`onchange` attributes calling plain global functions (not an IIFE), which is why nothing in this file is wrapped in a module or closure.
- **`state`** holds the current session, route, and UI-only flags (theme, bell open/closed, gate progress). **`db`** (loaded from `localStorage` via `loadDB()`/`migrateDB()`) holds everything persistent: `agents`, `vacancies`, `candidates`, `statusHistory`, `incidents`, `paidCommissions`, `notifications`.
- Commission and level-progress figures are **derived on read**, never stored — see `agentStats()`, `commissionMilestones()`, `computeLevelProgress()`, `leaderboardRows()` in the "Business logic" section of the script.
- `migrateDB()` is idempotent and additive: it seeds fresh data if none exists, and otherwise only backfills top-level keys that are missing, without touching existing records. Safe to call on every load.
- All user-supplied or seeded text is rendered through `esc()` before hitting `innerHTML`. The few helpers that build a labeled value (`dgItem`, `modalHead`) escape internally, so callers don't need to remember to wrap them again.
- This is a demo/prototype: there is no real backend, no real authentication, and no real payment processing. `localStorage` is not a substitute for a database in a shipped product — treat this as the interaction/behavior spec for a future real build, not as production infrastructure itself.
