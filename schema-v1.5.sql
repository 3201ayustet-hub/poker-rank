-- Poker Rank v1.5 / Supabase schema
-- Existing horse-bet-battle tables are untouched. All tables use poker_* prefix.
create extension if not exists pgcrypto;

create table if not exists public.poker_players (
  id uuid primary key default gen_random_uuid(), name text not null, member_no integer, my_hand text,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists poker_players_member_no_key on public.poker_players(member_no) where member_no is not null;

create table if not exists public.poker_sessions (
  id uuid primary key default gen_random_uuid(), session_date date not null default current_date, name text,
  status text not null default 'open' check(status in ('open','closed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.poker_games (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.poker_sessions(id) on delete cascade,
  game_number integer not null, starting_stack integer not null check(starting_stack>0),
  status text not null default 'playing' check(status in ('playing','finished')), reentry_open boolean not null default true,
  started_at timestamptz not null default now(), finished_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(session_id,game_number)
);

create table if not exists public.poker_game_players (
  id uuid primary key default gen_random_uuid(), game_id uuid not null references public.poker_games(id) on delete cascade,
  player_id uuid not null references public.poker_players(id) on delete cascade, current_stack integer not null default 0 check(current_stack>=0),
  is_active boolean not null default true, final_rank integer, elimination_order integer, reentry_count integer not null default 0 check(reentry_count>=0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(game_id,player_id)
);

create table if not exists public.poker_breaks (
  id uuid primary key default gen_random_uuid(), game_id uuid not null references public.poker_games(id) on delete cascade,
  break_number integer not null, recorded_at timestamptz not null default now(), created_at timestamptz not null default now(), unique(game_id,break_number)
);

create table if not exists public.poker_stack_records (
  id uuid primary key default gen_random_uuid(), game_id uuid not null references public.poker_games(id) on delete cascade,
  game_player_id uuid not null references public.poker_game_players(id) on delete cascade,
  break_id uuid references public.poker_breaks(id) on delete cascade,
  record_type text not null check(record_type in ('start','break','reentry','out','final')), stack integer check(stack is null or stack>=0),
  recorded_at timestamptz not null default now(), created_at timestamptz not null default now()
);

create table if not exists public.poker_events (
  id uuid primary key default gen_random_uuid(), game_id uuid not null references public.poker_games(id) on delete cascade,
  game_player_id uuid references public.poker_game_players(id) on delete cascade,
  event_type text not null check(event_type in ('game_start','break','out','reentry','reentry_closed','game_finished')),
  value_integer integer, note text, created_at timestamptz not null default now()
);

create index if not exists poker_games_session_id_idx on public.poker_games(session_id);
create index if not exists poker_game_players_game_id_idx on public.poker_game_players(game_id);
create index if not exists poker_game_players_player_id_idx on public.poker_game_players(player_id);
create index if not exists poker_breaks_game_id_idx on public.poker_breaks(game_id);
create index if not exists poker_stack_records_game_id_idx on public.poker_stack_records(game_id);
create index if not exists poker_stack_records_game_player_id_idx on public.poker_stack_records(game_player_id);
create index if not exists poker_events_game_id_idx on public.poker_events(game_id);

create or replace function public.poker_set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='poker_players_set_updated_at') then create trigger poker_players_set_updated_at before update on public.poker_players for each row execute function public.poker_set_updated_at(); end if;
  if not exists(select 1 from pg_trigger where tgname='poker_sessions_set_updated_at') then create trigger poker_sessions_set_updated_at before update on public.poker_sessions for each row execute function public.poker_set_updated_at(); end if;
  if not exists(select 1 from pg_trigger where tgname='poker_games_set_updated_at') then create trigger poker_games_set_updated_at before update on public.poker_games for each row execute function public.poker_set_updated_at(); end if;
  if not exists(select 1 from pg_trigger where tgname='poker_game_players_set_updated_at') then create trigger poker_game_players_set_updated_at before update on public.poker_game_players for each row execute function public.poker_set_updated_at(); end if;
end $$;

alter table public.poker_players enable row level security;
alter table public.poker_sessions enable row level security;
alter table public.poker_games enable row level security;
alter table public.poker_game_players enable row level security;
alter table public.poker_breaks enable row level security;
alter table public.poker_stack_records enable row level security;
alter table public.poker_events enable row level security;

grant usage on schema public to anon;
grant select,insert,update,delete on public.poker_players,public.poker_sessions,public.poker_games,public.poker_game_players,public.poker_breaks,public.poker_stack_records,public.poker_events to anon;

do $$ declare t text; begin
  foreach t in array array['poker_players','poker_sessions','poker_games','poker_game_players','poker_breaks','poker_stack_records','poker_events'] loop
    execute format('drop policy if exists %I on public.%I',t||'_anon_all',t);
    execute format('create policy %I on public.%I for all to anon using (true) with check (true)',t||'_anon_all',t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['poker_players','poker_sessions','poker_games','poker_game_players','poker_breaks','poker_stack_records','poker_events'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;

select table_name from information_schema.tables where table_schema='public' and table_name like 'poker_%' order by table_name;
