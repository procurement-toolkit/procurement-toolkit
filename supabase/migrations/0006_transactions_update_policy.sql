-- trySyncAndRecord() (src/lib/actions/transactions.ts) updates
-- ecount_sync_status/ecount_ref_no on a transaction right after inserting it,
-- using the same authenticated-user client as the insert. There was no
-- UPDATE policy on transactions at all, so that write was silently dropped
-- by RLS (0 rows affected, no error) — every transaction stayed stuck on
-- the PENDING default regardless of what actually happened with E-Count.
-- This mirrors the existing unrestricted INSERT policy.
--
-- (Applied live to the Supabase project on 2026-09-09; this file brings the
-- migration history in the repo back in sync with that.)
create policy "field users update transactions"
  on transactions for update
  using (true)
  with check (true);
