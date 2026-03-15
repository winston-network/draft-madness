# Resume Prompt for Draft Madness

Use this when starting a new Claude session. Copy/paste the relevant sections.

---

## Full Context Resume

I'm building **Draft Madness**, a March Madness draft game web app at `/mnt/d/coding_projects/march_madness`. Read `PROJECT_SUMMARY.md` for full details.

**Tech**: Node.js/Express/SQLite backend, vanilla HTML/CSS/JS frontend, SSE for real-time, ESPN API for live scores.

**Current state**: Core app is functional — game creation, 8-player snake draft with 3-min timer, leaderboard, scenarios engine, bot testing, broadcast-quality UI with March Madness branding. Replit deployment config ready. GitHub repo: `winston-network/draft-madness` (private).

**Key files to read first**:
- `server.js` — entry point, all route wiring
- `db/schema.sql` — database schema (5 tables)
- `public/index.html` — single-page app structure
- `public/js/app.js` — all frontend logic
- `public/css/style.css` — full design system

**Design decisions**:
- Snake draft: odd rounds forward (1-8), even rounds reverse (8-1)
- Each team can be drafted max 2 times per game
- Scoring: R1/R2=1pt, Sweet16/Elite8=2pts, Final4/Championship=4pts
- 3-minute pick timer, auto-picks on expiry
- Draft board shows current round big, previous rounds smaller, future rounds minimal
- Available teams in sidebar, color-coded (green=2 picks left, yellow=1, grey=gone)
- Team logos only appear after being drafted (reduce noise)
- Quick Test Mode creates game + 7 bots for solo testing
- Branding: dark navy (#091f2c), crimson (#da1f26), gold accents, Final Four Indianapolis 2026

---

## Quick Resume (for small tasks)

Working on Draft Madness at `/mnt/d/coding_projects/march_madness`. Node.js/Express/SQLite web app for March Madness team drafting game. Read `PROJECT_SUMMARY.md` for context. Run with `npm start`, test at `http://localhost:3000`.

---

## Current TODO / Next Steps

1. **Deploy to Replit** — GitHub repo needs to be created at `winston-network/draft-madness`, then import to Replit
2. **Admin dashboard** — Manage games, update team database yearly, moderate
3. **Team DB management** — UI to update 64 teams when bracket is announced
4. **Polish draft UX** — Test with real users, iterate on feedback
5. **User accounts** — Replace name+code auth with real accounts
6. **Mobile app** — React Native or Flutter, consuming the same JSON API

---

## How to Test Locally

```bash
cd /mnt/d/coding_projects/march_madness
rm -f march_madness.db  # fresh database
npm start               # http://localhost:3000
```

Use "Quick Test Mode" on the landing page to create a game with 7 bots instantly. Use the floating toolbar to simulate bot picks.
