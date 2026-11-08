const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
const anonymousGate = fs.readFileSync(
  path.join(migrationsDir, "20261107161733_restrict_anonymous_user_data_access.sql"),
  "utf8",
);
const optimizedGate = fs.readFileSync(
  path.join(migrationsDir, "20261107203000_optimize_permanent_user_rls_policy.sql"),
  "utf8",
);
const tables = [
  "profiles",
  "chart_scans",
  "journal_entries",
  "trades",
  "user_experiments",
  "core_brain_versions",
  "core_brain_rules",
  "brain_change_proposals",
];

test("anonymous-user restrictions cover every private and shared Brain table", () => {
  for (const table of tables) {
    assert.match(anonymousGate, new RegExp(`ON public\\.${table}\\b`));
  }
  assert.match(anonymousGate, /ON storage\.objects/);
  assert.match(anonymousGate, /AS RESTRICTIVE/);
  assert.match(anonymousGate, /TO authenticated/);
  assert.match(anonymousGate, /is_anonymous/);
  assert.match(anonymousGate, /WITH CHECK/);
});

test("optimized RLS migration evaluates JWT once per statement", () => {
  assert.match(optimizedGate, /\(SELECT auth\.jwt\(\)\)/);
  assert.doesNotMatch(optimizedGate, /auth\.jwt\(\)\s*->/);
  for (const table of [...tables, "storage\\.objects"]) {
    assert.match(optimizedGate, new RegExp(`ON (?:public\\.)?${table}\\b`));
  }
  assert.match(optimizedGate, /AS RESTRICTIVE/);
  assert.match(optimizedGate, /WITH CHECK/);
});


const scannerRateLimit = fs.readFileSync(
  path.join(migrationsDir, "20261108100000_add_scanner_rate_limit.sql"),
  "utf8",
);

test("scanner rate-limit migration uses invoker rights and user-scoped RLS", () => {
  assert.match(scannerRateLimit, /CREATE TABLE IF NOT EXISTS public\.scanner_rate_limit_events/);
  assert.match(scannerRateLimit, /ALTER TABLE public\.scanner_rate_limit_events ENABLE ROW LEVEL SECURITY/);
  assert.match(scannerRateLimit, /FOR SELECT[\s\S]*?USING \(\(SELECT auth\.uid\(\)\) = user_id\)/);
  assert.match(scannerRateLimit, /FOR INSERT[\s\S]*?WITH CHECK/);
  assert.match(scannerRateLimit, /FOR DELETE[\s\S]*?created_at < pg_catalog\.now\(\) - interval '1 hour'/);
  assert.match(scannerRateLimit, /SECURITY INVOKER/);
  assert.doesNotMatch(scannerRateLimit, /SECURITY DEFINER/);
  assert.match(scannerRateLimit, /pg_catalog\.pg_advisory_xact_lock/);
  assert.match(scannerRateLimit, /INSERT INTO public\.scanner_rate_limit_events/);
  assert.match(scannerRateLimit, /GRANT EXECUTE ON FUNCTION public\.consume_scanner_rate_limit\(integer, integer\) TO authenticated/);
  assert.match(scannerRateLimit, /FROM PUBLIC, anon/);
  assert.match(scannerRateLimit, /GRANT SELECT, INSERT, DELETE ON TABLE public\.scanner_rate_limit_events TO authenticated/);
});
