export const FS = 173.61;
export const N = 178;
export const MODES = ["rest", "focused", "interictal", "irregular", "seizure", "disconnected"];

function gauss() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function generateSignal(mode) {
  const out = new Array(N);
  const ph = Math.random() * 6.283;
  const s = (f, t, p) => Math.sin(2 * Math.PI * f * t + p);
  for (let i = 0; i < N; i++) {
    const t = i / FS;
    if (mode === "disconnected") out[i] = 0.4 * gauss();
    else if (mode === "focused") out[i] = 14 * s(20, t, ph) + 10 * s(12, t, 0) + 9 * gauss();
    else if (mode === "drowsy") out[i] = 45 * s(5.5, t, ph) + 6 * gauss();
    else if (mode === "seizure") out[i] = 150 * s(3, t, ph) + 60 * s(9, t, ph) + 25 * gauss();
    else out[i] = 32 * s(10, t, ph) + 8 * gauss();
  }
  if (mode === "irregular") {
    for (let k = 0; k < 3; k++) out[Math.floor(Math.random() * N)] += (Math.random() < 0.5 ? -1 : 1) * 180;
  }
  return out;
}

export function features(x) {
  const n = x.length;
  let m = 0;
  for (const v of x) m += v;
  m /= n;
  let ss = 0;
  let ll = 0;
  let mx = -Infinity;
  let mn = Infinity;
  let zc = 0;
  for (let i = 0; i < n; i++) {
    const d = x[i] - m;
    ss += d * d;
    if (x[i] > mx) mx = x[i];
    if (x[i] < mn) mn = x[i];
    if (i > 0) {
      ll += Math.abs(x[i] - x[i - 1]);
      if (d * (x[i - 1] - m) < 0) zc++;
    }
  }
  const bands = [0, 0, 0, 0, 0];
  let total = 0;
  for (let k = 1; k <= 46; k++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const a = (-2 * Math.PI * k * i) / n;
      re += (x[i] - m) * Math.cos(a);
      im += (x[i] - m) * Math.sin(a);
    }
    const f = (k * FS) / n;
    const pw = re * re + im * im;
    bands[f < 4 ? 0 : f < 8 ? 1 : f < 13 ? 2 : f < 30 ? 3 : 4] += pw;
    total += pw;
  }
  return [Math.sqrt(ss / n), ll / (n - 1), mx - mn, zc / (n - 1), ...bands.map((b) => b / (total || 1))];
}
