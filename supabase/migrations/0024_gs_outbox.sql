-- 0024 — GroundStream outbox. Copied verbatim from GS-APP-INTEGRATION-SPEC v1 §6.1.
-- Do not "improve" this per app: the point is that a fix made once applies to all of them.

create table if not exists public.gs_outbox (
  id                bigserial primary key,
  entity            text not null,
  aa_stage          text not null check (aa_stage in
                      ('acquired','engaged','activated','converted','retained')),
  event_name        text not null,
  actor_id          text,
  external_event_id text not null,
  occurred_at       timestamptz not null default now(),
  payload           jsonb not null default '{}'::jsonb,
  attempts          int  not null default 0,
  next_attempt_at   timestamptz not null default now(),
  delivered_at      timestamptz,
  last_error        text,
  created_at        timestamptz not null default now(),
  -- Local idempotency: the same transition enqueued twice is one row, so a
  -- double-submitted form cannot produce two events even before delivery.
  unique (entity, external_event_id)
);

-- Partial index: the drain worker only ever looks at undelivered rows.
create index if not exists gs_outbox_pending_idx
  on public.gs_outbox (next_attempt_at, id) where delivered_at is null;

-- Deny-all: RLS on, NO policies. Nothing holding an anon/authenticated JWT can read or
-- write this table — which is correct, and which is exactly why emit() MUST use the
-- service-role client.
alter table public.gs_outbox enable row level security;
