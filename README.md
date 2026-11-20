# MineX

**Field-to-boardroom compliance intelligence.**

MineX is an AI-enabled smart governance and compliance monitoring platform for Indian coal mining
operations. It has two clients over one backend and one database:

| Product | What it is | Stack |
| --- | --- | --- |
| **MineX Field** | Android mobile field application for inspectors and officers | Expo (React Native), Expo Router, `expo-sqlite` offline store |
| **MineX Command** | Web command center for managers, compliance and oversight | Next.js 15 (App Router), React, Tailwind CSS |

> **Project status — working prototype (hackathon MVP).** The end-to-end inspection → evidence →
> AI risk → corrective-action → verification loop is implemented on real, RLS-scoped Supabase data,
> across web and mobile. Several capabilities are deliberately **architecture-only** or **partial**
> and are labelled as such throughout this document. The current AI is a **deterministic keyword
> heuristic**, not a trained model or LLM.
>
> The user-facing brand is **MineX**. Internal identifiers (npm packages `@coalguard/*`, the Android
> application id `ai.coalguard.field`, database objects, demo email domain `@coalguard.demo`, the AI
> provider id `coalguard-heuristic`) intentionally keep the original `coalguard` name and are **not**
> renamed.

---

## Recent updates

- **Drag-and-drop assignment.** Assign an inspection finding to an eligible worker directly from the inspection detail page, including findings that need a new corrective action.
- **Live Command updates.** A connection badge shows the Supabase Realtime status. Changes to subscribed records trigger a batched refresh.
- **Faster Command navigation.** The production sidebar prefetches core routes, recently opened pages are briefly cached in the browser, and key queries run in parallel.
- **Android APK.** The MineX Field workspace has a preview build profile for direct installation on an Android device.

## Table of contents

1. [Introduction](#1-introduction)
2. [The problem](#2-the-problem)
3. [The MineX solution](#3-the-minex-solution)
4. [Key features](#4-key-features)
5. [User roles & multi-level governance](#5-user-roles--multi-level-governance)
6. [Complete user workflow](#6-complete-user-workflow)
7. [Offline-first architecture](#7-offline-first-architecture)
8. [AI architecture](#8-ai-architecture)
9. [Technology stack](#9-technology-stack)
10. [Programming languages](#10-programming-languages)
11. [System architecture](#11-system-architecture)
12. [Data architecture](#12-data-architecture)
13. [Security architecture](#13-security-architecture)
14. [API / backend](#14-api--backend)
15. [Storage & evidence](#15-storage--evidence)
16. [GIS / location intelligence](#16-gis--location-intelligence)
17. [Compliance domains](#17-compliance-domains)
18. [MineX Command (web)](#18-minex-command-web)
19. [MineX Field (mobile)](#19-minex-field-mobile)
20. [Internationalization](#20-internationalization)
21. [Deployment](#21-deployment)
22. [Local development setup](#22-local-development-setup)
23. [Demo accounts](#23-demo-accounts)
24. [Demo data](#24-demo-data)
25. [Data-flow examples](#25-data-flow-examples)
26. [Requirement coverage](#26-requirement-coverage)
27. [Current limitations](#27-current-limitations)
28. [Roadmap](#28-roadmap)
29. [Project structure](#29-project-structure)
30. [Development & quality](#30-development--quality)
31. [Design principles](#31-design-principles)
32. [Contributing](#32-contributing)
33. [License](#33-license)

---

## 1. Introduction

Indian coal mining is one of the most heavily regulated industrial activities in the country. A
single mine operates under overlapping statutory regimes for **safety**, **environment**,
**labour/workforce** and **production**, supervised through a layered corporate structure
(a holding organisation → subsidiaries → regions/areas → individual mines → departments).

In day-to-day practice, the information that regulators, boards and mine managers need is generated
at the rock face — by an inspector walking a bench, an officer checking a substation, a supervisor
logging attendance. That information is often captured on **paper or ad-hoc spreadsheets**, then
re-keyed, emailed, and consolidated by hand. The result is a **field-to-management information
gap**: findings are delayed, corrective actions are hard to track to closure, and there is no single
consolidated view of a mine's risk and compliance posture.

MineX closes that loop. **MineX Field** lets a field user run a structured inspection, raise an
observation, attach **geo-tagged, time-stamped photo and voice evidence**, get an explainable risk
classification, and propose a corrective action — **working offline** where mine-site connectivity
is unreliable, and syncing when a connection returns. **MineX Command** gives managers and oversight
roles a live, mine-scoped view of the same data, with an accountable **assign → progress → submit →
verify** corrective-action workflow and an append-only audit trail.

Every record carries its origin (who, where, when), every AI output is labelled as simulated, and
every row a user can see is constrained by **PostgreSQL Row Level Security** to that user's
authorised organisational scope.

---

## 2. The problem

### Fragmented compliance

Safety observations, environmental readings, labour and contractor records, production data and
equipment health typically live in **different registers owned by different departments**. There is
no shared spine that ties a field finding to a statutory requirement to a corrective action to a
board-level risk number.

### Manual field inspections

Inspections are frequently run on **paper checklists**. Transcription is slow and lossy; evidence
(if collected) is a photo on someone's phone with no reliable link to the finding, the location, or
the time it was taken.

### Connectivity constraints

Working faces, highwalls and underground districts often have **no reliable mobile data**. A field
application that assumes continuous internet is unusable exactly where inspections happen, so the
capture path must be **offline-first**, not offline-as-an-afterthought.

### Delayed escalation

A high or critical finding needs to reach a decision-maker **quickly**, with a named owner and a due
date. When escalation depends on someone getting back to the office and sending an email, serious
hazards sit unaddressed.

### Evidence and accountability

For a finding to be defensible it needs **traceability**: the photo, the GPS coordinates, the
timestamp, the observation text, the risk decision, the assigned action, the closure proof and the
verification — all linked, all attributable, none silently editable after the fact.

### Management visibility

Mine managers, internal auditors and HQ need a **consolidated operational picture** — open
high/critical findings, overdue actions, compliance status, environmental breaches — instead of a
stack of disconnected reports that are already out of date.

### Multi-level governance

Access has to follow the real organisation. A department officer should see their department; a mine
manager their mine; a regional GM their region; HQ everything — and **no one should see another
mine's data** unless their role scope includes it.

```
Corporate HQ
   └── Subsidiary
        └── Region / Area
             └── Mine
                  └── Department
                       └── User
```

MineX models this hierarchy explicitly (`subsidiaries → regions → mines → departments`), attaches
each role assignment to exactly one node of the tree, and enforces **mine-level isolation** in the
database.

---

## 3. The MineX solution

MineX implements the full chain from a field observation to a governed, audited outcome:

```
Field capture (MineX Field)
    → Offline local storage (expo-sqlite: records + sync_queue)
        → Sync queue (ordered, dependency-aware, idempotent)
            → Secure backend (Supabase + Next.js route handlers / server actions)
                → AI risk intelligence (@coalguard/ai heuristic + dashboard analytics)
                    → Central command center (MineX Command dashboard)
                        → Corrective action (assign → progress → submit)
                            → Verification (verify / reject)
                                → Governance & reporting (audit_logs, notifications, CSV / print)
```

| Stage | What happens |
| --- | --- |
| **Field capture** | An inspector picks a template, works a checklist, marks a finding, raises an observation, attaches photo/voice evidence and captures GPS + timestamp. |
| **Offline local storage** | Each unsynced object is written to a local SQLite `records` table; the server calls needed to persist it are appended to a local `sync_queue`. |
| **Sync queue** | The sync engine drains the queue in insertion order, honouring per-op `depends_on`, replaying every write as an idempotent upsert on a client-generated UUID. |
| **Secure backend** | Supabase (PostgreSQL + Auth + Storage). Server logic is Next.js route handlers and server actions in MineX Command; there is no separate API server. |
| **AI risk intelligence** | A deterministic keyword heuristic classifies risk (low/medium/high/critical) and derives a likely consequence + a single recommended action. Dashboard "risk intelligence" is deterministic analytics over live rows. Everything is labelled *Simulated AI*. |
| **Central command center** | Managers see KPIs, priority findings, AI risk insights, compliance status, operational health and a risk map — all mine-scoped. |
| **Corrective action** | A finding becomes a corrective action with a priority, an assignee and a due date. |
| **Verification** | The assignee submits closure notes/evidence; a verifier verifies or rejects with a reason. |
| **Governance & reporting** | Every state change writes an `audit_logs` row; governance events deliver an in-app `notifications` row via a scope-checked RPC; reports export as CSV or a printable page. |

| Problem | MineX solution | Result |
| --- | --- | --- |
| Fragmented registers | One Supabase schema (28 tables) spanning org, identity, field ops, compliance, operations, people, platform | A single spine linking finding → requirement → action → audit |
| Paper inspections | Templated checklist → observation → structured evidence in MineX Field | Typed, attributable field records instead of transcription |
| Unreliable connectivity | Offline-first capture: `expo-sqlite` records + `sync_queue` + reconnect drain | Inspections can be captured with no signal and sync later |
| Delayed escalation | Risk band on every observation + dashboard escalation summary + governance notifications | High/critical findings are surfaced and routed with an owner + due date |
| Weak traceability | GPS + `captured_at` + `uploaded_by` on evidence; append-only `audit_logs`; verify/reject workflow | A defensible, linked trail from photo to closure |
| No consolidated view | Mine-scoped Command dashboard fed by live RLS-scoped queries | Managers see current risk/compliance/operations in one place |
| Cross-mine data leakage | Row Level Security on every table via `user_mine_ids()` / `has_mine_scope()` | A user only ever sees mines inside their role scope |

---

## 4. Key features

Legend: **Implemented** = working on real data · **Partial** = works with a defined limitation ·
**Architecture** = interface/schema/UI present, core behaviour not wired.

| Feature | Status | Notes |
| --- | --- | --- |
| Email/password authentication | Implemented | Supabase Auth (JWT). Web uses `@supabase/ssr` cookie sessions; mobile persists the session to `AsyncStorage`. |
| Role-based capability checks | Implemented | 15 roles → permission map in `@coalguard/config` (`hasPermission`). Drives UI/nav visibility. |
| Mine-scoped access | Implemented | PostgreSQL RLS on every table; `user_mine_ids()` / `has_mine_scope()`. |
| Inspection templates | Implemented | `inspection_templates` + `inspection_checklist_items`; a daily safety round plus safety / electrical / equipment / environmental templates are seeded. |
| Guided inspection checklist | Implemented | Sectioned prompts with `ok` / `not_ok` / `na` responses and notes. |
| Observation creation | Implemented | From a failed checklist item, or standalone ("Quick Observation"). |
| Risk classification (band) | Implemented | `low` / `medium` / `high` / `critical` stored on the observation. |
| AI-assisted risk analysis | Implemented (heuristic) | Deterministic keyword heuristic → risk band, rationale, recommendations, likely consequence, single recommended action. Flagged `simulated: true`. **Not** a trained model / LLM. |
| Camera evidence | Implemented | `expo-camera` capture → compressed → uploaded to the private `evidence` bucket. |
| Gallery evidence | Implemented | `expo-image-picker`. |
| Simulated demo evidence | Implemented | `evidence.is_simulated = true` → UI shows "SIMULATED FIELD EVIDENCE". |
| GPS capture | Implemented | `expo-location`: latitude, longitude, accuracy, timestamp on observations / evidence / inspections. |
| Time-stamped field records | Implemented | `created_at` everywhere; `captured_at`, `occurred_at`, `started_at`, `submitted_at` where relevant. |
| Voice notes | Implemented | `expo-av` record (m4a) → persistent local copy → upload as `evidence_type = 'voice_note'`. Transcription returns "unavailable" (no provider configured). |
| Offline local persistence | Implemented (code-complete) | `expo-sqlite` DB `coalguard-offline.db` with `records` / `sync_queue` / `meta`. On-device end-to-end verification is still pending. |
| Offline sync queue | Implemented | Ordered `sync_queue`; drained by the sync engine. |
| Retry with attempt cap | Implemented | Up to `SYNC_MAX_ATTEMPTS = 6` per op; a periodic re-drain every ~8s while work is outstanding. (Not exponential backoff.) |
| Dependency-aware sync | Implemented | Per-op `depends_on`; an op runs only once every op for its dependency record is `done`. |
| Idempotent sync | Implemented | Every write is an upsert on a client-generated UUID that is also the server row id; a `23505` conflict is treated as a successful replay. |
| Connectivity-aware sync | Implemented | `@react-native-community/netinfo`; the drain stops on network loss and resumes on reconnect. |
| Auth-expiry handling | Implemented | A `401` during sync sets a `meta.auth_expired` flag, keeps the queue, and stops; sign-in clears it and resumes. |
| Alerts (mobile) | Implemented | Live list of active high/critical observations and corrective actions for the user's mine. |
| Corrective actions | Implemented | `open → assigned → in_progress → submitted → verified/closed` (+ `rejected`, `overdue`). |
| Assignment | Implemented | Assign from an inspection by drag-and-drop or from the corrective-action detail form. The server validates the manager's permission and the assignee's mine eligibility. |
| Command live refresh | Implemented | Supabase Realtime listens for changes to inspections, observations, corrective actions, evidence, notifications and grievances. The shell batches refreshes and shows connection status. |
| Progress notes | Implemented | Recorded to `audit_logs` (no separate notes table). |
| Closure submission | Implemented | Assignee submits `closure_notes` (+ optional closure evidence). |
| Verification / rejection | Implemented | Verifier verifies (`verified` + `closed_at`) or rejects with a `rejection_reason`. |
| Audit logs | Implemented | Append-only `audit_logs` written by the app for governance events. |
| Notifications / escalation | Partial | In-app `notifications` delivered via the scope-checked `notify_governance` RPC on assign/submit/verify/reject, and a dashboard escalation summary. No push notifications, no scheduled reminders, no automatic overdue transitions. |
| Compliance monitoring | Implemented | `/compliance` register over `compliance_requirements` + `compliance_records`; owner / priority / linked-observation carried as a JSON sidecar in the existing `notes` column (no schema change). |
| GIS / risk map | Implemented | `/risk-map` and a dashboard preview: Leaflet + OpenStreetMap raster tiles, observation markers coloured by risk. No API key; no satellite imagery. |
| Reports | Implemented | `/reports` live summaries, `/reports/export` CSV (inspections / observations / corrective-actions / compliance), `/reports/print` printable page. |
| Attendance | Implemented (read) | `/attendance` over the `attendance` table (worker / contractor-worker / profile subjects). |
| Mine operations | Implemented (read) | `/mine-operations`: equipment status, environmental readings, maintenance records. |
| Contractor information | Implemented (read) | `/contractors` + `contractor_workers` (inductions, medicals). |
| Grievances | Implemented | `/grievances` with a status workflow (`acknowledge → investigating → resolved → closed`) via server actions + audit. |
| Incident reporting (mobile) | Partial | Offline create + view on the `incidents` table (incident type carried as a description prefix, no schema change). Full investigation / root-cause / closure workflow is not implemented. |
| Document digitization / OCR | Architecture | `compliance_documents` table has an `ocr_text` column; `@coalguard/ai` defines an `OcrProvider` interface with a mock implementation; `/documents` displays extracted text and explains the intended pipeline. **No OCR extraction and no upload flow are implemented**, and the mock provider is never called by application code. |
| English / Hindi | Partial | `en` + `hi` in the mobile app, persisted to `AsyncStorage`; the Hindi dictionary is partial and missing keys fall back to English. The web app is English-only. |
| Settings (web) | Planned | `/settings` renders a "planned" placeholder. |

---

## 5. User roles & multi-level governance

### The 15 roles

Defined in `packages/types/src/enums.ts` (`USER_ROLES`), described in `packages/config/src/roles.ts`
(`ROLE_DEFINITIONS`), permissioned in `packages/config/src/rbac.ts` (`ROLE_PERMISSIONS`), and mirrored
by the `public.user_role` PostgreSQL enum.

| # | Role (`enum`) | Typical tier | In short |
| --- | --- | --- | --- |
| 1 | `FIELD_INSPECTOR` | mine | Runs inspections, captures evidence, raises observations |
| 2 | `SAFETY_OFFICER` | department | Owns safety observations, incidents, corrective actions |
| 3 | `ENVIRONMENTAL_OFFICER` | department | Environmental readings, breaches, environmental compliance |
| 4 | `MAINTENANCE_OFFICER` | department | Equipment health & maintenance records |
| 5 | `HR_OFFICER` | department | Workers, contractor workforce, attendance, grievances |
| 6 | `CONTRACTOR` | mine | External party: workforce, inductions, action-closure evidence |
| 7 | `WORKER` | mine | Frontline: view assignments, raise grievances |
| 8 | `COMPLIANCE_OFFICER` | mine | Compliance register & statutory submissions |
| 9 | `MINE_MANAGER` | mine | Review, assign, escalate, verify, close |
| 10 | `INTERNAL_AUDITOR` | subsidiary | Read-mostly across scope; audit trails |
| 11 | `REGIONAL_GM` | region | Oversight of all mines in a region; escalations |
| 12 | `SUBSIDIARY_HQ` | subsidiary | Oversight across a subsidiary |
| 13 | `CORPORATE_HQ` | corporate | Group-wide oversight |
| 14 | `REGULATOR` | corporate | External statutory body; read submitted records |
| 15 | `SYSTEM_ADMIN` | corporate | Users, roles, org hierarchy, configuration |

### Access = capability **and** scope

1. **Capability** — "may this role perform this action at all?" Answered by `hasPermission(roles, permission)`
   against `ROLE_PERMISSIONS`. This decides **what UI to render**; it is not security on its own.
2. **Scope** — "is the target row inside this user's part of the org tree?" Each `role_assignments`
   row pins a role to one node (`corporate` / `subsidiary` / `region` / `mine` / `department`), enforced
   by a DB `CHECK` constraint. A user may touch a row whose mine sits **at or below** one of their
   scope nodes.

**Enforcement is Row Level Security** in PostgreSQL (`supabase/migrations/0002_rls.sql`). The
service-role key that bypasses RLS is never used by application code (see
[§13](#13-security-architecture)).

### What actually exists today

| Layer | Reality |
| --- | --- |
| **Roles modelled** | All 15, with definitions, a permission map and a matching DB enum. |
| **Roles with dedicated UI/workflows** | The two field/oversight personas are exercised end-to-end: **Field Inspector** (MineX Field capture) and **Mine Manager** (MineX Command governance). Other roles authenticate and see the Command Center **filtered by their permission set and mine scope** — there are no separate bespoke dashboards per role. |
| **Demo accounts provided** | Two: one `FIELD_INSPECTOR`, one `MINE_MANAGER` (see [§23](#23-demo-accounts)). |

The org hierarchy itself — `subsidiaries → regions → mines → departments` — is real data with
cascade-on-delete and per-level scope resolution in `src/lib/data/context.ts`.

---

## 6. Complete user workflow

```
MineX Field (mobile)                         MineX Command (web)
────────────────────                         ───────────────────
Login (Supabase Auth)
  → Mine context (from role_assignments)
  → Start inspection            ┐
  → Select template             │
  → Work checklist              │  online: written straight to Supabase
  → Mark a finding (not_ok)     │  offline: written to expo-sqlite +
  → Raise observation           │           sync_queue, replayed on reconnect
  → Capture evidence (photo/voice)│
  → Capture GPS + timestamp     │
  → AI risk classification      │  (server route if reachable, else on-device heuristic)
  → Review                      │
  → Submit                      ┘
        │  sync (idempotent, dependency-ordered)
        ▼
                                             Manager dashboard
                                               → Priority finding
                                               → Create corrective action
                                               → Assign (owner + due date)      → audit_logs + notification
        ◄────────────────────────────────────
  Corrective Actions (mobile) or web
    → Progress note                                                            → audit_logs
    → Submit closure (notes / evidence)                                        → audit_logs + notification
        ────────────────────────────────────►
                                               → Verify  → verified + closed_at → audit_logs + notification
                                               → or Reject (reason)            → audit_logs + notification
```

### Assign an issue from an inspection

1. In MineX Command, sign in with a role that has `corrective_action:assign` and open **Inspections**. Select an inspection, then open **Assign inspection issues**.
2. Review the due date. It defaults to seven days from today in India time and can be changed before assigning.
3. Drag an issue onto an eligible person. On a touchscreen or with a keyboard, select the issue and then select the person.
4. MineX assigns the linked corrective action or creates one for an open finding. It records the assignment in the audit log and sends an in-app notification. The assignee can open the task under **Corrective Actions** in MineX Field.

The picker lists active user accounts with a current role assignment at the inspection's mine. Apply migration `0009_inspection_assignment.sql` to enable the picker.

**Online behaviour.** Every write goes directly to Supabase through the signed-in user's JWT; RLS
decides whether it is allowed. The Command Center reads the same rows live.

**Offline behaviour (MineX Field).** Inspection, checklist, observation, AI analysis, evidence and
incident writes are recorded in the local SQLite store and appended to `sync_queue`. The UI updates
immediately from the local record. When connectivity returns (or the app is reopened), the sync
engine drains the queue in order, and once every op for an inspection is `done` **and** every local
record is `synced`, the local footprint for that inspection is deleted — the server becomes the
single source of truth again.

> Current constraint: the field capture flow has been validated to work offline **after an online
> start**; a fully cold offline start has not been verified on-device. See
> [§27](#27-current-limitations).

---

## 7. Offline-first architecture

Only **MineX Field** is offline-capable. It is implemented as one system shared by the inspection
and incident flows — not two.

### Local database (`apps/mobile/src/lib/db/index.ts`)

- `expo-sqlite`, database file `coalguard-offline.db`.
- Opened with `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`.
- Schema versioning via `PRAGMA user_version` with a numbered `MIGRATIONS` map (currently one
  migration). The local DB is **not** a mirror of Supabase — it only holds work not yet confirmed
  on the server.

| Table | Purpose |
| --- | --- |
| `records` | One row per unsynced domain object (`inspection` / `inspection_item` / `observation` / `evidence` / `incident`). `id` is the **same UUID** that will be used server-side, so there is no local→server id mapping. Columns: `kind`, `id`, `inspection_id`, `payload` (JSON), `sync_state` (`local` / `queued` / `syncing` / `synced` / `failed`), `updated_at`. |
| `sync_queue` | Ordered list of server calls still to make. Columns: `seq` (autoincrement), `op`, `kind`, `record_id`, `inspection_id`, `args` (JSON), `depends_on`, `attempts`, `last_error`, `status` (`pending` / `syncing` / `done` / `failed`), `created_at`. |
| `meta` | Key/value: `auth_expired`, `last_sync_at`, `db_version`. |

### Sync engine (`apps/mobile/src/features/inspection/syncEngine.ts`)

Guarantees, as implemented:

- **Single drain at a time** — a module-level `running` mutex.
- **Order preserved** — ops are processed by ascending `seq`; an op with `depends_on` waits until
  every queue row for that dependency record is `done`.
- **Idempotent replay** — every handler calls the *same* Supabase function the online path uses, and
  every insert is an `upsert` on the client UUID (`onConflict: 'id'`); a `23505` unique-violation is
  treated as a successful replay.
- **Bounded retry** — `failOp` increments `attempts`; at `SYNC_MAX_ATTEMPTS = 6` the op is marked
  `failed` and skipped so it cannot block another inspection. `SyncProvider` re-drains every ~8s
  while any work is outstanding, and `retryFailed()` resets failed ops on demand.
- **Network loss** — an `OfflineError` stops the drain immediately (the current op is re-queued);
  it resumes on reconnect.
- **Auth expiry** — an `AuthExpiredError` sets `meta.auth_expired = '1'`, re-queues the op and stops.
  Signing back in clears the flag and resumes.
- **Per-pass cap** — at most 200 ops per drain pass, then it yields.

### Op types

`upsert_inspection`, `upsert_items`, `upsert_observation`, `save_ai_analysis`,
`upsert_corrective_action`, `upload_evidence`, `upload_voice_note`, `submit_inspection`,
`upsert_incident`.

### Provider / UI

`SyncProvider` (React context) exposes `state` (`idle` / `syncing` / `queued` / `failed` / `offline`),
a queue `summary`, `authExpired`, `online`, `syncNow()` and `retryFailed()`. `SyncBadge` and
`ConnectivityBadge` surface this on the Home and list screens. Connectivity is read from
`@react-native-community/netinfo` and mirrored to a module variable so the non-React sync engine can
check it.

### Evidence, offline (`apps/mobile/src/features/inspection/evidence.ts`)

1. **`prepareEvidence()`** — compress the photo and copy it into a **persistent** app directory
   (`FileSystem.documentDirectory + 'evidence/'`), so it survives an app restart or cache eviction.
   No network.
2. **`uploadPreparedEvidence()`** — read the persistent file → `upload` to the private `evidence`
   bucket (`upsert: true`) → `upsert` the `evidence` metadata row → delete the local copy. Run by the
   sync engine when online.

Voice notes follow the same two-step shape (`prepareVoiceNote` / `uploadPreparedVoiceNote`, `.m4a`,
`audio/m4a`).

### Behaviour under stress

| Situation | What happens |
| --- | --- |
| Network disappears mid-capture | Writes go to `records` + `sync_queue`; the UI keeps working from the local record. |
| App is closed | SQLite is durable; `records` and `sync_queue` persist. |
| App restarts | `SyncProvider` calls `runSync()` on mount and resumes the queue. |
| A sync op fails repeatedly | After 6 attempts it is marked `failed`, skipped, and surfaced in the sync badge for a manual `retryFailed()`. Other inspections are unaffected. |
| The session expires during sync | `meta.auth_expired` is set, the queue is kept, the drain stops; re-auth clears it and resumes. |
| The same op is replayed | Upsert on the client UUID → no duplicate row; a `23505` is treated as success. |

```
ONLINE      User → Supabase (RLS)
OFFLINE     User → expo-sqlite (records + sync_queue)
RECONNECT   sync_queue → dependency resolution → Supabase (RLS) → local rows cleared when confirmed
```

---

## 8. AI architecture

### What the "AI" is today

The current MVP uses a **deterministic keyword heuristic**, not a trained model and not an external
LLM. No AI provider API key is configured or required. Every AI output the product shows is labelled
**Simulated AI** and carries `simulated: true`.

### `@coalguard/ai` (server-side package)

| Export | What it does |
| --- | --- |
| `LlmProvider` / `LlmCompletionRequest` / `LlmCompletionResponse` | Provider-agnostic LLM contract. |
| `MockLlmProvider` | The only implemented provider (`name = 'mock'`, `model = 'coalguard-mock-v0'`). Returns a canned, clearly-simulated response. |
| `getLlmProvider()` | Factory keyed on `AI_PROVIDER` (default `mock`). Only the `mock` case is implemented; the `switch` is the extension point for a real provider. |
| `localRiskHeuristic(input)` | Pure, dependency-free function. Regex keyword bands: `CRITICAL` (fatal, explosion, inrush, entrapment, collapse, electrocution…), `HIGH` (fall from height, slope failure, no guard, live wire, methane…), `MEDIUM` (PPE, housekeeping, spill, near miss…), else `low`. Returns `{ risk, confidence: 0.35, rationale, recommendations[], simulated: true }`. Safe to bundle into React Native. |
| `analyzeObservation(input)` | Builds on the heuristic. Adds a hazard-family **`consequence`** and a single **`recommendedAction`** from an ordered signature list (slope / electrical / gas-inrush / haulage / PPE / emergency-response), falling back to per-band text. |
| `classifyRisk(input)` | High-level task. Calls the provider; with the `mock` provider it returns `localRiskHeuristic(input)`. A real-provider branch exists and defensively parses JSON, but no real provider is wired. |
| `OcrProvider` / `getOcrProvider()` / `MockOcrProvider` | OCR contract + a mock returning `"SIMULATED OCR TEXT"` with `confidence: 0`. **Never invoked by application code.** |
| `TranscriptionProvider` / `getTranscriptionProvider()` / `NoTranscriptionProvider` | Transcription contract. Keyed on `TRANSCRIBE_PROVIDER` (default `none`); the `none` provider returns `{ available: false }` and never fabricates a transcript. |

### Server route (`apps/web/src/app/api/ai/classify-risk/route.ts`)

`POST /api/ai/classify-risk` — the secure entry point for MineX Field. It verifies the caller's
Supabase access token, then calls `classifyRisk()` + `analyzeObservation()` on the server and returns
`{ risk, confidence, rationale, recommendations, consequence, recommendedAction, provider, model,
simulated }`. Any future real-provider key would live only on the server; the mobile bundle never
sees it.

### On-device fallback (`apps/mobile/src/lib/ai/classifyRisk.ts`)

1. If `EXPO_PUBLIC_WEB_API_URL` is configured, `POST` to the server route with the user's token
   (12-second timeout).
2. On any failure — not configured, unreachable, slow, non-2xx — fall back to the bundled
   `localRiskHeuristic` (`@coalguard/ai/heuristic`).

Both paths return a `source` (`'server'` | `'on-device'`) so the UI is honest about provenance.

### Dashboard "AI-Assisted Risk Intelligence"

`src/lib/data/ai-insights.ts` and `src/lib/data/risk-intelligence.ts` compute **deterministic
analytics over live Supabase rows** — risk distribution, top/recurring hazard categories, open
critical/high counts, overdue actions, compliance-at-risk, environmental breaches, an escalation
summary — and template the narrative "signals" from those numbers. Labelled *AI-Assisted Risk
Analysis / Simulated AI* in the UI. No model, no API key.

### Persistence & determinism

Every analysis can be stored in `ai_analyses` (`provider`, `model`, `input`, `output`, `risk`,
`confidence`, `summary`, `recommendations`, `entity_type`, `entity_id`, `requested_by`). The demo
seed writes frozen `ai_analyses` rows (provider `coalguard-heuristic`, model `coalguard-mock-v0`,
`output.simulated = true`) so the observation-detail "AI Risk Analysis" panel is reproducible.
Because the heuristic is pure, the same observation text always yields the same result.

---

## 9. Technology stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| **Mobile app** | Expo SDK 52, React Native 0.76.9, React 18.3.1 | MineX Field runtime (New Architecture enabled) |
| | Expo Router 4 | File-based navigation (`app/`) |
| | TypeScript 5.6 (strict) | Language |
| | `expo-sqlite` | Offline `records` / `sync_queue` / `meta` store |
| | `expo-camera` | Evidence photo capture |
| | `expo-image-picker` | Gallery evidence |
| | `expo-location` | GPS latitude / longitude / accuracy |
| | `expo-av` | Voice-note recording (+ microphone permission) |
| | `expo-file-system`, `expo-image-manipulator`, `expo-crypto` | Persistent local files, image compression, UUIDs |
| | `@react-native-async-storage/async-storage` | Supabase session + language persistence |
| | `@react-native-community/netinfo` | Connectivity state |
| | `@supabase/supabase-js` | Auth + data + storage client (anon key + user JWT) |
| | `lucide-react-native`, `react-native-svg`, `react-native-safe-area-context`, `react-native-screens` | UI primitives |
| **Web app** | Next.js 15 (App Router), React 18.3, React DOM 18.3 | MineX Command runtime |
| | TypeScript 5.6 (strict) | Language |
| | Tailwind CSS 3.4 (+ `autoprefixer`, `postcss`) | Styling, driven by `@coalguard/ui` tokens |
| | Hand-built shadcn-style components | `src/components/ui/*` (Button, Card, Badge, DataTable, …). **The `shadcn/ui` package is not a dependency.** |
| | Recharts 2 | Dashboard charts |
| | Leaflet 1.9 + React-Leaflet 4 | Risk map |
| | `lucide-react` | Icons |
| | `@supabase/ssr` + `@supabase/supabase-js` | Cookie-based auth + RLS-scoped data access |
| | `clsx`, `tailwind-merge` | Class composition |
| **Backend** | Next.js route handlers + server actions (in `apps/web`) | The only server-side code; there is no separate API service |
| | Supabase | Managed platform |
| **Database** | PostgreSQL 15 (via Supabase) | Relational store, enums, RLS, `SECURITY DEFINER` helper functions |
| **Auth** | Supabase Auth (JWT) | Email/password; `handle_new_user()` trigger auto-creates a `profiles` row |
| **Storage** | Supabase Storage | Private buckets: `evidence`, `documents`, `avatars` |
| **AI** | `@coalguard/ai` (in-process, server-side) | Deterministic risk heuristic + provider/OCR/transcription interfaces |
| **Maps** | OpenStreetMap raster tiles (`tile.openstreetmap.org`) via Leaflet | Risk-map basemap — no API key, no vendor SDK |
| **Monorepo** | npm workspaces | `apps/*` + `packages/*`, one shared `node_modules` |
| **Tooling** | ESLint (`eslint-config-next`, `eslint-config-expo`), Prettier, TypeScript, `expo-doctor` | Lint / format / typecheck / project-health |
| **Mobile build** | EAS Build (`apps/mobile/eas.json`) | Installable Android **APK** (`preview` profile) |

_Only technologies confirmed by `package.json` / source are listed._

---

## 10. Programming languages

| Language | Where / what for |
| --- | --- |
| **TypeScript** | Everything in `apps/web`, `apps/mobile` and `packages/*` — app code, shared types, RBAC config, AI heuristic, design tokens. `strict` + `noUncheckedIndexedAccess`. |
| **SQL** (PostgreSQL) | `supabase/migrations/*.sql` (schema, enums, RLS, `SECURITY DEFINER` functions, grants) and `supabase/seed/*.sql`. |
| **JavaScript** | Node ESM scripts `supabase/seed/*.mjs` (demo reset / additive seeds, zero-dependency), and config files (`next.config.mjs`, `metro.config.js`, `babel.config.js`, `postcss.config.js`, `.eslintrc.js`). |
| **JSON** | `package.json`, `tsconfig*.json`, `app.json`, `eas.json`, `supabase/config.toml`'s siblings, Prettier/editor config. |
| **CSS / Tailwind** | `apps/web/src/app/globals.css` + `tailwind.config.ts` (TS) mapping `@coalguard/ui` tokens to semantic classes / CSS variables. |
| **Markdown** | `README.md` and `docs/*.md`. |
| **TOML** | `supabase/config.toml` (Supabase CLI local config). |

No shell/PowerShell scripts are committed; setup steps in [§22](#22-local-development-setup) are run
by hand. There is no automated test code.

---

## 11. System architecture

```
                         ┌─────────────────────────────┐
                         │         MineX Field         │
                         │  Expo / React Native (SDK52)│
                         │  Inspection · Evidence · GPS │
                         │  Voice · expo-sqlite offline │
                         │  + sync engine               │
                         └───────────────┬─────────────┘
                                         │
                     online: direct (anon key + user JWT)
                     offline: local SQLite → sync_queue → drain on reconnect
                                         │
                                         ▼
             ┌────────────────────────────────────────────────────┐
             │              MineX Command  (apps/web)              │
             │   Next.js 15 App Router · Server Components         │
             │   Route handlers  /api/ai/*  · /reports/export      │
             │   Server actions  corrective-actions · grievances   │
             │   In-process @coalguard/ai (risk heuristic)         │
             └───────────────┬───────────────────────┬────────────┘
                             │                       │
             (browser: anon key + cookie session)    │ (SECURITY DEFINER RPCs:
                             │                       │  notify_governance,
                             ▼                       │  eligible_ca_assignees)
             ┌───────────────────────────────────────▼────────────┐
             │                   Supabase project                 │
             │  PostgreSQL 15   ·   Auth (JWT)   ·   Storage       │
             │  28 tables · enums · RLS on every table            │
             │  helpers: user_mine_ids() / has_mine_scope()       │
             │  buckets: evidence · documents · avatars (private) │
             └───────────────────────────────────────┬────────────┘
                                                     │  signed URLs
                                                     ▼
                                         Basemap: OpenStreetMap tiles
                                         (Leaflet, client-side, no key)
```

Notes that differ from a "generic" 3-tier picture:

- There is **no standalone backend service**. All server code is Next.js route handlers and server
  actions co-located with MineX Command.
- The AI "layer" is an **in-process module** (`@coalguard/ai`), not a network service.
- The mobile app talks to Supabase **directly** for reads/writes (RLS is the boundary); it only
  calls the web app for the secure AI route.

---

## 12. Data architecture

PostgreSQL, hosted by Supabase. Migrations in `supabase/migrations/` run in filename order.

| Migration | Contents |
| --- | --- |
| `0001_init.sql` | 23 enum types, **28 tables**, indexes, FK constraints, `CHECK` constraints, `set_updated_at()` triggers on mutable tables, `handle_new_user()` + `on_auth_user_created` trigger, deferred FKs to `ai_analyses`. |
| `0002_rls.sql` | RLS helper functions (`current_profile_id`, `is_system_admin`, `user_mine_ids`, `has_mine_scope`), RLS enabled on every table, `SYSTEM_ADMIN` blanket policy, mine-scoped SELECT/INSERT/UPDATE policies, identity / notifications / reference-data policies. |
| `0003_storage.sql` | Private buckets `evidence`, `documents`, `avatars` + `storage.objects` policies (Phase-0 rule: any authenticated user may read/write these buckets). |
| `0004_grants.sql` | Explicit table / sequence / function privileges for `anon` / `authenticated` / `service_role` (RLS still filters rows). |
| `0005_inspection_templates.sql` | **Seed-only.** Adds four inspection templates (Safety & PPE, Electrical Safety, Equipment & Machinery, Environmental Compliance) + checklist items. No schema change. |
| `0006_governance.sql` | **Additive.** `scoped_profile_ids()`, `eligible_ca_assignees(uuid)`, `notify_governance(uuid,uuid,text)` (`SECURITY DEFINER`) + one extra `profiles` SELECT policy. No tables / columns / enum values added. |
| `0007_realtime.sql` | Adds selected operational tables to the Supabase Realtime publication. |
| `0009_inspection_assignment.sql` | Adds the mine-scoped inspection assignee picker RPC. Requires the RLS helper from `0002` and governance functions from `0006`. |

### Table groups (28 tables)

**Organisation hierarchy** — `subsidiaries` → `regions` → `mines` → `departments` (cascade on
delete from parent). `mines` carries `latitude`, `longitude`, `boundary jsonb` (GeoJSON placeholder),
`mine_type`.

**Identity & RBAC** — `profiles` (`id` = `auth.users.id`, auto-created by trigger),
`role_assignments` (role + one scope pointer, `role_scope_consistent` CHECK).

**Field operations** — `inspection_templates` + `inspection_checklist_items` (the blueprint) →
`inspections` → `inspection_items` (filled answers) → `observations` → `corrective_actions`.
`incidents` stands alongside and can also spawn `corrective_actions`. Offline-capable rows
(`inspections`, `observations`, `incidents`, `evidence`) carry `client_ref uuid unique` and
`sync_status`.

**Evidence** — `evidence` attaches to at least one of inspection / observation / incident /
corrective_action (`evidence_has_parent` CHECK). Columns include `evidence_type`
(`photo` / `video` / `document` / `voice_note`), `storage_path`, `file_name`, `mime_type`,
`file_size_bytes`, `is_simulated`, `caption`, `captured_at`, `gps_latitude`, `gps_longitude`,
`location_accuracy_m`, `uploaded_by`, `mine_id`, `client_ref`, `sync_status`.

**Compliance** — `compliance_requirements` (catalogue) → `compliance_records` (per mine, per period)
→ `compliance_documents` (uploaded proof, with an `ocr_text` column).

**Operations** — `environmental_readings`, `equipment` → `maintenance_records`.

**People** — `workers`, `contractors` → `contractor_workers`, `attendance` (subject is exactly one
of worker / contractor-worker / profile), `grievances` (raised by a profile, worker, contractor
worker, or anonymously).

**Platform** — `notifications` (per recipient), `audit_logs` (append-only: `actor_id`, `action`,
`entity_type`, `entity_id`, `mine_id`, `before`, `after`), `ai_analyses` (one row per AI call).

### Relationships (high level)

```
subsidiaries ─< regions ─< mines ─< departments
                            │
   ┌────────────────────────┼───────────────────────────────┐
inspections            observations ─< corrective_actions   incidents
   │  │                     │               │        ▲        │
   │  └< inspection_items   │               │        └────────┘
   │                        │               │
   └──────────< ────────────┴───< ── evidence >──────────────┘

mines ─< compliance_records >─ compliance_requirements
mines ─< compliance_documents        mines ─< environmental_readings
mines ─< equipment ─< maintenance_records
mines ─< workers      mines ─< contractors ─< contractor_workers
mines ─< attendance   mines ─< grievances

profiles ─< role_assignments     profiles ─< notifications
audit_logs      ai_analyses
```

Enums the app relies on (mirrored in `packages/types/src/enums.ts`): `user_role` (15),
`org_scope_level`, `mine_type`, `department_type`, `inspection_status`, `risk_level`
(`low`/`medium`/`high`/`critical`), `inspection_item_response`, `observation_status`,
`incident_severity`, `incident_status`, `corrective_action_status`
(`open`/`assigned`/`in_progress`/`submitted`/`verified`/`closed`/`overdue`/`rejected`),
`corrective_action_priority`, `evidence_type`, `compliance_status`, `equipment_status`,
`maintenance_type`, `attendance_status`, `grievance_status`, `notification_status`,
`notification_priority`, `ai_analysis_type`, `ai_analysis_status`, `sync_status`.

Types are hand-written in `packages/types/src/models.ts` today; a `supabase gen types` step is
noted for later in `docs/DATABASE.md`.

---

## 13. Security architecture

| Control | Implementation |
| --- | --- |
| **Authentication** | Supabase Auth (JWT). Web: `@supabase/ssr`, session in an HTTP cookie, refreshed by `middleware.ts` → `updateSession`. Mobile: `@supabase/supabase-js` with `AsyncStorage` persistence, `autoRefreshToken`, `detectSessionInUrl: false`. |
| **Row Level Security** | Enabled on **every** public table (`0002_rls.sql`). `SYSTEM_ADMIN` has a blanket policy; mine-scoped tables use `has_mine_scope(mine_id)`; `inspection_items` inherit their parent inspection's mine; org-hierarchy tables are readable by any authenticated user and writable by admin; `profiles` = self + same-scope; `notifications` = recipient only; `ai_analyses` = requester only; reference tables (templates, checklist items, compliance requirements) readable by any authenticated user. |
| **Deny by default** | A table with no explicit scoped policy is admin-only. This is deliberate. |
| **Mine-scoped access** | `user_mine_ids()` computes the caller's allowed mines from all active `role_assignments` (corporate → every mine; subsidiary/region/mine/department → the matching subset). `SECURITY DEFINER` + `STABLE`. |
| **Server-side authorization** | Web server actions re-load the target row through the RLS client and re-check capability (`caCapabilities`, `hasPermission`, `allowedStatusTargets`) before writing; the AI route verifies the bearer token with `supabase.auth.getUser(token)` before doing anything. |
| **Sanctioned privileged paths** | `notify_governance` is the **only** insert path into `notifications` for non-admins — a `SECURITY DEFINER` function that checks the caller has scope on the corrective action and that the recipient is within scope. `eligible_ca_assignees` similarly gates assignment. |
| **Secure storage** | All three buckets (`evidence`, `documents`, `avatars`) are **private**. |
| **Signed URLs** | Evidence is served via short-lived signed URLs (`createSignedUrl`, 600–3600s). No public object URLs. |
| **Service-role key isolation** | `SUPABASE_SERVICE_ROLE_KEY` is referenced only in `supabase/seed/*.mjs` (admin seed/reset, reading `apps/web/.env.local`). `serverEnv()` in `apps/web/src/lib/env.ts` can surface it but is **not called anywhere in application code** — the web app runs entirely on the anon key + the user's session. |
| **Public vs secret keys** | Only `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` values reach a browser or a phone: the Supabase URL and the anon key (both safe by design). The mobile bundle contains **no** secret and **no** AI provider key. |
| **Environment separation** | `.env` / `.env.local` are git-ignored (`.env`, `.env.*` patterns); only `.env.example` is committed. |
| **Audit trail** | `audit_logs` is append-only (no update/delete policy); the app writes `corrective_action.*` and `grievance.*` events with `before`/`after` JSON. |

### Known security limitations

- **Storage object scoping.** Bucket policies currently allow **any authenticated user** to read/write
  the `evidence` and `documents` buckets. Object *keys* are namespaced by `mine_id` (and the
  corrective-action closure path is validated `startsWith(`${mine_id}/`)`), but the storage layer
  itself does not yet enforce mine scope on reads. Row-level access to the `evidence` *metadata* is
  RLS-scoped; the *bytes* are not path-scoped at the storage policy level.
- **Per-role fine-grained RLS.** Beyond mine scope + `SYSTEM_ADMIN`, there is not yet an
  "inspector may edit only their own draft" style policy set; several tables are effectively
  admin-write until finer policies are added.
- **`audit_logs` completeness.** Audit rows are written by application code for governance events,
  not by database triggers, so a direct DB write would not be audited.
- **Rate limiting / abuse controls** on the AI route are not implemented.
- **No automated security testing** is included in the repo.

---

## 14. API / backend

There is no separate API server. "Backend" = Next.js **route handlers**, **server actions** and
**data-access modules** in `apps/web`, plus **Supabase RPCs**.

### Route handlers

| Method | Endpoint | Purpose | Auth | Used by |
| --- | --- | --- | --- | --- |
| `POST` | `/api/ai/classify-risk` | Verify token → `classifyRisk()` + `analyzeObservation()` → risk band, rationale, recommendations, consequence, recommended action, provider/model | `Authorization: Bearer <supabase access token>` | MineX Field (AI risk analysis) |
| `POST` | `/api/ai/transcribe` | Verify token → load the `voice_note` `evidence` row through the caller's JWT (RLS) → sign a short URL → transcription provider. Returns `{ available: false }` when no provider is configured; never fabricates a transcript | `Authorization: Bearer <token>` | MineX Field (voice-note transcription) |
| `GET` | `/reports/export?type=<inspections\|observations\|corrective-actions\|compliance>&mine=<id>` | Streams a CSV built from the caller's **RLS-scoped** session — the export can never contain rows the user could not already see | Session cookie (`getSessionUser`) | MineX Command (Reports) |
| `POST` | `/auth/signout` | Ends the Supabase session and redirects | Session cookie | MineX Command |

Both `/api/ai/*` routes are `export const dynamic = 'force-dynamic'`.

### Server actions

**Corrective actions** (`app/(command)/corrective-actions/[id]/actions.ts`) — each re-loads the CA
through RLS, re-checks capability, writes, then writes an `audit_logs` row and (where relevant) calls
`notify_governance`:

`assignCorrectiveAction`, `assignInspectionIssue`, `updateCorrectiveActionStatus`, `addProgressNote`,
`submitCorrectiveAction`, `verifyCorrectiveAction`, `rejectCorrectiveAction`,
`attachClosureEvidence`.

**Grievances** (`app/(command)/grievances/[id]/actions.ts`) — a guarded status machine
(`open → acknowledged → investigating → resolved → closed`) with audit + best-effort assignee
notification:

`acknowledgeGrievance`, `startGrievanceReview`, `resolveGrievance`, `closeGrievance`.

### Supabase RPCs (`SECURITY DEFINER`, called from the app)

| Function | Purpose |
| --- | --- |
| `notify_governance(p_ca_id, p_recipient, p_kind)` | The only sanctioned `notifications` insert for non-admins; validates caller scope + recipient scope; `p_kind ∈ {assigned, submitted, verified, rejected}`. |
| `eligible_ca_assignees(p_ca_id)` | Returns active profiles with a role assignment at that corrective action's mine — only if the caller has scope on that mine. |
| `eligible_inspection_assignees(p_inspection_id)` | Lists active accounts with a current role assignment at the inspection mine, subject to the caller's mine scope. |
| `scoped_profile_ids()` | Profile ids the caller may see because they share a mine scope (used by the extra `profiles` policy and by the two functions above). |
| `user_mine_ids()` / `has_mine_scope()` / `is_system_admin()` / `current_profile_id()` | RLS helpers invoked inside policies. |

### Data-access modules (`apps/web/src/lib/data/*`)

`context` (command context + accessible mines), `dashboard` (one consolidated fetch → KPIs, trend,
breakdowns, priority findings, activity, AI insights, risk-intel subset, compliance, ops, risk-map),
`inspections`, `observations`, `corrective-actions`, `governance`, `ca-permissions`, `evidence`,
`compliance`, `documents`, `attendance`, `contractors`, `operations`, `grievances`, `reports`,
`risk-map`, `risk-intelligence`, `ai-insights`. Every one reads through the RLS-scoped SSR Supabase
client (`cache()`-wrapped where shared across a render).

### Request flow

```
Mobile / Web
  → authenticated request (JWT in Authorization header, or session cookie)
  → route handler / server action / server component
  → authorization (token verify · hasPermission · caCapabilities · allowedStatusTargets)
  → Supabase (RLS + SECURITY DEFINER RPCs enforce row-level scope)
  → response  (+ audit_logs row + notify_governance where it is a governance event)
```

---

## 15. Storage & evidence

### Buckets

`evidence`, `documents`, `avatars` — **all private** (`storage.buckets.public = false`).

### Evidence metadata (`public.evidence`)

Confirmed columns: `id`, `evidence_type` (`photo` / `video` / `document` / `voice_note`),
`storage_path`, `file_name`, `mime_type`, `file_size_bytes`, `is_simulated`, `caption`,
`captured_at`, `gps_latitude`, `gps_longitude`, `location_accuracy_m`, `uploaded_by`, `mine_id`,
`inspection_id`, `observation_id`, `incident_id`, `corrective_action_id`, `client_ref`,
`sync_status`, `created_at`, `updated_at`. `evidence_has_parent` requires at least one parent id.

### Object key layout (as written by the app)

```
evidence/<mine_id>/<inspection_id>/<observation_id>/<uuid>.jpg          (inspection evidence)
evidence/<mine_id>/incidents/<incident_id>/<uuid>.jpg                   (incident evidence)
evidence/<mine_id>/corrective-actions/<ca_id>/<uuid>.jpg               (closure evidence)
evidence/voice-notes/<mine_id>/observations/<observation_id>/<uuid>.m4a (voice notes)
```

The corrective-action closure action rejects a `storagePath` that does not
`startsWith(`${ca.mine_id}/`)`.

### Signed URLs

Evidence is displayed through `createSignedUrl(path, 600–3600)`. There is no public URL for any
evidence object — a raw bucket path is not a viewable link, and access still depends on holding a
valid session and being able to sign the URL (which the server does with the caller's JWT for
transcription, and the mobile client does with its own session for viewing).

### Simulated demo evidence

`evidence.is_simulated = true` marks any non-real image. The UI renders a **"SIMULATED FIELD
EVIDENCE"** badge (constant `SIMULATED_EVIDENCE_LABEL`). The demo reset uploads two real placeholder
photos and flags both rows `is_simulated = true` — GPS and imagery in the demo must not be presented
as live mine data.

---

## 16. GIS / location intelligence

### Capture (MineX Field)

`expo-location` (`src/lib/location/capture.ts`) records **latitude**, **longitude**, **accuracy (m)**
and a **timestamp**. Coordinates are written to:

- `observations.gps_latitude` / `gps_longitude`
- `evidence.gps_latitude` / `gps_longitude` / `location_accuracy_m` + `captured_at`
- `inspections.gps_latitude` / `gps_longitude` / `location_accuracy_m`
- `incidents.gps_latitude` / `gps_longitude`

Each geo-tagged observation is associated with its inspection, mine and (optionally) department.

### Web risk map (`/risk-map` + dashboard preview)

- **Leaflet** + **React-Leaflet 4**, loaded client-only via `next/dynamic` (`ssr: false`); the
  dashboard version defers loading until the map scrolls into view (`IntersectionObserver`).
- Basemap: **OpenStreetMap raster tiles** from `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
  with OSM attribution. **No API key, no tile-provider account, no vendor SDK.**
- Observations render as `CircleMarker`s coloured by risk band (critical=red, high=orange,
  medium=amber, low=green), with a popup linking to the observation.
- Observations without coordinates are listed separately (not dropped).
- After ~6 tile errors the component falls back to a **"Map unavailable"** list of the geo-tagged
  findings, so the page still works with no internet tiles.

`mines.latitude` / `longitude` provide the map centre; `mines.boundary` (GeoJSON `jsonb`) exists in
the schema but is **not** used by any UI yet. There is **no** satellite/aerial imagery, no
heatmap layer, no routing, and no draw/measure tools.

---

## 17. Compliance domains

MineX organises statutory obligations around the domains a coal mine is regulated on:

| Domain | Where it shows up |
| --- | --- |
| **Safety** | Inspection templates (Safety & PPE, Electrical, Equipment), observations, corrective actions, incidents |
| **Environment** | Environmental inspection template, `environmental_readings` (PM2.5/PM10/noise/water pH/SO₂/NOx with `is_breach` + `threshold`), environmental compliance requirements |
| **Production / operations** | `equipment` + `maintenance_records`, `mine-operations` module, production-category compliance requirements |
| **Labour / workforce** | `workers`, `contractors` + `contractor_workers` (inductions, medicals), `attendance`, `grievances` |

### Compliance register

- `compliance_requirements` — the catalogue (`code`, `title`, `authority` (default `DGMS`),
  `category`, `frequency`, `applies_to_mine_type`, `reference_url`). Reference data, readable by any
  authenticated user.
- `compliance_records` — one row per requirement per mine per period (`status`
  ∈ `compliant` / `at_risk` / `non_compliant` / `pending_review`, `period_start/end`, `due_date`,
  `submitted_at`, `reviewed_by/at`, `notes`). Mine-scoped RLS.
- **No columns were added** for owner / priority / linked-finding — those three attributes are
  carried as a small JSON sidecar inside the existing `notes` text column and parsed defensively
  (`parseComplianceMeta`); a plain-text note still works.
- `/compliance` and `/compliance/[id]` present the register with KPIs (compliant / at-risk /
  non-compliant / overdue / due-soon).

### Document digitization — **architecture only**

`/documents` shows the `compliance_documents` register and explains an OCR pipeline (upload → local
OCR extraction → field detection → review & save). In the current build there is **no upload UI and
no extraction step**; the page displays `ocr_text` if a row already has it, and `@coalguard/ai`'s
`OcrProvider` mock is never invoked.

---

## 18. MineX Command (web)

The `app/(command)/*` route group uses an authenticated layout. Pages with a mine picker load the scoped mine list through `getCommandContext()`. Routes have `loading.tsx` placeholders and a shared `error.tsx`.

| Route | What it shows (live, RLS-scoped) |
| --- | --- |
| `/` | Landing page → "Open Command Center" / "Sign in" |
| `/login` | Sign-in form |
| `/dashboard` | KPIs (total inspections, open observations, high/critical risks, pending corrective actions, compliance status); inspection trend; risk / observation-status / corrective-action-status breakdowns (Recharts); **AI Risk Insights**; **AI-Assisted Risk Intelligence** + escalation summary; **Priority Findings**; compliance snapshot; operational health; **Risk Map** preview; activity timeline. Streamed via `<Suspense>` boundaries; charts code-split. |
| `/inspections`, `/inspections/[id]` | Inspection list and detail with checklist answers, observations, evidence and the drag-and-drop assignment panel for eligible roles. |
| `/observations`, `/observations/[id]` | Observation list + detail with the persisted `ai_analyses` panel and evidence grid |
| `/corrective-actions`, `/corrective-actions/[id]` | Governance loop UI: assign / progress / submit / verify / reject, with a governance timeline |
| `/risk-map` | Full Leaflet risk map + geo/ungeo lists |
| `/compliance`, `/compliance/[id]` | Compliance register + requirement detail |
| `/documents` | `compliance_documents` register + OCR-pipeline explainer (architecture) |
| `/contractors`, `/contractors/[id]` | Contractors + contractor workforce |
| `/attendance` | Attendance records |
| `/grievances`, `/grievances/[id]` | Grievances + status workflow actions |
| `/mine-operations` | Equipment, environmental readings, maintenance |
| `/reports` | Live management summaries + CSV export links + link to `/reports/print` |
| `/notifications` | The signed-in user's `notifications` |
| `/profile` | The user's roles & effective permissions & scope |
| `/settings` | "Planned" placeholder |

Navigation items are filtered by the user's permission set (`filterNav` in
`src/components/command/nav.ts`); a mine filter appears when the user's scope covers more than one
mine.

**Live updates.** The header shows Realtime connection status. Changes to subscribed tables schedule a refresh once per one-second batch. The Refresh button also reloads the current view.

**Navigation.** The production sidebar prefetches Overview, Inspections, Observations and Corrective Actions. Other sidebar links prefetch on hover or focus. Next.js keeps recent dynamic route results in the browser for 20 seconds and fully prefetched data for up to 30 seconds. Overview metrics can render before the supporting dashboard queries finish. Default dashboard and list queries run alongside profile and mine-picker lookups after session verification.

---

## 19. MineX Field (mobile)

Expo Router `app/` tree.

| Area | Screens |
| --- | --- |
| Auth | `(auth)/sign-in` |
| Tabs | `(app)/home`, `(app)/inspections`, `(app)/alerts`, `(app)/profile` |
| Inspection flow | `inspection/templates` → `inspection/[id]/checklist` → `inspection/[id]/observation` → `inspection/[id]/review` → `inspection/[id]/submitted`; plus `inspection/[id]/detail` |
| Observations | `observation/quick` (standalone Quick Observation) |
| Incidents | `incident/index`, `incident/report`, `incident/[id]` |
| Corrective actions | `corrective-actions/index`, `corrective-actions/[id]` |

Capabilities exercised on these screens: login, mine context, template selection, guided checklist,
observation, **camera** + **gallery** evidence, **GPS** capture, **voice notes** (`expo-av`),
**AI risk** (server route or on-device heuristic), review & submit, **offline mode** with a
**sync badge** and **connectivity badge**, drafts-vs-submitted list, English/Hindi toggle.

> The Home screen's "Today's Activity" / "Recent Activity" tiles are **demo content** (`src/data/demoContent.ts`),
> clearly labelled "DEMO DATA". The **Alerts** screen is live Supabase data.

### UX philosophy

- **Field-first / low-friction** — one primary action per screen ("Start Inspection"), a guided
  checklist, minimal typing.
- **Large touch targets, high contrast** — a light, high-contrast field theme from central tokens
  (`src/lib/theme.ts`), AA-rated status colours, bigger labels for glare and gloves.
- **Works in poor connectivity** — every capture path has an offline route; the UI updates from the
  local record immediately and shows an honest ONLINE/OFFLINE + sync state.
- **Honest labelling** — simulated evidence and simulated AI are always marked as such.

---

## 20. Internationalization

- **Mobile:** English (`en`) and Hindi (`hi`), defined in `apps/mobile/src/lib/i18n/strings.ts`
  (`LANGUAGES`). A tiny runtime (`useI18n().t(key, params)`) with `{param}` interpolation. The chosen
  language persists to `AsyncStorage` (`coalguard.field.lang`) and is restored on launch. A missing
  key falls back to the English string, then to the key itself — so the **Hindi dictionary can be
  (and currently is) partial** without breaking the UI.
- **Web:** English only. No i18n runtime in MineX Command.

---

## 21. Deployment

### Web — MineX Command

A standard Next.js 15 App-Router application (`apps/web`). `npm run build` → `next build`;
`npm run start --workspace @coalguard/web` → `next start -p 3000`. It has no server of its own beyond Next.js, so it deploys to
any Next.js host; **Vercel** (with the repo's GitHub integration) is the intended target. Required
environment variables are `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and (only for
the seed/reset scripts, not the running app) `SUPABASE_SERVICE_ROLE_KEY`. `AI_PROVIDER` defaults to
`mock`.

### Mobile — MineX Field

Built with **EAS Build** to an installable **Android APK** for direct sideloading (not an AAB / not
Play Store). `apps/mobile/eas.json`:

```jsonc
{
  "cli": { "version": ">= 23.2.0", "appVersionSource": "local" },
  "build": {
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "env": {
        "EXPO_PUBLIC_SUPABASE_URL": "…",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY": "…"   // public anon key, RLS-protected
      }
    }
  }
}
```

`app.json`: name **MineX Field**, Android `package` **`ai.coalguard.field`**, `version` `0.1.0`,
`userInterfaceStyle: light`, splash `#F5F6F4` with a transparent `assets/splash.png`. Permissions
declared: camera, microphone (`RECORD_AUDIO`), fine + coarse location, `MODIFY_AUDIO_SETTINGS`.

From the repository root, run `npm run mobile:apk`. This runs EAS from `apps/mobile` and selects the MineX Field APK profile. For a direct EAS invocation, use the app directory:

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

Open the completed EAS build link on your Android phone, download the APK and install it. Run the build from `apps/mobile`, where the MineX Field app and its preview profile are configured.

> **Windows note (build tooling only).** If the checkout path contains an apostrophe, EAS's
> `git clone --depth 1 file://…` archiving step fails (`exit 128`). Prefix the build with
> `EAS_NO_VCS=1` (PowerShell: `$env:EAS_NO_VCS = "1"`) so EAS copies the working tree instead. This
> is a local packaging workaround; it is not an application requirement and does not affect runtime.

No secrets beyond the **public** Supabase anon key appear in `eas.json` or `app.json`. The
service-role key, and any future AI provider key, are server-only and must never be added to the
mobile config.

---

## 22. Local development setup

### Prerequisites

- **Node.js `>=20 <25`** (`package.json` `engines`; `.nvmrc` pins `22`) and **npm**.
- **Git**.
- A free **[Supabase](https://supabase.com)** project.
- Optional: **Expo Go** on a phone, or an Android emulator, to run MineX Field.
- Optional: **eas-cli** (`npm i -g eas-cli`) to build the APK.

### 1. Clone & install

```bash
git clone https://github.com/jatinpal548/MineX.git
cd MineX            # (repo root — folder may be named differently locally)
npm install         # installs all workspaces into one shared node_modules
```

### 2. Create the Supabase schema

For a fresh project, run the files in [`supabase/migrations/`](supabase/migrations/) in numeric order from `0001_init.sql` through `0009_inspection_assignment.sql`, then run `supabase/seed/seed.sql`. In the SQL Editor, paste each complete file in a new query and clear any text selection before running it. Keep the RLS policies from `0002_rls.sql` enabled.

For an existing project, apply pending migrations in order. `0007` registers tables for Realtime and can fail if they are already in the publication. `0009` checks that the functions from `0002` and `0006` exist. If migration history is managed through the Supabase CLI, link the project and use `npx supabase db push`.

### 3. Environment variables

Copy the sample and fill it in per app:

```bash
cp .env.example apps/web/.env.local
cp .env.example apps/mobile/.env
```

| Variable | Where | Public? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `apps/web/.env.local` | Public (browser) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `apps/web/.env.local` | Public (browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | `apps/web/.env.local` | **Secret — server / seed scripts only.** Not used by the running app. |
| `AI_PROVIDER` | `apps/web/.env.local` | Server. Leave `mock`. |
| `AI_API_KEY`, `AI_MODEL`, `OCR_PROVIDER`, `TRANSCRIBE_PROVIDER` | `apps/web/.env.local` | Server. Optional; unused in the current build. |
| `EXPO_PUBLIC_SUPABASE_URL` | `apps/mobile/.env` | Public (device) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `apps/mobile/.env` | Public (device) |
| `EXPO_PUBLIC_WEB_API_URL` | `apps/mobile/.env` (optional) | Public (device). Base URL of MineX Command; when unset, mobile AI risk analysis runs the on-device heuristic. |

`.env` / `.env.local` are git-ignored. Never commit real values. Never put a secret behind a
`NEXT_PUBLIC_` / `EXPO_PUBLIC_` prefix.

### 4. Demo users & roles

Create the demo login users in **Supabase → Authentication → Users** (see [§23](#23-demo-accounts)),
then either run `supabase/seed/role_assignments.example.sql` **or** run `npm run demo:reset` (which
also ensures the two demo accounts, their mine-scoped roles, and the minimal demo dataset — it needs
`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`).

### 5. Run & verify

```bash
# from the repo root
npm run typecheck        # tsc --noEmit across all workspaces
npm run lint             # next lint + expo lint
npm run build            # builds MineX Command (next build)

npm run web              # Turbopack dev server for MineX Command → http://localhost:3000
npm run mobile           # Expo dev server for MineX Field (scan the QR in Expo Go)

# project health for the mobile app
cd apps/mobile && npx expo-doctor
```

To check navigation without on-demand dev compilation, stop the dev server and run `npm run web:build`, then `npm run start --workspace @coalguard/web`. Route prefetching runs in production mode.

Optional demo data layers (additive, safe to re-run, need the service-role key):

```bash
node supabase/seed/demo-seed-intelligence.mjs   # extra compliance + AI analyses
node supabase/seed/demo-seed-operations.mjs     # contractor workforce, attendance, grievances, maintenance
```

All commands above are verified against the `scripts` in the root and per-app `package.json`.

---

## 23. Demo accounts

**DEMO credentials — for evaluation only.** Created via Supabase Auth (or `npm run demo:reset`).

| Role | Email | Password |
| --- | --- | --- |
| Field Inspector | `inspector.jayant@coalguard.demo` | `Coalguard#123` |
| Mine Manager | `manager.jayant@coalguard.demo` | `Coalguard#123` |

Both are scoped to the demo mine **Jayant OC (Demo)**. No other accounts are provided; `npm run demo:reset`
actively removes stray `*@coalguard.demo` users that have no role assignment.

---

## 24. Demo data

`npm run demo:reset` (→ `supabase/seed/demo-seed.mjs`) brings a live Supabase project to a minimal,
deterministic state:

- Exactly **2** login users + mine-scoped roles (above).
- **2** submitted inspections → checklist items → **2** observations → **2** evidence photos → **2**
  corrective actions (`open`, unassigned) → **2** frozen `ai_analyses` rows.
- Everything else transactional is purged (old inspections/observations/evidence/incidents/
  notifications/audit logs/compliance records & documents/attendance/grievances/maintenance/
  contractor workers) plus orphaned storage objects. Schema, migrations, RLS, functions, the org
  hierarchy, inspection templates, and `compliance_requirements` are **not** touched.

The two demo findings:

| # | Finding | Risk | Evidence |
| --- | --- | --- | --- |
| 1 | Tension crack and loose boulders on the **East highwall** crest above bench 3 | `critical` | `east-highwall.jpg` |
| 2 | **HT panel** interlock defeated + statutory danger boards missing at the workshop **substation** | `high` | `substation-ht-panel.jpg` |

Important framing for any demo:

- The evidence photos are **simulated** — every demo `evidence` row has `is_simulated = true` and the
  UI shows **"SIMULATED FIELD EVIDENCE"**.
- The GPS coordinates and imagery in the demo are illustrative and **must not be represented as live
  mine operational data**.
- The AI risk analysis is a **deterministic heuristic** (`provider: coalguard-heuristic`,
  `output.simulated: true`) — not a live model.

---

## 25. Data-flow examples

### Inspection creation

```
User → MineX Field → local draft (records: inspection, status in_progress)
     → (online) startInspection() → INSERT public.inspections (id = client UUID, client_ref set)
     → (offline) sync_queue: upsert_inspection → replayed on reconnect (idempotent upsert)
```

### Offline inspection

```
User → expo-sqlite records + sync_queue (upsert_inspection, upsert_items, upsert_observation,
        save_ai_analysis, upload_evidence, submit_inspection … with depends_on links)
     → reconnect → sync engine drains by seq, resolving depends_on
     → Supabase (RLS) → local footprint deleted once every op is done and every record synced
```

### Evidence

```
Camera → PendingImage → prepareEvidence() compress + copy → persistent documentDirectory/evidence/<uuid>.jpg
       → sync_queue: upload_evidence
       → uploadPreparedEvidence(): read bytes → Storage upload (evidence/<mine>/<insp>/<obs>/<uuid>.jpg, upsert)
                                  → upsert public.evidence (metadata + GPS + captured_at + is_simulated)
                                  → delete local copy
       → MineX Command: createSignedUrl(path) → <img> in the evidence grid
```

### AI

```
Observation text → mobile classifyRisk()
   ├─ EXPO_PUBLIC_WEB_API_URL set → POST /api/ai/classify-risk (Bearer token)
   │      → verify token → @coalguard/ai classifyRisk() + analyzeObservation()
   │      → { risk, confidence, rationale, recommendations, consequence, recommendedAction, provider, model }
   └─ otherwise / on failure → localRiskHeuristic() on device  (source: 'on-device', simulated: true)
        → save_ai_analysis → upsert public.ai_analyses → observations.ai_analysis_id
```

### Corrective action

```
Priority finding (Command) → create corrective_actions row (status open)
  → assignCorrectiveAction(assignee, dueDate)   → status assigned   → audit_logs + notify_governance('assigned')
  → updateCorrectiveActionStatus(in_progress)   → status in_progress → audit_logs
  → addProgressNote(note)                        →                   → audit_logs
  → submitCorrectiveAction(closureNotes)         → status submitted  → audit_logs + notify_governance('submitted')
  → verifyCorrectiveAction()  → status verified + closed_at          → audit_logs + notify_governance('verified')
    or rejectCorrectiveAction(reason) → status rejected              → audit_logs + notify_governance('rejected')
```

---

## 26. Requirement coverage

| # | Requirement | MineX implementation | Status |
| --- | --- | --- | --- |
| 1 | Statutory compliance tracking | `compliance_requirements` + `compliance_records` register, `/compliance`, KPIs, CSV export | Implemented |
| 2 | Inspections / observations / violations | Templates → checklist → observation → corrective action, including drag-and-drop assignment in Command, RLS-scoped | Implemented |
| 3 | AI analytics | Deterministic keyword heuristic (risk band + consequence + action) + deterministic dashboard analytics; provider interface for a future model | Partial (heuristic, not a trained model / LLM) |
| 4 | Geo-tagged / time-stamped field reporting | `expo-location` + `captured_at` / `occurred_at` on observations & evidence; `uploaded_by` attribution | Implemented |
| 5 | Dashboards | `/dashboard` with KPIs, charts, priority findings, risk intelligence, risk map, activity — live RLS-scoped data | Implemented |
| 6 | Alerts / reminders / escalation | Mobile Alerts, Command Realtime refresh, dashboard escalation summary, in-app `notify_governance` on governance events | Partial (no push, no scheduled reminders, no auto-overdue) |
| 7 | Paperless governance | Corrective-action assign→submit→verify/reject, append-only `audit_logs`, grievance workflow | Implemented |
| 8 | Multi-mine / multi-subsidiary scalability | `subsidiaries → regions → mines → departments`, scope-aware queries, RLS via `user_mine_ids()` | Implemented |
| 9 | GIS | Leaflet + OpenStreetMap risk map, geo-tagged observation markers, `mines.lat/lng` | Implemented (basic; no imagery/heatmap; `mines.boundary` unused) |
| 10 | OCR / document digitization | `compliance_documents.ocr_text` column, `OcrProvider` interface + mock, `/documents` explainer | Architecture / Planned (no extraction, no upload flow) |
| 11 | Secure audit trails | Append-only `audit_logs` (no update/delete policy), `before`/`after` JSON, written on governance events | Implemented (app-written, not trigger-written) |
| 12 | Multilingual support | English + Hindi in MineX Field, AsyncStorage-persisted | Partial (Hindi dictionary incomplete; web is English-only) |

---

## 27. Current limitations

- **AI is a deterministic heuristic**, not a trained model or LLM. No provider key is configured; the
  provider interface exists as an extension point only. All AI output is labelled *Simulated AI*.
- **OCR / document digitization is architecture-only.** There is a schema column, a provider
  interface + mock, and an explanatory page — but **no extraction and no upload flow**, and the mock
  is never called by application code.
- **Transcription is unavailable by design.** Voice notes are recorded and uploaded; the transcribe
  route returns `{ available: false }` unless a provider is configured (none is).
- **Incident lifecycle is partial.** MineX Field can create and view incidents offline; there is no
  investigation / root-cause / closure workflow and no web incident screens.
- **Role coverage is not uniform.** All 15 roles are modelled and permissioned, but only the Field
  Inspector and Mine Manager personas have an end-to-end exercised flow. Other roles get the Command
  Center filtered by permissions + scope, not bespoke per-role UIs.
- **Notifications / escalation is in-app only.** No push notifications, no email, no scheduled
  reminders, and corrective actions are not auto-transitioned to `overdue`.
- **Offline behaviour is code-complete but not fully device-verified.** It has been exercised to work
  offline **after an online start**; a cold, fully-offline first launch has not been verified
  on-device. There is no automated test for the sync engine.
- **Storage objects are not mine-scoped at the policy level.** Any authenticated user can read/write
  the `evidence` / `documents` buckets; keys are namespaced by `mine_id` but the bytes are not
  path-scoped by a storage policy. Evidence *metadata* rows are RLS-scoped.
- **Per-role fine-grained RLS is not complete.** Beyond mine scope + `SYSTEM_ADMIN`, "edit only your
  own draft"-style policies are not in place; some tables are effectively admin-write.
- **Web app is English-only.** i18n exists only in MineX Field.
- **Demo data is synthetic.** GPS, imagery and AI results in the demo must not be treated as real
  operational data.
- **No automated tests** (unit / integration / e2e) are included.
- **`/settings`** is a placeholder.

---

## 28. Roadmap

Future work — not implemented today:

- **Production AI provider** behind the existing `LlmProvider` interface (server-only key), replacing
  the heuristic while keeping the deterministic path as an offline fallback.
- **Predictive analytics / anomaly detection** over the accumulated `observations` / `ai_analyses` /
  `environmental_readings` history.
- **Full OCR extraction** wired to `compliance_documents.ocr_text` with a real upload + review flow
  (on-device or server provider behind `OcrProvider`).
- **Voice-note transcription** behind `TranscriptionProvider` (e.g. Whisper), preserving spoken
  language, never fabricating.
- **Storage object scoping** — path-prefix RLS on `storage.objects` so evidence bytes are mine-scoped.
- **Finer RLS** — per-role, per-state row policies (own-draft edits, assignment-based access).
- **Additional role-specific workflows** — dedicated surfaces for Safety / Environmental / HR /
  Compliance / Auditor / Regulator.
- **Regional & corporate roll-up dashboards** — cross-mine aggregation for `REGIONAL_GM` /
  `SUBSIDIARY_HQ` / `CORPORATE_HQ`.
- **Richer offline** — offline-first for more of the Command workflows; conflict resolution beyond
  last-write-wins upserts.
- **Escalation automation** — scheduled reminders, auto-`overdue` transitions, push notifications,
  `audit_logs` database triggers.
- **Full incident investigation** lifecycle.
- **Hindi (and further language) completion** across mobile, and i18n for the web app.
- **Production monitoring** and rate limiting on server routes.

---

## 29. Project structure

```
MineX/
├── apps/
│   ├── web/                     @coalguard/web — MineX Command (Next.js 15 App Router)
│   │   └── src/
│   │       ├── app/
│   │       │   ├── (command)/   dashboard, inspections, observations, corrective-actions,
│   │       │   │                risk-map, compliance, documents, contractors, attendance,
│   │       │   │                grievances, mine-operations, reports, notifications,
│   │       │   │                profile, settings  (+ loading.tsx / error.tsx)
│   │       │   ├── api/ai/      classify-risk · transcribe  (route handlers)
│   │       │   ├── auth/signout · login · page.tsx (landing)
│   │       ├── components/      ui/ (shadcn-style primitives), command/, charts/, brand/, auth/
│   │       └── lib/             data/ (RLS-scoped data access), supabase/, auth.ts, env.ts, status.ts
│   └── mobile/                  @coalguard/mobile — MineX Field (Expo SDK 52, Expo Router)
│       ├── app/                 (auth)/ (app)/ inspection/ observation/ incident/ corrective-actions/
│       ├── src/
│       │   ├── features/        inspection/ (localStore, syncEngine, SyncProvider, evidence, repository)
│       │   │                    incident/, corrective-actions/
│       │   ├── lib/             db/ (expo-sqlite), ai/, i18n/, location/, media/, connectivity, supabase, theme
│       │   ├── components/      ui/, inspection/, brand/
│       │   └── hooks/, data/
│       ├── app.json  eas.json  metro.config.js
├── packages/
│   ├── types/                   @coalguard/types — enums (mirror the DB) + domain models
│   ├── config/                  @coalguard/config — roles, RBAC permission map, org-scope logic, constants
│   ├── ui/                      @coalguard/ui — design tokens (palette, spacing, radius, type)
│   └── ai/                      @coalguard/ai — risk heuristic + LLM/OCR/transcription interfaces (server-side)
├── supabase/
│   ├── migrations/              0001_init · 0002_rls · 0003_storage · 0004_grants
│   │                            0005_inspection_templates · 0006_governance
│   │                            0007_realtime, 0009_inspection_assignment
│   ├── seed/                    seed.sql · role_assignments.example.sql
│   │                            demo-seed.mjs (npm run demo:reset) · demo-seed-intelligence.mjs
│   │                            demo-seed-operations.mjs · demo_reset.sql · assets/*.jpg
│   └── config.toml
├── docs/                        ARCHITECTURE.md · DATABASE.md · RBAC.md · SETUP.md · PHASE-0.md
├── package.json                 npm workspaces + root scripts
├── tsconfig.base.json
└── README.md
```

> `docs/*.md` were written early in the project and describe the Phase-0 baseline; where they and
> this README differ, **this README and the source are current**.

---

## 30. Development & quality

| Check | Command | Notes |
| --- | --- | --- |
| Type-check | `npm run typecheck` | `tsc --noEmit` in every workspace; `strict` + `noUncheckedIndexedAccess`. The `Record<UserRole, …>` maps fail the build if a role is missed. |
| Lint | `npm run lint` | `next lint` (web) + `expo lint` (mobile). |
| Format | `npm run format` / `npm run format:check` | Prettier. |
| Web production build | `npm run build` | `next build` for MineX Command. |
| Mobile project health | `cd apps/mobile && npx expo-doctor` | Expo dependency / config checks. |
| Mobile bundle | `npx expo export` / EAS Build | Verifies the RN bundle / produces the APK. |
| Automated tests | — | **None.** There is no unit / integration / e2e test suite in the repo. |

---

## 31. Design principles

| Principle | Status | How it shows up |
| --- | --- | --- |
| **Field-first** | Implemented | One primary action per screen, guided checklist, large touch targets, high-contrast field theme |
| **Offline-first** | Implemented (mobile capture) | `expo-sqlite` records + `sync_queue` + reconnect drain; UI updates from the local record |
| **Evidence-first** | Implemented | Structured `evidence` with GPS + timestamp + uploader; simulated evidence explicitly flagged |
| **Security-by-default** | Implemented | RLS on every table, deny-by-default, private buckets, signed URLs, no service-role key in app code |
| **Mine-scoped governance** | Implemented | `user_mine_ids()` / `has_mine_scope()`; scope-checked governance RPCs |
| **Explainable risk** | Implemented | Keyword rationale + likely consequence + single recommended action; never a black box |
| **Human-in-the-loop** | Implemented | AI proposes; a person sets the risk band, assigns, and verifies |
| **Auditability** | Implemented | Append-only `audit_logs` with `before`/`after` on governance events |
| **Progressive escalation** | Partial | Risk bands + dashboard escalation summary + governance notifications; no automation/push yet |
| **Honest labelling** | Implemented | "SIMULATED FIELD EVIDENCE", "Simulated AI", `source` on every AI result |

---

## 32. Contributing

- **Branch** off `main`; keep changes focused.
- **Validate before opening a PR:** `npm run typecheck && npm run lint && npm run build`, and
  `npx expo-doctor` for mobile changes.
- **Schema changes** are new numbered files in `supabase/migrations/` — never edit an applied
  migration. Keep the `public.*` PostgreSQL enums and `packages/types/src/enums.ts` in lock-step.
- **Never commit secrets.** Only `.env.example` is tracked. Nothing secret goes behind a
  `NEXT_PUBLIC_` / `EXPO_PUBLIC_` prefix.
- **Never put the Supabase service-role key (or any provider key) in client code** or in
  `app.json` / `eas.json`.
- **Preserve internal identifiers.** The user-facing brand is *MineX*; the `@coalguard/*` package
  names, the `ai.coalguard.field` application id, database object names, the `@coalguard.demo` demo
  domain and the `coalguard-heuristic` provider id stay as they are.
- Match the surrounding code's style; Prettier + ESLint configs are in the repo.

---

## 33. License

**License: Not currently specified.** No license file is present in the repository.
