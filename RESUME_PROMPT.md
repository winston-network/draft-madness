# Resume Prompt for Draft Madness

Use this when starting a new Claude session. Copy/paste the relevant sections.

---

## Full Context Resume

I'm building **Draft Madness**, a March Madness draft game web app at `/mnt/d/coding_projects/march_madness`. Read `PROJECT_SUMMARY.md` for full details.

**Tech**: Node.js/Express/SQLite backend, vanilla HTML/CSS/JS frontend, SSE for real-time, ESPN API for live scores.

**Current state**: Single-page view (no tab navigation) with dark arena theme and hardwood court floor background. Landing page has toggle between **Import Draft** (primary onboarding — upload .xlsx or Google Sheets URL) and **Demo** mode (1-click game with 7 bots). Import flow: preview overlay shows parsed 8×16 grid with fuzzy match highlighting, then confirm creates an active game. Draft board with round-based layout, team logos filling cells, seed numbers in bottom-right. Sidebar swaps from available teams to inline leaderboard after draft completes. Digital scoreboard font (Orbitron) on all scores. Tournament round simulation for testing. Multiplayer infrastructure built (atomic joins, pick validation, pause/resume) but hidden behind demo mode until tested.

**Deployment**:
- **GitHub**: https://github.com/winston-network/draft-madness (public, `winston-network` org)
- **Replit**: Development/testing server
- **Railway**: Production deployment at `draft-madness-production.up.railway.app`
- **Domain**: `draftmadness2026.com` (DNS via GoDaddy → Railway)

**Key files to read first**:
- `PROJECT_SUMMARY.md` — Full feature list and architecture
- `server.js` — entry point, all route wiring
- `db/schema.sql` — database schema (5 tables)
- `db/database.js` — SQLite init, migrations, 64-team seed (real 2026 bracket)
- `public/index.html` — single-page app (landing + draft + leaderboard, no tabs)
- `public/js/app.js` — all frontend logic
- `public/css/style.css` — full design system (~1500 lines)

**Design decisions**:
- Single-page view: no tab navigation, lobby → draft board → leaderboard flow in one page
- Snake draft: odd rounds forward (1-8), even rounds reverse (8-1)
- Each team can be drafted max 2 times per game (same player can't pick same team twice)
- Scoring: R1/R2/Sweet16=1pt, Elite8/Final4/Championship=2pts
- 3-minute pick timer, auto-picks on expiry, pause/resume support
- Draft board: current round green border, all rounds same cell size, logos fill cells
- After draft completes, sidebar swaps from available teams to inline compact leaderboard
- Available teams: 2x2 grid, green tint=2 picks left, yellow=1 left, faded strikethrough=gone
- Dark arena theme: navy backgrounds, frosted glass cards, orange accents
- Hardwood basketball court floor background (hardwood.svg)
- Chalkboard play diagram style: orange X's, green O's, white arrows (court-pattern.svg)
- Scoreboard aesthetic: Orbitron digital font, red LED round scores, green LED alive count
- Header: centered with basketball-fire SVG + bracket SVG, Russo One font
- Subtitle: "A New Take on March Madness"
- Branding: navy #0d1b2e, orange #f47920, Russo One + Orbitron + Inter fonts

**Replit deploy command**:
```bash
git fetch origin && git reset --hard origin/main && rm -f march_madness.db* && pkill node ; sleep 2 && npm start
```

**Railway**: Auto-deploys from GitHub main branch.

---

## Quick Resume (for small tasks)

Working on Draft Madness at `/mnt/d/coding_projects/march_madness`. Node.js/Express/SQLite web app for March Madness team drafting game. Single-page view (no tabs) with hardwood court background. Landing page toggles between Import Draft (.xlsx/Google Sheets) and Demo mode. Read `PROJECT_SUMMARY.md` for context. GitHub: `winston-network/draft-madness`. Run with `npm start`, test at `http://localhost:3000`. Replit update: `git fetch origin && git reset --hard origin/main && rm -f march_madness.db* && pkill node ; sleep 2 && npm start`

---

## Current TODO / Next Steps

### Priority: Draft Strategy Dashboard
1. **My Picks dashboard** — Personal view of your drafted teams showing seeds, regions, and current status
2. **538 win probabilities** — Integrate FiveThirtyEight tournament projections (not just first game — deep run probabilities through each round)
3. **Upset articles** — Allow submitting reference articles flagging potential upsets to inform draft strategy
4. **Value score advisor** — Recommend which teams to pick based on expected point accumulation (probability × points per round, summed across all rounds)

### Backlog
5. **Test multiplayer** — Iron out Create/Join flow, test with real concurrent users
6. **Flexible player count** — Support 4, 6, or 8 players (adjust rounds/max-per-team)
7. **Production branch** — Strip test toolbar, quick test, dev endpoints
8. **Custom domain** — Finish `draftmadness2026.com` DNS setup (Railway + GoDaddy)
9. **Re-enable Scenarios tab** — Backend is done, just need to add UI back
10. **Admin dashboard** — Manage games, update team database yearly
11. **User accounts** — Replace name+code auth with real accounts
12. **Payment integration** — Buy-in collection
13. **Mobile app** — React Native or Flutter, consuming the same JSON API

---

## How to Test Locally

```bash
cd /mnt/d/coding_projects/march_madness
rm -f march_madness.db*   # fresh database
npm start                  # http://localhost:3000
```

Click "Launch Demo" on the landing page to create a game with 7 bots instantly. Use the floating toolbar to:
- **Bot Picks** — advance bot picks to your turn
- **Auto-Pick All** — complete the entire draft
- **Sim Tourney Round** — simulate a tournament round (click 6 times for full tournament)
- **Reset** — wipe database and start fresh
