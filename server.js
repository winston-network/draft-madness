const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb } = require('./db/database');
const { updateScores, shouldPollNow } = require('./services/espn');
const { checkExpiredPicks } = require('./services/timer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

// Cache-bust: replace __BUILD__ in HTML with startup timestamp
const fs = require('fs');
const BUILD_ID = Date.now().toString(36);
app.get('/', (req, res) => {
  const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  res.type('html').send(html.replace(/__BUILD__/g, BUILD_ID));
});

app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/games', require('./routes/games'));
app.use('/api/draft', require('./routes/draft'));
app.use('/api/scores', require('./routes/scores'));
app.use('/api/test', require('./routes/test'));
app.use('/api/import', require('./routes/import'));

// Teams endpoint
app.get('/api/teams', (req, res) => {
  const db = getDb();
  const teams = db.prepare('SELECT * FROM teams ORDER BY region, seed').all();
  res.json(teams);
});

// Initialize database on startup
getDb();
console.log('Database initialized');

// Smart ESPN score polling — only polls during game windows
let scorePollerTimeout = null;
function startScorePoller() {
  if (scorePollerTimeout) return;

  async function pollCycle() {
    try {
      const db = getDb();
      const activeGames = db
        .prepare("SELECT COUNT(*) as c FROM games WHERE status IN ('active', 'complete')")
        .get();

      if (activeGames.c > 0) {
        // First poll always fetches schedule so we know the day's game times
        const decision = shouldPollNow();

        if (decision.shouldPoll) {
          const result = await updateScores(db);
          if (result.updated > 0) {
            console.log(`ESPN: updated ${result.updated} results`);
          }
          const s = result.schedule;
          if (s) {
            console.log(`ESPN: ${s.completedGames}/${s.totalGames} games final${s.gamesInProgress ? ' (LIVE)' : ''}`);
          }
        } else {
          // Still fetch schedule periodically so we know when games start
          if (!decision.schedule) {
            await updateScores(db); // initial schedule fetch
          }
          console.log(`ESPN: skipping poll — ${decision.reason}`);
        }

        const nextMs = decision.nextCheckMs || 10 * 60 * 1000;
        const mins = Math.round(nextMs / 60000);
        console.log(`ESPN: next check in ${mins} min`);
        scorePollerTimeout = setTimeout(pollCycle, nextMs);
      } else {
        // No active games in our app, check again in 5 minutes
        scorePollerTimeout = setTimeout(pollCycle, 5 * 60 * 1000);
      }
    } catch (err) {
      console.error('Score poll error:', err.message);
      scorePollerTimeout = setTimeout(pollCycle, 10 * 60 * 1000);
    }
  }

  // First poll after 10 seconds (let server start up)
  scorePollerTimeout = setTimeout(pollCycle, 10000);
}

// Check for expired draft pick timers every 5 seconds
let timerChecker = null;
function startTimerChecker() {
  if (timerChecker) return;
  timerChecker = setInterval(() => {
    try {
      checkExpiredPicks(getDb());
    } catch (err) {
      console.error('Timer check error:', err.message);
    }
  }, 5000);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Draft Madness running at http://0.0.0.0:${PORT}`);
  startScorePoller();
  startTimerChecker();
});
