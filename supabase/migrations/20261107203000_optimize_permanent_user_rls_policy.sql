-- Trading Vault: optimize permanent-user RLS checks with a statement-level JWT init plan.
-- Restricts anonymous Supabase Auth users from accessing permanent trader data.
-- This is an additional restrictive gate; existing owner/user RLS policies remain in force.

BEGIN;

DROP POLICY IF EXISTS "Permanent users only" ON public.profiles;
CREATE POLICY "Permanent users only"
  ON public.profiles
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'::text))::boolean, false) = false)
  WITH CHECK (COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'::text))::boolean, false) = false);

DROP POLICY IF EXISTS "Permanent users only" ON public.chart_scans;
CREATE POLICY "Permanent users only"
  ON public.chart_scans
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'::text))::boolean, false) = false)
  WITH CHECK (COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'::text))::boolean, false) = false);

DROP POLICY IF EXISTS "Permanent users only" ON public.journal_entries;
CREATE POLICY "Permanent users only"
  ON public.journal_entries
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'::text))::boolean, false) = false)
  WITH CHECK (COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'::text))::boolean, false) = false);

DROP POLICY IF EXISTS "Permanent users only" ON public.trades;
CREATE POLICY "Permanent users only"
  ON public.trades
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'::text))::boolean, false) = false)
  WITH CHECK (COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'::text))::boolean, false) = false);

DROP POLICY IF EXISTS "Permanent users only" ON public.user_experiments;
CREATE POLICY "Permanent users only"
  ON public.user_experiments
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'::text))::boolean, false) = false)
  WITH CHECK (COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'::text))::boolean, false) = false);

DROP POLICY IF EXISTS "Permanent users only" ON public.core_brain_versions;
CREATE POLICY "Permanent users only"
  ON public.core_brain_versions
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'::text))::boolean, false) = false)
  WITH CHECK (COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'::text))::boolean, false) = false);

DROP POLICY IF EXISTS "Permanent users only" ON public.core_brain_rules;
CREATE POLICY "Permanent users only"
  ON public.core_brain_rules
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'::text))::boolean, false) = false)
  WITH CHECK (COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'::text))::boolean, false) = false);

DROP POLICY IF EXISTS "Permanent users only" ON public.brain_change_proposals;
CREATE POLICY "Permanent users only"
  ON public.brain_change_proposals
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'::text))::boolean, false) = false)
  WITH CHECK (COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'::text))::boolean, false) = false);

DROP POLICY IF EXISTS "Permanent users only" ON storage.objects;
CREATE POLICY "Permanent users only"
  ON storage.objects
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'::text))::boolean, false) = false)
  WITH CHECK (COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'::text))::boolean, false) = false);

COMMIT;
