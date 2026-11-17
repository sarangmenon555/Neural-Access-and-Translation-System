import { CATEGORIES } from "./schema";

const DAY = 864e5;

function initialConsent() {
  const c = {};
  for (const party of ["doctor", "employer"]) {
    c[party] = {};
    for (const cat of Object.keys(CATEGORIES)) c[party][cat] = { enabled: false, threshold: 0.8, expiresAt: 0, days: 30 };
  }
  return c;
}

if (!globalThis.__nats) {
  globalThis.__nats = { offset: 0, incidentalOptIn: true, latest: {}, log: [], seen: {}, history: [], alerts: [], notes: [], rate: [], paused: false, hours: { on: false, start: 9, end: 17 }, sent: 0, contact: { name: "", on: false }, override: null, consent: initialConsent() };
}

export const store = globalThis.__nats;
export const now = () => Date.now() + store.offset * DAY;
export const CONSENT_DAYS = 30;
export const addDays = (d) => now() + d * DAY;

import { createHash } from "node:crypto";

const sha = (s) => createHash("sha256").update(s).digest("hex");

export function addLog(entry) {
  const p = store.log[0] ? store.log[0].h : "genesis";
  store.log.unshift({ ...entry, p, h: sha(p + JSON.stringify(entry)) });
  store.log.length = Math.min(store.log.length, 200);
}

export function verifyLog() {
  for (let i = 0; i < store.log.length; i++) {
    const { p, h, ...entry } = store.log[i];
    if (sha(p + JSON.stringify(entry)) !== h) return { ok: false, at: i };
    if (i + 1 < store.log.length && store.log[i + 1].h !== p) return { ok: false, at: i };
  }
  return { ok: true, count: store.log.length };
}

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FILE = join(tmpdir(), "nats-state.json");

if (!globalThis.__natsLoaded) {
  globalThis.__natsLoaded = true;
  try {
    Object.assign(globalThis.__nats, JSON.parse(readFileSync(FILE, "utf8")));
  } catch {
    globalThis.__nats.restored = false;
  }
}

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const KEY = "nats:state";
let snap = {};

async function redis(cmd) {
  const r = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + REDIS_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmd)
  });
  return (await r.json()).result;
}

export async function load() {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  try {
    const arr = (await redis(["HGETALL", KEY])) || [];
    snap = {};
    for (let i = 0; i < arr.length; i += 2) {
      snap[arr[i]] = arr[i + 1];
      store[arr[i]] = JSON.parse(arr[i + 1]);
    }
  } catch {
    return;
  }
}

export async function save() {
  const { rate, ...rest } = store;
  if (REDIS_URL && REDIS_TOKEN) {
    const cmd = ["HSET", KEY];
    for (const [k, v] of Object.entries(rest)) {
      const text = JSON.stringify(v);
      if (snap[k] !== text) {
        cmd.push(k, text);
        snap[k] = text;
      }
    }
    if (cmd.length > 2) {
      try {
        await redis(cmd);
      } catch {
        return;
      }
    }
    return;
  }
  try {
    writeFileSync(FILE, JSON.stringify(rest));
  } catch {
    return;
  }
}
