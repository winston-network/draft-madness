# Draft Madness — Project Summary

## What Is This?
A web app for a March Madness draft game. 8 contestants draft NCAA tournament teams via snake draft, then earn points as their teams win games. Built as a proof-of-concept web app, intended to eventually become a mobile app + web version.

## Game Rules
- **8 contestants per game**, must be exactly 8
- **Snake draft**: Draw straws for order (1-8), then snake (1-8, 8-1, 1-8...) for 16 rounds
- **64 NCAA teams** available, each can be drafted **max 2 times**
- Each contestant ends up with **16 teams**
- **Scoring per team win**: R1=1pt, R2=1pt, Sweet16=2pts, Elite8=2pts, Final4=4pts, Championship=4pts
- **Tiebreaker**: Predict total combined score of championship game (submitted before tournament starts)
- **Prize pool**: Variable buy-in agreed by all contestants, split 60/30/10 for 1st/2nd/3rd
- **Draft timer**: 3 minutes per pick, auto-picks random team on expiry

## Tech Stack
- **Backend**: Node.js + Express + SQLite (better-sqlite3, WAL mode)
- **Frontend**: Vanilla HTML/CSS/JS (no framework)
- **Real-time**: Server-Sent Events (SSE) for live draft updates
- **Live scores**: ESPN public API polling (every 60s during tournament)
- **Auth**: Simple name + game code (session token in localStorage)
- **Deployment**: Replit (live), GitHub repo: `winston-network/draft-madness` (public)

## Project Structure
```
march_madness/
├── server.js                  # Express entry, polling, timer checker
├── package.json
├── .replit / replit.nix        # Replit deployment config
├── db/
│   ├── schema.sql             # 5 tables: games, contestants, teams, draft_picks, tournament_results
│   └── database.js            # SQLite init, migrations, 64-team seed (REAL 2026 bracket)
├── routes/
│   ├── auth.js                # Join game, get current user
│   ├── games.js               # Create game, start draft, tiebreaker
│   ├── draft.js               # Draft state, make pick, SSE stream, timer endpoint
│   ├── scores.js              # Leaderboard, scenarios
│   └── test.js                # Bot testing endpoints (disabled in production)
├── services/
│   ├── draft-engine.js        # Snake order, pick validation
│   ├── scoring.js             # Points calculation, prize distribution
│   ├── scenarios.js           # Final Four/Championship what-if calculator (backend only, tab hidden)
│   ├── timer.js               # Pick countdown, auto-pick on expiry
│   └── espn.js                # ESPN API integration for live scores
└── public/
    ├── index.html             # Single-page app: landing → draft + leaderboard tabs
    ├── css/style.css          # Full design system (~1100 lines)
    ├── js/api.js              # API client wrapper
    ├── js/app.js              # All UI logic, draft rendering, countdown
    └── img/
        ├── logo-v2.svg        # Clean basketball + typography logo
        └── favicon.svg        # App icon
```

## Key Features Built
- [x] Game creation with unique 6-char codes
- [x] 8-player lobby with join/wait flow (hidden tab, backend works)
- [x] Snake draft with straw drawing
- [x] 3-minute pick timer with auto-pick
- [x] Real-time SSE updates during draft
- [x] Round-based draft board (current round big/green, previous smaller, future minimal)
- [x] Horizontal round numbers on left side
- [x] Available teams 2x2 region grid (East/West top, South/Midwest bottom)
- [x] Color-coded availability (green dot=2 left, amber dot=1 left, strikethrough=gone)
- [x] Teams stay in seed order even when fully drafted
- [x] Team logos (ESPN CDN) shown only after drafting
- [x] Team primary colors and ESPN IDs in database
- [x] Real 2026 NCAA tournament bracket (all 64 teams with correct seeds/regions)
- [x] Leaderboard with prize pool display (60/30/10 split)
- [x] Team detail expansion (click contestant to see their teams)
- [x] Scenarios engine (Final Four / Championship what-if) — backend ready, tab hidden
- [x] ESPN API live score polling
- [x] Quick Test Mode (1-click game with 7 bots)
- [x] Bot simulation toolbar (advance to your turn, auto-complete draft)
- [x] Tournament simulation for testing leaderboard
- [x] Real Unsplash basketball arena photo background on landing
- [x] Frosted glass dark cards with gold focus states
- [x] Indianapolis 2026 Final Four theming
- [x] Mobile-responsive design
- [x] Replit deployment config
- [x] GitHub repo with automated push workflow

## What's NOT Built Yet
- [ ] Admin dashboard (manage games, update teams, moderate)
- [ ] Team database management UI (update 64 teams each year)
- [ ] Payment/buy-in collection
- [ ] User accounts (currently name + game code only)
- [ ] Push notifications
- [ ] Draft chat/messaging
- [ ] Historical stats / past games
- [ ] Scenarios tab (backend done, need to re-enable UI)
- [ ] Mobile app (React Native / Flutter)
- [ ] First Four game results (4 TBD slots in bracket)

## Branding
- **Name**: Draft Madness
- **Colors**: Dark navy (#091f2c), Crimson (#da1f26), Orange accent (#ff6b35), Gold (#f5c842)
- **Theme**: 2026 Final Four, Indianapolis, Lucas Oil Stadium
- **Font**: Inter (Google Fonts)
- **Style**: Real photo background, frosted glass UI, broadcast aesthetic
- **Logo**: Clean realistic basketball + bold chrome/crimson typography

## Deployment
- **GitHub**: https://github.com/winston-network/draft-madness (public)
- **Replit**: Import from GitHub, run `npm start`
- **Replit update command**: `git reset --hard origin/main && rm -f march_madness.db* && pkill node ; sleep 2 && npm start`
- **Local**: `rm -f march_madness.db* && npm start` → http://localhost:3000
