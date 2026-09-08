# CoalGuard AI — Database

PostgreSQL, hosted by Supabase. Migrations live in `supabase/migrations` and run
in filename order.

| File | Purpose |
| --- | --- |
| `0001_init.sql` | Enums, all 28 tables, indexes, constraints, `updated_at` triggers, `handle_new_user()` |
| `0002_rls.sql` | RLS helper functions + policies |
| `0003_storage.sql` | Storage buckets (`evidence`, `documents`, `avatars`) + object policies |
| `0004_grants.sql` | Explicit table/function privileges for `anon` / `authenticated` / `service_role` |

## Conventions

- **Primary keys**: `uuid` via `gen_random_uuid()`.
- **Timestamps**: every table has `created_at timestamptz not null default now()`.
  Mutable tables also have `updated_at`, kept current by the `set_updated_at()`
  trigger.
- **Enums**: Postgres `enum` types that mirror `packages/types/src/enums.ts`
  exactly. Change both together.
- **Foreign keys** are all indexed. Extra indexes on `status`, `risk`, `due_date`,
  `recorded_at` and other columns we filter/sort by.
- **Offline columns**: rows the mobile app can create offline have
  `client_ref uuid unique` (idempotency key) and `sync_status` (`synced` /
  `pending` / `conflict`).
- **Soft references to AI**: `ai_analysis_id` FKs point at `ai_analyses` and are
  added at the end of `0001` (after that table exists).

## Table groups

### Organisation hierarchy
`subsidiaries` → `regions` → `mines` → `departments`
Each level cascades on delete from its parent.

### Identity & RBAC
- `profiles` — one row per Supabase Auth user (`id` = `auth.users.id`), created
  automatically by the `on_auth_user_created` trigger.
- `role_assignments` — role + org-scope pointer per user (see RBAC.md). The
  `role_scope_consistent` CHECK enforces which scope columns must be set.

### Field operations
`inspection_templates` + `inspection_checklist_items` (the blueprint) →
`inspections` → `inspection_items` (the filled-in answers) → `observations` →
`corrective_actions`. `incidents` stands alongside and can also spawn
`corrective_actions`. `evidence` attaches to any of inspection / observation /
incident / corrective_action (CHECK: at least one parent).

### Compliance
`compliance_requirements` (the catalogue) → `compliance_records` (per mine, per
period) → `compliance_documents` (uploaded proof, with room for `ocr_text`).

### Operations
`environmental_readings`, `equipment` → `maintenance_records`, `attendance`.

### People
`workers`, `contractors` → `contractor_workers`, `grievances` (which can be
raised by a profile, a worker, a contractor worker, or anonymously).

### Platform
`notifications` (per recipient), `audit_logs` (append-only trail),
`ai_analyses` (every AI call — input, output, risk, tokens, provider).

## Regenerating the typed client (later)

Once the schema is live you can generate a fully-typed `Database` definition:

```bash
npx supabase gen types typescript --linked > packages/types/src/database.generated.ts
```

Phase 0 uses the hand-written models in `packages/types/src/models.ts` instead.

## Entity map

```
subsidiaries─<regions─<mines─<departments
                        │
   ┌────────────────────┼───────────────────────────────┐
   │                    │                               │
inspections        observations──<corrective_actions   incidents
   │  │                 │              │        ▲         │
   │  └<inspection_items│              │        └─────────┘
   │                    │              │
   └──────────<─────────┴───<─────evidence>───────────────┘

mines─<compliance_records>─compliance_requirements
mines─<compliance_documents
mines─<environmental_readings
mines─<equipment─<maintenance_records
mines─<workers          mines─<contractors─<contractor_workers
mines─<attendance       mines─<grievances

profiles─<role_assignments      profiles─<notifications
audit_logs   ai_analyses
```
