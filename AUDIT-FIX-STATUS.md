# CargoEntry implementation and verification status

**Date:** 2026-11-02  
**Backup taken before source edits:** `backups/CargoEntry-pre-fixes-2026-11-02.zip`  
**Scope:** Fixes made from the supplied QA specification, static review of connected workflows, and safe checks that do not require a database.  
**Important:** This is a completed code-change pass, not a claim that the full production-readiness audit has passed. MongoDB-backed, browser, security, concurrency, and scale tests still need an isolated environment.

## Changes made

### Trip scheduling and lifecycle

- A fresh Create Trip dialog resets to its default values on every open and after a successful create.
- Ordinary planned trip creation and rescheduling reject past planned start dates using the Asia/Kolkata calendar date. Delivery-before-start is rejected on create and update.
- A separate `POST /api/trips/historical` endpoint accepts completed historical operations only for administrators. It requires actual start/delivery dates and start/closing odometer values, creates a completed trip, and does not overwrite the truck's current status while entering history.
- Truck and driver reservations now check overlapping trip windows. A non-overlapping future reservation can coexist with a current trip; an overdue in-transit trip or an unstarted overdue reservation blocks new reservations until it is resolved/rescheduled. Future scheduled maintenance blocks only overlapping dates, while in-progress maintenance blocks dispatch.
- Trip truck, driver, cargo, and schedule changes are rejected after loading begins. A truck's assigned driver cannot be switched while the truck has a trip in progress.
- A calculated `startOverdue` trip flag is shown in the trip list and a dashboard attention count points staff to overdue trips.
- Cancelling a trip releases linked cargo to PENDING. Deleting a trip with financial or compliance records is rejected to avoid orphan references.

### Odometer integrity

- Trip start and completion now require readings; values are stored as distinct start/close readings on the trip and limited to 0.1 km precision.
- Start readings must be at least the truck's current verified reading. Closing readings must be at least both the start reading and latest truck reading. Duplicate trip lifecycle submissions are guarded with optimistic concurrency.
- Fuel and maintenance readings advance the truck reading with an atomic non-decreasing update. A submitted reading cannot be changed through ordinary edit forms. Truck profile edits no longer accept arbitrary current-odometer changes.
- Authorized staff corrections use `POST /api/odometer/corrections` for truck, trip start/close, fuel, or maintenance readings. A reason is required; changes are written to the audit log, and trip corrections also retain an embedded correction history.
- Mongoose optimistic-concurrency conflicts return HTTP 409 instead of an unhandled 500.

### Maintenance planning and costs

- Maintenance records now store estimated parts, labour, other charges, tax, and estimated total separately from actual components and actual total.
- The maintenance form can suggest an estimate from the truck's latest completed record of the same service type. Suggested values remain editable; the UI shows estimated and actual totals and completed-job variance.
- Scheduled maintenance does not mark a truck unavailable before the service date. Maintenance/trip overlap is checked on create and update, and starting work during an active trip is rejected.
- Dashboard actual maintenance expense includes completed work only; planned/in-progress estimates are shown separately. Completed maintenance records cannot be reopened or deleted.

### Financial and related data integrity

- Revenue and trip profit reporting now recognize revenue only for COMPLETED trips, using `completedAt` for reporting periods. Revenue series and leaderboards use the same rule.
- Report date ranges, daily/weekly/monthly buckets, and labels use Asia/Kolkata boundaries rather than the server's local timezone.
- Expense edits are limited to pending claims, validate a newly linked trip against its driver and state, and recalculate both the old and new trip. Review is a conditional update so a competing approval/rejection cannot both succeed. Reviewed claims cannot be edited/deleted through normal routes.
- Fuel entries now validate that a linked trip uses the selected truck. Updates recalculate both affected trip totals and prevent moving a reading-bearing entry to another truck.
- Verified document compliance fields return the record to PENDING verification when changed. Driver document creation is scoped to the driver's own profile, assigned truck, or assigned trip; drivers cannot delete a verified document. Unsupported EXPENSE/BREAKDOWN document owners are no longer accepted by the create API.
- Breakdown reports validate the trip/truck/driver relationship and status transitions. Severe unresolved breakdowns keep a truck unavailable after trip completion or maintenance completion.
- Cargo status can no longer be directly patched through the API, and loaded/in-transit/delivered cargo cannot be reassigned. Truck deletion is blocked when operational history exists; driver deletion is blocked when driver history exists, with suspension recommended instead.
- Transportation cost reassignment validates the target trip and recalculates both old and new trip totals.

### Build portability

- Removed the `next/font/google` Roboto fetch and use a local system-font stack. This makes production builds independent of Google Fonts availability at build time.
- Added a `test` script using Node's built-in test runner and the existing `tsx` dependency.

## Executed safe checks

| Check ID | Scenario | Result |
| --- | --- | --- |
| TR-VAL-01 | Today/future planned trip accepted | Pass |
| TR-VAL-02 | Past planned start and delivery-before-start rejected | Pass |
| TR-HIST-01 | Past historical trip accepted through historical schema with valid odometer order | Pass |
| ODO-VAL-01 | Start/close readings required; negative, excessive precision, and missing values rejected | Pass |
| ODO-COR-01 | Correction requires a known source, valid reading, and sufficiently descriptive reason | Pass |
| RPT-TZ-01 | Today range uses full Asia/Kolkata day boundaries | Pass |
| RPT-TZ-02 | Custom report range includes complete India calendar days | Pass |
| TYPE-01 | `npm run typecheck` | Pass |
| BUILD-01 | `npm run build` | Pass; optimized production build and route generation completed |

Commands run: `npm test`, `npm run typecheck`, and `npm run build`. The build initially exposed a network dependency on Google Fonts and sandbox write restrictions in `.next`; removing the remote font dependency and running the build with the approved workspace build permission resulted in a successful production build.

## Test cases still requiring isolated MongoDB/browser environment

| Test ID | Scenario | Status |
| --- | --- | --- |
| TR-UI-01 | Create trip, reopen create dialog, verify all fields/defaults are fresh | Not run |
| TR-SCHED-01 | Current truck expected Nov 5; allow non-overlap Nov 7, reject overlap Nov 4 | Not run; service query source-reviewed |
| TR-SCHED-02 | Two planned reservations overlap for same truck or driver | Not run; service query source-reviewed |
| TR-SCHED-03 | In-transit trip becomes overdue; future reservation blocks until trip resolves | Not run |
| TR-EDIT-01 | Reassign driver/truck/cargo after loading begins | Not run |
| TR-HIST-02 | Admin-only route authorization, historical overlap detection, cargo linkage, and snapshot preservation | Not run |
| ODO-DB-01 | Concurrent trip starts/completions, correction audit contents, monotonic truck update, historical reading correction | Not run |
| MNT-DB-01 | Estimate totals, actual totals, estimate-vs-actual reporting, service/trip date overlap, status restoration | Not run |
| FIN-DB-01 | Completed-only recognized revenue and maintenance spend against a seeded test database | Not run |
| API-SEC-01 | Role-by-role IDOR and ownership matrix over every route | Not run |
| CONC-01 | Two managers reserve the same date range concurrently | Not run; multi-document reservation checks are not transactionally serialized |
| SCALE-01 | 1k/10k/50k/100k simulated records, slow query plans, memory/latency, multi-instance rate limits | Not run |

No seed/reset command or database mutation was run. `.env` was not read or changed. The supplied repository has no isolated test-database configuration, and the current `.env` target was intentionally not used as a test database.

## Remaining audit scope

- **Authentication, invitations, authorization:** route inventory exists, but every method still needs an end-to-end guard → validation → service ownership trace and role matrix testing. CSRF/XSS/rate-limit and last-admin cases remain untested.
- **Documents:** ownership and re-verification paths were fixed, but expiry boundaries, duplicate identifiers, deletion policy, and all document owner workflows still need runtime testing.
- **Reports and dashboard:** aggregation rules and India timezone boundaries were fixed in code and unit-tested at the date-range level. Mongo aggregation output, CSV exports, pagination, and large-range performance remain untested.
- **Database:** Mongoose model indexes and references still need a complete review, duplicate/orphan scans against a safe copy, and query-plan analysis at the target scale.
- **Concurrency:** trip document optimistic concurrency and expense review CAS were added. Trip/truck/driver/maintenance reservation creation is still a check-then-write flow; truly simultaneous managers can race without a transaction or reservation-lock design. MongoDB transaction behavior depends on replica-set deployment and has not been verified.
- **User experience:** historical trip and odometer correction flows are API workflows; dedicated UI dialogs for these controlled operations are not yet present.
- **Local working tree:** existing edits in `package-lock.json`, `src/server/config/env.ts`, `src/server/db.ts`, and Tailwind configuration were preserved. `package.json` was already marked unmerged in Git's index when work began; its working file is valid and npm commands succeeded, but the index conflict has not been staged/resolved to avoid staging unrelated user work.

## Fix roadmap from here

1. Run the listed integration cases against a disposable MongoDB replica set and browser session.
2. Design and test atomic reservation locking for concurrent trip, driver, truck, and maintenance scheduling.
3. Complete route-level authorization and IDOR audit for all 60 API handlers.
4. Exercise financial, report, document, invitation, and deletion workflows with boundary and concurrent requests.
5. Run performance/index tests at the requested data volumes, then address only measured bottlenecks.
