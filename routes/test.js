const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { getCurrentPick } = require('../services/draft-engine');

const router = express.Router();

// Block in production
router.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Test endpoints are disabled in production' });
  }
  next();
});

const BOT_NAMES = [
  'Bot Alpha',
  'Bot Bravo',
  'Bot Charlie',
  'Bot Delta',
  'Bot Echo',
  'Bot Foxtrot',
  'Bot Golf',
];

/**
 * POST /api/test/fill-game/:code
 * Joins 7 bot players to fill up a game so the human only needs to join once.
 */
router.post('/fill-game/:code', (req, res) => {
  try {
    const db = getDb();
    const code = req.params.code.toUpperCase();

    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(code);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (game.status !== 'lobby') {
      return res.status(400).json({ error: 'Game is not in lobby phase' });
    }

    const existing = db
      .prepare('SELECT COUNT(*) as c FROM contestants WHERE game_id = ?')
      .get(code);

    const slotsNeeded = 8 - existing.c;
    if (slotsNeeded <= 0) {
      return res.status(400).json({ error: 'Game is already full' });
    }

    const botsToAdd = BOT_NAMES.slice(0, slotsNeeded);
    const insertBot = db.prepare(
      'INSERT INTO contestants (game_id, name, session_token) VALUES (?, ?, ?)'
    );

    const addedBots = [];
    const addBots = db.transaction(() => {
      for (const botName of botsToAdd) {
        const token = `bot-${uuidv4()}`;
        insertBot.run(code, botName, token);
        addedBots.push(botName);
      }
    });

    addBots();

    res.json({
      message: `Added ${addedBots.length} bots`,
      bots: addedBots,
      totalContestants: existing.c + addedBots.length,
    });
  } catch (err) {
    console.error('fill-game error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Pick a random available team with some intelligence — prefer lower seeds.
 * Returns the chosen team or null if none available.
 */
function pickSmartTeam(db, code) {
  const available = db
    .prepare(
      `SELECT t.*
       FROM teams t
       LEFT JOIN draft_picks dp ON dp.team_id = t.id AND dp.game_id = ?
       GROUP BY t.id
       HAVING COUNT(dp.id) < 2
       ORDER BY t.seed, t.region`
    )
    .all(code);

  if (available.length === 0) return null;

  // Weighted random: lower seeds get higher weight
  // Seed 1 gets weight 16, seed 16 gets weight 1
  const weighted = available.map((t) => ({
    team: t,
    weight: 17 - t.seed,
  }));

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) return entry.team;
  }

  // Fallback
  return available[0];
}

/**
 * Make a single auto-pick for whoever's turn it is.
 * Returns the pick info or null if draft is complete.
 */
function makeAutoPick(db, code) {
  const pickCount = db
    .prepare('SELECT COUNT(*) as c FROM draft_picks WHERE game_id = ?')
    .get(code);

  const current = getCurrentPick(pickCount.c);
  if (current.isComplete) return null;

  const contestant = db
    .prepare('SELECT * FROM contestants WHERE game_id = ? AND draft_position = ?')
    .get(code, current.draftPosition);

  if (!contestant) return null;

  const team = pickSmartTeam(db, code);
  if (!team) return null;

  db.prepare(
    'INSERT INTO draft_picks (game_id, contestant_id, team_id, pick_number, round) VALUES (?, ?, ?, ?, ?)'
  ).run(code, contestant.id, team.id, current.pickNumber, current.round);

  // Check if draft is now complete
  const newCount = db
    .prepare('SELECT COUNT(*) as c FROM draft_picks WHERE game_id = ?')
    .get(code);
  const next = getCurrentPick(newCount.c);
  if (next.isComplete) {
    db.prepare("UPDATE games SET status = 'active' WHERE id = ?").run(code);
  }

  return {
    contestantName: contestant.name,
    contestantId: contestant.id,
    teamName: team.name,
    teamId: team.id,
    seed: team.seed,
    region: team.region,
    pickNumber: current.pickNumber,
    round: current.round,
    draftComplete: next.isComplete,
  };
}

/**
 * POST /api/test/auto-pick/:code
 * Makes the current pick automatically for whoever's turn it is.
 */
router.post('/auto-pick/:code', (req, res) => {
  try {
    const db = getDb();
    const code = req.params.code.toUpperCase();

    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(code);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (game.status !== 'drafting') {
      return res.status(400).json({ error: 'Draft is not active' });
    }

    const pick = makeAutoPick(db, code);
    if (!pick) {
      return res.json({ message: 'Draft is complete', draftComplete: true });
    }

    // Broadcast via SSE if available
    try {
      const { broadcastToGame } = require('./draft');
      broadcastToGame(code, {
        type: 'pick',
        pick,
        nextPick: pick.draftComplete ? null : getCurrentPick(
          db.prepare('SELECT COUNT(*) as c FROM draft_picks WHERE game_id = ?').get(code).c
        ),
        draftComplete: pick.draftComplete,
      });
    } catch (_) { /* SSE broadcast optional */ }

    res.json({ message: 'Auto-pick made', pick });
  } catch (err) {
    console.error('auto-pick error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/test/simulate-round/:code
 * Auto-picks for ALL non-human players until it's the human's turn again.
 * Body: { humanContestantId: number }
 */
router.post('/simulate-round/:code', (req, res) => {
  try {
    const db = getDb();
    const code = req.params.code.toUpperCase();
    const { humanContestantId } = req.body;

    if (!humanContestantId) {
      return res.status(400).json({ error: 'humanContestantId required in body' });
    }

    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(code);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (game.status !== 'drafting') {
      return res.status(400).json({ error: 'Draft is not active' });
    }

    const picks = [];
    let safety = 0;
    const maxIterations = 200; // prevent infinite loops

    while (safety < maxIterations) {
      safety++;

      const pickCount = db
        .prepare('SELECT COUNT(*) as c FROM draft_picks WHERE game_id = ?')
        .get(code);
      const current = getCurrentPick(pickCount.c);

      if (current.isComplete) break;

      // Check if it's the human's turn
      const nextUp = db
        .prepare('SELECT * FROM contestants WHERE game_id = ? AND draft_position = ?')
        .get(code, current.draftPosition);

      if (nextUp && nextUp.id === humanContestantId) break;

      // Auto-pick for this bot
      const pick = makeAutoPick(db, code);
      if (!pick) break;
      picks.push(pick);

      // Broadcast via SSE
      try {
        const { broadcastToGame } = require('./draft');
        broadcastToGame(code, {
          type: 'pick',
          pick,
          nextPick: pick.draftComplete ? null : getCurrentPick(
            db.prepare('SELECT COUNT(*) as c FROM draft_picks WHERE game_id = ?').get(code).c
          ),
          draftComplete: pick.draftComplete,
        });
      } catch (_) { /* SSE broadcast optional */ }

      if (pick.draftComplete) break;
    }

    res.json({
      message: `Simulated ${picks.length} picks`,
      picks,
      draftComplete: picks.length > 0 && picks[picks.length - 1].draftComplete,
    });
  } catch (err) {
    console.error('simulate-round error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/test/simulate-full-draft/:code
 * Runs the entire draft with random picks for all players.
 */
router.post('/simulate-full-draft/:code', (req, res) => {
  try {
    const db = getDb();
    const code = req.params.code.toUpperCase();

    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(code);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (game.status !== 'drafting') {
      return res.status(400).json({ error: 'Draft is not active' });
    }

    const picks = [];
    let safety = 0;
    const maxIterations = 200;

    while (safety < maxIterations) {
      safety++;

      const pick = makeAutoPick(db, code);
      if (!pick) break;
      picks.push(pick);

      if (pick.draftComplete) break;
    }

    // Broadcast final state via SSE
    try {
      const { broadcastToGame } = require('./draft');
      broadcastToGame(code, {
        type: 'pick',
        pick: picks[picks.length - 1],
        nextPick: null,
        draftComplete: true,
      });
    } catch (_) { /* SSE broadcast optional */ }

    res.json({
      message: `Draft simulated with ${picks.length} total picks`,
      totalPicks: picks.length,
      draftComplete: true,
    });
  } catch (err) {
    console.error('simulate-full-draft error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/test/reset
 * Wipes the database (games, contestants, picks, results) and re-seeds teams.
 * Keeps the server running — no restart needed.
 */
router.post('/reset', (req, res) => {
  try {
    const db = getDb();
    db.exec(`
      DELETE FROM draft_picks;
      DELETE FROM tournament_results;
      DELETE FROM contestants;
      DELETE FROM games;
    `);
    res.json({ message: 'Database reset. All games wiped.' });
  } catch (err) {
    console.error('reset error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/test/simulate-tournament-round/:code
 * Simulates one tournament round. Each call advances the tournament by one round.
 * Round 1: 64→32, Round 2: 32→16, ... Round 6: Championship.
 * Teams that won previous rounds play in the next round.
 * Uses seed-weighted randomness (lower seeds more likely to win).
 */
router.post('/simulate-tournament-round/:code', (req, res) => {
  try {
    const db = getDb();
    const code = req.params.code.toUpperCase();

    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(code);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (game.status !== 'active') {
      return res.status(400).json({ error: 'Game must be in active status (draft complete)' });
    }

    // Figure out current tournament round
    const lastRound = db
      .prepare('SELECT MAX(tournament_round) as r FROM tournament_results')
      .get();
    const nextRound = (lastRound.r || 0) + 1;

    if (nextRound > 6) {
      return res.json({ message: 'Tournament is already complete', round: 6, complete: true });
    }

    // Get teams that should play this round
    let teamsInRound;
    if (nextRound === 1) {
      // All 64 teams play round 1
      teamsInRound = db.prepare('SELECT * FROM teams ORDER BY region, seed').all();
    } else {
      // Teams that won the previous round
      teamsInRound = db
        .prepare(
          `SELECT t.* FROM teams t
           JOIN tournament_results tr ON tr.team_id = t.id
           WHERE tr.tournament_round = ? AND tr.won = 1
           ORDER BY t.region, t.seed`
        )
        .all(nextRound - 1);
    }

    // Pair them up and simulate matchups
    const results = [];
    const insertResult = db.prepare(
      `INSERT OR REPLACE INTO tournament_results (team_id, tournament_round, won, game_score, opponent_score)
       VALUES (?, ?, ?, ?, ?)`
    );

    const simulate = db.transaction(() => {
      // Shuffle within regions for matchups, then pair adjacent teams
      // In round 1, pair by seed (1v16, 2v15, etc.)
      const paired = [];

      if (nextRound === 1) {
        // Standard bracket: 1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15 per region
        const regions = ['East', 'West', 'South', 'Midwest'];
        const bracketOrder = [
          [1,16], [8,9], [5,12], [4,13], [6,11], [3,14], [7,10], [2,15]
        ];
        for (const region of regions) {
          const regionTeams = teamsInRound.filter(t => t.region === region);
          for (const [s1, s2] of bracketOrder) {
            const t1 = regionTeams.find(t => t.seed === s1);
            const t2 = regionTeams.find(t => t.seed === s2);
            if (t1 && t2) paired.push([t1, t2]);
          }
        }
      } else {
        // Pair consecutively from sorted list
        for (let i = 0; i < teamsInRound.length - 1; i += 2) {
          paired.push([teamsInRound[i], teamsInRound[i + 1]]);
        }
      }

      for (const [teamA, teamB] of paired) {
        // Seed-weighted: lower seed = higher chance of winning
        // Upset factor increases in later rounds for drama
        const upsetBoost = 1 + (nextRound - 1) * 0.15;
        const weightA = (17 - teamA.seed) * upsetBoost + Math.random() * 8;
        const weightB = (17 - teamB.seed) * upsetBoost + Math.random() * 8;
        const aWins = weightA >= weightB;

        // Generate realistic scores
        const baseScore = 55 + Math.floor(Math.random() * 25);
        const margin = 1 + Math.floor(Math.random() * 18);
        const winnerScore = baseScore + margin;
        const loserScore = baseScore;

        insertResult.run(teamA.id, nextRound, aWins ? 1 : 0, aWins ? winnerScore : loserScore, aWins ? loserScore : winnerScore);
        insertResult.run(teamB.id, nextRound, aWins ? 0 : 1, aWins ? loserScore : winnerScore, aWins ? winnerScore : loserScore);

        results.push({
          winner: aWins ? teamA.name : teamB.name,
          loser: aWins ? teamB.name : teamA.name,
          score: `${winnerScore}-${loserScore}`,
        });
      }
    });

    simulate();

    // If championship just finished, update game status
    if (nextRound === 6) {
      db.prepare("UPDATE games SET status = 'complete' WHERE id = ?").run(code);
    }

    res.json({
      message: `Simulated tournament round ${nextRound}`,
      round: nextRound,
      matchups: results.length,
      results,
      complete: nextRound === 6,
    });
  } catch (err) {
    console.error('simulate-tournament-round error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
