const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const proxyPath = path.join(process.cwd(), "src", "proxy.ts");
const proxySource = fs.readFileSync(proxyPath, "utf8");
const scannerRoutePath = path.join(process.cwd(), "src", "app", "api", "scanner", "analyze", "route.ts");
const scannerRouteSource = fs.readFileSync(scannerRoutePath, "utf8");

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

test("chart analysis API independently enforces the configured owner identity", () => {
  assert.match(scannerRouteSource, /process\.env\.TRADING_VAULT_OWNER_USER_ID/);
  assert.match(scannerRouteSource, /if \(!ownerUserId\)[\s\S]*?jsonError\([^\n]*, 503\)/);
  assert.match(scannerRouteSource, /if \(user\.id !== ownerUserId\)[\s\S]*?jsonError\([^\n]*, 403\)/);
  assert.ok(scannerRouteSource.indexOf("user.id !== ownerUserId") < scannerRouteSource.indexOf("process.env.GROQ_API_KEY"));
});
