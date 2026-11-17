import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateSignal, features } from "../lib/signal.mjs";

const negatives = ["rest", "focused", "drowsy", "irregular"];
const X = [];
const y = [];
for (let i = 0; i < 2000; i++) {
  const pos = i % 5 === 4;
  X.push(features(generateSignal(pos ? "seizure" : negatives[i % 4])));
  y.push(pos ? 1 : 0);
}
const n = X[0].length;
const train = 1500;
const mean = Array.from({ length: n }, (_, j) => X.slice(0, train).reduce((a, r) => a + r[j], 0) / train);
const scale = Array.from({ length: n }, (_, j) => Math.sqrt(X.slice(0, train).reduce((a, r) => a + (r[j] - mean[j]) ** 2, 0) / train) || 1);
const Z = X.map((r) => r.map((v, j) => (v - mean[j]) / scale[j]));
let w = Array(n).fill(0);
let b = 0;
const score = (z) => z.reduce((a, v, j) => a + v * w[j], b);
const prob = (z) => 1 / (1 + Math.exp(-score(z)));
for (let e = 0; e < 600; e++) {
  const gw = Array(n).fill(0);
  let gb = 0;
  for (let i = 0; i < train; i++) {
    const d = prob(Z[i]) - y[i];
    Z[i].forEach((v, j) => (gw[j] += d * v));
    gb += d;
  }
  w = w.map((v, j) => v - (0.1 * (gw[j] + 0.01 * v * train)) / train);
  b -= (0.1 * gb) / train;
}
let tp = 0;
let fp = 0;
let fn = 0;
let tn = 0;
const pos = [];
const neg = [];
for (let i = train; i < X.length; i++) {
  const s = score(Z[i]);
  (y[i] ? pos : neg).push(s);
  const p = s >= 0 ? 1 : 0;
  if (p && y[i]) tp++;
  else if (p) fp++;
  else if (y[i]) fn++;
  else tn++;
}
let wins = 0;
for (const a of pos) for (const c of neg) wins += a > c ? 1 : a === c ? 0.5 : 0;
const m = X.length - train;
const out = {
  source: "synthetic",
  mean,
  scale,
  coef: w,
  intercept: b,
  metrics: {
    accuracy: (tp + tn) / m,
    precision: tp / (tp + fp || 1),
    recall: tp / (tp + fn || 1),
    auc: Math.round((wins / (pos.length * neg.length)) * 1000) / 1000,
    confusion: { tp, fp, fn, tn },
    n_test: m
  }
};
writeFileSync(fileURLToPath(new URL("../data/weights.json", import.meta.url)), JSON.stringify(out, null, 2));
console.log(out.metrics);
