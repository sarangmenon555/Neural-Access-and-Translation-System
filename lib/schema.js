export const CATEGORIES = {
  seizure_risk: ["elevated", "low"],
  focus_level: ["low", "normal"],
  incidental: ["rhythm_irregularity"]
};

export const FEATURES = ["amplitude spread", "line length", "peak-to-peak range", "zero-crossing rate", "delta power", "theta power", "alpha power", "beta power", "gamma power"];

const KEYS = ["category", "value", "confidence", "explain"];

export function validate(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  const keys = Object.keys(b);
  if (keys.length !== KEYS.length || !KEYS.every((k) => keys.includes(k))) return null;
  const allowed = CATEGORIES[b.category];
  if (!allowed || !allowed.includes(b.value)) return null;
  if (typeof b.confidence !== "number" || !(b.confidence >= 0 && b.confidence <= 1)) return null;
  if (!Array.isArray(b.explain) || b.explain.length > FEATURES.length) return null;
  for (const e of b.explain) {
    if (!e || Object.keys(e).length !== 2) return null;
    if (!FEATURES.includes(e.feature)) return null;
    if (typeof e.weight !== "number" || Math.abs(e.weight) > 1) return null;
  }
  return { category: b.category, value: b.value, confidence: b.confidence, explain: b.explain };
}
