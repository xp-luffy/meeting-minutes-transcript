-- 0035 — deleting an account must not be blocked by an organisation it created.
--
-- organisations.created_by had no ON DELETE action, so removing a user who had
-- ever created an organisation failed on a foreign key violation. That is a
-- problem the day someone asks to be deleted: the organisation must outlive the
-- individual, which is the same principle as the leaver rule.
--
-- SET NULL, not CASCADE. CASCADE would delete an entire firm's statutory
-- records because the person who happened to sign up first closed their account.

alter table public.organisations drop constraint if exists organisations_created_by_fkey;
alter table public.organisations
  add constraint organisations_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;
