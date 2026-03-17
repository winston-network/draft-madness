# Draft Madness

A New Take on March Madness — don't get busted!

Draft NCAA tournament teams with your friends, then watch the points roll in as your teams win games throughout the tournament.

## How It Works

1. **Create a game** — get a 6-character code to share
2. **Up to 8 players join** the lobby
3. **Snake draft** — draw straws for order, then draft 16 rounds (each of the 64 teams can be drafted up to 2 times)
4. **Track scores** — points accumulate as your teams win tournament games
5. **Win the pot** — prize pool splits 60/30/10

### Scoring

| Round | Points per win |
|-------|---------------|
| Round 1 (64 → 32) | 1 pt |
| Round 2 (32 → 16) | 1 pt |
| Sweet 16 (16 → 8) | 2 pts |
| Elite 8 (8 → 4) | 2 pts |
| Final Four (4 → 2) | 4 pts |
| Championship (2 → 1) | 4 pts |

Tiebreaker: predict the total combined score of the championship game.

## Tech Stack

- **Backend**: Node.js + Express + SQLite (better-sqlite3, WAL mode)
- **Frontend**: Vanilla HTML/CSS/JS (single-page, no tabs)
- **Real-time**: Server-Sent Events (SSE) for live draft updates
- **Live scores**: ESPN public API polling
- **Design**: Dark arena theme with hardwood court background and digital scoreboard aesthetic

## Running Locally

```bash
npm install
npm start
# Open http://localhost:3000
```

Click **Launch Demo** on the landing page to create a game with 7 bots for instant testing. Use the floating toolbar to simulate bot picks and tournament rounds.

## Deployment

**Production** (Railway — auto-deploys from main):
```
draft-madness-production.up.railway.app
```

**Domain**: `draftmadness2026.com`

**Replit** (dev/testing):
```bash
git fetch origin && git reset --hard origin/main && rm -f march_madness.db* && pkill node ; sleep 2 && npm start
```

## Project Structure

```
server.js              — Express entry point, polling, timer checker
db/schema.sql          — Database schema (5 tables)
db/database.js         — SQLite init, migrations, 64-team seed data
routes/                — API routes (auth, games, draft, scores, test)
services/              — Business logic (draft engine, scoring, timer, ESPN)
public/                — Frontend (single-page app, no tab navigation)
  index.html           — Landing page + draft board + leaderboard (all one view)
  css/style.css        — Dark arena design system (~1500 lines)
  js/app.js            — All UI logic, SSE, countdown
  js/api.js            — API client wrapper
  img/                 — Logos, icons, hardwood background, court pattern
branding/              — Design reference assets (logos, scoreboard, play diagrams)
```

## 2026 Season

Pre-loaded with the real 2026 NCAA tournament bracket — all 64 teams with correct seeds, regions, ESPN IDs, and team colors.
