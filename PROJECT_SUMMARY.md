# Draft Madness — Project Summary

## What Is This?
A web app for a March Madness draft game. Up to 8 contestants draft NCAA tournament teams via snake draft, then earn points as their teams win games. Built as a proof-of-concept web app, intended to eventually become a mobile app + web version.

**Tagline**: "A new take on March Madness brackets — don't get busted!"

## Game Rules
- **8 contestants per game** (4 and 6 player modes planned)
- **Snake draft**: Draw straws for order (1-8), then snake (1-8, 8-1, 1-8...) for 16 rounds
- **64 NCAA teams** available, each can be drafted **max 2 times** (same player can't pick same team twice)
- Each contestant ends up with **16 teams**
- **Scoring per team win**: R1=1pt, R2=1pt, Sweet16=2pts, Elite8=2pts, Final4=4pts, Championship=4pts
- **Tiebreaker**: Predict total combined score of championship game
- **Prize pool**: Variable buy-in, split 60/30/10 for 1st/2nd/3rd
- **Draft timer**: 3 minutes per pick, auto-picks on expiry, pause/resume available

## Tech Stack
- **Backend**: Node.js + Express + SQLite (better-sqlite3, WAL mode)
- **Frontend**: Vanilla HTML/CSS/JS (no framework)
- **Real-time**: Server-Sent Events (SSE) for live draft updates + lobby join notifications
- **Live scores**: ESPN public API polling (every 60s during tournament)
- **Auth**: Simple name + game code (session token in localStorage)
- **Fonts**: Inter (body), Russo One (header title), Orbitron (scoreboard numbers)
- **Deployment**: Railway (production), Replit (dev), GitHub repo

## Project Structure
```
march_madness/
├── server.js                  # Express entry, polling, timer checker
├── package.json
├── db/
│   ├── schema.sql             # 5 tables: games, contestants, teams, draft_picks, tournament_results
│   └── database.js            # SQLite init, migrations, 64-team seed (real 2026 bracket)
├── routes/
│   ├── auth.js                # Join game (atomic 8-player limit), get current user
│   ├── games.js               # Create game, start draft (idempotent), tiebreaker
│   ├── draft.js               # Draft state, make pick (atomic), SSE stream, timer, pause/resume
│   ├── scores.js              # Leaderboard, scenarios
│   └── test.js                # Bot testing endpoints (disabled in production)
├── services/
│   ├── draft-engine.js        # Snake order, pick validation (prevents same player drafting same team)
│   ├── scoring.js             # Points calculation, prize distribution
│   ├── scenarios.js           # Final Four/Championship what-if calculator
│   ├── timer.js               # Pick countdown, auto-pick, pause/resume support
│   └── espn.js                # ESPN API integration for live scores
├── branding/
│   ├── DraftMadness_logo.jpg  # Main logo
│   ├── scoreboard.png         # Scoreboard design reference
│   └── xando.png              # Court pattern design reference
└── public/
    ├── index.html             # Single-page app: landing → draft + leaderboard
    ├── css/style.css          # Full dark arena design system (~1500 lines)
    ├── js/api.js              # API client wrapper
    ├── js/app.js              # All UI logic, draft rendering, countdown, SSE
    └── img/
        ├── logo-main.jpg      # Landing page logo
        ├── basketball-fire.svg # Header icon
        ├── bracket.svg        # Header bracket illustration
        ├── court-pattern.png  # Background texture (whiteboard X's and O's)
        ├── favicon.svg        # App icon
        ├── logo-v2.svg        # Legacy logo
        └── logo.svg           # Legacy logo
```

## Key Features Built
- [x] Game creation with unique 6-char codes
- [x] 8-player lobby with join/wait flow and SSE live updates
- [x] Snake draft with straw drawing
- [x] 3-minute pick timer with auto-pick on expiry
- [x] Pause/resume draft timer
- [x] Real-time SSE updates during draft with heartbeat (25s)
- [x] Atomic race condition protection (joins, picks, start-draft)
- [x] Double-click prevention on picks (frontend + backend)
- [x] Round-based draft board (current round green border, logos fill cells)
- [x] Sidebar swaps to inline leaderboard after draft completes
- [x] Available teams 2x2 region grid with color-coded availability
- [x] Same player can't draft same team twice
- [x] Bots can't draft same team twice
- [x] Team logos (ESPN CDN) shown after drafting, fill cell in previous rounds
- [x] Real 2026 NCAA tournament bracket (64 teams with seeds/regions/ESPN IDs/colors)
- [x] Scoreboard-style leaderboard (Orbitron font, LED glow effects, tight spacing)
- [x] Compact sidebar leaderboard (abbreviated round headers)
- [x] Team detail expansion (click contestant to see their teams)
- [x] Scenarios engine — backend ready, tab hidden
- [x] ESPN API live score polling
- [x] Demo mode (1-click game with 7 bots)
- [x] Bot simulation toolbar (bot picks, auto-complete draft, sim tournament rounds)
- [x] Tournament round simulation with seed-weighted results
- [x] Dark arena theme: navy backgrounds, frosted glass cards, orange accents
- [x] Centered header with basketball-fire + bracket SVGs, Russo One font
- [x] Court pattern background (whiteboard X's and O's, blurred overlay)
- [x] Shareable game links with ?code= auto-fill (hidden behind demo for now)
- [x] Mobile-responsive design
- [x] Railway production deployment
- [x] GitHub repo with automated push workflow

## What's NOT Built Yet
- [ ] Flexible player count (4/6/8 players)
- [ ] Production branch (strip dev tools)
- [ ] Admin dashboard
- [ ] User accounts (currently name + game code only)
- [ ] Payment/buy-in collection
- [ ] Push notifications
- [ ] Draft chat/messaging
- [ ] Historical stats / past games
- [ ] Scenarios tab UI (backend done)
- [ ] Mobile app (React Native / Flutter)
- [ ] First Four game results (4 TBD slots in bracket)

## Branding
- **Name**: Draft Madness
- **Tagline**: "A new take on March Madness brackets — don't get busted!"
- **Colors**: Navy #0d1b2e, Orange #f47920, Gold #f5c842
- **Theme**: Dark arena / scoreboard aesthetic
- **Fonts**: Inter (body), Russo One (header), Orbitron (scores/numbers)
- **Style**: Dark backgrounds, frosted glass UI, digital scoreboard numbers, court pattern overlay

## Deployment
- **GitHub**: https://github.com/winston-network/draft-madness (public)
- **Railway**: Auto-deploys from main branch → `draft-madness-production.up.railway.app`
- **Domain**: `draftmadness2026.com` (GoDaddy DNS → Railway)
- **Replit**: Dev/testing server
- **Replit update command**:
  ```bash
  git fetch origin && git reset --hard origin/main && rm -f march_madness.db* && pkill node ; sleep 2 && npm start
  ```
- **Local**: `rm -f march_madness.db* && npm start` → http://localhost:3000
