import W from "../data/weights.json";
import { features } from "./signal.mjs";
import { FEATURES } from "./schema";

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r2 = (v) => Math.round(v * 100) / 100;

export function decode(x) {
  const f = features(x);
  if (!(f[0] >= 2)) return [];
  const parts = f.map((v, i) => ((v - W.mean[i]) / W.scale[i]) * W.coef[i]);
  const p = sigmoid(parts.reduce((a, b) => a + b, W.intercept));
  const total = parts.reduce((a, b) => a + Math.abs(b), 0) || 1;
  const explain = parts
    .map((v, i) => ({ feature: FEATURES[i], weight: r2(v / total) }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, 4);
  const out = [
    {
      category: "seizure_risk",
      value: p >= 0.5 ? "elevated" : "low",
      confidence: r2(p >= 0.5 ? p : 1 - p),
      explain
    }
  ];
  const zcr = f[3];
  out.push({
    category: "focus_level",
    value: zcr < 0.1 ? "low" : "normal",
    confidence: r2(clamp(0.5 + Math.abs(zcr - 0.1) * 8, 0.55, 0.99)),
    explain: [{ feature: "zero-crossing rate", weight: 1 }]
  });
  const ratio = f[2] / (f[0] || 1);
  if (ratio > 7 && p < 0.5) {
    out.push({
      category: "incidental",
      value: "rhythm_irregularity",
      confidence: r2(clamp(0.6 + (ratio - 7) / 10, 0.6, 0.99)),
      explain: [
        { feature: "peak-to-peak range", weight: 0.6 },
        { feature: "amplitude spread", weight: 0.4 }
      ]
    });
  }
  return out;
}
