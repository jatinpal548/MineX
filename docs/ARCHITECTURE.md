# CoalGuard AI — Architecture

## 1. One system, two front-ends

CoalGuard is **not** two apps with two databases. It is one backend and one
database with two clients:

- **CoalGuard Field** (`apps/mobile`) — what inspectors, officers, contractors and
  workers use on a phone, in the field, often offline.
- **CoalGuard Command** (`apps/web`) — what managers, auditors and HQ use at a desk
  to review, assign, escalate, verify and close work.

```
                         AI services  (packages/ai — SERVER ONLY)
                                |
                     Backend / API layer
        Next.js Route Handlers + Server Actions  ·  Supabase client
                                |
              +-----------------+------------------+
              |                                    |
      CoalGuard Field                       CoalGuard Command
      Expo / React Native                   Next.js / React
              |                                    |
              +-----------------+------------------+
                                |
                 Supabase project (single source of truth)
        PostgreSQL   ·   Auth (JWT)   ·   Storage (evidence/docs/avatars)
```

## 2. Why Supabase

Supabase gives us Postgres + Auth + Storage + row-level security in one place, on
a free tier, with a great local dev story. It means Phase 0 needs **no custom
server to deploy** — the web app's route handlers are the only backend code, and
they run on the same host as the web app.

## 3. The monorepo

We use **npm workspaces** (built into npm — nothing extra to install).

```
coalguard/
├─ apps/
│  ├─ web/       @coalguard/web     Next.js dashboard
│  └─ mobile/    @coalguard/mobile  Expo field app
├─ packages/
│  ├─ types/     @coalguard/types   enums + row/domain types (no dependencies)
│  ├─ config/    @coalguard/config  roles, RBAC, org-scope logic (depends on types)
│  ├─ ui/        @coalguard/ui      design tokens (colours, spacing, type)
│  └─ ai/        @coalguard/ai      LLM/OCR provider abstraction (server only)
├─ supabase/
│  ├─ migrations/  0001 schema · 0002 RLS · 0003 storage
│  └─ seed/        synthetic demo data
└─ docs/
```

Packages are consumed **straight from their TypeScript source** (no build step).
The web app lists them in `transpilePackages`; Metro watches the repo root for the
mobile app. This keeps things simple for now; we can add build outputs later if
the packages grow.

### Dependency rule

`types` ← `config` ← (`ai`, `apps`) and `ui` ← `apps`.
Never import an app from a package. Never import `@coalguard/ai` from client code.

## 4. Request flow (the core workflow, end to end)

```
Field Inspector (mobile)
  → start inspection            row in `inspections` (client_ref set, sync_status=pending offline)
  → work the checklist          rows in `inspection_items`
  → capture evidence            file → Storage `evidence` bucket, row in `evidence`
  → GPS + timestamp             gps_* + captured_at columns
  → raise observation           row in `observations`
  → request AI risk analysis    POST /api/ai/... → packages/ai → row in `ai_analyses`
  → propose corrective action   row in `corrective_actions` (status=open)
        │
        ▼  (syncs to Supabase when back online)
Mine Manager (web)
  → review, assign owner        corrective_actions.assigned_to / status=assigned
  → escalate if needed          notifications + status changes
        ▼
Inspector / Contractor
  → do the work, upload proof   evidence rows linked to corrective_action_id
  → submit closure              status=submitted
        ▼
Mine Manager
  → verify & close              status=verified → closed; audit_logs row written
```

Every state change is meant to write an `audit_logs` row and (where a person
needs to act) a `notifications` row. Phase 1 adds the triggers/handlers that do
this automatically.

## 5. Offline-first (mobile)

| State | Path |
| --- | --- |
| Online | UI → Supabase client → Postgres |
| Offline | UI → **sync outbox** (`src/lib/offline/outbox.ts`) → local storage |
| Reconnect | outbox → sync engine → Supabase → mark `synced` |

Phase 0 ships the **interface** (`OutboxStore`) and an in-memory stub. Every
offline-capable row already has a `client_ref` (UUID, unique) column so a queued
insert can be replayed exactly once, and a `sync_status` column. Phase 1 swaps
the stub for `expo-sqlite` + a real sync engine with conflict handling.

## 6. Security model (summary — full detail in RBAC.md)

1. **Auth**: Supabase Auth issues a JWT. `profiles` has one row per user
   (auto-created by a trigger).
2. **Roles**: `role_assignments` attaches one or more roles to a user, each
   pinned to a node of the org tree (corporate / subsidiary / region / mine /
   department).
3. **Capability**: `@coalguard/config` maps role → permissions. Used to
   show/hide UI.
4. **Scope + enforcement**: **Row Level Security** in Postgres is the real
   boundary. `public.user_mine_ids()` computes which mines a user may touch;
   policies on every table check it. The service-role key (which bypasses RLS)
   never leaves the server.
