/**
 * Snake draft engine for 8 contestants, 16 rounds.
 * Round 1: positions 1-8 (forward)
 * Round 2: positions 8-1 (reverse)
 * Round 3: positions 1-8 (forward)
 * ... alternating for 16 rounds = 128 total picks
 */

const NUM_CONTESTANTS = 8;
const NUM_ROUNDS = 16;
const MAX_DRAFTS_PER_TEAM = 2;

/**
 * Generate the full snake draft order.
 * Returns array of 128 entries: index = pickNumber (0-based), value = draft_position (1-8)
 */
function generateSnakeOrder() {
  const order = [];
  for (let round = 0; round < NUM_ROUNDS; round++) {
    const positions = [1, 2, 3, 4, 5, 6, 7, 8];
    if (round % 2 === 1) positions.reverse();
    order.push(...positions);
  }
  return order;
}

/**
 * Given the current pick count, determine whose turn it is.
 * Returns { draftPosition, round, pickNumber, isComplete }
 */
function getCurrentPick(pickCount) {
  if (pickCount >= NUM_CONTESTANTS * NUM_ROUNDS) {
    return { isComplete: true };
  }
  const order = generateSnakeOrder();
  const draftPosition = order[pickCount];
  const round = Math.floor(pickCount / NUM_CONTESTANTS) + 1;
  return {
    draftPosition,
    round,
    pickNumber: pickCount + 1,
    isComplete: false,
  };
}

/**
 * Shuffle array in place (Fisher-Yates) for straw drawing.
 */
function shufflePositions() {
  const positions = [1, 2, 3, 4, 5, 6, 7, 8];
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  return positions;
}

/**
 * Validate a draft pick.
 * Returns { valid: boolean, error?: string }
 */
function validatePick(db, gameId, contestantId, teamId) {
  // Check team exists
  const team = db.prepare('SELECT id FROM teams WHERE id = ?').get(teamId);
  if (!team) return { valid: false, error: 'Team does not exist' };

  // Check how many times this team has been drafted in this game
  const draftCount = db
    .prepare(
      'SELECT COUNT(*) as c FROM draft_picks WHERE game_id = ? AND team_id = ?'
    )
    .get(gameId, teamId);

  if (draftCount.c >= MAX_DRAFTS_PER_TEAM) {
    return { valid: false, error: 'Team has already been drafted twice' };
  }

  // Check it's this contestant's turn
  const pickCount = db
    .prepare('SELECT COUNT(*) as c FROM draft_picks WHERE game_id = ?')
    .get(gameId);

  const current = getCurrentPick(pickCount.c);
  if (current.isComplete) {
    return { valid: false, error: 'Draft is complete' };
  }

  const contestant = db
    .prepare('SELECT draft_position FROM contestants WHERE id = ? AND game_id = ?')
    .get(contestantId, gameId);

  if (!contestant) return { valid: false, error: 'Contestant not found in this game' };

  if (contestant.draft_position !== current.draftPosition) {
    return { valid: false, error: `Not your turn. Waiting for position ${current.draftPosition}` };
  }

  return { valid: true, round: current.round, pickNumber: current.pickNumber };
}

module.exports = {
  generateSnakeOrder,
  getCurrentPick,
  shufflePositions,
  validatePick,
  NUM_CONTESTANTS,
  NUM_ROUNDS,
  MAX_DRAFTS_PER_TEAM,
};
