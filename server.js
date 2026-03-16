const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb } = require('./db/database');
const { updateScores } = require('./services/espn');
const { checkExpiredPicks } = require('./services/timer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true }));
app.use(express.json());

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

// Teams endpoint
app.get('/api/teams', (req, res) => {
  const db = getDb();
  const teams = db.prepare('SELECT * FROM teams ORDER BY region, seed').all();
  res.json(teams);
});

// Initialize database on startup
getDb();
console.log('Database initialized');

// Poll ESPN for scores every 60 seconds during tournament
let scorePoller = null;
function startScorePoller() {
  if (scorePoller) return;
  scorePoller = setInterval(async () => {
    try {
      const db = getDb();
      const activeGames = db
        .prepare("SELECT COUNT(*) as c FROM games WHERE status = 'active'")
        .get();
      if (activeGames.c > 0) {
        const result = await updateScores(db);
        if (result.updated > 0) {
          console.log(`Updated ${result.updated} tournament results`);
        }
      }
    } catch (err) {
      console.error('Score poll error:', err.message);
    }
  }, 60000);
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
