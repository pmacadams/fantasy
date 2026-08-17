# Draft Room

Live tracking for an in-person fantasy football draft. One person in the room
records picks on a phone; everyone else watches a board that updates itself.

Three screens, no accounts:

| URL | Who uses it | What it does |
| --- | --- | --- |
| `/pick` | the person at the table | Search a name, tap it, pick saved. Undo is one tap. |
| `/draft` | everyone else | Live board, rosters, available players. Read-only, shareable. |
| `/admin` | commissioner | League setup, fixing picks, pause/resume, player pool. |

Each takes a league in the query string: `/draft?l=sunday-money-league`. The
last league used is remembered per browser, so the links are usually bare.

---

## Setup (about ten minutes)

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com). The free tier is
   more than enough — a 12-team draft is under 200 rows.
2. Open **SQL Editor → New query**, paste all of `supabase/schema.sql`, run it.
3. New query again, paste all of `supabase/seed_players.sql`, run it. That loads
   260 players.
4. **Project Settings → API**: copy the Project URL and the `anon` public key.

### 2. Local

```bash
cp .env.local.example .env.local   # paste the two values in
npm install
npm run dev                        # http://localhost:3000
```

### 3. Deploy

The app builds to plain static HTML (`next build` writes an `out/` folder), so
any static host works. `netlify.toml` is already configured — push to GitHub,
import the repo at [netlify.com](https://netlify.com), and add the same two
environment variables under **Site configuration → Environment variables**
before the first deploy. They are read at build time, so a deploy that ran
without them will show the "Connect Supabase" screen until you redeploy.

Vercel works identically with no changes.

### 4. Before draft night

Go to `/admin`, create the league (team names one per line in draft order, pick
a PIN), then hit **Start draft** from `/pick`. Send `/draft?l=your-league` to
the league and `/pick?l=your-league` to whoever is typing.

---

## How the reliability works

The room's Wi-Fi will be bad. Four things are in place for that:

**Picks are atomic and server-authoritative.** The pick screen only ever sends
"this league, this player." The database works out the round, the slot and the
team from the snake order, writes the pick, and advances the clock inside one
transaction with the league row locked. The client never calculates anything
that matters.

**Double taps cannot double-draft.** `draft_picks` has unique constraints on
`(league_id, overall_pick)` and `(league_id, nfl_player_id)`. A second tap, a
retry, or two phones racing each other all collapse into one row — the loser
gets "that player is already drafted" instead of a corrupt board. A ref guard in
the UI stops the second tap before it leaves the phone in the first place.

**Dropped requests retry, rejections don't.** Network failures back off and
retry three times. A real rejection from Postgres (wrong PIN, draft paused,
player gone) surfaces immediately rather than being retried into confusion.

**Realtime has a safety net.** Every screen subscribes to Postgres changes, and
also re-reads the draft every 12 seconds and on window focus. If the websocket
dies quietly — which it will — the board self-repairs within seconds instead of
sitting there looking correct and being wrong.

**Search never hits the network.** The whole player pool loads once and is
searched in memory, so typing stays instant even when the connection doesn't.

## How security works

No accounts, by design. The anon key in the browser can only read. Every write
goes through a `security definer` function that checks the league PIN first, and
the PIN lives in `league_secrets`, a table with row-level security on and no read
policy at all — it is unreachable from the browser.

So: anyone with the board link can watch, and only someone with the PIN can
change anything. A 4-digit PIN is not real security; it is a defence against the
wrong person tapping a name, which is the actual threat model on draft night.

## Updating the player pool

The seed reflects rosters as of August 2026 with the published 2026 bye weeks,
ordered by a reasonable overall ranking. **Check it before you draft** — training
camp moves players, and the ordering is a starting point, not a projection.

Two ways to refresh:

- **Paste a CSV** into Manage draft → Player pool. Header row required, with at
  least `name,position,nfl_team`; `bye_week`, `rank`, `adp` and `pos_rank` are
  used if present. Any ranking export works after you rename the columns.
- **Edit the file**: change `data/players.json` (entries are
  `["Name", "POS", "TEAM"]`, in overall order), run `npm run players`, and paste
  the regenerated `supabase/seed_players.sql`.

Both are upserts keyed on a slug of the player's name, so a player who is already
drafted keeps his square on the board.

## Layout

```
supabase/schema.sql          tables, RLS, and every write function
supabase/seed_players.sql    generated — do not edit by hand
data/players.json            the pool you actually edit
scripts/build-players.mjs    players.json + 2026 byes -> seed SQL

src/lib/snake.ts             snake order, mirrored from the DB function
src/lib/search.ts            in-memory ranked player search
src/lib/useDraft.ts          realtime state, polling net, derived board data
src/lib/supabase.ts          client, retry, error translation

src/components/Scoreboard.tsx      round/pick/on-the-clock header + snake rail
src/components/PlayerSearch.tsx    tap-to-draft list
src/components/DraftBoard.tsx      the wall chart
src/components/AvailablePlayers.tsx  sidebar with filters and sorting
src/components/Rosters.tsx         roster panel + pick history
src/components/Gates.tsx           league resolution, PIN gate, empty states

src/app/pick/                the draft room screen
src/app/draft/               the remote board
src/app/admin/               setup and corrections
netlify.toml                 build command, publish dir, cache headers
```

## Design notes

Dark, flat, no gradients. Type does the work: Barlow Condensed for scoreboard
numerals, Archivo for names, IBM Plex Mono with tabular figures so the pick
counter doesn't wobble as it ticks. Positions get one desaturated colour each,
carried by a single CSS variable so badges, board cells and roster rails always
agree.

The one flourish is the snake rail under the scoreboard: a tick per draft slot,
drawn in the direction the current round actually runs, filled as picks land. It
answers "how far away am I" without reading a number, and it's the only thing on
the page that moves.
