create table if not exists meta_snapshots (
  id bigserial primary key,
  report_date date not null,
  page_id text not null,
  ad_account_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists ai_reports (
  id bigserial primary key,
  report_date date not null,
  report_text text not null,
  snapshot_id bigint references meta_snapshots(id),
  created_at timestamptz not null default now()
);

create table if not exists line_users (
  source_id text primary key,
  source_type text not null,
  display_name text,
  last_seen_at timestamptz not null default now()
);

create index if not exists meta_snapshots_report_date_idx
  on meta_snapshots (report_date desc);

create index if not exists ai_reports_report_date_idx
  on ai_reports (report_date desc);
