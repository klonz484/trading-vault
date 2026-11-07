/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/scanner/analyze/route.ts"), "utf8");
const history = fs.readFileSync(path.join(process.cwd(), "src/app/history/page.tsx"), "utf8");
const contracts = fs.readFileSync(path.join(process.cwd(), "src/lib/scanner/contracts.ts"), "utf8");

test("original screenshots are stored in the private chart-images bucket", () => {
  assert.match(route, /storage\.from\("chart-images"\)\.upload/);
  assert.match(route, /contentType: mimeType/);
  assert.match(route, /upsert: false/);
  assert.match(contracts, /storagePath: string/);
});

test("successful observation packets are saved to the existing chart_scans table", () => {
  assert.match(route, /from\("chart_scans"\)\.insert/);
  assert.match(route, /user_id: user\.id/);
  assert.match(route, /image_path: storagePath/);
  assert.match(route, /analysis: \{ observation: packet, brainStatus: "NOT_CONNECTED" \}/);
});

test("failed database writes clean up only the newly uploaded image", () => {
  assert.match(route, /if \(saveError\)[\s\S]*?storage\.from\("chart-images"\)\.remove\(\[storagePath\]\)/);
});

test("scan history reads owner-scoped Supabase rows rather than browser local storage", () => {
  assert.match(history, /createClient\(\)/);
  assert.match(history, /from\("chart_scans"\)/);
  assert.match(history, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.doesNotMatch(history, /localStorage|readLocalList|writeLocalList/);
});
