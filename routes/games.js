const express = require('express');
const { getDb } = require('../db/database');
const { shufflePositions } = require('../services/draft-engine');
const { startPickTimer } = require('../services/timer');

const router = express.Router();

function generateGameCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// POST /api/games - Create a new game
router.post('/', (req, res) => {
  const { name, buyIn, pickTimer } = req.body;
  if (!name) return res.status(400).json({ error: 'Game name required' });

  const db = getDb();
  let code;
  // Ensure unique code
  do {
    code = generateGameCode();
  } while (db.prepare('SELECT id FROM games WHERE id = ?').get(code));

  const timerValue = (pickTimer && pickTimer > 0) ? Math.min(Math.max(Math.round(pickTimer), 15), 600) : 180;

  db.prepare('INSERT INTO games (id, name, buy_in, pick_timer) VALUES (?, ?, ?, ?)').run(
    code,
    name,
    buyIn || 0,
    timerValue
  );

  res.json({ gameCode: code, name, buyIn: buyIn || 0, pickTimer: timerValue });
});

// GET /api/games/:code - Get game info
router.get('/:code', (req, res) => {
  const db = getDb();
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.code.toUpperCase());
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const contestants = db
    .prepare('SELECT id, name, draft_position, tiebreaker_score FROM contestants WHERE game_id = ? ORDER BY draft_position')
    .all(game.id);

  const pickCount = db
    .prepare('SELECT COUNT(*) as c FROM draft_picks WHERE game_id = ?')
    .get(game.id);

  res.json({ ...game, contestants, pickCount: pickCount.c });
});

// POST /api/games/:code/start-draft - Start the draft (shuffle positions)
router.post('/:code/start-draft', (req, res) => {
  const db = getDb();
  const code = req.params.code.toUpperCase();
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(code);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  // Atomic status update: only one caller can transition lobby -> drafting
  const statusChange = db.prepare("UPDATE games SET status = 'drafting' WHERE id = ? AND status = 'lobby'").run(code);

  if (statusChange.changes === 0) {
    // Check if already drafting (idempotent)
    const current = db.prepare('SELECT status FROM games WHERE id = ?').get(code);
    if (current && current.status === 'drafting') {
      const updated = db
        .prepare('SELECT id, name, draft_position FROM contestants WHERE game_id = ? ORDER BY draft_position')
        .all(code);
      return res.json({ message: 'Draft started!', contestants: updated });
    }
    return res.status(400).json({ error: 'Game is not in lobby phase' });
  }

  const contestants = db
    .prepare('SELECT id FROM contestants WHERE game_id = ?')
    .all(code);

  if (contestants.length !== 8) {
    // Roll back status since we can't start without 8 players
    db.prepare("UPDATE games SET status = 'lobby' WHERE id = ?").run(code);
    return res.status(400).json({ error: `Need exactly 8 contestants (have ${contestants.length})` });
  }

  // Draw straws - randomly assign draft positions (inside transaction)
  const positions = shufflePositions();

  const updatePos = db.prepare('UPDATE contestants SET draft_position = ? WHERE id = ?');
  const assignPositions = db.transaction(() => {
    contestants.forEach((c, i) => {
      updatePos.run(positions[i], c.id);
    });
  });

  assignPositions();

  // Start the pick timer for the first pick
  startPickTimer(db, code);

  const updated = db
    .prepare('SELECT id, name, draft_position FROM contestants WHERE game_id = ? ORDER BY draft_position')
    .all(code);

  res.json({ message: 'Draft started!', contestants: updated });
});

// POST /api/games/:code/tiebreaker - Submit tiebreaker prediction
router.post('/:code/tiebreaker', (req, res) => {
  const { score } = req.body;
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: 'No token' });
  if (score == null || score < 0) return res.status(400).json({ error: 'Invalid score' });

  const db = getDb();
  const contestant = db
    .prepare('SELECT * FROM contestants WHERE session_token = ? AND game_id = ?')
    .get(token, req.params.code.toUpperCase());

  if (!contestant) return res.status(404).json({ error: 'Contestant not found' });

  db.prepare('UPDATE contestants SET tiebreaker_score = ? WHERE id = ?').run(
    Math.round(score),
    contestant.id
  );

  res.json({ message: 'Tiebreaker saved', score: Math.round(score) });
});

module.exports = router;
