/**
 * Draft pick timer service.
 * Manages countdown deadlines, pause/resume, and auto-picks when time expires.
 */

const { getCurrentPick, MAX_DRAFTS_PER_TEAM } = require('./draft-engine');

/**
 * Set the deadline for the current pick in a game.
 * Deadline = now + pick_timer seconds.
 * Also clears any paused state.
 */
function startPickTimer(db, gameCode) {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameCode);
  if (!game || game.status !== 'drafting') return;

  const pickTimer = game.pick_timer || 180;
  const deadline = new Date(Date.now() + pickTimer * 1000).toISOString();

  db.prepare('UPDATE games SET current_pick_deadline = ?, paused_remaining = NULL WHERE id = ?').run(deadline, gameCode);
}

/**
 * Clear the pick deadline (e.g. when draft completes).
 */
function clearPickTimer(db, gameCode) {
  db.prepare('UPDATE games SET current_pick_deadline = NULL, paused_remaining = NULL WHERE id = ?').run(gameCode);
}

/**
 * Pause the draft timer. Saves remaining seconds and clears the deadline.
 * Returns { remaining } on success, or null if not pausable.
 */
function pauseTimer(db, gameCode) {
  const game = db.prepare('SELECT current_pick_deadline, paused_remaining FROM games WHERE id = ?').get(gameCode);
  if (!game || !game.current_pick_deadline || game.paused_remaining != null) {
    return null; // no deadline to pause, or already paused
  }

  const deadline = new Date(game.current_pick_deadline).getTime();
  const remaining = Math.max(1, Math.ceil((deadline - Date.now()) / 1000));

  db.prepare('UPDATE games SET paused_remaining = ?, current_pick_deadline = NULL WHERE id = ?').run(remaining, gameCode);

  return { remaining };
}

/**
 * Resume the draft timer. Sets a new deadline from saved remaining time.
 * Returns { deadline, secondsRemaining } on success, or null if not paused.
 */
function resumeTimer(db, gameCode) {
  const game = db.prepare('SELECT paused_remaining FROM games WHERE id = ?').get(gameCode);
  if (!game || game.paused_remaining == null) {
    return null; // not paused
  }

  const remaining = game.paused_remaining;
  const deadline = new Date(Date.now() + remaining * 1000).toISOString();

  db.prepare('UPDATE games SET current_pick_deadline = ?, paused_remaining = NULL WHERE id = ?').run(deadline, gameCode);

  return { deadline, secondsRemaining: remaining };
}

/**
 * Get time remaining for the current pick.
 * Returns { deadline, secondsRemaining } or paused state.
 */
function getTimeRemaining(db, gameCode) {
  const game = db.prepare('SELECT current_pick_deadline, paused_remaining FROM games WHERE id = ?').get(gameCode);
  if (!game) {
    return { deadline: null, secondsRemaining: null };
  }

  // If paused, return paused state
  if (game.paused_remaining != null) {
    return { paused: true, remaining: game.paused_remaining, deadline: null, secondsRemaining: game.paused_remaining };
  }

  if (!game.current_pick_deadline) {
    return { deadline: null, secondsRemaining: null };
  }

  const deadline = new Date(game.current_pick_deadline).getTime();
  const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));

  return {
    deadline: game.current_pick_deadline,
    secondsRemaining: remaining,
  };
}

/**
 * Check all active drafting games for expired pick timers.
 * When a timer expires, auto-pick a random available team for the current player.
 * Skips games that are paused (paused_remaining IS NOT NULL).
 */
function checkExpiredPicks(db) {
  const now = new Date().toISOString();

  const expiredGames = db
    .prepare(
      `SELECT * FROM games
       WHERE status = 'drafting'
         AND current_pick_deadline IS NOT NULL
         AND current_pick_deadline <= ?
         AND paused_remaining IS NULL`
    )
    .all(now);

  for (const game of expiredGames) {
    try {
      autoPickForGame(db, game);
    } catch (err) {
      console.error(`Auto-pick error for game ${game.id}:`, err.message);
    }
  }
}

/**
 * Auto-pick a random available team for the current player in a game.
 */
function autoPickForGame(db, game) {
  const pickCount = db
    .prepare('SELECT COUNT(*) as c FROM draft_picks WHERE game_id = ?')
    .get(game.id);

  const currentPick = getCurrentPick(pickCount.c);
  if (currentPick.isComplete) {
    clearPickTimer(db, game.id);
    return null;
  }

  // Find the contestant whose turn it is
  const contestant = db
    .prepare('SELECT * FROM contestants WHERE game_id = ? AND draft_position = ?')
    .get(game.id, currentPick.draftPosition);

  if (!contestant) {
    console.error(`No contestant found at position ${currentPick.draftPosition} in game ${game.id}`);
    return null;
  }

  // Get available teams (drafted fewer than MAX_DRAFTS_PER_TEAM times)
  const availableTeams = db
    .prepare(
      `SELECT t.id
       FROM teams t
       LEFT JOIN draft_picks dp ON dp.team_id = t.id AND dp.game_id = ?
       GROUP BY t.id
       HAVING COUNT(dp.id) < ?
       ORDER BY RANDOM()
       LIMIT 1`
    )
    .get(game.id, MAX_DRAFTS_PER_TEAM);

  if (!availableTeams) {
    console.error(`No available teams for auto-pick in game ${game.id}`);
    return null;
  }

  // Make the auto-pick
  db.prepare(
    'INSERT INTO draft_picks (game_id, contestant_id, team_id, pick_number, round) VALUES (?, ?, ?, ?, ?)'
  ).run(game.id, contestant.id, availableTeams.id, currentPick.pickNumber, currentPick.round);

  // Check if draft is now complete
  const newPickCount = db
    .prepare('SELECT COUNT(*) as c FROM draft_picks WHERE game_id = ?')
    .get(game.id);

  const nextPick = getCurrentPick(newPickCount.c);
  if (nextPick.isComplete) {
    db.prepare("UPDATE games SET status = 'active', current_pick_deadline = NULL, paused_remaining = NULL WHERE id = ?").run(game.id);
  } else {
    // Set timer for the next pick
    startPickTimer(db, game.id);
  }

  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(availableTeams.id);

  // Broadcast via SSE if the draft route is available
  try {
    const { broadcastToGame } = require('../routes/draft');
    broadcastToGame(game.id, {
      type: 'pick',
      autoPick: true,
      pick: {
        contestantName: contestant.name,
        contestantId: contestant.id,
        teamName: team.name,
        teamId: team.id,
        seed: team.seed,
        region: team.region,
        pickNumber: currentPick.pickNumber,
        round: currentPick.round,
      },
      nextPick: nextPick.isComplete ? null : nextPick,
      draftComplete: nextPick.isComplete,
    });
  } catch (_) {
    // SSE broadcast not available
  }

  return { contestantName: contestant.name, teamName: team.name, pickNumber: currentPick.pickNumber };
}

module.exports = {
  startPickTimer,
  clearPickTimer,
  getTimeRemaining,
  checkExpiredPicks,
  pauseTimer,
  resumeTimer,
};
