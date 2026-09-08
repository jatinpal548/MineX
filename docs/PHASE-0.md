# Phase 0 — Foundation (this phase)

## Goal

Stand up the skeleton that every later phase builds on, with nothing faked in a
way that blocks the real architecture.

## Delivered

- [x] **Monorepo** — npm workspaces: `apps/web`, `apps/mobile`, `packages/{types,config,ui,ai}`.
- [x] **Web shell** — Next.js 15 (App Router), Tailwind + design tokens, shadcn-style
      `Button`/`Card`/`Badge`, `/`, `/login`, protected `/dashboard`, auth middleware.
- [x] **Mobile shell** — Expo SDK 52 + Expo Router, dark field theme from shared
      tokens, `/sign-in` + home, session provider, monorepo-aware Metro config.
- [x] **Shared types** — `@coalguard/types`: enums (mirror DB) + domain models.
- [x] **Supabase config** — `supabase/config.toml`, three migrations, seed.
- [x] **Database schema** — 28 tables across org / identity / field ops /
      compliance / operations / people / platform. UUID PKs, timestamps, FKs,
      indexes, CHECK constraints, `updated_at` triggers. Validated against
      PostgreSQL 15 (migrations + seed apply cleanly; seed is idempotent).
- [x] **Auth foundation** — Supabase Auth; `profiles` auto-created by trigger;
      web session refresh in middleware; mobile session persisted to AsyncStorage.
- [x] **Role definitions** — 15 roles in `USER_ROLES` + `ROLE_DEFINITIONS`.
- [x] **RBAC foundation** — `Permission` vocabulary, `ROLE_PERMISSIONS` map,
      `hasPermission()`, org-scope logic, **and RLS policies** in `0002_rls.sql`
      with SQL helpers (`user_mine_ids()`, `has_mine_scope()`). Verified: two
      mine managers at different mines cannot see or write each other's rows;
      cross-scope writes are rejected by `WITH CHECK`.
- [x] **Env setup** — `.env.example` (root + per app), strict public/secret split.
- [x] **AI abstraction** — `@coalguard/ai`: `LlmProvider` / `OcrProvider`
      interfaces, `MockLlmProvider`, `getLlmProvider()` factory, `classifyRisk()`.
- [x] **OCR** — kept modular behind `OcrProvider` + `getOcrProvider()`; mock only.
- [x] **Offline foundation** — `OutboxStore` interface + in-memory stub;
      `client_ref` / `sync_status` columns on all offline-capable tables.
- [x] **Demo data structure** — realistic synthetic org (2 subsidiaries → 2
      regions → 4 mines → 24 departments), 1 inspection template + 8 checklist
      items, 6 compliance requirements, equipment / workers / contractors /
      environmental readings; `role_assignments.example.sql` for post-auth wiring.
- [x] **Docs** — architecture, database, RBAC, setup, this file.
- [x] **Tooling** — TypeScript strict everywhere, ESLint (Next + Expo configs),
      Prettier, `typecheck` / `lint` / `build` scripts at the root.

## Explicitly NOT in Phase 0

Full inspection workflow · dashboards & charts · maps / GIS / heatmaps · AI
Copilot · real OCR · real LLM provider · SQLite offline engine + conflict
resolution · push notifications · escalation automation · audit-log triggers ·
per-role fine-grained RLS beyond the core tables.

## Phase 1 (next)

1. **Inspection workflow, end to end** — templates → run inspection → checklist →
   evidence capture (Expo Camera) → GPS/timestamp (Expo Location) → observation →
   corrective action → manager assign → closure evidence → verify → close.
2. **Mine dashboard (web)** — activity feed, open observations by risk, overdue
   corrective actions, compliance status tiles (Recharts).
3. **Audit-log + notification triggers** — every state change recorded and routed.
4. **Real offline engine** — `expo-sqlite` outbox + sync + conflict handling.
5. **Typed DB client** — generate `database.generated.ts`, wire into both apps.
6. **Finer RLS** — per-role rules (own-draft edits, assignment-based access).
