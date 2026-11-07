/* eslint-disable @typescript-eslint/no-require-imports -- Node's built-in test runner uses CommonJS in this .cjs test file. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const proxyPath = path.join(process.cwd(), "src", "proxy.ts");
const proxySource = fs.readFileSync(proxyPath, "utf8");

test("protected requests require a verified owner claim", () => {
  assert.match(proxySource, /await supabase\.auth\.getClaims\(\)/);
  assert.match(proxySource, /claims\?\.sub === ownerUserId/);
  assert.match(proxySource, /if \(!isOwner\)/);
});

test("missing Supabase configuration fails closed for protected pages", () => {
  assert.match(proxySource, /if \(!supabaseUrl \|\| !supabasePublishableKey\)/);
  assert.match(proxySource, /owner_config_missing/);
  assert.match(proxySource, /NextResponse\.redirect\(loginUrl\)/);
});

test("missing Supabase configuration rejects API requests with 503", () => {
  assert.match(proxySource, /pathname\.startsWith\("\/api\/"\)[\s\S]*?status: 503/);
});

test("configured API requests reject non-owner sessions", () => {
  assert.match(proxySource, /if \(!isOwner\)[\s\S]*?pathname\.startsWith\("\/api\/"\)[\s\S]*?status: ownerUserId \? 401 : 503/);
});

test("signup routes always redirect to login", () => {
  const signupGuards = proxySource.match(/pathname === "\/signup" \|\| pathname\.startsWith\("\/signup\/"\)/g) || [];
  assert.equal(signupGuards.length, 2, "signup must be blocked both with and without Supabase configuration");
  assert.match(proxySource, /NextResponse\.redirect\(new URL\("\/login", request\.url\)\)/);
});

test("login and password recovery routes remain public", () => {
  for (const route of ["/login", "/forgot-password", "/reset-password", "/auth/callback"]) {
    assert.ok(proxySource.includes(`pathname === "${route}"`), `${route} must remain reachable without an owner session`);
  }
});

test("non-owner protected-page redirects preserve the requested destination", () => {
  assert.match(proxySource, /loginUrl\.searchParams\.set\("next", pathname \+ request\.nextUrl\.search\)/);
});

test("auth cookies are forwarded when redirecting unauthenticated users", () => {
  assert.match(proxySource, /supabaseResponse\.cookies\.getAll\(\)\.forEach\(\(cookie\) => \{\s*redirect\.cookies\.set\(cookie\);/);
});

test("matcher applies the security proxy broadly while excluding static assets", () => {
  assert.match(proxySource, /matcher:\s*\[/);
  assert.match(proxySource, /_next\/static\|_next\/image/);
});

const scannerApiPath = path.join(process.cwd(), "src", "app", "api", "scanner", "analyze", "route.ts");
const scannerApiSource = fs.readFileSync(scannerApiPath, "utf8");

test("scanner analysis API fails closed when owner configuration is missing", () => {
  assert.match(scannerApiSource, /const ownerUserId = process\.env\.TRADING_VAULT_OWNER_USER_ID/);
  assert.match(scannerApiSource, /Owner access is not configured[\s\S]*?503/);
});

test("scanner analysis API requires an authenticated owner", () => {
  assert.match(scannerApiSource, /await supabase\.auth\.getUser\(\)/);
  assert.match(scannerApiSource, /if \(authError \|\| !user\)[\s\S]*?401/);
  assert.match(scannerApiSource, /if \(user\.id !== ownerUserId\)[\s\S]*?403/);
});



test("scanner endpoint is observation-only and cannot return trade signals", () => {
  assert.match(scannerApiSource, /assessment: null/);
  assert.match(scannerApiSource, /brainStatus: "NOT_CONNECTED"/);
  assert.match(scannerApiSource, /contextOnlyNotSignal: true/);
  assert.doesNotMatch(scannerApiSource, /const DECISIONS = new Set/);
});
