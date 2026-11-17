"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { generateSignal, MODES } from "../lib/signal.mjs";
import { decode } from "../lib/decoder";
import MODEL from "../data/weights.json";
import REPLAY from "../data/replay.json";

const PARTIES = { doctor: "Your doctor", employer: "Your employer" };
const CATS = { seizure_risk: "Seizure warning", focus_level: "Focus", incidental: "Unexpected findings" };
const MEANING = {
  seizure_risk: "A warning when your seizure risk is higher than usual",
  focus_level: "Whether your focus is low or normal",
  incidental: "Anything unusual the system notices that you did not ask about"
};
const VALUE = {
  "seizure_risk:elevated": "Higher than usual",
  "seizure_risk:low": "Low",
  "focus_level:low": "Low focus",
  "focus_level:normal": "Normal",
  "incidental:rhythm_irregularity": "Unusual rhythm"
};
const LEVELS = [["Fewer alerts", 0.9], ["Balanced", 0.8], ["Earlier alerts", 0.65]];
const NAV = [["home", "Home"], ["sharing", "Sharing"], ["activity", "Activity"], ["preview", "Their view"], ["privacy", "Privacy"]];
const NEXT = [
  ["Data provenance trail", "See every hand-off of a finding, such as a doctor referring it on."],
  ["Family consent mode", "Involve relatives when a finding has genetic relevance."],
  ["Accountability scoring", "Rate each party on how it has handled data you shared."]
];

const post = (url, body) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const get = (url) => fetch(url, { cache: "no-store" }).then((r) => r.json());
const when = (t) => {
  const d = Date.now() - t;
  if (d < 0 || d > 864e5) return new Date(t).toLocaleString();
  if (d < 60000) return "just now";
  if (d < 3600000) return Math.round(d / 60000) + " min ago";
  return Math.round(d / 3600000) + " hr ago";
};
const pct = (v) => Math.round(v * 1000) / 10 + "%";
const day = (t) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const nearest = (th) => LEVELS.reduce((a, b) => (Math.abs(b[1] - th) < Math.abs(a[1] - th) ? b : a))[1];

function Logo() {
  return <img className="logo" src="/logo.png" alt="NATS logo" width="42" height="42" />;
}

function Ring({ tone, label }) {
  const stroke = tone === "bad" ? "url(#gbad)" : tone === "good" ? "url(#ggood)" : "url(#goff)";
  const sub = tone === "off" ? "Wearable is off" : tone === "bad" ? "Check now" : "Monitoring";
  return (
    <svg className={"ring " + tone} viewBox="0 0 160 160" role="img" aria-label={label}>
      <defs>
        <linearGradient id="ggood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0b6e4f" /><stop offset="1" stopColor="#38c98a" /></linearGradient>
        <linearGradient id="gbad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff5a36" /><stop offset="1" stopColor="#d61f2c" /></linearGradient>
        <linearGradient id="goff" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9fb0c8" /><stop offset="1" stopColor="#c5d0e0" /></linearGradient>
      </defs>
      <circle cx="80" cy="80" r="74" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" strokeDasharray="1 6.2" />
      <circle cx="80" cy="80" r="62" fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="12" />
      <circle className="arc" cx="80" cy="80" r="62" fill="none" stroke={stroke} strokeWidth="12" strokeLinecap="round" strokeDasharray={tone === "off" ? "70 390" : "390 0"} transform="rotate(-90 80 80)" />
      <text x="80" y="80" textAnchor="middle" fontSize="20" fontWeight="760" fill="currentColor">{label}</text>
      <text x="80" y="102" textAnchor="middle" fontSize="10.5" fill="currentColor" opacity="0.6">{sub}</text>
    </svg>
  );
}

function Wave({ sig }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !sig) return;
    const g = c.getContext("2d");
    const w = c.width;
    const h = c.height;
    g.clearRect(0, 0, w, h);
    g.shadowBlur = 0;
    g.strokeStyle = "rgba(120, 140, 170, 0.22)";
    for (let x = 0; x < w; x += 38) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "#ff9a3c");
    grad.addColorStop(0.5, "#c9c24a");
    grad.addColorStop(1, "#2bd18f");
    g.strokeStyle = grad;
    g.lineWidth = 2.2;
    g.lineJoin = "round";
    g.shadowColor = "rgba(43, 209, 143, 0.55)";
    g.shadowBlur = 10;
    g.beginPath();
    const mx = Math.max(120, ...sig.map(Math.abs));
    sig.forEach((v, i) => {
      const x = (i / (sig.length - 1)) * w;
      const y = h / 2 - (v / mx) * (h / 2 - 10);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.stroke();
  }, [sig]);
  return <canvas ref={ref} width={760} height={150} className="wave" aria-label="Raw signal, kept on this device" />;
}

function Trend({ data }) {
  if (data.length < 2) return <p className="muted">The trend appears after two readings.</p>;
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * 300},${58 - d.risk * 54}`).join(" ");
  return (
    <svg className="trend" viewBox="0 0 300 60" preserveAspectRatio="none" role="img" aria-label="Seizure risk over recent readings">
      <line x1="0" y1="31" x2="300" y2="31" stroke="#dbe5e2" strokeDasharray="3 3" />
      <polyline points={pts} fill="none" stroke="#b42346" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Reading({ cat, f, why }) {
  const bad = f.value === "elevated" || f.value === "rhythm_irregularity";
  return (
    <div className="reading">
      <div>
        <b>{CATS[cat]}</b>
        {typeof f.confidence === "number" && <div className="muted">{Math.round(f.confidence * 100)}% sure <span className="meter"><span style={{ width: f.confidence * 100 + "%" }} /></span></div>}
        {why && f.explain && (
          <details>
            <summary>Why this result</summary>
            <div className="bars">
              {f.explain.map((e) => (
                <div className="bar" key={e.feature}>
                  <span>{e.feature}</span>
                  <span className="track"><span className={e.weight < 0 ? "fill neg" : "fill"} style={{ width: Math.abs(e.weight) * 100 + "%" }} /></span>
                  <span>{e.weight}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
      <b className={"pill " + (bad ? "bad" : "ok")}>{VALUE[cat + ":" + f.value] || f.value}</b>
    </div>
  );
}

export default function Page() {
  const [nav, setNav] = useState("home");
  const [sub, setSub] = useState("doctor");
  const [welcome, setWelcome] = useState(true);
  const [mode, setMode] = useState("rest");
  const [live, setLive] = useState(false);
  const [sig, setSig] = useState(null);
  const [payload, setPayload] = useState(null);
  const [state, setState] = useState({ consent: null, log: [], incidentalOptIn: true, offset: 0, override: null, contact: { name: "", on: false }, notes: [], paused: false, hours: { on: false }, integrity: { ok: true, count: 0 }, now: Date.now() });
  const [own, setOwn] = useState({});
  const [history, setHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [sent, setSent] = useState(0);
  const [shared, setShared] = useState({});
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [toast, setToast] = useState("");
  const [pending, setPending] = useState(null);
  const [filter, setFilter] = useState("all");
  const [tour, setTour] = useState(null);
  const [offline, setOffline] = useState(false);
  const [big, setBig] = useState(false);
  const [undo, setUndo] = useState(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const refresh = useCallback(async () => {
    let s;
    try {
      s = await get("/api/consent");
    } catch {
      setOffline(true);
      return;
    }
    setOffline(false);
    setState(s);
    const o = await get("/api/labels?role=owner");
    setOwn(o.findings || {});
    setHistory(o.history || []);
    setAlerts(o.alerts || []);
    setSent(o.sent || 0);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (NAV.some(([k]) => k === h)) setNav(h);
    try {
      if (window.localStorage.getItem("nats-welcome") === "done") setWelcome(false);
      if (window.localStorage.getItem("nats-big") === "1") {
        setBig(true);
        document.documentElement.style.fontSize = "120%";
      }
    } catch {
      setWelcome(true);
    }
    const k = (e) => {
      if (e.key === "Escape") setPending(null);
      if (e.target.tagName !== "INPUT" && !e.metaKey && !e.ctrlKey && NAV[Number(e.key) - 1]) go(NAV[Number(e.key) - 1][0]);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
  }, [refresh]);

  const go = (k) => {
    setNav(k);
    window.location.hash = k;
  };

  useEffect(() => {
    if (!live) return;
    const tick = async () => {
      const pool = REPLAY[modeRef.current];
      const s = pool ? pool[Math.floor(Math.random() * pool.length)] : generateSignal(modeRef.current);
      const out = decode(s);
      setSig(s);
      setPayload(out);
      for (const f of out) await post("/api/labels", f);
      refresh();
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, [live, refresh]);

  useEffect(() => {
    if (nav !== "preview") return;
    const run = async () => setShared((await get("/api/labels?role=" + sub)).findings || {});
    run();
    const id = setInterval(run, 2000);
    return () => clearInterval(id);
  }, [nav, sub]);

  const MSG = { rule: "Saved", pause: "Sharing pause updated", note: "Note saved", preset: "Sharing updated", import: "Rules imported", erase: "Your data was erased", contact: "Trusted contact updated", gate: "Preference saved", hours: "Work hours setting saved", override: "Emergency access opened and logged", revoke: "Sharing stopped" };
  const flash = (m, u) => {
    setToast(m);
    setUndo(u ? () => u : null);
    setTimeout(() => {
      setToast("");
      setUndo(null);
    }, u ? 7000 : 3000);
  };
  const act = async (body) => {
    const snap = state.consent;
    setState(await post("/api/consent", body));
    refresh();
    const u = ["preset", "revoke"].includes(body.action) && snap ? () => act({ action: "import", consent: snap }) : null;
    if (MSG[body.action]) flash(MSG[body.action], u);
  };
  const rule = (party, category, patch) => act({ action: "rule", party, category, ...patch });
  const exportRules = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ consent: state.consent }, null, 2)], { type: "application/json" }));
    a.download = "nats-consent.json";
    a.click();
  };
  const importRules = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      act({ action: "import", consent: JSON.parse(await f.text()).consent });
    } catch {
      return;
    }
  };

  const TOUR = [
    ["Start the wearable", "Begins streaming a simulated signal. Decoding happens in your browser.", () => { setLive(true); go("home"); }],
    ["Share with your doctor", "Applies the doctor preset: seizure risk shared at 90 percent confidence.", () => { act({ action: "preset", name: "care" }); go("sharing"); }],
    ["Trigger a seizure", "Switches the simulator to a seizure pattern and returns to Home.", () => { setMode("seizure"); go("home"); }],
    ["See the doctor's screen", "The doctor sees the label and the reasons behind it.", () => { setSub("doctor"); go("preview"); }],
    ["See the employer's screen", "The employer sees nothing, because nothing was shared with them.", () => { setSub("employer"); go("preview"); }],
    ["Let permissions expire", "Moves the clock forward 31 days. Access ends on its own.", () => { act({ action: "advance", days: 31 }); setSub("doctor"); go("preview"); }],
    ["Prove the log is honest", "Alters one log entry. The checksum chain flags it.", () => { act({ action: "tamper" }); go("activity"); }]
  ];
  const sz = own.seizure_risk;
  const tone = !live ? "off" : sz && sz.value === "elevated" ? "bad" : "good";
  const ringLabel = tone === "off" ? "Standby" : tone === "bad" ? "Attention" : "All clear";
  const open = state.override && state.override.until > state.now;
  const rules = state.consent ? Object.keys(PARTIES).flatMap((p) => Object.values(state.consent[p])) : [];
  const active = rules.filter((r) => r.enabled && r.expiresAt > state.now).length;
  const soon = rules.filter((r) => r.enabled && r.expiresAt > state.now && r.expiresAt - state.now < 7 * 864e5).length;
  const poor = live && payload && payload.length === 0;
  const countFor = (p) => (state.consent ? Object.values(state.consent[p]).filter((r) => r.enabled && r.expiresAt > state.now).length : 0);
  const plural = (n) => (n === 0 ? "nothing" : n === 1 ? "1 thing" : n + " things");
  const summaryText = "Right now your doctor can see " + plural(countFor("doctor")) + " and your employer can see " + plural(countFor("employer")) + ".";
  const receipt = () => {
    const lines = ["NATS (Neural Access & Translation System) consent receipt", "Issued: " + new Date().toLocaleString(), "Log checksum head: " + (state.log[0] ? state.log[0].h : "none"), "Sharing paused: " + state.paused, ""];
    for (const p of Object.keys(PARTIES)) {
      for (const c of Object.keys(CATS)) {
        const r = state.consent[p][c];
        if (r.enabled) lines.push(PARTIES[p] + " may see " + CATS[c] + " at " + Math.round(r.threshold * 100) + "% confidence until " + new Date(r.expiresAt).toLocaleDateString());
      }
    }
    if (lines.length === 5) lines.push("No permissions are active.");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "text/plain" }));
    a.download = "nats-consent-receipt.txt";
    a.click();
  };
  const summary = () => {
    const el = history.filter((h) => h.risk >= 0.5).length;
    const peak = history.reduce((m, h) => Math.max(m, h.risk), 0);
    const text = "NATS (Neural Access & Translation System) summary for my doctor\nReadings: " + history.length + "\nElevated seizure risk readings: " + el + "\nPeak seizure risk: " + Math.round(peak * 100) + "%\nPatient notes:\n" + state.notes.map((n) => "- " + when(n.t) + ": " + n.text).join("\n") + "\n";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = "nats-summary.txt";
    a.click();
  };

  return (
    <div className="app" data-tone={tone}>
      <a className="skip" href="#main">Skip to content</a>
      <aside className="side">
        <div className="brand"><Logo /><span className="bname">NATS <small>(Neural Access &amp; Translation System)</small></span>{live && <span className="dot" title="Wearable live" />}</div>
        <div className="brandsub">Neural Access &amp; Translation System</div>
        <nav className="nav" aria-label="Main">
          {NAV.map(([k, l]) => (
            <button key={k} aria-current={nav === k ? "page" : undefined} onClick={() => go(k)}>{l}</button>
          ))}
        </nav>
        <div className="topbar"><button className={state.paused ? "pausebtn on" : "pausebtn"} onClick={() => act({ action: "pause", value: !state.paused })}>{state.paused ? "Resume sharing" : "Pause all sharing"}</button>
        <button className="chip tourbtn" onClick={() => setTour(0)}>Guided demo</button></div>
      </aside>

      <main className="main" id="main">
        {offline && <div className="banner" role="alert">Cannot reach the server. Retrying automatically.</div>}
        {nav === "home" && (
          <div className="stack">
            <div>
              <h1>Hi, welcome back</h1>
              <p className="lede">Your brain signal stays on this device. Only simple results, like "all clear", can be shared, and only with people you choose.</p>
            </div>
            {welcome && (
              <div className="card">
                <h2>Three things to know</h2>
                <p className="muted">Your brain signal stays on this device. You choose who sees each result, and every permission ends on its own unless you renew it.</p>
                <div className="row"><button className="btn" onClick={() => { setWelcome(false); try { window.localStorage.setItem("nats-welcome", "done"); } catch {} }}>Got it</button><button className="btn ghost" onClick={() => go("sharing")}>Set up sharing</button><button className="btn ghost" onClick={() => setTour(0)}>Take the guided demo</button></div>
              </div>
            )}
            {alerts[0] && <div className="banner" role="alert">{alerts[0].text} <span className="muted">{when(alerts[0].t)}</span></div>}
            {tone === "bad" && (
              <section className="card">
                <h2>What to do now</h2>
                <p className="muted">Sit or lie down somewhere safe, move hard objects away, and do not put anything in the mouth. If it lasts more than 5 minutes or breathing is difficult, call your local emergency number.</p>
              </section>
            )}
            {(() => {
              const steps = [["Start your wearable", live || sent > 0], ["Choose who can see your results", active > 0], ["Add a trusted contact", state.contact.on]];
              const done = steps.filter((s) => s[1]).length;
              return done < 3 ? (
                <section className="card">
                  <h2>Get set up ({done} of 3)</h2>
                  <ul className="check">{steps.map(([t, d]) => <li key={t} className={d ? "done" : ""}>{t}</li>)}</ul>
                </section>
              ) : null;
            })()}
            {history.length > 0 && (
              <section className="card">
                <h2>This session</h2>
                <div className="glance">
                  <div><div className="counter">{history.length}</div><span className="muted">readings</span></div>
                  <div><div className="counter">{history.filter((h) => h.risk >= 0.5).length}</div><span className="muted">warnings</span></div>
                  <div><div className="counter">{Math.round(history.reduce((m, h) => Math.max(m, h.risk), 0) * 100)}%</div><span className="muted">peak risk</span></div>
                </div>
              </section>
            )}
            {open && <div className="banner info">Emergency access is open until {when(state.override.until)}. Every use is recorded in Activity.</div>}
            {state.paused && <div className="banner info">Sharing is paused. Nobody can see your results until you resume.</div>}
            {soon > 0 && <div className="banner info">{soon} permission{soon === 1 ? "" : "s"} will expire within 7 days. Renew them in Sharing.</div>}
            {poor && <div className="banner">Signal quality is poor, so no results were produced. Check that the wearable is on.</div>}

            <section className="card status hero">
              <Ring tone={tone} label={ringLabel} />
              <div>
                <h2>{tone === "off" ? "Start your wearable to begin" : tone === "bad" ? "Elevated seizure risk right now" : "Everything looks normal"}</h2>
                <p className="muted">{active === 0 ? "You are not sharing anything yet. Nothing leaves this device." : active + " sharing setting" + (active === 1 ? " is" : "s are") + " on. You can change this any time in Sharing."}</p>
                {live && sz && <p className="muted">Last reading {when(sz.t)}.</p>}
                <div className="row">
                  <button className="btn" onClick={() => setLive(!live)}>{live ? "Stop monitoring" : "Start monitoring"}</button>
                  <button className={state.paused ? "btn danger" : "btn ghost"} onClick={() => act({ action: "pause", value: !state.paused })}>{state.paused ? "Resume sharing" : "Pause all sharing"}</button>
                </div>
              </div>
            </section>

            <div className="two">
              <section className="card">
                <h2>Latest readings</h2>
                {Object.keys(own).length === 0 && <p className="muted">No readings yet. Press Start monitoring above.</p>}
                {Object.entries(own).map(([c, f]) => <Reading key={c} cat={c} f={f} why />)}
              </section>
              <section className="card">
                <h2>Signal on this device</h2>
                {sig ? <Wave sig={sig} /> : <p className="muted">The signal appears here once the wearable starts.</p>}
                <p className="muted" style={{ marginTop: 10 }}>This view is the only place raw signal exists.</p>
              </section>
            </div>

            <details className="card">
              <summary>Demo controls</summary>
              <p className="muted">Simulate different brain states and move the clock forward to see permissions expire.</p>
              <div className="row">
                {MODES.map((m) => <button key={m} className="chip" aria-pressed={mode === m} onClick={() => setMode(m)}>{m}</button>)}
              </div>
              <div className="row">
                <button className="btn ghost" onClick={() => act({ action: "advance", days: 31 })}>Skip ahead 31 days</button>
                <span className="muted">Clock offset: {state.offset} days</span>
                <button className="btn ghost" onClick={() => act({ action: "tamper" })}>Simulate log tampering</button>
              </div>
            </details>
          </div>
        )}

        {nav === "sharing" && (
          <div className="stack">
            <div>
              <h1>Sharing</h1>
              <p className="lede">Switch on only what each person needs, and choose how many alerts they get.</p>
              <p className="summary">{summaryText}</p>
              <details className="help">
                <summary>How does sharing work?</summary>
                <p className="muted">Nothing is shared until you switch it on. Each permission ends by itself after the days you pick, so you never forget who has access. Fewer alerts means people only hear about results the system is very sure of. You can stop sharing at any time.</p>
              </details>
            </div>
            <div className="row" style={{ marginTop: 0 }}>
              <span className="muted">Quick setup</span>
              <button className="chip" onClick={() => act({ action: "preset", name: "private" })}>Keep everything private</button>
              <button className="chip" onClick={() => act({ action: "preset", name: "care" })}>Share with my doctor</button>
              <button className="chip" onClick={() => act({ action: "preset", name: "work" })}>Doctor and workplace focus</button>
            </div>
            {!state.consent && <div className="card skeleton" aria-busy="true" />}
            {state.consent && Object.entries(PARTIES).map(([p, label]) => (
              <section className="card party" key={p}>
                <div className="between"><h2>{label}</h2>{Object.values(state.consent[p]).some((r) => r.enabled) && <button className="chip" onClick={() => act({ action: "revoke", party: p })}>Stop sharing with {label.toLowerCase()}</button>}</div>
                <p className="muted">{p === "doctor" ? "Sees results and the reasons behind them." : "Sees results only. Never the reasons, history or how sure the system is."}</p>
                {p === "employer" && (
                  <div className="perm" style={{ borderTop: 0 }}>
                    <label className="switch">
                      <input type="checkbox" checked={state.hours.on} aria-label="Only share during work hours" onChange={(e) => act({ action: "hours", on: e.target.checked })} />
                      <i />
                    </label>
                    <div><h3>Only during work hours</h3><p className="muted">Your employer sees results only between 9:00 and 17:00, never evenings or weekends.</p></div>
                  </div>
                )}
                {Object.keys(CATS).map((c) => {
                  const r = state.consent[p][c];
                  const on = r.enabled && r.expiresAt > state.now;
                  return (
                    <div className="perm" key={c}>
                      <label className="switch">
                        <input type="checkbox" checked={r.enabled} aria-label={"Share " + CATS[c] + " with " + label} onChange={(e) => (e.target.checked && p === "employer" ? setPending({ p, c }) : rule(p, c, { enabled: e.target.checked }))} />
                        <i />
                      </label>
                      <div>
                        <h3>{CATS[c]}</h3>
                        <p className="muted">{MEANING[c]}{p === "employer" && r.enabled ? ". Your employer could weigh this in decisions about your work." : "."}</p>
                        {r.enabled && (
                          <>
                            <div className="seg" role="group" aria-label="Sensitivity">
                              {LEVELS.map(([n, v]) => <button key={n} aria-pressed={nearest(r.threshold) === v} onClick={() => rule(p, c, { threshold: v })}>{n}</button>)}
                            </div>
                            <div className="seg" role="group" aria-label="Duration" style={{ marginLeft: 8 }}>
                              {[7, 30, 90].map((d) => <button key={d} aria-pressed={(r.days || 30) === d} onClick={() => rule(p, c, { days: d })}>{d} days</button>)}
                            </div>
                            <p className="muted" style={{ marginTop: 8 }}>
                              {on ? "Shared until " + day(r.expiresAt) + "." : <span className="alert">Expired</span>}
                              {(() => {
                                const v = state.log.find((l) => l.kind === "view" && l.party === p && l.categories.includes(c));
                                return v ? " Last viewed " + when(v.t) + "." : " Not viewed yet.";
                              })()}
                              {" "}<button className="chip" onClick={() => rule(p, c, { renew: true })}>Renew</button>
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        )}

        {nav === "activity" && (
          <div className="stack">
            <div>
              <h1>Activity</h1>
              <p className="lede">Every alert and every time someone looked at your data.</p>
            </div>
            <section className="card">
              <h2>Seizure risk trend</h2>
              <Trend data={history} />
              <div className="row"><button className="btn ghost" onClick={summary}>Download summary for my doctor</button></div>
            </section>
            <section className="card">
              <h2>Add a note</h2>
              <p className="muted">Record how you felt. Notes appear in your timeline and in the doctor summary.</p>
              <div className="row">
                <input type="text" placeholder="For example, felt dizzy after lunch" onKeyDown={(e) => { if (e.key === "Enter" && note.trim()) { act({ action: "note", text: note }); setNote(""); } }} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
                <button className="btn" onClick={() => { if (note.trim()) { act({ action: "note", text: note }); setNote(""); } }}>Save note</button>
              </div>
            </section>
            <section className="card">
              <h2>Log integrity</h2>
              <p className={state.integrity.ok ? "muted" : "alert"}>{state.integrity.ok ? "Verified. " + state.integrity.count + " entries are chained and unaltered." : "Tampering detected at entry " + (state.integrity.at + 1) + ". The log no longer matches its checksums."}</p>
            </section>
            <section className="card">
              <h2>Timeline</h2>
              <div className="row" style={{ marginTop: 0, marginBottom: 12 }}>{[["all", "All"], ["alerts", "Alerts"], ["views", "Views"], ["sharing", "Sharing changes"], ["notes", "Notes"]].map(([k, l]) => <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}</div>
              {alerts.length + state.log.length + state.notes.length === 0 && <p className="muted">Nothing yet. Alerts and views will appear here.</p>}
              <ul className="tl">
                {[...alerts.map((a) => ({ t: a.t, f: "alerts", k: "al", s: a.text })), ...state.notes.map((n) => ({ t: n.t, f: "notes", k: "", s: "Note: " + n.text })), ...state.log.map((l) => ({ t: l.t, f: l.kind === "override" ? "alerts" : l.kind === "consent" ? "sharing" : "views", k: l.kind === "override" ? "ov" : "", s: l.kind === "override" ? "Emergency access by " + l.party + ". Reason: " + l.reason : l.kind === "consent" ? PARTIES[l.party] + (l.on ? " was given access to " : " lost access to ") + l.categories.map((c) => CATS[c]).join(", ") : PARTIES[l.party] + " viewed " + l.categories.map((c) => CATS[c]).join(", ") }))]
                  .filter((e) => filter === "all" || e.f === filter)
                  .sort((a, b) => b.t - a.t)
                  .map((e, i) => <li key={i} className={e.k}><b>{e.s}</b><div className="muted">{when(e.t)}</div></li>)}
              </ul>
            </section>
          </div>
        )}

        {nav === "preview" && (
          <div className="stack">
            <div>
              <h1>Their view</h1>
              <p className="lede">See exactly what each person sees right now.</p>
            </div>
            <div className="row" style={{ marginTop: 0 }}>
              {[["doctor", "Doctor"], ["employer", "Employer"], ["emergency", "Emergency responder"]].map(([k, l]) => <button key={k} className="chip" aria-pressed={sub === k} onClick={() => setSub(k)}>{l}</button>)}
            </div>
            <section className="card">
              <h2>{sub === "doctor" ? "Doctor's screen" : sub === "employer" ? "Employer's screen" : "Responder's screen"}</h2>
              {sub === "emergency" && (
                <div style={{ marginBottom: 12 }}>
                  <p className="muted">In a real emergency a responder can see your seizure risk for one hour without asking. You are told what was accessed and why.</p>
                  <div className="row"><button className="btn danger" onClick={() => act({ action: "override", reason: "Seizure in public, responder needs current status" })}>Open emergency access</button></div>
                </div>
              )}
              {Object.keys(shared).length === 0 && (
                <>
                  <p className="muted">{sub === "emergency" ? "Emergency access is closed." : "Nothing is shared with them right now."}</p>
                  {sub !== "emergency" && <div className="row"><button className="chip" onClick={() => go("sharing")}>Open sharing settings</button></div>}
                </>
              )}
              {Object.entries(shared).map(([c, f]) => <Reading key={c} cat={c} f={f} why={sub === "doctor"} />)}
            </section>
          </div>
        )}

        {nav === "privacy" && (
          <div className="stack">
            <div>
              <h1>Privacy</h1>
              <p className="lede">Proof of what left your device, and the controls that keep it yours.</p>
            </div>
            <div className="two">
              <section className="card"><div className="counter">{sent}</div><p className="muted">Simple results shared with the app</p></section>
              <section className="card"><div className="counter">0 bytes</div><p className="muted">Raw brain signal has left your device. Only simple results ever do.</p></section>
            </div>
            <section className="card">
              <h2>For the curious</h2>
              <details>
                <summary>See exactly what leaves your device</summary>
                <pre>{payload ? JSON.stringify(payload, null, 2) : "Nothing sent yet."}</pre>
              </details>
            </section>
            <section className="card">
              <h2>Trusted contact</h2>
              <p className="muted">{state.contact.on ? "Notifying " + state.contact.name + " when a high seizure risk is detected." : "Notify someone you trust when a high seizure risk is detected."}</p>
              <div className="row">
                <input type="text" placeholder="Contact name" onKeyDown={(e) => e.key === "Enter" && name.trim() && act({ action: "contact", name, on: true })} value={name} onChange={(e) => setName(e.target.value)} aria-label="Contact name" />
                <button className="btn" onClick={() => act({ action: "contact", name, on: true })}>Save contact</button>
                {state.contact.on && <button className="btn ghost" onClick={() => act({ action: "contact", name: "", on: false })}>Remove {state.contact.name}</button>}
              </div>
            </section>
            <section className="card">
              <h2>Incidental findings</h2>
              <p className="muted">Choose in advance whether you want to hear about patterns you did not ask to be screened for.</p>
              <div className="perm" style={{ borderTop: 0, paddingBottom: 0 }}>
                <label className="switch">
                  <input type="checkbox" checked={state.incidentalOptIn} aria-label="Tell me about incidental findings" onChange={(e) => act({ action: "gate", value: e.target.checked })} />
                  <i />
                </label>
                <p>Tell me about incidental findings</p>
              </div>
            </section>
            <section className="card">
              <h2>Display</h2>
              <div className="perm" style={{ borderTop: 0, paddingTop: 4 }}>
                <label className="switch">
                  <input type="checkbox" checked={big} aria-label="Larger text" onChange={(e) => { setBig(e.target.checked); document.documentElement.style.fontSize = e.target.checked ? "120%" : ""; try { window.localStorage.setItem("nats-big", e.target.checked ? "1" : "0"); } catch {} }} />
                  <i />
                </label>
                <p>Larger text</p>
              </div>
              <h2 style={{ marginTop: 18 }}>Your rules and your data</h2>
              <div className="row">
                <button className="btn ghost" onClick={exportRules}>Export my sharing rules</button>
                <button className="btn ghost" onClick={receipt}>Download consent receipt</button>
                <label className="btn ghost">Import rules<input className="drop" type="file" accept="application/json" onChange={importRules} /></label>
                <button className="btn danger" onClick={() => window.confirm("Erase all readings, alerts and the access log?") && act({ action: "erase" })}>Erase my data</button>
              </div>
            </section>
            <section className="card">
              <h2>How accurate is it?</h2>
              {MODEL.source === "synthetic" && <div className="banner" style={{ marginBottom: 12 }}>These numbers come from synthetic data. Train on the UCI file to replace them.</div>}
              <div className="glance">
                <div><div className="counter">{pct(MODEL.metrics.accuracy)}</div><span className="muted">correct overall</span></div>
                <div><div className="counter">{pct(MODEL.metrics.precision)}</div><span className="muted">alerts that were right</span></div>
                <div><div className="counter">{pct(MODEL.metrics.recall)}</div><span className="muted">seizures caught</span></div>
              </div>
              <p className="muted" style={{ marginTop: 10 }}>Logistic regression on {MODEL.coef.length} signal features, AUC {MODEL.metrics.auc}, {MODEL.metrics.n_test} test windows, source {MODEL.source}, {MODEL.split} split. Focus and incidental labels are rule-based, not trained. Single-channel EEG in one-second windows, not validated on new patients. An alert needs two elevated readings in a row.</p>
              <h2 style={{ marginTop: 18 }}>About this prototype</h2>
              <p className="muted">NATS (Neural Access &amp; Translation System) is a research prototype. It does not diagnose any condition and is not a medical device. Press 1 to 5 to switch screens. Results come from a model trained on simulated data until you train it on real recordings.</p>
              <h2 style={{ marginTop: 18 }}>Coming next</h2>
              {NEXT.map(([t, d]) => <div className="reading" key={t}><div><b>{t}</b><div className="muted">{d}</div></div></div>)}
            </section>
          </div>
        )}
      </main>
      {pending && (
        <div className="overlay" onClick={() => setPending(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg" onClick={(e) => e.stopPropagation()}>
            <h2 id="dlg">Before you share with your employer</h2>
            <p className="muted">They will see {MEANING[pending.c].toLowerCase()}. This could be used in decisions about your work. You can stop at any time, and it expires on its own.</p>
            <div className="row">
              <button className="btn" autoFocus onClick={() => { rule(pending.p, pending.c, { enabled: true }); setPending(null); }}>Share</button>
              <button className="btn ghost" onClick={() => setPending(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      <div className="toast" role="status" aria-live="polite">{toast}{undo && toast && <button className="toastbtn" onClick={() => { undo(); setUndo(null); setToast(""); }}>Undo</button>}</div>
      {tour !== null && (
        <aside className="tour" aria-label="Guided demo">
          <div className="between"><b>Step {tour + 1} of {TOUR.length}</b><button className="chip" onClick={() => setTour(null)}>Close</button></div>
          <h3 style={{ marginTop: 8 }}>{TOUR[tour][0]}</h3>
          <p className="muted">{TOUR[tour][1]}</p>
          <div className="row">
            <button className="btn" onClick={() => { TOUR[tour][2](); if (tour < TOUR.length - 1) setTour(tour + 1); }}>Do this step</button>
            {tour > 0 && <button className="btn ghost" onClick={() => setTour(tour - 1)}>Back</button>}
          </div>
        </aside>
      )}
    </div>
  );
}
