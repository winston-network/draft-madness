# Resume Prompt for Draft Madness

Use this when starting a new Claude session. Copy/paste the relevant sections.

---

## Full Context Resume

I'm building **Draft Madness**, a March Madness draft game web app at `/mnt/d/coding_projects/march_madness`. Read `PROJECT_SUMMARY.md` for full details.

**Tech**: Node.js/Express/SQLite backend, vanilla HTML/CSS/JS frontend, SSE for real-time, ESPN API for live scores.

**Current state**: Core draft and leaderboard are functional and deployed on Replit. Real 2026 NCAA tournament bracket loaded (all 64 teams). Draft board has round-based layout with green current round, 2x2 available teams grid, ESPN team logos. Landing page uses real Unsplash basketball arena photo with frosted glass cards.

**GitHub**: https://github.com/winston-network/draft-madness (public, `winston-network` org)

**Key files to read first**:
- `PROJECT_SUMMARY.md` — Full feature list and architecture
- `server.js` — entry point, all route wiring
- `db/schema.sql` — database schema (5 tables)
- `db/database.js` — team seed data (real 2026 bracket)
- `public/index.html` — single-page app (landing + draft + leaderboard tabs; lobby/scenarios hidden)
- `public/js/app.js` — all frontend logic
- `public/css/style.css` — full design system (~1100 lines)

**Design decisions**:
- Snake draft: odd rounds forward (1-8), even rounds reverse (8-1)
- Each team can be drafted max 2 times per game
- Scoring: R1/R2=1pt, Sweet16/Elite8=2pts, Final4/Championship=4pts
- 3-minute pick timer, auto-picks on expiry
- Draft board: current round big with green border, previous rounds smaller, future minimal
- Round numbers horizontal on left side (not vertical text)
- Available teams: 2x2 grid (East/West top, South/Midwest bottom), no scroll
- Color-coded: green dot=2 picks left, amber=1 left, strikethrough=gone, all stay in seed order
- Team logos only appear after being drafted
- Lobby tab hidden (backend works), Scenarios tab hidden (backend works)
- Landing: real Unsplash basketball photo background, dark frosted glass cards
- Branding: dark navy #091f2c, crimson #da1f26, gold #f5c842

**Deployment workflow**:
1. Make changes locally
2. `git add -A && git commit -m "message" && git push origin main`
3. On Replit Shell: `git reset --hard origin/main && rm -f march_madness.db* && pkill node ; sleep 2 && npm start`

---

## Quick Resume (for small tasks)

Working on Draft Madness at `/mnt/d/coding_projects/march_madness`. Node.js/Express/SQLite web app for March Madness team drafting game. Read `PROJECT_SUMMARY.md` for context. GitHub: `winston-network/draft-madness`. Run with `npm start`, test at `http://localhost:3000`.

---

## Current TODO / Next Steps

1. **First Four results** — Update 4 TBD bracket slots after First Four games play
2. **Leaderboard polish** — Test with simulated tournament data, improve visuals
3. **Re-enable Scenarios tab** — Backend is done, just need to add tab back to nav
4. **Admin dashboard** — Manage games, update team database yearly
5. **User accounts** — Replace name+code auth with real accounts
6. **Payment integration** — Buy-in collection
7. **Mobile app** — React Native or Flutter, consuming the same JSON API

---

## How to Test Locally

```bash
cd /mnt/d/coding_projects/march_madness
rm -f march_madness.db*   # fresh database
npm start                  # http://localhost:3000
```

Use "Quick Test Mode" on the landing page to create a game with 7 bots instantly. Use the floating toolbar to simulate bot picks.

To simulate tournament results for leaderboard testing:
```bash
# After creating a test game and completing draft, run the tournament simulation
# (see the node -e script in conversation history that inserts fake tournament_results)
```
