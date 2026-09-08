/**
 * CoalGuard AI - ADDITIVE operations / people seed  (Node >= 20, no deps)
 * ----------------------------------------------------------------------------
 * Layers contractor-workforce, attendance, grievances, maintenance and two
 * extra compliance categories (labour + production) on top of the existing
 * clean demo DB. NOTHING IS DELETED except this script's own fixed-UUID rows
 * (so re-running is idempotent). All rows are clearly demo data.
 *
 *   node supabase/seed/demo-seed-operations.mjs
 */
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    const f = path.resolve(HERE, '../../apps/web/.env.local');
    if (fs.existsSync(f)) {
      for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!m) continue;
        if (m[1] === 'NEXT_PUBLIC_SUPABASE_URL') url ||= m[2].trim();
        if (m[1] === 'SUPABASE_SERVICE_ROLE_KEY') key ||= m[2].trim();
      }
    }
  }
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  return { url, key };
}
const { url: BASE, key: SRK } = loadEnv();

/* ---- constants (Jayant OC demo) ------------------------------------- */
const MINE = '9dab1551-680d-42c8-be18-5f519054acea';
const MANAGER = '5442a6c1-9f28-4ff6-90c9-631b930a1bfc'; // Priya Sharma
const INSPECTOR = '611a307b-3f3b-4d52-936c-7ba8e9792049'; // Ravi Kumar
const DEPT_SAFETY = '4aee81fa-00c0-4c05-9abd-446ffe8a1fdc';
const DEPT_MAINT = '5f656d3f-0d20-46e1-bd26-9ba579cbc000';
const DEPT_HR = 'f1cb7390-6439-42ee-8076-a12736dc2153';
const DEPT_OPS = 'cea0a245-08cf-4f9c-90bd-cd2570e49149';
const CONTRACTOR_JYT = '3bd11572-f5d5-490f-a9a2-f6e194bb10f7';
const EQ_SHOVEL = '09e02957-61c3-4097-aea9-a5b9b1d36543';
const EQ_DUMPER = '6148dcc4-48a1-4c6c-9ddf-dfc2a2598710';
const W1 = '57a2e098-1ed0-46ba-aee4-732aa8e348ae';
const W2 = '5f7cce62-a7f4-4fb4-b465-942182409d4b';
const W3 = '501bfd28-a42c-4b79-b277-b4f85e4a31e9';
const OBS3 = 'a2054bf0-cb6f-4ac8-afa3-7483ab3064c6'; // "helmets & gloves" (no GPS yet)
const LAT = 24.119;
const LNG = 82.656;

const dateIn = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();

/* ---- REST client --------------------------------------------------- */
function rq(p, { m = 'GET', body = null, extra = {} } = {}) {
  return new Promise((res, rej) => {
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    const headers = { apikey: SRK, Authorization: 'Bearer ' + SRK, ...extra };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = payload.length;
    }
    const r = https.request(new URL(BASE + p), { method: m, headers }, (x) => {
      let d = '';
      x.on('data', (c) => (d += c));
      x.on('end', () => res({ s: x.statusCode, b: d, cr: x.headers['content-range'] }));
    });
    r.on('error', rej);
    r.end(payload ?? undefined);
  });
}
const upsert = (t, rows, onConflict) =>
  rq(`/rest/v1/${t}?on_conflict=${onConflict}`, {
    m: 'POST',
    body: rows,
    extra: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  });
const count = async (t, filter = '') =>
  (await rq(`/rest/v1/${t}?select=id${filter}`, { extra: { Prefer: 'count=exact', Range: '0-0' } })).cr;

/* ---- 1. contractor workforce -------------------------------------- */
const CW = [
  {
    id: 'a6000000-0000-4000-8000-000000000001',
    contractor_id: CONTRACTOR_JYT,
    mine_id: MINE,
    full_name: 'Demo Contract Worker A',
    id_proof_type: 'Aadhaar',
    id_proof_number: 'XXXX-XXXX-1042',
    designation: 'Dozer Operator',
    induction_done: true,
    induction_date: dateIn(-40),
    medical_valid_until: dateIn(120),
    is_active: true,
  },
  {
    id: 'a6000000-0000-4000-8000-000000000002',
    contractor_id: CONTRACTOR_JYT,
    mine_id: MINE,
    full_name: 'Demo Contract Worker B',
    id_proof_type: 'Aadhaar',
    id_proof_number: 'XXXX-XXXX-7781',
    designation: 'Haul Truck Operator',
    induction_done: true,
    induction_date: dateIn(-25),
    medical_valid_until: dateIn(18),
    is_active: true,
  },
  {
    id: 'a6000000-0000-4000-8000-000000000003',
    contractor_id: CONTRACTOR_JYT,
    mine_id: MINE,
    full_name: 'Demo Contract Worker C',
    id_proof_type: 'Voter ID',
    id_proof_number: 'DL/0091/2231',
    designation: 'Support Crew',
    induction_done: false,
    induction_date: null,
    medical_valid_until: dateIn(-5),
    is_active: true,
  },
];

/* ---- 2. attendance (last 7 days x 3 own workers) ----------------- */
const ATT_WORKERS = [
  { id: W1, name: 'JYT-W1' },
  { id: W2, name: 'JYT-W2' },
  { id: W3, name: 'JYT-W3' },
];
// deterministic pattern -> a couple of absences / half-days for realism
const PATTERN = [
  ['present', 'present', 'present', 'present', 'half_day', 'present', 'present'],
  ['present', 'absent', 'present', 'present', 'present', 'leave', 'present'],
  ['present', 'present', 'present', 'absent', 'present', 'present', 'half_day'],
];
const attendance = [];
ATT_WORKERS.forEach((w, wi) => {
  for (let d = 0; d < 7; d++) {
    const status = PATTERN[wi][d];
    attendance.push({
      id: `a7000000-000${wi}-4000-8000-00000000000${d}`,
      mine_id: MINE,
      department_id: DEPT_OPS,
      worker_id: w.id,
      contractor_worker_id: null,
      profile_id: null,
      work_date: dateIn(-(6 - d)),
      status,
      shift: 'A',
      hours_worked: status === 'present' ? 8 : status === 'half_day' ? 4 : 0,
      recorded_by: MANAGER,
    });
  }
});

/* ---- 3. grievances --------------------------------------------- */
const grievances = [
  {
    id: 'a8000000-0000-4000-8000-000000000001',
    mine_id: MINE,
    department_id: DEPT_HR,
    raised_by_worker_id: W2,
    is_anonymous: false,
    category: 'Welfare',
    title: 'Drinking water point near workshop not refilled',
    description:
      'The drinking water station near the workshop bay has been empty for two shifts. Crew is walking to the far end of the pit for water.',
    status: 'investigating',
    assigned_to: MANAGER,
  },
  {
    id: 'a8000000-0000-4000-8000-000000000002',
    mine_id: MINE,
    department_id: DEPT_SAFETY,
    raised_by_worker_id: W1,
    is_anonymous: false,
    category: 'Safety',
    title: 'Night-shift lighting inadequate on the eastern ramp',
    description:
      'Two light towers on the eastern ramp are not working. Visibility for reversing dumpers is poor after dark.',
    status: 'acknowledged',
    assigned_to: MANAGER,
  },
  {
    id: 'a8000000-0000-4000-8000-000000000003',
    mine_id: MINE,
    department_id: DEPT_HR,
    raised_by_worker_id: null,
    is_anonymous: true,
    category: 'Workplace conduct',
    title: 'Supervisor allocating overtime unfairly',
    description: 'Overtime is repeatedly given to the same few workers. Request a transparent roster.',
    status: 'open',
    assigned_to: null,
  },
  {
    id: 'a8000000-0000-4000-8000-000000000004',
    mine_id: MINE,
    department_id: DEPT_OPS,
    raised_by_worker_id: W3,
    is_anonymous: false,
    category: 'Facilities',
    title: 'Rest shelter roof leaking',
    description: 'The rest shelter near the CHP leaks during rain; benches and floor stay wet.',
    status: 'resolved',
    assigned_to: MANAGER,
    resolution_notes: 'Roofing sheet replaced by the civil team; verified dry after the last shower.',
    resolved_at: iso(2 * 864e5),
  },
];

/* ---- 4. maintenance records --------------------------------------- */
const maintenance = [
  {
    id: 'a9000000-0000-4000-8000-000000000001',
    equipment_id: EQ_DUMPER,
    mine_id: MINE,
    maintenance_type: 'corrective',
    description: 'Rear brake actuator replacement and full brake test after workshop observation.',
    performed_by: null,
    contractor_id: null,
    scheduled_for: dateIn(-3),
    performed_at: null,
    downtime_hours: null,
    cost: null,
    status: 'in_progress',
  },
  {
    id: 'a9000000-0000-4000-8000-000000000002',
    equipment_id: EQ_SHOVEL,
    mine_id: MINE,
    maintenance_type: 'preventive',
    description: '250-hour preventive service - lubrication, filters, slew ring inspection.',
    performed_by: null,
    contractor_id: null,
    scheduled_for: dateIn(5),
    performed_at: null,
    downtime_hours: null,
    cost: null,
    status: 'planned',
  },
  {
    id: 'a9000000-0000-4000-8000-000000000003',
    equipment_id: EQ_DUMPER,
    mine_id: MINE,
    maintenance_type: 'breakdown',
    description: 'Hydraulic hose burst on the hoist circuit - hose replaced, system bled.',
    performed_by: MANAGER,
    contractor_id: null,
    scheduled_for: dateIn(-9),
    performed_at: iso(8 * 864e5),
    downtime_hours: 6.5,
    cost: 42000,
    status: 'completed',
  },
];

/* ---- 5. compliance: labour + production categories --------------- */
const meta = (o) => JSON.stringify(o);
const EXTRA_REQS = [
  {
    code: 'LABOUR-ATTEND',
    title: 'Workforce attendance and induction records',
    description:
      'Daily attendance maintained for departmental and contractor workforce; induction and medical fitness records current before deployment.',
    authority: 'DGMS',
    category: 'labour',
    frequency: 'daily',
    is_active: true,
  },
  {
    code: 'PROD-MONTHLY',
    title: 'Monthly production and dispatch return',
    description:
      'Monthly coal production, overburden removal and dispatch reconciled against the approved programme and filed with the area office.',
    authority: 'Coal Controller',
    category: 'production',
    frequency: 'monthly',
    is_active: true,
  },
];
const EXTRA_RECORDS = [
  {
    code: 'LABOUR-ATTEND',
    status: 'at_risk',
    due_date: dateIn(1),
    notes: meta({
      note: 'Three contractor workers flagged: one pending induction, one with a lapsed medical, one medical expiring within 30 days.',
      ownerName: 'HR Officer (Demo)',
      ownerRole: 'HR Officer',
      priority: 'high',
      observationId: null,
    }),
  },
  {
    code: 'PROD-MONTHLY',
    status: 'pending_review',
    due_date: dateIn(9),
    notes: meta({
      note: 'August production return drafted; pending manager sign-off before filing with the area office.',
      ownerName: 'Priya Sharma',
      ownerRole: 'Mine Manager',
      priority: 'medium',
      observationId: null,
    }),
  },
];
const PERIOD_START = '2026-09-01';

async function main() {
  console.log('== 1. contractor_workers ==');
  console.log('  ', (await upsert('contractor_workers', CW, 'id')).s);

  console.log('== 2. attendance ==');
  console.log('  ', (await upsert('attendance', attendance, 'id')).s, `(${attendance.length} rows)`);

  console.log('== 3. grievances ==');
  // uniform keys so PostgREST accepts the bulk upsert
  const grvUniform = grievances.map((g) => ({
    resolution_notes: null,
    resolved_at: null,
    raised_by_profile_id: null,
    raised_by_contractor_worker_id: null,
    ...g,
  }));
  for (const g of grvUniform) {
    const r = await upsert('grievances', [g], 'id');
    if (r.s >= 300) console.log('  ', g.id.slice(-2), r.s, r.b.slice(0, 200));
  }
  console.log('   done', grvUniform.length);

  console.log('== 4. maintenance_records ==');
  console.log('  ', (await upsert('maintenance_records', maintenance, 'id')).s);

  console.log('== 5. compliance labour + production ==');
  console.log('   requirements', (await upsert('compliance_requirements', EXTRA_REQS, 'code')).s);
  const reqs = JSON.parse((await rq('/rest/v1/compliance_requirements?select=id,code')).b);
  const idByCode = Object.fromEntries(reqs.map((r) => [r.code, r.id]));
  const recRows = EXTRA_RECORDS.filter((r) => idByCode[r.code]).map((r) => ({
    requirement_id: idByCode[r.code],
    mine_id: MINE,
    status: r.status,
    period_start: PERIOD_START,
    period_end: null,
    due_date: r.due_date,
    reviewed_by: null,
    reviewed_at: null,
    notes: r.notes,
  }));
  console.log('   records     ', (await upsert('compliance_records', recRows, 'requirement_id,mine_id,period_start')).s);

  console.log('== 6. geo-tag OBS3 for the risk map ==');
  const p = await rq(`/rest/v1/observations?id=eq.${OBS3}&gps_latitude=is.null`, {
    m: 'PATCH',
    body: { gps_latitude: LAT - 0.0035, gps_longitude: LNG + 0.001 },
    extra: { Prefer: 'return=minimal' },
  });
  console.log('  ', p.s);

  console.log('\n== counts (Jayant) ==');
  console.log('  contractor_workers   ', await count('contractor_workers', `&mine_id=eq.${MINE}`));
  console.log('  attendance           ', await count('attendance', `&mine_id=eq.${MINE}`));
  console.log('  grievances           ', await count('grievances', `&mine_id=eq.${MINE}`));
  console.log('  maintenance_records  ', await count('maintenance_records', `&mine_id=eq.${MINE}`));
  console.log('  compliance_records   ', await count('compliance_records', `&mine_id=eq.${MINE}`));
  console.log('\nOperations seed complete.');
}
main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
