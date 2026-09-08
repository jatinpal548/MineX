# CoalGuard AI — Setup (start here)

This is written for someone doing their first full-stack setup. Follow it in
order. Every command runs from the **repo root** (`CoalGuard/`) unless it says
otherwise.

Prerequisites already on your machine: Node 20+ and npm (you have Node 24, npm
11 — good). A free [Supabase](https://supabase.com) account. Optionally the
**Expo Go** app on your phone to preview the mobile app.

---

## Step 1 — Install dependencies

```bash
npm install
```

This installs everything for all workspaces (web, mobile, and the 4 packages)
into one shared `node_modules`. It will take a few minutes the first time.

---

## Step 2 — Create the Supabase project

1. Go to <https://supabase.com/dashboard> → **New project**.
2. Name it `coalguard-dev`. Choose a region near you. Set a database password
   (save it in your password manager).
3. Wait ~2 minutes for it to provision.

---

## Step 3 — Run the database migrations

**Option A — Dashboard SQL editor (simplest, no CLI):**

1. In your project: **SQL Editor** → **New query**.
2. Open `supabase/migrations/0001_init.sql` in your code editor, copy **all** of
   it, paste, click **Run**. You should see "Success".
3. Repeat, in order, for:
   - `supabase/migrations/0002_rls.sql`
   - `supabase/migrations/0003_storage.sql`
   - `supabase/migrations/0004_grants.sql`
4. Repeat for `supabase/seed/seed.sql` (this adds the demo mines, departments,
   templates, etc. — it is safe to run more than once).

**Option B — Supabase CLI (if you prefer the terminal):**

```bash
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase db push          # applies everything in supabase/migrations
# then run the seed:
npx supabase db execute --file supabase/seed/seed.sql
```

> `YOUR-PROJECT-REF` is the string in your project URL:
> `https://<PROJECT-REF>.supabase.co`.

---

## Step 4 — Get your API keys

In the project: **Project Settings → API**. You need three values:

| Value | Where it's used | Secret? |
| --- | --- | --- |
| **Project URL** (`https://xxxx.supabase.co`) | web + mobile | no |
| **anon / public** key | web + mobile | no (safe in the browser) |
| **service_role** key | web server only | **YES — never share / never commit** |

---

## Step 5 — Create your env files

```bash
cp .env.example apps/web/.env.local
cp .env.example apps/mobile/.env
```

Now edit each file and paste your values:

**`apps/web/.env.local`**
```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...           # anon key
SUPABASE_SERVICE_ROLE_KEY=eyJ...               # service_role key
AI_PROVIDER=mock
```

**`apps/mobile/.env`**
```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...           # anon key
```

> These files are git-ignored. Only the `*_PUBLIC_*` / `EXPO_PUBLIC_*` values
> ever reach a browser or phone. The `service_role` key stays on the server.

---

## Step 6 — Create demo login users

The database has no users yet. In the dashboard: **Authentication → Users →
Add user** (tick "Auto Confirm User"). Create at least:

| Email | Password (demo) |
| --- | --- |
| `admin@coalguard.demo` | `Coalguard#123` |
| `manager.jayant@coalguard.demo` | `Coalguard#123` |
| `inspector.jayant@coalguard.demo` | `Coalguard#123` |
| `env.gevra@coalguard.demo` | `Coalguard#123` |

Each one automatically gets a matching row in `profiles` (a database trigger does
this).

---

## Step 7 — Give the demo users roles

Open `supabase/seed/role_assignments.example.sql`, check the emails match what you
created, then run it in the **SQL Editor** (same as Step 3).

---

## Step 8 — Run and verify

```bash
npm run typecheck     # no type errors
npm run lint          # no lint errors
npm run build         # web app builds

npm run web           # open http://localhost:3000
```

- Visit `http://localhost:3000` → click **Sign in**.
- Log in as `manager.jayant@coalguard.demo`.
- You should land on `/dashboard` and see **MINE_MANAGER · mine** under "Your
  roles & scope", plus a list of effective permissions.
- Logging in as `admin@coalguard.demo` should show **SYSTEM_ADMIN · corporate**.

Mobile:

```bash
npm run mobile        # press "i"/"a" for a simulator, or scan the QR in Expo Go
```

- The app opens on the sign-in screen. Log in with a demo user → you land on the
  Field home screen showing your email.

If sign-in fails with "Supabase env not configured", re-check Step 5.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `npm run build` fails with "Missing NEXT_PUBLIC_SUPABASE_URL" | You skipped Step 5 for `apps/web/.env.local`. |
| Login says `Invalid login credentials` | User not created (Step 6) or wrong password. |
| Dashboard shows "No roles assigned yet" | Run Step 7. |
| Mobile: `Unable to resolve module @coalguard/...` | Stop Expo, run `npm install` again, then `npm run mobile -- --clear`. |
| Postgres error running `0002_rls.sql` | Make sure `0001_init.sql` ran first, with no errors. |
