-- ============================================================================
-- DRAFT ROOM — schema
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: it drops and recreates functions, but never drops your data.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- tables ----

create table if not exists public.leagues (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  rounds        int  not null default 16 check (rounds between 1 and 30),
  team_count    int  not null default 12 check (team_count between 2 and 24),
  status        text not null default 'setup'
                check (status in ('setup', 'live', 'paused', 'complete')),
  current_pick  int  not null default 1 check (current_pick >= 1),
  created_at    timestamptz not null default now()
);

-- The PIN lives in its own table with no read policy, so it is unreachable from
-- the browser even though every other league column is public.
create table if not exists public.league_secrets (
  league_id uuid primary key references public.leagues(id) on delete cascade,
  pin       text not null
);

create table if not exists public.fantasy_teams (
  id             uuid primary key default gen_random_uuid(),
  league_id      uuid not null references public.leagues(id) on delete cascade,
  name           text not null,
  draft_position int  not null check (draft_position >= 1),
  unique (league_id, draft_position)
);

-- Player ids are stable text slugs ("jamarr-chase") so the dataset can be
-- re-imported later without orphaning picks that already reference a player.
create table if not exists public.nfl_players (
  id        text primary key,
  name      text not null,
  position  text not null check (position in ('QB','RB','WR','TE','K','DST')),
  nfl_team  text not null,
  bye_week  int,
  rank      int,
  adp       numeric(5,1),
  pos_rank  text
);

create table if not exists public.draft_picks (
  id              uuid primary key default gen_random_uuid(),
  league_id       uuid not null references public.leagues(id) on delete cascade,
  fantasy_team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  nfl_player_id   text not null references public.nfl_players(id),
  overall_pick    int  not null,
  round           int  not null,
  round_pick      int  not null,
  created_at      timestamptz not null default now(),
  -- These two constraints are the whole reliability story. A double-tap or a
  -- retried request can never create a second pick.
  unique (league_id, overall_pick),
  unique (league_id, nfl_player_id)
);

create index if not exists draft_picks_league_idx  on public.draft_picks (league_id, overall_pick);
create index if not exists fantasy_teams_league_idx on public.fantasy_teams (league_id, draft_position);
create index if not exists nfl_players_rank_idx     on public.nfl_players (rank);

-- ------------------------------------------------------------- security ----
-- Everything is world-readable (anyone with the board link can watch).
-- Nothing is world-writable: there are no insert/update/delete policies, so the
-- anon key cannot write directly. All writes go through the security-definer
-- functions below, which check the league PIN first.

alter table public.leagues        enable row level security;
alter table public.league_secrets enable row level security;
alter table public.fantasy_teams enable row level security;
alter table public.nfl_players   enable row level security;
alter table public.draft_picks   enable row level security;

drop policy if exists "read leagues"  on public.leagues;
drop policy if exists "read teams"    on public.fantasy_teams;
drop policy if exists "read players"  on public.nfl_players;
drop policy if exists "read picks"    on public.draft_picks;

create policy "read leagues" on public.leagues       for select using (true);
create policy "read teams"   on public.fantasy_teams for select using (true);
create policy "read players" on public.nfl_players   for select using (true);
create policy "read picks"   on public.draft_picks   for select using (true);

-- league_secrets deliberately has no policy of any kind: unreachable from anon.

-- -------------------------------------------------------- snake helpers ----

-- Which draft position is on the clock at a given overall pick.
create or replace function public.snake_position(p_overall int, p_team_count int)
returns int language sql immutable as $$
  select case
    when ((p_overall - 1) / p_team_count) % 2 = 0
      then ((p_overall - 1) % p_team_count) + 1                 -- odd round: 1 -> N
      else p_team_count - ((p_overall - 1) % p_team_count)      -- even round: N -> 1
  end;
$$;

create or replace function public.assert_pin(p_league uuid, p_pin text)
returns public.leagues language plpgsql security definer set search_path = public as $$
declare
  l     public.leagues;
  v_pin text;
begin
  select * into l from public.leagues where id = p_league for update;
  if not found then
    raise exception 'League not found' using errcode = 'P0002';
  end if;
  select pin into v_pin from public.league_secrets where league_id = p_league;
  if v_pin is distinct from p_pin then
    raise exception 'Wrong PIN' using errcode = '28000';
  end if;
  return l;
end $$;

-- ------------------------------------------------------------ make_pick ----
-- The only function the draft room ever calls. Takes a league and a player,
-- works out whose turn it is server-side, writes the pick, advances the clock.
-- The row lock in assert_pin serialises concurrent callers.

create or replace function public.make_pick(p_league uuid, p_player text, p_pin text)
returns public.draft_picks
language plpgsql security definer set search_path = public as $$
declare
  l       public.leagues;
  v_round int;
  v_rpick int;
  v_pos   int;
  v_team  uuid;
  v_pick  public.draft_picks;
  v_total int;
begin
  l := public.assert_pin(p_league, p_pin);

  if l.status <> 'live' then
    raise exception 'Draft is %, not live', l.status using errcode = 'P0001';
  end if;

  v_total := l.rounds * l.team_count;
  if l.current_pick > v_total then
    raise exception 'Draft is already complete' using errcode = 'P0001';
  end if;

  v_round := ((l.current_pick - 1) / l.team_count) + 1;
  v_rpick := l.current_pick - (v_round - 1) * l.team_count;
  v_pos   := public.snake_position(l.current_pick, l.team_count);

  select id into v_team
    from public.fantasy_teams
   where league_id = p_league and draft_position = v_pos;

  if v_team is null then
    raise exception 'No team in draft slot %', v_pos using errcode = 'P0002';
  end if;

  insert into public.draft_picks
    (league_id, fantasy_team_id, nfl_player_id, overall_pick, round, round_pick)
  values
    (p_league, v_team, p_player, l.current_pick, v_round, v_rpick)
  returning * into v_pick;

  update public.leagues
     set current_pick = l.current_pick + 1,
         status = case when l.current_pick + 1 > v_total then 'complete' else status end
   where id = p_league;

  return v_pick;
end $$;

-- ------------------------------------------------------ undo_last_pick ----

create or replace function public.undo_last_pick(p_league uuid, p_pin text)
returns public.draft_picks
language plpgsql security definer set search_path = public as $$
declare
  l      public.leagues;
  v_pick public.draft_picks;
begin
  l := public.assert_pin(p_league, p_pin);

  select * into v_pick
    from public.draft_picks
   where league_id = p_league
   order by overall_pick desc
   limit 1;

  if not found then
    raise exception 'Nothing to undo' using errcode = 'P0002';
  end if;

  delete from public.draft_picks where id = v_pick.id;

  update public.leagues
     set current_pick = v_pick.overall_pick,
         status = case when l.status = 'complete' then 'live' else l.status end
   where id = p_league;

  return v_pick;
end $$;

-- Lets the commissioner screen say "wrong PIN" before the first pick, rather
-- than failing on it.
create or replace function public.verify_pin(p_league uuid, p_pin text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_pin text;
begin
  select pin into v_pin from public.league_secrets where league_id = p_league;
  return v_pin is not distinct from p_pin;
end $$;

-- --------------------------------------------------------- league setup ----

create or replace function public.create_league(
  p_name text, p_rounds int, p_team_names text[], p_pin text
) returns public.leagues
language plpgsql security definer set search_path = public as $$
declare
  l    public.leagues;
  slug text;
  i    int;
begin
  if coalesce(trim(p_pin), '') = '' then
    raise exception 'A PIN is required' using errcode = 'P0001';
  end if;
  if array_length(p_team_names, 1) is null or array_length(p_team_names, 1) < 2 then
    raise exception 'Add at least two teams' using errcode = 'P0001';
  end if;

  slug := regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g');
  slug := trim(both '-' from slug);
  if slug = '' then slug := 'league'; end if;
  if exists (select 1 from public.leagues where public.leagues.slug = slug) then
    slug := slug || '-' || substr(md5(random()::text), 1, 4);
  end if;

  insert into public.leagues (slug, name, rounds, team_count, status)
  values (slug, trim(p_name), p_rounds, array_length(p_team_names, 1), 'setup')
  returning * into l;

  insert into public.league_secrets (league_id, pin) values (l.id, p_pin);

  for i in 1 .. array_length(p_team_names, 1) loop
    insert into public.fantasy_teams (league_id, name, draft_position)
    values (l.id, trim(p_team_names[i]), i);
  end loop;

  return l;
end $$;

-- --------------------------------------------------------------- admin ----

create or replace function public.set_status(p_league uuid, p_status text, p_pin text)
returns public.leagues
language plpgsql security definer set search_path = public as $$
declare l public.leagues;
begin
  l := public.assert_pin(p_league, p_pin);
  if p_status not in ('setup','live','paused','complete') then
    raise exception 'Unknown status %', p_status using errcode = 'P0001';
  end if;
  update public.leagues set status = p_status where id = p_league returning * into l;
  return l;
end $$;

create or replace function public.rename_team(p_team uuid, p_name text, p_pin text)
returns public.fantasy_teams
language plpgsql security definer set search_path = public as $$
declare
  v_league uuid;
  t public.fantasy_teams;
begin
  select league_id into v_league from public.fantasy_teams where id = p_team;
  if v_league is null then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;
  perform public.assert_pin(v_league, p_pin);
  update public.fantasy_teams set name = trim(p_name) where id = p_team returning * into t;
  return t;
end $$;

-- Reorder the whole board before the draft starts. p_team_ids is in draft order.
create or replace function public.reorder_teams(p_league uuid, p_team_ids uuid[], p_pin text)
returns setof public.fantasy_teams
language plpgsql security definer set search_path = public as $$
declare
  l public.leagues;
  i int;
begin
  l := public.assert_pin(p_league, p_pin);
  if exists (select 1 from public.draft_picks where league_id = p_league) then
    raise exception 'Picks already exist — clear the draft before reordering'
      using errcode = 'P0001';
  end if;
  -- park them out of the way so the unique index does not trip mid-shuffle
  update public.fantasy_teams set draft_position = draft_position + 1000
   where league_id = p_league;
  for i in 1 .. array_length(p_team_ids, 1) loop
    update public.fantasy_teams set draft_position = i
     where id = p_team_ids[i] and league_id = p_league;
  end loop;
  return query select * from public.fantasy_teams
                where league_id = p_league order by draft_position;
end $$;

-- Overwrite (or fill) any slot on the board. Used by Manage draft.
create or replace function public.set_pick(
  p_league uuid, p_overall int, p_player text, p_pin text
) returns public.draft_picks
language plpgsql security definer set search_path = public as $$
declare
  l       public.leagues;
  v_round int;
  v_rpick int;
  v_team  uuid;
  v_pick  public.draft_picks;
begin
  l := public.assert_pin(p_league, p_pin);

  if p_overall < 1 or p_overall > l.rounds * l.team_count then
    raise exception 'Pick % is outside this draft', p_overall using errcode = 'P0001';
  end if;

  v_round := ((p_overall - 1) / l.team_count) + 1;
  v_rpick := p_overall - (v_round - 1) * l.team_count;

  select id into v_team from public.fantasy_teams
   where league_id = p_league
     and draft_position = public.snake_position(p_overall, l.team_count);

  -- free the slot and release the player from wherever else he sits
  delete from public.draft_picks
   where league_id = p_league
     and (overall_pick = p_overall or nfl_player_id = p_player);

  insert into public.draft_picks
    (league_id, fantasy_team_id, nfl_player_id, overall_pick, round, round_pick)
  values (p_league, v_team, p_player, p_overall, v_round, v_rpick)
  returning * into v_pick;

  if p_overall >= l.current_pick then
    update public.leagues set current_pick = p_overall + 1 where id = p_league;
  end if;

  return v_pick;
end $$;

create or replace function public.remove_pick(p_league uuid, p_overall int, p_pin text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_pin(p_league, p_pin);
  delete from public.draft_picks where league_id = p_league and overall_pick = p_overall;
end $$;

-- Move the clock by hand (rarely needed; undo covers the normal case).
create or replace function public.set_current_pick(p_league uuid, p_overall int, p_pin text)
returns public.leagues
language plpgsql security definer set search_path = public as $$
declare l public.leagues;
begin
  l := public.assert_pin(p_league, p_pin);
  update public.leagues
     set current_pick = greatest(1, least(p_overall, l.rounds * l.team_count + 1))
   where id = p_league returning * into l;
  return l;
end $$;

-- Replace the player pool. Rows already referenced by a pick are updated, never
-- deleted, so a mid-draft refresh can't orphan the board.
create or replace function public.import_players(p_rows jsonb, p_pin text, p_league uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public.assert_pin(p_league, p_pin);
  insert into public.nfl_players (id, name, position, nfl_team, bye_week, rank, adp, pos_rank)
  select r->>'id', r->>'name', r->>'position', r->>'nfl_team',
         nullif(r->>'bye_week','')::int, nullif(r->>'rank','')::int,
         nullif(r->>'adp','')::numeric, nullif(r->>'pos_rank','')
    from jsonb_array_elements(p_rows) r
  on conflict (id) do update set
    name = excluded.name, position = excluded.position, nfl_team = excluded.nfl_team,
    bye_week = excluded.bye_week, rank = excluded.rank,
    adp = excluded.adp, pos_rank = excluded.pos_rank;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- grants ----

grant execute on function
  public.make_pick(uuid, text, text),
  public.undo_last_pick(uuid, text),
  public.verify_pin(uuid, text),
  public.create_league(text, int, text[], text),
  public.set_status(uuid, text, text),
  public.rename_team(uuid, text, text),
  public.reorder_teams(uuid, uuid[], text),
  public.set_pick(uuid, int, text, text),
  public.remove_pick(uuid, int, text),
  public.set_current_pick(uuid, int, text),
  public.import_players(jsonb, text, uuid),
  public.snake_position(int, int)
to anon, authenticated;

revoke execute on function public.assert_pin(uuid, text) from anon, authenticated;

-- -------------------------------------------------------------- realtime ----

-- Re-runnable: adding a table that is already published raises an error.
do $$
declare t text;
begin
  foreach t in array array['draft_picks', 'leagues', 'fantasy_teams'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
