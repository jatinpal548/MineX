# CoalGuard AI

AI-enabled smart governance & compliance monitoring for the Indian coal mining ecosystem.

> **Status: Phase 0 (foundation).** Project structure, both app shells, the shared
> packages, the database schema, auth and the RBAC model are in place. Dashboards,
> maps, the inspection workflow, AI and OCR come in later phases.

## What's in the box

| Path | What it is |
| --- | --- |
| `apps/web` | **CoalGuard Command** — Next.js 15 web dashboard (App Router, Tailwind, shadcn-style UI) |
| `apps/mobile` | **CoalGuard Field** — Expo (React Native) app, Expo Router |
| `packages/types` | Shared TypeScript enums + domain models |
| `packages/config` | Roles, RBAC permissions, org-scope logic, constants |
| `packages/ui` | Design tokens shared by web + mobile |
| `packages/ai` | Provider-agnostic LLM / OCR abstraction (server-side) |
| `supabase/migrations` | SQL schema + Row Level Security + storage buckets + grants |
| `supabase/seed` | Synthetic demo data |
| `docs/` | Architecture, database, RBAC and setup guides |

## Quick start

```bash
# 1. install everything (from the repo root)
npm install

# 2. create your env files (see docs/SETUP.md for where the values come from)
cp .env.example apps/web/.env.local
cp .env.example apps/mobile/.env

# 3. verify the workspace
npm run typecheck
npm run lint
npm run build          # builds the web app

# 4. run
npm run web            # http://localhost:3000
npm run mobile         # Expo dev server (scan the QR with Expo Go)
```

Full step-by-step (including the Supabase project setup) is in **[docs/SETUP.md](docs/SETUP.md)**.

## Architecture in one picture

```
                 AI (server-side only)
                        |
                  Backend / API
             (Next.js route handlers + Supabase)
                        |
        +---------------+---------------+
        |                               |
  CoalGuard Field                 CoalGuard Command
  (Expo mobile)                   (Next.js web)
        |                               |
        +---------------+---------------+
                        |
                Supabase (Postgres + Auth + Storage)
```

Both apps talk to **one** backend and **one** database. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
