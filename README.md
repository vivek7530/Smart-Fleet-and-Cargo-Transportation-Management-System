# CargoEntry — Smart Fleet & Cargo Transportation Management System

A production-shaped fleet operations platform: trucks, drivers, cargo, trips, fuel,
maintenance, transport costs, driver expenses, documents, breakdowns, revenue,
profit and reporting — in one Next.js application backed by a local MongoDB.

Everything runs from a **single Next.js project**. The API lives in
`src/app/api/**` as Route Handlers, and the business logic sits behind them in
`src/server/**`, so there is no separate backend service to start.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # then set JWT_SECRET and the admin credentials
npm run seed:reset             # creates the admin + realistic demo data
npm run dev                    # http://localhost:3000
```

### 1. Install MongoDB

Install MongoDB Community Server and make sure it is running locally on the
default port. On Windows it is usually installed as the **MongoDB Server**
service; on macOS `brew services start mongodb-community` does the same.

Verify it is listening:

```bash
node -e "require('net').connect(27017,'127.0.0.1').on('connect',()=>console.log('MongoDB is up')).on('error',()=>console.log('MongoDB is NOT running'))"
```

### 2. Create your environment file

```bash
cp .env.example .env.local
```

Then edit `.env.local`:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/cargoentry
JWT_SECRET=<a long random string>
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=YourStrongPassword1
```

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The MongoDB connection string is **never hardcoded** — it is read from
`MONGODB_URI` everywhere, including the seed script.

### 3. Seed the database

```bash
npm run seed:reset
```

This wipes the collections and rebuilds a realistic dataset: 1 admin,
3 managers, 10 drivers, 20 trucks, 30 trips with cargo, fuel, transport costs and
driver expenses, plus maintenance history, documents, breakdown reports,
notifications and an audit trail. It prints the sign-in credentials and two
still-pending invitation links when it finishes.

Use `npm run seed` instead if you only want to fill an empty database.

### 4. Start the app

```bash
npm run dev
```

Open <http://localhost:3000>.

### 5. Browse the data in MongoDB Compass

Open Compass and connect with the same URI from your `.env.local`:

```
mongodb://127.0.0.1:27017/cargoentry
```

You will see the `users`, `invitations`, `trucks`, `cargo`, `trips`,
`fuelrecords`, `maintenances`, `transportationcosts`, `driverexpenses`,
`documents`, `breakdownreports`, `notifications`, `auditlogs` and `counters`
collections.

---

## Demo accounts

After `npm run seed:reset`, sign in with any of these:

| Role    | Sign in with                  | Password       |
| ------- | ----------------------------- | -------------- |
| Admin   | the `ADMIN_EMAIL` you set     | `ADMIN_PASSWORD` |
| Manager | `priya.sharma@cargoentry.dev` | `Password123!` |
| Driver  | `+919822104561`               | `Password123!` |

Drivers sign in with their **mobile number** — the login field accepts either an
email address or a mobile number.

The seed also leaves two invitations pending (one sent by email, one by mobile)
and prints their links, so you can walk through the registration flow.

---

## Scripts

| Command              | What it does                                             |
| -------------------- | -------------------------------------------------------- |
| `npm run dev`        | Start the app on <http://localhost:3000>                  |
| `npm run build`      | Production build                                          |
| `npm start`          | Serve the production build                                |
| `npm run seed`       | Add demo data if the database is empty                    |
| `npm run seed:reset` | Wipe the collections and rebuild the demo data            |
| `npm run typecheck`  | TypeScript across the whole project                       |

---

## How it is put together

```
src/
├── app/
│   ├── api/**/route.ts        REST API (Route Handlers)
│   ├── (app)/**               Authenticated screens, behind the app shell
│   ├── login/ · register/     Public authentication screens
│   └── layout.tsx             Root layout, providers, theme
├── components/
│   ├── ui/                    Design-system primitives (shadcn-style, Radix)
│   ├── data/                  DataList, toolbar, dialogs, stat cards
│   ├── charts/                Recharts wrappers with a shared palette
│   └── layout/                Sidebar, top bar, command palette, notifications
├── hooks/                     Infinite lists, list state, media queries
├── lib/                       API client, formatting, shared types
└── server/
    ├── api/                   Request context, auth guards, response envelope
    ├── config/                Environment
    ├── models/                Mongoose schemas + indexes
    ├── modules/<domain>/      Validation + service per domain
    ├── services/              Audit, notifications, invitations, reports
    ├── lib/                   JWT, passwords, pagination, errors
    └── seed/                  Development dataset
```

Route Handlers stay thin: they authenticate, validate with Zod and delegate to a
service. Business rules — trip lifecycle transitions, expense approval, financial
roll-ups — live in the service layer.

---

## Roles

Authorisation is decided on the server from the persisted user record. A role
claim sent by the browser is never trusted.

**Admin** — full access: dashboard, users, managers, drivers, trucks, trips,
cargo, fuel, maintenance, expenses, trip costs, documents, breakdowns, reports,
the audit log, and inviting managers and drivers.

**Manager** — day-to-day operations: trucks, drivers, trips (create, assign,
start, complete), cargo, fuel, maintenance, trip costs, document verification,
approving and rejecting driver expenses, and operational reports.

**Driver** — a focused, mobile-friendly view: their profile, assigned truck,
assigned trips, trip progress, fuel entries, expense claims and their status,
breakdown reports, and their own documents. Drivers never see fleet-wide
financials.

---

## Invitations

Only an administrator can invite people, and only as **Manager** or **Driver**.
An invitation needs **at least one** contact method — email *or* mobile; neither
is mandatory on its own.

The channel used to deliver the invitation becomes **locked**:

- Invited by mobile → the invitee may add an email during registration, but the
  mobile number cannot be changed.
- Invited by email → the invitee may add a mobile number, but the email address
  cannot be changed.

The lock is enforced by the API at registration *and* on later profile edits —
the submitted value for the locked field is discarded rather than trusted.

Invitation tokens are 32 random bytes, stored only as a SHA-256 hash, single-use,
and expire after `INVITATION_EXPIRES_HOURS` (72 by default).

> No email or SMS provider is wired up in this build. The generated invitation
> link is written to the server log and returned to the inviting administrator so
> it can be shared directly. Replace `deliverInvitation()` in
> `src/server/services/invitation.service.ts` with your provider.

---

## Trip lifecycle

```
Create trip → assign truck → assign driver → load cargo → start trip
   → in transit → delivered → complete → revenue / expenses / profit settled
```

Statuses: `PLANNED · ASSIGNED · LOADING · IN_TRANSIT · DELIVERED · COMPLETED · CANCELLED`.

Only forward transitions the API recognises are allowed; anything else is
rejected with a `409`. Completing a trip is blocked while any driver expense on
it is still awaiting review, and on completion the trip's transport costs,
approved driver expenses and fuel are rolled up so profit is final.

---

## Lists, pagination and loading

Every listing supports search, filters, sorting and a date range where it makes
sense. Lists request **10 records** initially:

```
GET /api/trucks?limit=10
GET /api/trucks?limit=10&cursor=<opaque cursor>
```

Paging is **cursor based** — the cursor encodes the sort value plus the document
`_id`, so results stay stable while records are being inserted. The next page is
requested automatically when roughly **five rows remain**, via an
`IntersectionObserver` sentinel placed five rows from the end; a "Load more"
button is always present as a keyboard-accessible fallback. Lists longer than 60
rows switch to a virtualised renderer, so thousands of records stay smooth.

Skeleton loaders — not spinners — are used for the dashboard, every list, every
chart and every detail view.

---

## Documents

CargoEntry deliberately **stores no files, images or video, and uses no cloud
object storage**. A document is a record: name, type, reference number, issuer,
issue and expiry dates, and its verification state. That is enough to drive
expiry warnings and the compliance view without holding a copy of the paperwork.

---

## Security

- JWT issued on sign-in and kept in an **HTTP-only cookie** — never readable by
  client-side JavaScript, and never written to `localStorage`.
- Passwords hashed with bcrypt (12 rounds); the hash is `select: false` and
  stripped from every response.
- Every request re-reads the user from MongoDB, so a suspension or role change
  applies immediately and role claims cannot be spoofed.
- Zod validation on every mutating endpoint, in addition to client-side checks.
- Queries are built from validated values, and search terms are regex-escaped.
- Rate limiting that **only counts failed attempts** — see below.
- Security headers via `next.config.mjs`; API responses are `no-store`.
- Single-use, hashed, expiring invitation tokens.
- An audit log for every meaningful action.

### Rate limiting

The limiter exists to slow down password and token guessing — **not** to ration
normal use. Two decisions keep it out of real users' way:

1. **Only failed attempts are counted.** Signing in correctly, inviting
   colleagues, or changing your own password never consumes budget, so a
   legitimate user cannot be locked out however heavily they use the app.
2. **Administrator actions are not limited at all.** Inviting and re-inviting are
   already authenticated and audited, and onboarding a whole fleet in one sitting
   is ordinary use.

Guessing still gets stopped: after `RATE_LIMIT_MAX_FAILURES` (50) failures from
one client inside the window, further attempts return `429` with a message
saying when to retry.

The window lives behind a small store interface with two drivers:

| `RATE_LIMIT_DRIVER` | Use it when                                                    |
| ------------------- | -------------------------------------------------------------- |
| `memory` (default)  | A single instance — no shared state needed                      |
| `mongo`             | Multiple replicas — shares one window via the database you already run |

The `mongo` driver counts with an atomic `$inc` upsert and clears finished
windows with a TTL index, so it needs no extra services and no sweeper. If the
store is ever unreachable it falls back to in-process counting rather than
failing the request.

---

## API

```
POST   /api/auth/login              POST   /api/auth/logout
GET    /api/auth/me                 POST   /api/auth/register
PATCH  /api/auth/profile            POST   /api/auth/change-password
GET    /api/auth/invitation/:token

GET    /api/users                   POST   /api/users/invite
GET    /api/users/:id               PATCH  /api/users/:id           DELETE /api/users/:id
GET    /api/users/:id/activity      GET    /api/users/invitations
POST   /api/users/invitations/:id/resend | /revoke

GET    /api/drivers                 GET    /api/drivers/:id
GET    /api/trucks                  POST   /api/trucks
GET/PATCH/DELETE /api/trucks/:id    POST   /api/trucks/:id/assign-driver
GET    /api/trucks/assigned/me

GET    /api/cargo                   POST   /api/cargo
GET/PATCH/DELETE /api/cargo/:id

GET    /api/trips                   POST   /api/trips
GET/PATCH/DELETE /api/trips/:id
POST   /api/trips/:id/start | /complete | /cancel | /status

GET/POST /api/fuel                  PATCH/DELETE /api/fuel/:id
GET/POST /api/maintenance           PATCH/DELETE /api/maintenance/:id
GET/POST /api/transportation-costs  PATCH/DELETE /api/transportation-costs/:id

GET/POST /api/expenses              GET /api/expenses/summary
GET/PATCH/DELETE /api/expenses/:id  POST /api/expenses/:id/approve | /reject

GET/POST /api/documents             GET /api/documents/expiring
PATCH/DELETE /api/documents/:id     POST /api/documents/:id/verify | /reject

GET/POST /api/breakdowns            GET /api/breakdowns/:id
POST   /api/breakdowns/:id/status

GET    /api/notifications           GET /api/notifications/unread-count
POST   /api/notifications/read-all  POST /api/notifications/:id/read
DELETE /api/notifications/:id

GET    /api/reports/dashboard | /analytics | /summary
GET    /api/audit-logs | /audit-logs/facets
GET    /api/health
```

Responses use a consistent envelope:

```jsonc
// success
{ "success": true, "data": { } }

// failure
{ "success": false, "message": "Invalid credentials", "code": "INVALID_CREDENTIALS" }
```

Validation failures also carry `issues: [{ field, message }]`, which the forms
render inline. The API uses `400`, `401`, `403`, `404`, `409`, `422`, `429` and
`500` deliberately.

---

## Tech

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS ·
Radix UI primitives in the shadcn style · TanStack Query · TanStack Virtual ·
Recharts · react-hook-form + Zod · Mongoose 8 · MongoDB.
