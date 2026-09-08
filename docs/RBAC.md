# CoalGuard AI — Roles & Access Control

## The 15 roles

| Role | Typical tier | In short |
| --- | --- | --- |
| `FIELD_INSPECTOR` | mine | Runs inspections, captures evidence, raises observations |
| `SAFETY_OFFICER` | department | Owns safety observations, incidents, corrective actions |
| `ENVIRONMENTAL_OFFICER` | department | Environmental readings, breaches, MoEFCC compliance |
| `MAINTENANCE_OFFICER` | department | Equipment health & maintenance records |
| `HR_OFFICER` | department | Workers, contractor workforce, attendance, grievances |
| `CONTRACTOR` | mine | External party: workforce, inductions, action-closure evidence |
| `WORKER` | mine | Frontline: view assignments, raise grievances |
| `COMPLIANCE_OFFICER` | mine | Compliance register & statutory submissions |
| `MINE_MANAGER` | mine | Review, assign, escalate, verify, close |
| `INTERNAL_AUDITOR` | subsidiary | Read-mostly across scope; audit trails |
| `REGIONAL_GM` | region | Oversight of all mines in a region; escalations |
| `SUBSIDIARY_HQ` | subsidiary | Oversight across a subsidiary |
| `CORPORATE_HQ` | corporate | Group-wide oversight |
| `REGULATOR` | corporate | External statutory body; read submitted records |
| `SYSTEM_ADMIN` | corporate | Users, roles, org hierarchy, configuration |

Defined in `packages/types/src/enums.ts` (`USER_ROLES`) and described in
`packages/config/src/roles.ts` (`ROLE_DEFINITIONS`).

## Two independent questions

Access = **capability** AND **scope**.

### 1. Capability — "can this role do this action?"

`packages/config/src/rbac.ts` maps every role to a list of `Permission` strings
(e.g. `inspection:submit`, `corrective_action:verify`). Helpers:

```ts
import { hasPermission, permissionsForRoles } from '@coalguard/config';

hasPermission(['FIELD_INSPECTOR'], 'inspection:submit'); // true
hasPermission(['WORKER'], 'inspection:submit');          // false
```

This layer decides **what UI to render**. It is not security on its own.

### 2. Scope — "is the target row in my part of the org?"

The org tree: **Corporate → Subsidiary → Region → Mine → Department → User**.

Each `role_assignments` row pins a role to one node:

| `scope_level` | Columns that must be set |
| --- | --- |
| `corporate` | (none) |
| `subsidiary` | `subsidiary_id` |
| `region` | `region_id` |
| `mine` | `mine_id` |
| `department` | `mine_id` + `department_id` |

(A DB `CHECK` constraint enforces this.)

A user may see a row if the row's mine sits **at or below** one of their scope
nodes. Client-side hint: `isWithinScope()` in `packages/config/src/org.ts`.

## Enforcement: Row Level Security (the real boundary)

`supabase/migrations/0002_rls.sql`:

- RLS is **enabled on every table**.
- `SYSTEM_ADMIN` gets a blanket allow policy on every table.
- SQL helpers mirror the TS logic:
  - `public.current_profile_id()` → `auth.uid()`
  - `public.is_system_admin()`
  - `public.user_mine_ids()` → set of mine ids the caller may touch
  - `public.has_mine_scope(mine_id)` → boolean used by policies
- Mine-scoped operational tables get `SELECT` / `INSERT` / `UPDATE` policies that
  call `has_mine_scope(mine_id)`.
- Org-hierarchy tables are readable by any signed-in user, writable by admin.
- `profiles`: read your own + anyone in your mine scope; update only your own.
- `notifications`: only the recipient.

> Tables without an explicit scoped policy are **admin-only** until Phase 1 adds
> finer policies (e.g. "an inspector may edit only their own draft inspection").
> This is deliberate: deny-by-default is safe.

The **service-role key** bypasses RLS entirely. It lives only in server-side env
(`SUPABASE_SERVICE_ROLE_KEY`) and is never sent to a browser or a phone.

## Adding a role or permission

1. Add the value to `USER_ROLES` / `PERMISSIONS`.
2. If it's a role, add it to the `public.user_role` enum via a new migration and
   add a `ROLE_DEFINITIONS` entry + `ROLE_PERMISSIONS` entry.
3. If it changes who can see data, add/adjust an RLS policy migration.
4. `npm run typecheck` — the `Record<UserRole, …>` maps will fail the build until
   every role is covered.
