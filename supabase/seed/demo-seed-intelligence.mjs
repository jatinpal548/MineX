/**
 * CoalGuard AI - ADDITIVE intelligence seed  (Node >= 20, no dependencies)
 * ----------------------------------------------------------------------------
 * Layers the AI + Compliance demo data on top of whatever `demo-seed.mjs` left:
 *
 *   1. upserts 2 extra compliance_requirements (highwall slope, electrical)
 *   2. upserts 8 compliance_records for Jayant OC (Demo) with a small JSON
 *      sidecar in `notes` carrying owner / priority / linked-observation.
 *      Two of them link to the real demo observations (OBS1 / OBS2).
 *   3. upserts 3 ai_analyses rows (risk_classification) for the 3 demo
 *      observations and points observations.ai_analysis_id at them.
 *
 * NOTHING IS DELETED. Fixed UUIDs + stable conflict targets make it safe to
 * re-run. `requested_by` on the ai_analyses rows is the demo MANAGER, because
 * ai_analyses RLS is "requester can read" and the manager is the demo persona
 * who opens the observation detail screen.
 *
 *   node supabase/seed/demo-seed-intelligence.mjs
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

/* ---- constants (match demo-seed.mjs) ---------------------------------- */
const MINE = '9dab1551-680d-42c8-be18-5f519054acea'; // Jayant OC (Demo)
const MANAGER = '5442a6c1-9f28-4ff6-90c9-631b930a1bfc'; // Priya Sharma
const OBS1 = 'a2000000-0000-4000-8000-000000000001'; // highwall tension crack (critical)
const OBS2 = 'a2000000-0000-4000-8000-000000000002'; // HT panel interlock (high)
const OBS3 = 'a2054bf0-cb6f-4ac8-afa3-7483ab3064c6'; // helmets & gloves (medium)
const PERIOD_START = '2026-09-01'; // stable => repeatable upsert

const AI1 = 'a5000000-0000-4000-8000-000000000001';
const AI2 = 'a5000000-0000-4000-8000-000000000002';
const AI3 = 'a5000000-0000-4000-8000-000000000003';

const iso = (msFromNow) => new Date(Date.now() + msFromNow).toISOString();
const dateIn = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

/* ---- tiny REST client ------------------------------------------------- */
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
const count = async (t) =>
  (await rq(`/rest/v1/${t}?select=id`, { extra: { Prefer: 'count=exact', Range: '0-0' } })).cr;

/* ---- 1. extra compliance requirements -------------------------------- */
const EXTRA_REQUIREMENTS = [
  {
    code: 'SAFE-HIGHWALL',
    title: 'Highwall slope stability management',
    description:
      'Working slopes and benches kept to the approved geotechnical design; visible cracks, overhangs and loose material managed before work continues below.',
    authority: 'DGMS',
    category: 'safety',
    frequency: 'continuous',
  },
  {
    code: 'SAFE-ELECTRICAL',
    title: 'Electrical safety and protection system integrity',
    description:
      'HT/LT panels locked, interlocked and earthed; statutory danger and shock-treatment boards displayed at every substation and switching point.',
    authority: 'DGMS',
    category: 'safety',
    frequency: 'monthly',
  },
];

/* ---- 2. compliance records for Jayant ------------------------------- */
// meta sidecar lives in `notes` as JSON: { note, ownerName, ownerRole, priority, observationId }
const meta = (o) => JSON.stringify(o);

const RECORDS = [
  {
    code: 'SAFE-HIGHWALL',
    status: 'at_risk',
    due_date: dateIn(2),
    notes: meta({
      note: 'East highwall crest showing a continuous tension crack above bench 3 - controlled scaling and re-survey required before haulage resumes below.',
      ownerName: 'Priya Sharma',
      ownerRole: 'Mine Manager',
      priority: 'critical',
      observationId: OBS1,
    }),
  },
  {
    code: 'SAFE-ELECTRICAL',
    status: 'at_risk',
    due_date: dateIn(7),
    notes: meta({
      note: 'Workshop substation HT panel interlock defeated and statutory boards missing - protection to be restored and verified by the electrical supervisor.',
      ownerName: 'S. Nair',
      ownerRole: 'Electrical Safety Officer',
      priority: 'high',
      observationId: OBS2,
    }),
  },
  {
    code: 'DGMS-FIRSTAID',
    status: 'pending_review',
    due_date: dateIn(13),
    notes: meta({
      note: 'Quarterly first-aid and rescue readiness audit due; stations stocked, trained personnel roster to be re-verified.',
      ownerName: 'Priya Sharma',
      ownerRole: 'Mine Manager',
      priority: 'high',
      observationId: null,
    }),
  },
  {
    code: 'CPCB-AAQ',
    status: 'pending_review',
    due_date: dateIn(23),
    notes: meta({
      note: 'Monthly ambient air quality return pending. Latest PM10 boundary reading is above the notified threshold - dust suppression to be stepped up.',
      ownerName: 'D. Rao',
      ownerRole: 'Environmental Officer',
      priority: 'medium',
      observationId: null,
    }),
  },
  {
    code: 'MOEFCC-EC',
    status: 'compliant',
    due_date: dateIn(90),
    notes: meta({
      note: 'Half-yearly environmental clearance compliance report submitted and acknowledged.',
      ownerName: 'D. Rao',
      ownerRole: 'Environmental Officer',
      priority: 'medium',
      observationId: null,
    }),
  },
  {
    code: 'CGWA-WATER',
    status: 'pending_review',
    due_date: dateIn(38),
    notes: meta({
      note: 'Quarterly ground water abstraction return to be filed; NOC valid.',
      ownerName: 'D. Rao',
      ownerRole: 'Environmental Officer',
      priority: 'medium',
      observationId: null,
    }),
  },
  {
    code: 'DGMS-DSR',
    status: 'compliant',
    due_date: dateIn(1),
    notes: meta({
      note: 'Daily safety status report submitted to the area manager for the current shift.',
      ownerName: 'Priya Sharma',
      ownerRole: 'Mine Manager',
      priority: 'low',
      observationId: null,
    }),
  },
  {
    code: 'DGMS-MINE-PLAN',
    status: 'compliant',
    due_date: dateIn(120),
    notes: meta({
      note: 'Working confined to the approved mining plan and boundaries; latest survey reconciled.',
      ownerName: 'Priya Sharma',
      ownerRole: 'Mine Manager',
      priority: 'medium',
      observationId: null,
    }),
  },
];

/* ---- 3. AI analyses ------------------------------------------------- */
const ANALYSES = [
  {
    id: AI1,
    entity_id: OBS1,
    risk: 'critical',
    confidence: 0.82,
    summary:
      'Keywords "tension crack", "loose boulders" and "highwall crest" match a slope-instability pattern. An open, continuous crest crack above an active haul road is a recognised precursor to bench or highwall failure.',
    recommendations: [
      'Stop the activity and make the area safe immediately.',
      'Notify the mine manager and safety officer now.',
      'Raise a critical corrective action with a same-day due date.',
    ],
    output: {
      consequence:
        'Progressive slope failure could bury the bench or haul road below and trap personnel and equipment.',
      recommendedAction:
        'Barricade the crest and the bench below, stop work in the run-out zone, and arrange controlled scaling with a geotechnical review.',
      simulated: true,
    },
  },
  {
    id: AI2,
    entity_id: OBS2,
    risk: 'high',
    confidence: 0.78,
    summary:
      'Keywords "HT panel", "interlock" and "danger boards missing" match an electrical-protection pattern. A defeated interlock allows an energised panel to be opened, and missing statutory boards remove the last warning to workers.',
    recommendations: [
      'Isolate or barricade the hazard and restrict access.',
      'Raise a high-priority corrective action with a named owner.',
      'Re-inspect before the equipment is returned to use.',
    ],
    output: {
      consequence:
        'A worker could receive a fatal electric shock during switching or maintenance while the protection is defeated.',
      recommendedAction:
        'Isolate and lock out the affected panel, restore the interlock and earthing, and display the statutory danger and shock-treatment boards before re-energising.',
      simulated: true,
    },
  },
  {
    id: AI3,
    entity_id: OBS3,
    risk: 'medium',
    confidence: 0.6,
    summary:
      'Keywords "helmet" and "gloves" match a PPE-compliance pattern. Routine work without head and hand protection raises the chance of an otherwise avoidable injury.',
    recommendations: [
      'Log the observation and assign a corrective action owner.',
      'Attach photo evidence with GPS and timestamp.',
      'Verify the fix on the next scheduled inspection.',
    ],
    output: {
      consequence:
        'Repeated exposure without protection raises the chance of a head or hand injury during routine work.',
      recommendedAction:
        'Stop the activity until the correct PPE is worn, and reinforce the requirement at the next toolbox talk.',
      simulated: true,
    },
  },
];

async function main() {
  console.log('== 1. extra compliance requirements ==');
  console.log(
    '  compliance_requirements',
    (await upsert('compliance_requirements', EXTRA_REQUIREMENTS.map((r) => ({ ...r, is_active: true })), 'code')).s,
  );

  // resolve requirement ids by code
  const reqs = JSON.parse(
    (await rq('/rest/v1/compliance_requirements?select=id,code')).b,
  );
  const idByCode = Object.fromEntries(reqs.map((r) => [r.code, r.id]));

  console.log('== 2. compliance records for Jayant OC ==');
  const recordRows = RECORDS.filter((r) => idByCode[r.code]).map((r) => ({
    requirement_id: idByCode[r.code],
    mine_id: MINE,
    status: r.status,
    period_start: PERIOD_START,
    period_end: null,
    due_date: r.due_date,
    reviewed_by: r.status === 'compliant' ? MANAGER : null,
    reviewed_at: r.status === 'compliant' ? iso(-2 * 864e5) : null,
    notes: r.notes,
  }));
  console.log(
    '  compliance_records     ',
    (await upsert('compliance_records', recordRows, 'requirement_id,mine_id,period_start')).s,
    `(${recordRows.length} rows)`,
  );

  console.log('== 3. ai_analyses + observation links ==');
  const analysisRows = ANALYSES.map((a) => ({
    id: a.id,
    analysis_type: 'risk_classification',
    status: 'completed',
    provider: 'coalguard-heuristic',
    model: 'coalguard-mock-v0',
    input: null,
    output: a.output,
    risk: a.risk,
    confidence: a.confidence,
    summary: a.summary,
    recommendations: a.recommendations,
    entity_type: 'observation',
    entity_id: a.entity_id,
    requested_by: MANAGER,
    completed_at: iso(-4 * 3600e3),
  }));
  console.log('  ai_analyses            ', (await upsert('ai_analyses', analysisRows, 'id')).s);

  for (const a of ANALYSES) {
    const r = await rq(`/rest/v1/observations?id=eq.${a.entity_id}`, {
      m: 'PATCH',
      body: { ai_analysis_id: a.id },
      extra: { Prefer: 'return=minimal' },
    });
    console.log(`  observation ${a.entity_id.slice(0, 8)} -> ai_analysis_id  ${r.s}`);
  }

  console.log('\n== counts ==');
  for (const t of ['compliance_requirements', 'compliance_records', 'ai_analyses'])
    console.log('  ' + t.padEnd(24), await count(t));
  console.log('\nIntelligence seed complete.');
}
main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
