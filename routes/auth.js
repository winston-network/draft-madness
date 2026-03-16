const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');

const router = express.Router();

// POST /api/auth/join - Join a game with name + game code
router.post('/join', (req, res) => {
  const { name, gameCode } = req.body;
  if (!name || !gameCode) {
    return res.status(400).json({ error: 'Name and game code required' });
  }

  const db = getDb();
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameCode.toUpperCase());
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }

  // Check if already joined
  const existing = db
    .prepare('SELECT * FROM contestants WHERE game_id = ? AND name = ?')
    .get(game.id, name);

  if (existing) {
    return res.json({
      token: existing.session_token,
      contestantId: existing.id,
      gameId: game.id,
      gameName: game.name,
    });
  }

  // Atomic join: check count + status + insert inside a transaction
  const token = uuidv4();
  const joinTransaction = db.transaction(() => {
    const g = db.prepare('SELECT status FROM games WHERE id = ?').get(game.id);
    if (g.status !== 'lobby') {
      throw new Error('Game has already started');
    }

    const count = db
      .prepare('SELECT COUNT(*) as c FROM contestants WHERE game_id = ?')
      .get(game.id);

    if (count.c >= 8) {
      throw new Error('Game is full (8/8 contestants)');
    }

    const result = db
      .prepare('INSERT INTO contestants (game_id, name, session_token) VALUES (?, ?, ?)')
      .run(game.id, name, token);

    // Double-check count after insert
    const newCount = db
      .prepare('SELECT COUNT(*) as c FROM contestants WHERE game_id = ?')
      .get(game.id);

    if (newCount.c > 8) {
      throw new Error('Game is full (8/8 contestants)');
    }

    return { lastInsertRowid: result.lastInsertRowid, count: newCount.c };
  });

  try {
    const result = joinTransaction();

    // Broadcast join event to lobby SSE clients
    try {
      const { broadcastToGame } = require('./draft');
      broadcastToGame(game.id, { type: 'join', name, count: result.count });
    } catch (_) {
      // SSE broadcast not available
    }

    res.json({
      token,
      contestantId: result.lastInsertRowid,
      gameId: game.id,
      gameName: game.name,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/auth/me - Get current user info from token
router.get('/me', (req, res) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: 'No token' });

  const db = getDb();
  const contestant = db
    .prepare('SELECT c.*, g.name as game_name, g.status as game_status FROM contestants c JOIN games g ON g.id = c.game_id WHERE c.session_token = ?')
    .get(token);

  if (!contestant) return res.status(401).json({ error: 'Invalid token' });

  res.json(contestant);
});

module.exports = router;
