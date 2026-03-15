const express = require('express');
const { getDb } = require('../db/database');
const { validatePick, getCurrentPick, generateSnakeOrder } = require('../services/draft-engine');
const { startPickTimer, getTimeRemaining } = require('../services/timer');

const router = express.Router();

// SSE connections per game
const sseClients = new Map();

function broadcastToGame(gameCode, data) {
  const clients = sseClients.get(gameCode) || [];
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach((res) => {
    try { res.write(msg); } catch (_) { /* client disconnected */ }
  });
}

// GET /api/draft/:code/stream - SSE stream for live draft updates
router.get('/:code/stream', (req, res) => {
  const code = req.params.code.toUpperCase();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('\n');

  if (!sseClients.has(code)) sseClients.set(code, []);
  sseClients.get(code).push(res);

  req.on('close', () => {
    const clients = sseClients.get(code) || [];
    sseClients.set(code, clients.filter((c) => c !== res));
  });
});

// GET /api/draft/:code/state - Current draft state
router.get('/:code/state', (req, res) => {
  const db = getDb();
  const code = req.params.code.toUpperCase();

  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(code);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const picks = db
    .prepare(
      `SELECT dp.*, t.name as team_name, t.seed, t.region, t.logo_url, t.primary_color, c.name as contestant_name
       FROM draft_picks dp
       JOIN teams t ON t.id = dp.team_id
       JOIN contestants c ON c.id = dp.contestant_id
       WHERE dp.game_id = ?
       ORDER BY dp.pick_number`
    )
    .all(code);

  const pickCount = picks.length;
  const currentPick = getCurrentPick(pickCount);

  // Get who's up
  let currentContestant = null;
  if (!currentPick.isComplete) {
    currentContestant = db
      .prepare('SELECT id, name FROM contestants WHERE game_id = ? AND draft_position = ?')
      .get(code, currentPick.draftPosition);
  }

  // Available teams
  const available = db
    .prepare(
      `SELECT t.*, COUNT(dp.id) as times_drafted
       FROM teams t
       LEFT JOIN draft_picks dp ON dp.team_id = t.id AND dp.game_id = ?
       GROUP BY t.id
       HAVING times_drafted < 2
       ORDER BY t.seed, t.region`
    )
    .all(code);

  res.json({
    game,
    picks,
    currentPick,
    currentContestant,
    availableTeams: available,
  });
});

// POST /api/draft/:code/pick - Make a draft pick
router.post('/:code/pick', (req, res) => {
  const { teamId } = req.body;
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: 'No token' });

  const db = getDb();
  const code = req.params.code.toUpperCase();

  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(code);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status !== 'drafting') {
    return res.status(400).json({ error: 'Draft is not active' });
  }

  const contestant = db
    .prepare('SELECT * FROM contestants WHERE session_token = ? AND game_id = ?')
    .get(token, code);
  if (!contestant) return res.status(401).json({ error: 'Not in this game' });

  const validation = validatePick(db, code, contestant.id, teamId);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  // Make the pick
  db.prepare(
    'INSERT INTO draft_picks (game_id, contestant_id, team_id, pick_number, round) VALUES (?, ?, ?, ?, ?)'
  ).run(code, contestant.id, teamId, validation.pickNumber, validation.round);

  // Check if draft is complete
  const newPickCount = db
    .prepare('SELECT COUNT(*) as c FROM draft_picks WHERE game_id = ?')
    .get(code);

  const nextPick = getCurrentPick(newPickCount.c);
  if (nextPick.isComplete) {
    db.prepare("UPDATE games SET status = 'active' WHERE id = ?").run(code);
  }

  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);

  // Broadcast to all SSE clients
  broadcastToGame(code, {
    type: 'pick',
    pick: {
      contestantName: contestant.name,
      contestantId: contestant.id,
      teamName: team.name,
      teamId: team.id,
      seed: team.seed,
      region: team.region,
      pickNumber: validation.pickNumber,
      round: validation.round,
    },
    nextPick: nextPick.isComplete ? null : nextPick,
    draftComplete: nextPick.isComplete,
  });

  // Start timer for the next pick
  if (!nextPick.isComplete) {
    startPickTimer(db, code);
  }

  res.json({ success: true, pick: validation.pickNumber, team: team.name });
});

// GET /api/draft/:code/timer - Get current pick timer
router.get('/:code/timer', (req, res) => {
  const db = getDb();
  const code = req.params.code.toUpperCase();

  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(code);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const timer = getTimeRemaining(db, code);
  res.json(timer);
});

module.exports = router;
module.exports.broadcastToGame = broadcastToGame;
