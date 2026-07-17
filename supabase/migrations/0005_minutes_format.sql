-- House-style support: which minutes template a meeting's drafts should follow.
alter table meetings add column if not exists minutes_format text not null default 'standard'
  check (minutes_format in ('standard','maisca'));
