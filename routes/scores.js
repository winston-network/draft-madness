const express = require('express');
const { getDb } = require('../db/database');
const { calculateScores, calculatePrizes } = require('../services/scoring');
const { generateScenarios } = require('../services/scenarios');
const { updateScores, getPollStatus } = require('../services/espn');

const router = express.Router();

// GET /api/scores/:code/leaderboard
router.get('/:code/leaderboard', (req, res) => {
  const db = getDb();
  const code = req.params.code.toUpperCase();

  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(code);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const scoreData = calculateScores(db, code);
  const prizes = calculatePrizes(game.buy_in, 8);
  const pollStatus = getPollStatus();

  res.json({ ...scoreData, prizes, gameStatus: game.status, pollStatus });
});

// POST /api/scores/:code/refresh — trigger an immediate ESPN score pull
router.post('/:code/refresh', async (req, res) => {
  const db = getDb();
  const code = req.params.code.toUpperCase();

  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(code);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  try {
    const result = await updateScores(db);
    const scoreData = calculateScores(db, code);
    const prizes = calculatePrizes(game.buy_in, 8);
    const pollStatus = getPollStatus();
    res.json({ ...scoreData, prizes, gameStatus: game.status, pollStatus, espnResult: result });
  } catch (err) {
    res.status(500).json({ error: 'ESPN fetch failed: ' + err.message });
  }
});

// GET /api/scores/:code/scenarios
router.get('/:code/scenarios', (req, res) => {
  const db = getDb();
  const code = req.params.code.toUpperCase();

  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(code);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const scenarios = generateScenarios(db, code);
  res.json(scenarios);
});

// GET /api/teams - All 64 teams
router.get('/teams', (req, res) => {
  const db = getDb();
  const teams = db.prepare('SELECT * FROM teams ORDER BY region, seed').all();
  res.json(teams);
});

module.exports = router;
