/**
 * CoalGuard AI - repeatable DEMO RESET + seed  (Node >= 20, no dependencies)
 * ----------------------------------------------------------------------------
 * `npm run demo:reset` -> this script. Brings the LIVE Supabase project to the
 * minimal, deterministic SIH demo state:
 *
 *   1. ensures EXACTLY the 2 demo login users + mine-scoped role assignments
 *        manager.jayant@coalguard.demo   (MINE_MANAGER   @ Jayant OC, "Priya Sharma")
 *        inspector.jayant@coalguard.demo (FIELD_INSPECTOR @ Jayant OC, "Ravi Kumar")
 *      Password for both: Coalguard#123
 *   2. uploads the 2 evidence photos in ./assets to the private `evidence` bucket
 *   3. upserts the 2 demo inspection trees (fixed UUIDs) -
 *        inspection -> 4 checklist items -> 1 critical/high observation ->
 *        1 evidence photo (is_simulated = true, "SIMULATED FIELD EVIDENCE") ->
 *        1 corrective action (open, unassigned)
 *   3b. upserts the 2 frozen deterministic AI analyses (OBS1 critical, OBS2 high)
 *       and links each observation to it. The MVP AI is a heuristic, NOT a live
 *       model - every analysis carries output.simulated = true.
 *   3c. removes any stray *@coalguard.demo auth user that is not one of the 2
 *       accounts and has no role assignment.
 *   4. purges every other transactional row (old inspections / observations /
 *      evidence / ai_analyses / incidents / notifications / audit_logs /
 *      compliance_records + documents / attendance / grievances / maintenance /
 *      contractor_workers) + orphaned storage objects.
 *   5. prints a full count + orphan + storage audit.
 *
 * NOT touched: schema, migrations, RLS, functions, roles, permissions, the org
 * hierarchy (subsidiaries/regions/mines/departments), inspection templates +
 * checklist items, compliance_requirements, and the seed.sql reference baseline
 * (equipment / workers / contractors / environmental_readings).
 *
 * The 2 corrective actions are left `open` + unassigned, ready for the
 * assign -> progress -> submit -> verify governance walk-through. Re-run any time.
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the env, or
 * falls back to apps/web/.env.local. The service-role key is used ONLY here
 * (admin seed) - it is never referenced by application code.
 *
 *   npm run demo:reset      (or)      node supabase/seed/demo-seed.mjs
 */
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SBURL || '';
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SRK || '';
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
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (env or apps/web/.env.local).');
    process.exit(1);
  }
  return { url, key };
}
const { url: BASE, key: SRK } = loadEnv();

/* ---- constants ---------------------------------------------------------- */
const MINE = '9dab1551-680d-42c8-be18-5f519054acea'; // Jayant OC (Demo)
const DEPT = '4aee81fa-00c0-4c05-9abd-446ffe8a1fdc'; // Jayant OC / Safety
const TPL = '46479fa0-5557-4250-8e92-567b558287cc';  // Daily Safety Round
const LAT = 24.119, LNG = 82.656;

const INSP1 = 'a1000000-0000-4000-8000-000000000001';
const INSP2 = 'a1000000-0000-4000-8000-000000000002';
const OBS1 = 'a2000000-0000-4000-8000-000000000001';
const OBS2 = 'a2000000-0000-4000-8000-000000000002';
const EV1 = 'a3000000-0000-4000-8000-000000000001';
const EV2 = 'a3000000-0000-4000-8000-000000000002';
const CA1 = 'a4000000-0000-4000-8000-000000000001';
const CA2 = 'a4000000-0000-4000-8000-000000000002';
const AI1 = 'a5000000-0000-4000-8000-000000000001'; // deterministic AI analysis -> OBS1
const AI2 = 'a5000000-0000-4000-8000-000000000002'; // deterministic AI analysis -> OBS2
/** The ONLY demo login accounts. Any other *@coalguard.demo auth user with no
 *  role assignment is a stray and is removed by purgeStrayUsers(). */
const DEMO_EMAILS = ['manager.jayant@coalguard.demo', 'inspector.jayant@coalguard.demo'];
const P1 = `${MINE}/${INSP1}/${OBS1}/${EV1}.jpg`;
const P2 = `${MINE}/${INSP2}/${OBS2}/${EV2}.jpg`;
const IMG1 = path.resolve(HERE, 'assets/east-highwall.jpg');
const IMG2 = path.resolve(HERE, 'assets/substation-ht-panel.jpg');

const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo).toISOString();
const dateIn = (d) => new Date(now + d * 864e5).toISOString().slice(0, 10);

/* ---- tiny REST client ------------------------------------------------- */
function rq(p, { m = 'GET', body = null, bin = null, extra = {} } = {}) {
  return new Promise((res, rej) => {
    const payload = bin ?? (body == null ? null : Buffer.from(JSON.stringify(body)));
    const headers = { apikey: SRK, Authorization: 'Bearer ' + SRK, ...extra };
    if (payload) {
      headers['Content-Type'] = bin ? 'image/jpeg' : 'application/json';
      headers['Content-Length'] = payload.length;
    }
    const r = https.request(new URL(BASE + p), { method: m, headers }, (x) => {
      let d = ''; x.on('data', (c) => (d += c));
      x.on('end', () => res({ s: x.statusCode, b: d, cr: x.headers['content-range'] }));
    });
    r.on('error', rej);
    r.end(payload ?? undefined);
  });
}
const upsert = (t, rows, onConflict) =>
  rq(`/rest/v1/${t}?on_conflict=${onConflict}`, {
    m: 'POST', body: rows,
    extra: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  });
const jlen = (s) => { try { return JSON.parse(s).length; } catch { return `?(${s.slice(0, 80)})`; } };
const count = async (t) => (await rq(`/rest/v1/${t}?select=id`, { extra: { Prefer: 'count=exact', Range: '0-0' } })).cr;

/* ---- 1. users + roles ---------------------------------------------------- */
async function ensureUsers() {
  const list = JSON.parse((await rq('/auth/v1/admin/users?per_page=200')).b).users || [];
  const ensure = async (email, fullName, code, role) => {
    let u = list.find((x) => x.email === email);
    if (!u) {
      const c = await rq('/auth/v1/admin/users', { m: 'POST', body: { email, password: 'Coalguard#123', email_confirm: true } });
      u = JSON.parse(c.b);
      console.log(`  created ${email} (${c.s})`);
    }
    // only fill in a name/code when the profile row is still blank - never
    // overwrite a name that already exists on the live project.
    const cur = JSON.parse((await rq(`/rest/v1/profiles?id=eq.${u.id}&select=full_name,employee_code`)).b)[0] || {};
    const patch = { email };
    if (!cur.full_name) patch.full_name = fullName;
    if (!cur.employee_code) patch.employee_code = code;
    await rq(`/rest/v1/profiles?id=eq.${u.id}`, { m: 'PATCH', body: patch });
    const ras = JSON.parse((await rq(`/rest/v1/role_assignments?profile_id=eq.${u.id}&select=role,mine_id`)).b);
    if (!ras.some((r) => r.role === role && r.mine_id === MINE)) {
      await rq('/rest/v1/role_assignments', {
        m: 'POST', extra: { Prefer: 'return=minimal' },
        body: { profile_id: u.id, role, scope_level: 'mine', mine_id: MINE, is_primary: true },
      });
    }
    return u.id;
  };
  const manager = await ensure('manager.jayant@coalguard.demo', 'Priya Sharma', 'JYT-MGR-01', 'MINE_MANAGER');
  const inspector = await ensure('inspector.jayant@coalguard.demo', 'Ravi Kumar', 'JYT-INS-01', 'FIELD_INSPECTOR');
  return { manager, inspector };
}

/* ---- 2. storage -------------------------------------------------------- */
async function uploadImage(objectPath, file) {
  await rq(`/storage/v1/object/evidence/${objectPath}`, { m: 'DELETE' });
  return rq(`/storage/v1/object/evidence/${objectPath}`, { m: 'POST', bin: fs.readFileSync(file), extra: { 'x-upsert': 'true' } });
}

/* ---- 3. the 2 demo trees -------------------------------------------------- */
async function seedTrees(inspector) {
  const inspections = [
    {
      id: INSP1, client_ref: INSP1, mine_id: MINE, department_id: DEPT, template_id: TPL,
      title: 'Daily Safety Round — Jayant OC (East Highwall)', inspection_type: 'safety_round',
      status: 'submitted', started_at: iso(6 * 3600e3), submitted_at: iso(5 * 3600e3),
      inspector_id: inspector, created_by: inspector, overall_risk: 'critical',
      summary: 'Highwall crest instability on the eastern face above bench 3. One critical observation raised with corrective action.',
      gps_latitude: LAT + 0.004, gps_longitude: LNG + 0.003, location_accuracy_m: 6, scheduled_for: iso(8 * 3600e3),
    },
    {
      id: INSP2, client_ref: INSP2, mine_id: MINE, department_id: DEPT, template_id: TPL,
      title: 'Daily Safety Round — Jayant OC (Workshop & Substation)', inspection_type: 'safety_round',
      status: 'submitted', started_at: iso(30 * 3600e3), submitted_at: iso(29 * 3600e3),
      inspector_id: inspector, created_by: inspector, overall_risk: 'high',
      summary: 'Electrical safety gaps at the workshop substation: HT panel interlock defeated and statutory danger boards missing.',
      gps_latitude: LAT - 0.002, gps_longitude: LNG - 0.0015, location_accuracy_m: 8, scheduled_for: iso(32 * 3600e3),
    },
  ];
  console.log('  inspections       ', (await upsert('inspections', inspections, 'id')).s);

  for (const id of [INSP1, INSP2]) await rq(`/rest/v1/inspection_items?inspection_id=eq.${id}`, { m: 'DELETE' });
  const it = (inspection_id, section, prompt, response, sort_order, risk = null, notes = null) =>
    ({ inspection_id, checklist_item_id: null, section, prompt, response, notes, risk, sort_order });
  const items = [
    it(INSP1, 'Haul Roads', 'Haul road width >= 3x widest vehicle and berms intact?', 'ok', 1),
    it(INSP1, 'Slopes & Benches', 'Any visible cracks, overhangs or loose boulders on the highwall?', 'not_ok', 2, 'critical', 'Continuous tension crack ~12 m along the crest above bench 3; loose boulders overhanging the haul road below.'),
    it(INSP1, 'HEMM', 'Reverse alarms, lights and seatbelts functional?', 'ok', 3),
    it(INSP1, 'Emergency', 'First-aid station stocked and rescue contact list displayed?', 'ok', 4),
    it(INSP2, 'PPE', 'All personnel wearing helmet, safety shoes and hi-viz?', 'ok', 1),
    it(INSP2, 'Electrical', 'HT/LT panels locked, earthed and free of water/vegetation?', 'not_ok', 2, 'high', 'Substation HT panel door interlock defeated with a tie-wrap; danger board and shock-treatment chart missing.'),
    it(INSP2, 'Earthing', 'Earthing connections intact and visibly bonded?', 'ok', 3),
    it(INSP2, 'Cabling', 'Trailing / flexible cables free of cuts and joints?', 'not_ok', 4, 'medium', 'Two flexible cables with taped joints near the workshop bay; scheduled for replacement.'),
  ];
  console.log('  inspection_items  ', (await rq('/rest/v1/inspection_items', { m: 'POST', body: items, extra: { Prefer: 'return=minimal' } })).s);

  const obs = [
    {
      id: OBS1, client_ref: OBS1, inspection_id: INSP1, mine_id: MINE, department_id: DEPT, raised_by: inspector,
      title: 'Tension crack and loose boulders on East highwall crest',
      description: 'A continuous tension crack has opened along roughly 12 m of the eastern highwall crest above bench 3. Several loose boulders overhang the active haul road. Slope angle appears steeper than the approved section. Immediate barricading recommended.',
      category: 'Slope Stability', risk: 'critical', status: 'action_required',
      gps_latitude: LAT + 0.004, gps_longitude: LNG + 0.003, occurred_at: iso(5.5 * 3600e3),
    },
    {
      id: OBS2, client_ref: OBS2, inspection_id: INSP2, mine_id: MINE, department_id: DEPT, raised_by: inspector,
      title: 'HT panel interlock defeated and danger boards missing at substation',
      description: 'The workshop substation HT panel door interlock has been bypassed with a tie-wrap, allowing the door to open while energised. The statutory danger board and shock-treatment chart are not displayed. Risk of electrocution during switching.',
      category: 'Electrical Safety', risk: 'high', status: 'action_required',
      gps_latitude: LAT - 0.002, gps_longitude: LNG - 0.0015, occurred_at: iso(29.5 * 3600e3),
    },
  ];
  console.log('  observations      ', (await upsert('observations', obs, 'id')).s);

  const evidence = [
    {
      id: EV1, client_ref: EV1, evidence_type: 'photo', storage_path: P1, file_name: 'east-highwall-crack.jpg',
      mime_type: 'image/jpeg', file_size_bytes: fs.statSync(IMG1).size, is_simulated: true,
      caption: 'East highwall crest — tension crack above bench 3 (simulated field evidence)',
      captured_at: iso(5.5 * 3600e3), gps_latitude: LAT + 0.004, gps_longitude: LNG + 0.003, location_accuracy_m: 6,
      uploaded_by: inspector, mine_id: MINE, inspection_id: INSP1, observation_id: OBS1,
    },
    {
      id: EV2, client_ref: EV2, evidence_type: 'photo', storage_path: P2, file_name: 'substation-ht-panel.jpg',
      mime_type: 'image/jpeg', file_size_bytes: fs.statSync(IMG2).size, is_simulated: true,
      caption: 'Substation HT panel — interlock bypassed, no shock-treatment chart (simulated field evidence)',
      captured_at: iso(29.5 * 3600e3), gps_latitude: LAT - 0.002, gps_longitude: LNG - 0.0015, location_accuracy_m: 8,
      uploaded_by: inspector, mine_id: MINE, inspection_id: INSP2, observation_id: OBS2,
    },
  ];
  console.log('  evidence          ', (await upsert('evidence', evidence, 'id')).s);

  const cas = [
    {
      id: CA1, observation_id: OBS1, inspection_id: INSP1, mine_id: MINE,
      title: 'Barricade East highwall crest and scale down loose material',
      description: 'Hard-barricade the crest for 20 m each side of the crack, stop haulage on the bench below, and arrange controlled scaling of loose boulders. Re-survey the section against the approved slope design before reopening.',
      priority: 'critical', status: 'open',
      assigned_to: null, assigned_by: null, assigned_at: null, due_date: null,
      submitted_at: null, verified_by: null, verified_at: null, closed_at: null, closure_notes: null, rejection_reason: null,
    },
    {
      id: CA2, observation_id: OBS2, inspection_id: INSP2, mine_id: MINE,
      title: 'Restore HT panel interlock and install statutory danger boards',
      description: 'Remove the tie-wrap, repair/replace the door interlock so the panel cannot be opened while energised, and display the danger board plus shock-treatment chart at the substation. Verify with the electrical supervisor.',
      priority: 'high', status: 'open',
      assigned_to: null, assigned_by: null, assigned_at: null, due_date: null,
      submitted_at: null, verified_by: null, verified_at: null, closed_at: null, closure_notes: null, rejection_reason: null,
    },
  ];
  console.log('  corrective_actions', (await upsert('corrective_actions', cas, 'id')).s);
}

/* ---- 3b. deterministic AI analyses for the 2 observations --------------- */
// The MVP AI is a deterministic heuristic (packages/ai `localRiskHeuristic` /
// `analyzeObservation`) - NOT a live model. These rows are the frozen output so
// the observation-detail "AI Risk Analysis" panel is populated in the demo.
// `requested_by = manager` because ai_analyses RLS is "requester can read" and
// the manager is the persona who opens the observation on the web.
async function seedAiAnalyses(manager) {
  const rows = [
    {
      id: AI1, analysis_type: 'risk_classification', status: 'completed',
      provider: 'coalguard-heuristic', model: 'coalguard-mock-v0', input: null,
      risk: 'critical', confidence: 0.82,
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
      entity_type: 'observation', entity_id: OBS1, requested_by: manager,
      completed_at: iso(4 * 3600e3),
    },
    {
      id: AI2, analysis_type: 'risk_classification', status: 'completed',
      provider: 'coalguard-heuristic', model: 'coalguard-mock-v0', input: null,
      risk: 'high', confidence: 0.78,
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
      entity_type: 'observation', entity_id: OBS2, requested_by: manager,
      completed_at: iso(28 * 3600e3),
    },
  ];
  console.log('  ai_analyses       ', (await upsert('ai_analyses', rows, 'id')).s);
  // link each observation to its analysis
  for (const [obs, ai] of [[OBS1, AI1], [OBS2, AI2]]) {
    await rq(`/rest/v1/observations?id=eq.${obs}`, {
      m: 'PATCH', extra: { Prefer: 'return=minimal' }, body: { ai_analysis_id: ai },
    });
  }
}

/* ---- 3c. remove any stray demo login that is not one of the 2 accounts --- */
async function purgeStrayUsers() {
  const users = JSON.parse((await rq('/auth/v1/admin/users?per_page=200')).b).users || [];
  const ras = JSON.parse((await rq('/rest/v1/role_assignments?select=profile_id')).b);
  const hasRole = new Set(ras.map((r) => r.profile_id));
  let removed = 0;
  for (const u of users) {
    const email = (u.email || '').toLowerCase();
    if (DEMO_EMAILS.includes(email)) continue;
    // only touch obvious demo accounts with no role assignment - never a real user
    if (!email.endsWith('@coalguard.demo')) continue;
    if (hasRole.has(u.id)) continue;
    await rq(`/rest/v1/profiles?id=eq.${u.id}`, { m: 'DELETE' });
    const d = await rq(`/auth/v1/admin/users/${u.id}`, { m: 'DELETE' });
    console.log(`  removed stray user ${email} (${d.s})`);
    removed += 1;
  }
  if (removed === 0) console.log('  stray users removed: 0');
}

/* ---- 4. purge everything else ---------------------------------------------- */
async function purge() {
  // storage: list every object under the mine prefix, delete any not owned by the 2 demo trees
  const listed = JSON.parse((await rq('/storage/v1/object/list/evidence', {
    m: 'POST', body: { prefix: '', limit: 1000, sortBy: { column: 'name', order: 'asc' } },
  })).b || '[]');
  // the list endpoint is shallow; walk the known layout instead via the DB rows we keep
  const keepPaths = new Set([P1, P2]);
  const dbPaths = JSON.parse((await rq('/rest/v1/evidence?select=storage_path')).b).map((r) => r.storage_path);
  // any object referenced by a row we are about to delete, plus any stray closure images
  const strayPrefixes = dbPaths.filter((p) => !keepPaths.has(p));
  const closureListing = JSON.parse((await rq('/storage/v1/object/list/evidence', {
    m: 'POST', body: { prefix: `${MINE}/corrective-actions`, limit: 1000 },
  })).b || '[]');
  for (const o of closureListing) {
    // nested one level: MINE/corrective-actions/<caId>/<file>
    const inner = JSON.parse((await rq('/storage/v1/object/list/evidence', {
      m: 'POST', body: { prefix: `${MINE}/corrective-actions/${o.name}`, limit: 1000 },
    })).b || '[]');
    for (const f of inner) strayPrefixes.push(`${MINE}/corrective-actions/${o.name}/${f.name}`);
  }
  if (strayPrefixes.length) {
    const d = await rq('/storage/v1/object/evidence', { m: 'DELETE', body: { prefixes: [...new Set(strayPrefixes)] } });
    console.log('  storage objects removed:', d.s === 200 ? jlen(d.b) : `(${d.s})`);
  } else {
    console.log('  storage objects removed: 0');
  }
  void listed;

  const del = async (label, pathAndFilter) =>
    console.log('  ' + label.padEnd(18) + '-',
      jlen((await rq(pathAndFilter, { m: 'DELETE', extra: { Prefer: 'return=representation' } })).b));

  // children / leaf transactional tables first ------------------------------
  await del('evidence', `/rest/v1/evidence?id=not.in.(${EV1},${EV2})`);
  await del('ai_analyses', `/rest/v1/ai_analyses?id=not.in.(${AI1},${AI2})`);
  await del('notifications', '/rest/v1/notifications?id=not.is.null');
  await del('audit_logs', '/rest/v1/audit_logs?id=not.is.null');
  await del('compliance_documents', '/rest/v1/compliance_documents?id=not.is.null');
  await del('compliance_records', '/rest/v1/compliance_records?id=not.is.null');
  await del('attendance', '/rest/v1/attendance?id=not.is.null');
  await del('contractor_workers', '/rest/v1/contractor_workers?id=not.is.null');
  await del('grievances', '/rest/v1/grievances?id=not.is.null');
  await del('maintenance_records', '/rest/v1/maintenance_records?id=not.is.null');
  await del('incidents', '/rest/v1/incidents?id=not.is.null');
  // inspection tree last ---------------------------------------------------
  await del('observations', `/rest/v1/observations?id=not.in.(${OBS1},${OBS2})`);
  await del('inspection_items', `/rest/v1/inspection_items?inspection_id=not.in.(${INSP1},${INSP2})`);
  await del('inspections', `/rest/v1/inspections?id=not.in.(${INSP1},${INSP2})`);
}

/* ---- 5. final audit ------------------------------------------------------- */
const num = (cr) => Number(String(cr || '0/0').split('/')[1] || 0);

async function audit() {
  const c = {};
  const tables = [
    'profiles', 'role_assignments', 'subsidiaries', 'regions', 'mines', 'departments',
    'inspection_templates', 'inspection_checklist_items', 'compliance_requirements',
    'inspections', 'inspection_items', 'observations', 'evidence', 'ai_analyses',
    'corrective_actions', 'incidents', 'notifications', 'audit_logs',
    'compliance_records', 'compliance_documents', 'environmental_readings', 'equipment',
    'maintenance_records', 'workers', 'contractor_workers', 'contractors', 'attendance', 'grievances',
  ];
  for (const t of tables) c[t] = num(await count(t));

  const users = JSON.parse((await rq('/auth/v1/admin/users?per_page=200')).b).users || [];

  // orphan / dangling-reference checks
  const q = async (p) => JSON.parse((await rq(p)).b);
  const inspIds = new Set((await q('/rest/v1/inspections?select=id')).map((r) => r.id));
  const obsIds = new Set((await q('/rest/v1/observations?select=id')).map((r) => r.id));
  const mineIds = new Set((await q('/rest/v1/mines?select=id')).map((r) => r.id));
  const profIds = new Set((await q('/rest/v1/profiles?select=id')).map((r) => r.id));

  const ev = await q('/rest/v1/evidence?select=id,inspection_id,observation_id,incident_id,corrective_action_id,mine_id,uploaded_by');
  const ai = await q('/rest/v1/ai_analyses?select=id,entity_type,entity_id');
  const ca = await q('/rest/v1/corrective_actions?select=id,observation_id,mine_id');
  const obs = await q('/rest/v1/observations?select=id,inspection_id,mine_id');

  const problems = [];
  for (const e of ev) {
    if (!e.inspection_id && !e.observation_id && !e.incident_id && !e.corrective_action_id)
      problems.push(`evidence ${e.id} has no parent`);
    if (e.inspection_id && !inspIds.has(e.inspection_id)) problems.push(`evidence ${e.id} -> missing inspection`);
    if (e.observation_id && !obsIds.has(e.observation_id)) problems.push(`evidence ${e.id} -> missing observation`);
    if (!mineIds.has(e.mine_id)) problems.push(`evidence ${e.id} -> missing mine`);
    if (!profIds.has(e.uploaded_by)) problems.push(`evidence ${e.id} -> missing uploader`);
  }
  for (const a of ai)
    if (a.entity_type === 'observation' && !obsIds.has(a.entity_id))
      problems.push(`ai_analysis ${a.id} -> missing observation`);
  for (const x of ca) {
    if (x.observation_id && !obsIds.has(x.observation_id)) problems.push(`corrective_action ${x.id} -> missing observation`);
    if (!mineIds.has(x.mine_id)) problems.push(`corrective_action ${x.id} -> missing mine`);
  }
  for (const o of obs) {
    if (o.inspection_id && !inspIds.has(o.inspection_id)) problems.push(`observation ${o.id} -> missing inspection`);
    if (!mineIds.has(o.mine_id)) problems.push(`observation ${o.id} -> missing mine`);
  }

  // storage vs db
  const evPaths = (await q('/rest/v1/evidence?select=storage_path')).map((r) => r.storage_path);
  const listRoot = async (prefix) => JSON.parse((await rq('/storage/v1/object/list/evidence', {
    m: 'POST', body: { prefix, limit: 1000 },
  })).b || '[]');
  const storageObjs = [];
  for (const lvl1 of await listRoot('')) {
    if (!lvl1.id && lvl1.name) {
      for (const lvl2 of await listRoot(`${lvl1.name}/`))
        for (const lvl3 of await listRoot(`${lvl1.name}/${lvl2.name}/`))
          for (const f of await listRoot(`${lvl1.name}/${lvl2.name}/${lvl3.name}/`))
            if (f.id) storageObjs.push(`${lvl1.name}/${lvl2.name}/${lvl3.name}/${f.name}`);
    } else if (lvl1.id) storageObjs.push(lvl1.name);
  }
  const strayObjs = storageObjs.filter((p) => !evPaths.includes(p));
  const missingObjs = evPaths.filter((p) => !storageObjs.includes(p));

  console.log('\n============================================================');
  console.log(' COALGUARD DEMO RESET COMPLETE');
  console.log('============================================================');
  console.log(` Users: ${users.length}   (${users.map((u) => u.email).join(', ')})`);
  console.log(` Role assignments: ${c.role_assignments}`);
  console.log(` Subsidiaries: ${c.subsidiaries}   Regions: ${c.regions}   Mines: ${c.mines}   Departments: ${c.departments}`);
  console.log(` Inspection templates: ${c.inspection_templates}   Checklist items: ${c.inspection_checklist_items}   Compliance requirements: ${c.compliance_requirements}`);
  console.log(' ---------------------------------------------------------');
  console.log(` Inspections: ${c.inspections}        (expect 2)`);
  console.log(` Inspection items: ${c.inspection_items}`);
  console.log(` Observations: ${c.observations}       (expect 2)`);
  console.log(` Evidence: ${c.evidence}           (expect 2)`);
  console.log(` AI analyses: ${c.ai_analyses}        (expect 2)`);
  console.log(` Corrective actions: ${c.corrective_actions} (expect 2, both open/unassigned)`);
  console.log(` Incidents: ${c.incidents}            (expect 0)`);
  console.log(` Notifications: ${c.notifications}        (expect 0)`);
  console.log(` Audit logs: ${c.audit_logs}           (expect 0)`);
  console.log(' ---------------------------------------------------------');
  console.log(` Compliance records: ${c.compliance_records}   Compliance documents: ${c.compliance_documents}`);
  console.log(` Environmental readings: ${c.environmental_readings}   Equipment: ${c.equipment}   Maintenance: ${c.maintenance_records}`);
  console.log(` Workers: ${c.workers}   Contractor workers: ${c.contractor_workers}   Contractors: ${c.contractors}`);
  console.log(` Attendance: ${c.attendance}   Grievances: ${c.grievances}`);
  console.log('============================================================');
  console.log(problems.length ? ` ${problems.length} ORPHAN / DANGLING REFERENCE(S):` : ' No orphan records detected.');
  for (const p of problems) console.log('   - ' + p);
  console.log(strayObjs.length ? ` ${strayObjs.length} stray storage object(s): ${strayObjs.join(', ')}`
    : ' No stray storage objects.');
  console.log(missingObjs.length ? ` ${missingObjs.length} evidence row(s) with NO storage object: ${missingObjs.join(', ')}`
    : ' All evidence rows have a storage object.');
  console.log('============================================================');
  console.log(' Logins: manager.jayant@ / inspector.jayant@coalguard.demo  (Coalguard#123)');
}

async function main() {
  console.log('== 1. users + roles =='); const { manager, inspector } = await ensureUsers();
  console.log('== 2. evidence images ==');
  console.log('  east-highwall     ', (await uploadImage(P1, IMG1)).s);
  console.log('  substation-ht-panel', (await uploadImage(P2, IMG2)).s);
  console.log('== 3. demo inspection trees =='); await seedTrees(inspector);
  console.log('== 3b. deterministic AI analyses =='); await seedAiAnalyses(manager);
  console.log('== 3c. stray demo logins =='); await purgeStrayUsers();
  console.log('== 4. purge everything else =='); await purge();
  await audit();
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
