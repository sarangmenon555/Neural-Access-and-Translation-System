import assert from "node:assert/strict";

const B = process.env.BASE_URL || "http://localhost:3000";
const J = { "Content-Type": "application/json" };
const post = (p, b) => fetch(B + p, { method: "POST", headers: J, body: typeof b === "string" ? b : JSON.stringify(b) });
const get = (p) => fetch(B + p).then((r) => r.json());
const rule = (party, category, patch) => post("/api/consent", { action: "rule", party, category, ...patch });
const label = { category: "seizure_risk", value: "elevated", confidence: 0.97, explain: [{ feature: "line length", weight: 0.5 }] };
let n = 0;
const t = async (name, fn) => {
  await fn();
  n++;
  console.log("pass", name);
};

await post("/api/consent", { action: "erase" });
await post("/api/consent", { action: "pause", value: false });
await post("/api/consent", { action: "preset", name: "private" });
await post("/api/consent", { action: "gate", value: true });

await t("rejects a payload carrying a raw signal key", async () => assert.equal((await post("/api/labels", { ...label, signal: [1, 2, 3] })).status, 400));
await t("rejects a bare raw signal array", async () => assert.equal((await post("/api/labels", [1, 2, 3, 4])).status, 400));
await t("rejects oversized bodies", async () => assert.equal((await post("/api/labels", JSON.stringify({ x: "a".repeat(3000) }))).status, 413));
await t("rejects unknown categories", async () => assert.equal((await post("/api/labels", { ...label, category: "mood" })).status, 400));
await t("rejects out-of-range confidence", async () => assert.equal((await post("/api/labels", { ...label, confidence: 7 })).status, 400));
await t("a single elevated reading raises no alert", async () => {
  assert.equal((await post("/api/labels", label)).status, 200);
  assert.equal((await get("/api/labels?role=owner")).alerts.length, 0);
});
await t("two elevated readings in a row raise one alert", async () => {
  await post("/api/labels", label);
  assert.equal((await get("/api/labels?role=owner")).alerts.length, 1);
});
await t("doctor sees nothing without consent", async () => assert.deepEqual((await get("/api/labels?role=doctor")).findings, {}));
await t("doctor sees the label and reasons after consent", async () => {
  await rule("doctor", "seizure_risk", { enabled: true });
  const f = (await get("/api/labels?role=doctor")).findings.seizure_risk;
  assert.equal(f.confidence, 0.97);
  assert.ok(f.explain.length > 0);
});
await t("employer view carries no confidence or reasons", async () => {
  await rule("employer", "seizure_risk", { enabled: true });
  const f = (await get("/api/labels?role=employer")).findings.seizure_risk;
  assert.equal(f.value, "elevated");
  assert.equal(f.confidence, undefined);
  assert.equal(f.explain, undefined);
});
await t("a higher confidence threshold hides the result", async () => {
  await rule("doctor", "seizure_risk", { threshold: 0.99 });
  assert.deepEqual((await get("/api/labels?role=doctor")).findings, {});
  await rule("doctor", "seizure_risk", { threshold: 0.8 });
});
await t("pausing hides everything from third parties", async () => {
  await post("/api/consent", { action: "pause", value: true });
  assert.deepEqual((await get("/api/labels?role=doctor")).findings, {});
  await post("/api/consent", { action: "pause", value: false });
});
await t("emergency access is closed until opened, then label only", async () => {
  assert.deepEqual((await get("/api/labels?role=emergency")).findings, {});
  await post("/api/consent", { action: "override", reason: "test" });
  const f = (await get("/api/labels?role=emergency")).findings.seizure_risk;
  assert.deepEqual(Object.keys(f).sort(), ["t", "value"]);
});
await t("incidental findings are dropped when the user opts out", async () => {
  await post("/api/consent", { action: "gate", value: false });
  const r = await (await post("/api/labels", { category: "incidental", value: "rhythm_irregularity", confidence: 0.8, explain: [] })).json();
  assert.equal(r.dropped, true);
});
await t("the access log verifies, and tampering is detected", async () => {
  assert.equal((await get("/api/consent")).integrity.ok, true);
  await post("/api/consent", { action: "tamper" });
  assert.equal((await get("/api/consent")).integrity.ok, false);
});
await t("permissions expire after the clock moves forward", async () => {
  await post("/api/consent", { action: "erase" });
  await post("/api/labels", label);
  await rule("doctor", "seizure_risk", { enabled: true });
  assert.ok(Object.keys((await get("/api/labels?role=doctor")).findings).length > 0);
  await post("/api/consent", { action: "advance", days: 31 });
  assert.deepEqual((await get("/api/labels?role=doctor")).findings, {});
});

console.log(n + " checks passed");
