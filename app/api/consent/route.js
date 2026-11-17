import { NextResponse } from "next/server";
import { store, now, addDays, CONSENT_DAYS, addLog, verifyLog, save, load } from "../../../lib/store";
import { CATEGORIES } from "../../../lib/schema";

export const dynamic = "force-dynamic";

const PRESETS = {
  private: [],
  care: [["doctor", "seizure_risk", 0.9], ["doctor", "focus_level", 0.8], ["doctor", "incidental", 0.8]],
  work: [["doctor", "seizure_risk", 0.9], ["employer", "focus_level", 0.8]]
};

const snapshot = () =>
  NextResponse.json({
    consent: store.consent,
    incidentalOptIn: store.incidentalOptIn,
    log: store.log,
    offset: store.offset,
    override: store.override,
    contact: store.contact,
    notes: store.notes,
    paused: store.paused,
    hours: store.hours,
    integrity: verifyLog(),
    now: now()
  });

const clamp = (v) => Math.min(0.99, Math.max(0.5, Number(v) || 0.8));

export async function GET() {
  await load();
  return snapshot();
}

export async function POST(req) {
  await load();
  const b = await req.json();
  if (b.action === "rule") {
    const r = store.consent[b.party] && store.consent[b.party][b.category];
    if (!r) return NextResponse.json({ error: "unknown rule" }, { status: 400 });
    if (typeof b.enabled === "boolean") {
      r.enabled = b.enabled;
      addLog({ t: now(), party: b.party, kind: "consent", on: b.enabled, categories: [b.category] });
      if (b.enabled) r.expiresAt = addDays(r.days || CONSENT_DAYS);
    }
    if (typeof b.threshold === "number") r.threshold = clamp(b.threshold);
    if ([7, 30, 90].includes(b.days)) {
      r.days = b.days;
      if (r.enabled) r.expiresAt = addDays(b.days);
    }
    if (b.renew) r.expiresAt = addDays(r.days || CONSENT_DAYS);
  } else if (b.action === "gate") {
    store.incidentalOptIn = Boolean(b.value);
    if (!store.incidentalOptIn) delete store.latest.incidental;
  } else if (b.action === "advance") {
    store.offset += Math.min(90, Math.max(0, Number(b.days) || 0));
  } else if (b.action === "preset" && PRESETS[b.name]) {
    for (const p of Object.keys(store.consent)) {
      for (const c of Object.keys(CATEGORIES)) Object.assign(store.consent[p][c], { enabled: false, expiresAt: 0 });
    }
    for (const [p, c, th] of PRESETS[b.name]) Object.assign(store.consent[p][c], { enabled: true, threshold: th, expiresAt: addDays(CONSENT_DAYS) });
  } else if (b.action === "import" && b.consent && typeof b.consent === "object") {
    for (const p of Object.keys(store.consent)) {
      for (const c of Object.keys(CATEGORIES)) {
        const s = b.consent[p] && b.consent[p][c];
        if (s) Object.assign(store.consent[p][c], { enabled: Boolean(s.enabled), threshold: clamp(s.threshold), expiresAt: s.enabled ? addDays(CONSENT_DAYS) : 0 });
      }
    }
  } else if (b.action === "revoke" && store.consent[b.party]) {
    const cats = Object.keys(CATEGORIES).filter((c) => store.consent[b.party][c].enabled);
    for (const c of cats) Object.assign(store.consent[b.party][c], { enabled: false, expiresAt: 0 });
    if (cats.length) addLog({ t: now(), party: b.party, kind: "consent", on: false, categories: cats });
  } else if (b.action === "hours") {
    store.hours = { on: Boolean(b.on), start: 9, end: 17 };
  } else if (b.action === "pause") {
    store.paused = Boolean(b.value);
  } else if (b.action === "note") {
    store.notes.unshift({ t: now(), text: String(b.text || "").slice(0, 200) });
    store.notes.length = Math.min(store.notes.length, 30);
  } else if (b.action === "tamper") {
    if (store.log[0]) store.log[0].t += 1;
  } else if (b.action === "contact") {
    store.contact = { name: String(b.name || "").slice(0, 40), on: Boolean(b.on) };
  } else if (b.action === "erase") {
    Object.assign(store, { latest: {}, history: [], alerts: [], notes: [], log: [], seen: {}, sent: 0 });
  } else if (b.action === "override") {
    store.override = { until: addDays(1 / 24) };
    addLog({ t: now(), party: "emergency responder", kind: "override", reason: String(b.reason || "Emergency access").slice(0, 80), categories: ["seizure_risk"] });
  }
  await save();
  return snapshot();
}
