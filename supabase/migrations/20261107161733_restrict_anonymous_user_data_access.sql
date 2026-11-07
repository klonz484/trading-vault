-- Prevent Supabase anonymous-auth users from accessing trader-owned data.
-- Existing ownership predicates remain in place; this restrictive policy is an
-- additional guard for permanent email/password accounts only.

create policy "Permanent users only"
on public.brain_change_proposals
as restrictive
for all
to authenticated
using (coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false)
with check (coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false);

create policy "Permanent users only"
on public.chart_scans
as restrictive
for all
to authenticated
using (coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false)
with check (coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false);

create policy "Permanent users only"
on public.core_brain_rules
as restrictive
for all
to authenticated
using (coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false)
with check (coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false);

create policy "Permanent users only"
on public.core_brain_versions
as restrictive
for all
to authenticated
using (coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false)
with check (coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false);

create policy "Permanent users only"
on public.journal_entries
as restrictive
for all
to authenticated
using (coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false)
with check (coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false);

create policy "Permanent users only"
on public.profiles
as restrictive
for all
to authenticated
using (coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false)
with check (coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false);

create policy "Permanent users only"
on public.trades
as restrictive
for all
to authenticated
using (coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false)
with check (coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false);

create policy "Permanent users only"
on public.user_experiments
as restrictive
for all
to authenticated
using (coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false)
with check (coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false);

create policy "Permanent users only"
on storage.objects
as restrictive
for all
to authenticated
using (coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false)
with check (coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false);
