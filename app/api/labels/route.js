import { NextResponse } from "next/server";
import { validate } from "../../../lib/schema";
import { store, now, addLog, save, load } from "../../../lib/store";

export const dynamic = "force-dynamic";

const reject = (status) =>
  NextResponse.json({ error: "rejected: only the approved label schema is accepted" }, { status });

export async function POST(req) {
  await load();
  const nowMs = Date.now();
  store.rate = store.rate.filter((x) => nowMs - x < 60000);
  if (store.rate.length >= 90) return reject(429);
  store.rate.push(nowMs);
  const text = await req.text();
  if (text.length > 2000) return reject(413);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return reject(400);
  }
  const clean = validate(body);
  if (!clean) return reject(400);
  if (clean.category === "incidental" && !store.incidentalOptIn) return NextResponse.json({ ok: true, dropped: true });
  store.latest[clean.category] = { ...clean, t: now() };
  store.sent += 1;
  const prev = store.history[store.history.length - 1];
  if (clean.category === "seizure_risk" && clean.value === "elevated" && clean.confidence >= 0.9 && prev && prev.risk >= 0.5) {
    const last = store.alerts[0];
    if (!last || now() - last.t > 60000) {
      const c = store.contact;
      store.alerts.unshift({ t: now(), text: c.on && c.name ? "High seizure risk detected. " + c.name + " was notified." : "High seizure risk detected. Find a safe place to sit." });
      store.alerts.length = Math.min(store.alerts.length, 10);
    }
  }
  if (clean.category === "seizure_risk") {
    const risk = clean.value === "elevated" ? clean.confidence : 1 - clean.confidence;
    store.history.push({ t: now(), risk });
    if (store.history.length > 40) store.history.shift();
  }
  await save();
  return NextResponse.json({ ok: true });
}

export async function GET(req) {
  await load();
  const role = new URL(req.url).searchParams.get("role");
  const t = now();
  if (role === "owner") return NextResponse.json({ findings: store.latest, history: store.history, alerts: store.alerts, sent: store.sent });
  if (role === "emergency") {
    const f = store.latest.seizure_risk;
    const open = store.override && store.override.until > t && f;
    return NextResponse.json({ findings: open ? { seizure_risk: { value: f.value, t: f.t } } : {} });
  }
  const rules = store.consent[role];
  if (!rules) return NextResponse.json({ error: "unknown role" }, { status: 400 });
  if (store.paused) return NextResponse.json({ findings: {}, paused: true });
  if (role === "employer" && store.hours.on) {
    const h = new Date(t).getHours();
    if (h < store.hours.start || h >= store.hours.end) return NextResponse.json({ findings: {}, offHours: true });
  }
  const findings = {};
  for (const [cat, f] of Object.entries(store.latest)) {
    const r = rules[cat];
    if (r.enabled && r.expiresAt > t && f.confidence >= r.threshold) {
      findings[cat] = role === "doctor" ? f : { value: f.value, t: f.t };
    }
  }
  const key = Object.entries(findings).map(([c, f]) => c + f.t).join("|");
  if (key && store.seen[role] !== key) {
    store.seen[role] = key;
    addLog({ t, party: role, kind: "view", categories: Object.keys(findings) });
    await save();
  }
  return NextResponse.json({ findings });
}
