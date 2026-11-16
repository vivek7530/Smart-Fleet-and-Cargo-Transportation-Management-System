# CargoEntry baseline audit (pre-fix snapshot)

This document records the source findings as they stood before the authorized
implementation work. For fixes, current verification results, and remaining
unverified areas, see [AUDIT-FIX-STATUS.md](./AUDIT-FIX-STATUS.md).

**Audit stage:** Repository and implementation baseline (static inspection)  
**Date:** 2026-11-02  
**Scope:** Architecture, module inventory, and source review of trip scheduling/lifecycle, odometer writes, maintenance, auth context, and API error handling.  
**Method:** Read-only source inspection. No test suite, application, database, or production-like environment was run.

## Repository state and limits

- The working tree was already modified when the audit began: `package-lock.json`, `src/server/config/env.ts`, `src/server/db.ts`, and `tailwind.config.ts` are modified; `package.json` is unmerged (`UU`). These edits are not part of this audit and must be preserved.
- The package manifest has unresolved merge markers in its dependency section. This blocks a reliable baseline install/build through npm until the existing merge is resolved.
- `.env` exists. Its values were not read or reproduced in this report.
- README setup assumes a local MongoDB and includes a destructive `seed:reset` script. No database was touched.
- The repo has no declared test, lint, Jest, Vitest, Cypress, or Playwright script/configuration. The `lint` script invokes `next lint`, which may not be supported by the declared Next.js version; verify after the manifest is reconciled.
- A source check is not a runtime reproduction. Findings below are “Confirmed” only where the relevant path is directly visible in the implementation; concurrency and deployment behavior remain unverified.

## Architecture and module inventory

This is one Next.js 15 App Router project using React 19, TypeScript, MongoDB/Mongoose 8, and Route Handlers under `src/app/api`. The UI and API share one application. API handlers use helpers in `src/server/api`, validate request data with Zod, and delegate domain logic to `src/server/modules`. There is no separate backend service or infrastructure/deployment definition in the repository root.

| Area | Location | Modules / responsibilities |
| --- | --- | --- |
| Screens | `src/app/(app)` | Dashboard; users/managers; drivers and driver detail; trucks and truck detail; trips and trip detail; cargo; fuel; maintenance; transportation costs; expenses; documents; breakdowns; reports; audit logs; notifications; profile/settings; driver trip/truck views |
| Public screens | `src/app` | Login, invitation registration, root redirect, root layout |
| API | `src/app/api` | 58 Route Handler files spanning auth, users/invitations/activity, drivers, trucks/assignment, cargo, trips/lifecycle, fuel, maintenance, costs, expenses/approval, documents/verification, breakdowns, notifications, reports, audit logs, and health |
| Domain services | `src/server/modules` | auth, users, drivers, trucks, cargo, trips, fuel, maintenance, transportation-costs, expenses, documents, breakdowns, notifications |
| Models | `src/server/models` | User, Invitation, Truck, Cargo, Trip, FuelRecord, Maintenance, TransportationCost, DriverExpense, DocumentRecord, BreakdownReport, Notification, AuditLog, Counter, RateLimit |
| Shared server services | `src/server/services` | audit, bootstrap, invitations, notifications, reports |
| Frontend shared code | `src/components`, `src/hooks`, `src/lib` | UI primitives, data lists/dialogs/charts/layout, query and list hooks, API client, types, formatting, navigation |
| Data/bootstrap | `src/server/seed` | Demo dataset and seed/reset entry point |

The repository inventory supports the high-level README description. Every listed module has not yet had a full route-by-route/page-by-page security and behavior review; that remains a required audit pass.

## Confirmed source-level findings

### BUG-TR-01 — New trip form does not reset after successful create

- **Module / feature:** Trips / create dialog
- **Severity:** Medium (operational data-entry error risk)
- **Status:** Confirmed by source inspection; UI reproduction not run
- **Source:** `src/app/(app)/trips/trip-form.tsx`, `TripFormDialog` initialization and open effect
- **Root cause:** The form is initialized once with defaults. The effect calls `form.reset(...)` only when `trip` exists (edit mode). Successful create closes the dialog but does not reset it; reopening in create mode therefore reuses React Hook Form state.
- **Reproduction path:** Enter a trip, create it, reopen Create a trip, inspect the fields.
- **Expected:** Fresh defaults and no prior driver/truck/cargo/dates/costs/notes.
- **Actual from code path:** No create-mode reset is invoked on open or successful create; values may remain in the mounted dialog.
- **Regression case:** Create one trip, close/reopen create dialog, assert each field equals the defined new-trip default.
- **Dependencies:** Dialog lifecycle and form state; no backend dependency.

### BUG-TR-02 — Resource assignment checks block all active-trip reservations without date overlap

- **Module / feature:** Trips / truck and driver assignment
- **Severity:** High
- **Status:** Confirmed by source inspection; scheduling behavior not runtime-tested
- **Source:** `src/server/modules/trips/trips.service.ts`, `assertTruckUsable`, `assertDriverUsable`, `createTrip`, `updateTrip`
- **Root cause:** Truck usability rejects a truck if *any* trip has status `ASSIGNED`, `LOADING`, or `IN_TRANSIT`, without comparing the candidate trip dates. Driver usability only checks existence, role, and active user status; it does not check trip overlap at all.
- **Expected:** Reject overlapping reservations for both resources; allow non-overlapping future reservations when the business rule allows them.
- **Actual from code:** An active trip blocks truck assignment regardless of future dates; overlapping assigned/planned trips can be made for a driver because no driver conflict query is present. Planned reservations are not included in truck conflict statuses.
- **Regression cases:** Existing trip ending before candidate reservation (allow); overlapping truck reservation (reject); overlapping driver reservation (reject); existing in-transit trip with a later non-overlapping reservation (allow per selected policy).
- **Dependencies:** Trip date semantics, loading/unloading buffers, maintenance reservations, timezone policy, and operational decision on overdue trips.

### BUG-TR-03 — Past planned trip dates are accepted by create and update validation

- **Module / feature:** Trips / scheduling
- **Severity:** Medium
- **Status:** Confirmed by source inspection; policy needs owner decision
- **Source:** `src/server/modules/trips/trips.validation.ts`, create and update schemas; `createTrip` / `updateTrip`
- **Root cause:** Validation checks only that expected delivery is on/after start; there is no historical-entry mode/authorization or past-date check. The UI likewise has no `min` constraint on the start date.
- **Expected:** Apply the selected historical-trip workflow policy; do not blanket-reject actual historical values.
- **Actual from code:** Any valid past start date is accepted by the API and UI schema if date ordering is valid.
- **Regression cases:** Past planned date rejected for ordinary creation; authorized historical entry follows its separate workflow; actual dates remain logically validated.
- **Dependencies:** Historical-entry authorization/workflow is a design decision from the supplied specification.

### BUG-ODO-01 — Odometer values are optional mutable truck snapshots, not a verified lifecycle

- **Module / feature:** Trips, fuel, maintenance / odometer
- **Severity:** High
- **Status:** Confirmed by source inspection
- **Sources:** `src/server/modules/trips/trips.service.ts` (`startTrip`, `completeTrip`); `src/server/modules/fuel/fuel.service.ts`; `src/server/modules/maintenance/maintenance.service.ts`; `src/server/models/Trip.ts`, `Truck.ts`, `FuelRecord.ts`, `Maintenance.ts`
- **Root cause:** Start and completion accept optional `odometerKm`, write it directly to `Truck.odometerKm`, and have no monotonic conditional update, prior-reading validation, once-only guard, separate trip start/closing fields, correction reason, or odometer audit event. Fuel and maintenance similarly write their optional reading straight to the truck. All paths permit missing readings and allow values lower than the current truck reading.
- **Expected:** Enforce the agreed once-per-event lifecycle, monotonicity, precision, authorized corrections, and auditable history; safely serialize concurrent updates.
- **Actual from code:** A later request can silently replace the current truck reading with a lower value; trip start/completion readings are not retained on the trip as distinct readings.
- **Regression cases:** negative/decimal boundary policy; below-last-reading rejection; repeated start/close writes; concurrent writes; authorized correction with reason and audit record.
- **Dependencies:** Odometer precision, correction roles, and migration strategy are business/design decisions.

### GAP-MNT-01 — Maintenance has no estimate-vs-actual cost model

- **Module / feature:** Maintenance / cost planning
- **Severity:** Medium
- **Status:** Confirmed scope gap
- **Sources:** `src/server/modules/maintenance/maintenance.service.ts`; `src/server/models/Maintenance.ts`
- **Root cause:** A maintenance record contains one required `cost`, and creation defaults status to `COMPLETED`. No estimate components, actual component breakdown, approval identity, estimate/actual comparison, or maintenance financial dashboard rollup are present in the inspected model/service.
- **Expected:** Track a scheduled estimate separately from actual completed costs, including approval and variance.
- **Actual from code:** Only one `cost` value is stored; a scheduled record still requires it and cannot express estimate versus actual distinctly.
- **Dependencies:** Estimate source (manual, history-based, or both), tax representation, approval policy, and dashboard treatment are design decisions.

### BUG-MNT-02 — Scheduling maintenance can overwrite a truck’s status while it is in transit

- **Module / feature:** Maintenance / truck status
- **Severity:** High
- **Status:** Confirmed by source inspection
- **Source:** `src/server/modules/maintenance/maintenance.service.ts`, `createMaintenance`
- **Root cause:** For SCHEDULED or IN_PROGRESS maintenance, the service sets the truck to MAINTENANCE unless its current status is `IN_TRIP`. A truck represented as IN_TRIP is left unchanged, while the maintenance record is still created. This permits simultaneous maintenance and trip occupancy with no reservation conflict check. Later status transitions also act on the truck status independently of other maintenance records.
- **Expected:** Prevent incompatible maintenance/trip windows or reserve future maintenance dates and reconcile availability through explicit rules.
- **Actual from code:** Maintenance can be scheduled/in progress during a trip; future maintenance dates do not create an interval checked by trip assignment.
- **Regression cases:** maintenance overlapping trip (reject or explicitly flag); non-overlapping future maintenance (allow); completion/cancellation while another maintenance record remains open (truck remains unavailable).
- **Dependencies:** Maintenance duration and planned vs actual time windows are not represented in the current model.

### GAP-CONC-01 — Critical multi-document workflows have no visible transaction boundary

- **Module / feature:** Trip status, cargo, truck, financial rollups
- **Severity:** High
- **Status:** Suspected consistency risk from source inspection; concurrency failure not reproduced
- **Sources:** `src/server/modules/trips/trips.service.ts`, `syncSideEffectsForStatus`, `completeTrip`, `deleteTrip`
- **Evidence:** Trip document updates, truck/cargo updates, financial recalculation, and audit/notification writes are separate operations; no session/transaction is used in the inspected service paths. `startTrip` and `completeTrip` first read and then save without a conditional status update.
- **Risk:** Concurrent start/complete/assignment or partial failure can leave trip, truck, cargo, financial summary, and audit state inconsistent.
- **Required verification:** Run concurrent duplicate transitions and injected-failure scenarios against an isolated replica-set test database; define idempotency and transaction policy.

### BUG-FIN-01 — Dashboard/report revenue counts planned and unfinished trips as realized revenue

- **Module / feature:** Reports / financials
- **Severity:** High (financial reporting integrity)
- **Status:** Confirmed by source inspection; report output not runtime-tested
- **Source:** `src/server/services/reports.service.ts`, `financialsFor` and `timeSeries`
- **Root cause:** Revenue aggregation matches trips whose status is anything except `CANCELLED`. It sums `revenue` for PLANNED, ASSIGNED, LOADING, IN_TRANSIT, DELIVERED, and COMPLETED trips alike.
- **Expected:** Per the supplied audit requirements, planned and unfinished trips must not be represented as earned revenue. Define the recognition event/status and apply consistently to KPI, trend, and chart aggregates.
- **Actual from code:** All non-cancelled trip revenue contributes to revenue/profit, including planned and active work.
- **Regression cases:** Isolate one trip in each lifecycle state and confirm only business-approved recognized revenue contributes to the chosen actual-revenue metric; verify cancelled exclusion and trend/chart consistency.
- **Dependencies:** Revenue recognition policy and whether delivered-but-not-completed trips qualify.

### GAP-API-01 — Authorization and ownership review remains incomplete across the route surface

- **Module / feature:** API security / all domains
- **Severity:** Needs investigation
- **Status:** Suspected review gap, not a confirmed vulnerability
- **Evidence:** The API surface has 58 route handler files and distinct role guards (`requireAuth`, `requireStaff`, `requireAdmin`) plus service-level driver scopes. A route inventory was captured, but each handler and its downstream ownership checks have not been traced end to end.
- **Risk:** A guard that permits a role may still leave object-level ownership unscoped, or a secondary endpoint may bypass a service invariant.
- **Required verification:** Trace each HTTP method from route guard through validation and service query/mutation; test each role directly against foreign IDs in an isolated environment.

## Suspected areas / not yet established

- Security and IDOR correctness across every route: not established by the sampled auth context. Each route’s guard and service ownership scope still needs a systematic review.
- Report aggregation accuracy, timezone boundaries, export behavior, and large-data query plans: not executed or fully inspected.
- Document verification and ownership lifecycle, invitation race behavior, rate-limit behavior across instances, deletion/orphan handling, and expense approval/completion races: not yet fully reviewed.
- README claims (virtualization threshold, cursor stability, dashboard semantics, security headers, audit coverage, rate-limit fallback) are documentation claims until implementation and runtime behavior are verified.

## Decisions to confirm against the supplied specification

The pasted plan recommends (a) restricted historical trip entry, (b) date-overlap scheduling with future reservations, (c) controlled odometer correction with audit history, and (d) both suggested and manually editable maintenance estimates. These are treated as target requirements for audit comparison, not as already implemented rules.

The “START_OVERDUE” recommendation is a calculated operational flag; the current enum has no START_OVERDUE trip status. No due-time/overdue calculation was identified in the inspected trip service paths.

## Test execution record

| Check | Result |
| --- | --- |
| Source and repository inventory | Completed for top-level structure, all route paths, model names, module names, and core trip/odometer/maintenance paths |
| Runtime/UI reproduction | Not run |
| Automated tests | Not run; no test runner/configuration is declared, and the requested workflow places safe runtime testing after full inspection |
| Build/typecheck/lint | Not run; `package.json` is currently unmerged, making npm-based baseline results unreliable |
| Database/security/concurrency/performance tests | Not run; no isolated test database or deployment environment was provisioned |

## Next audit passes

1. Reconcile the existing package manifest conflict without losing local edits, then capture a clean baseline typecheck/build result.
2. Complete page/form and query-cache review across all UI modules.
3. Inspect each API route, Zod schema, service, model, and authorization/ownership path; record confirmed vs suspected findings using the required bug template.
4. Review finance/reporting/document/breakdown/invitation/audit workflows and database indexes/relationships.
5. Prepare a separate test plan and isolated test database, then execute only non-destructive tests there and record evidence.
6. Present the prioritized findings and proposed fixes for the approval gate specified in the supplied plan. No source fixes were made in this baseline stage.
