/**
 * Scoring engine for March Madness draft game.
 *
 * Points per team win by tournament round:
 *   Round 1 (64→32): 1 point
 *   Round 2 (32→16): 1 point
 *   Round 3 Sweet 16 (16→8): 2 points
 *   Round 4 Elite 8 (8→4): 2 points
 *   Round 5 Final Four (4→2): 4 points
 *   Round 6 Championship (2→1): 4 points
 */

const POINTS_BY_ROUND = {
  1: 1,
  2: 1,
  3: 2,
  4: 2,
  5: 4,
  6: 4,
};

/**
 * Calculate scores for all contestants in a game.
 * Returns sorted array: [{ contestantId, name, score, teams: [...] }]
 */
function calculateScores(db, gameId) {
  const contestants = db
    .prepare('SELECT id, name, tiebreaker_score FROM contestants WHERE game_id = ?')
    .all(gameId);

  const results = contestants.map((c) => {
    // Get all teams drafted by this contestant
    const teams = db
      .prepare(
        `SELECT t.id, t.name, t.seed, t.region, dp.pick_number
         FROM draft_picks dp
         JOIN teams t ON t.id = dp.team_id
         WHERE dp.game_id = ? AND dp.contestant_id = ?
         ORDER BY dp.pick_number`
      )
      .all(gameId, c.id);

    let totalScore = 0;
    const teamScores = teams.map((team) => {
      const wins = db
        .prepare(
          `SELECT tournament_round, won, game_score, opponent_score
           FROM tournament_results
           WHERE team_id = ? AND won = 1`
        )
        .all(team.id);

      let teamPoints = 0;
      const roundResults = {};
      wins.forEach((w) => {
        const pts = POINTS_BY_ROUND[w.tournament_round] || 0;
        teamPoints += pts;
        roundResults[w.tournament_round] = {
          won: true,
          points: pts,
          score: w.game_score,
          opponentScore: w.opponent_score,
        };
      });

      // Also get losses
      const losses = db
        .prepare(
          `SELECT tournament_round, game_score, opponent_score
           FROM tournament_results
           WHERE team_id = ? AND won = 0`
        )
        .all(team.id);

      losses.forEach((l) => {
        roundResults[l.tournament_round] = {
          won: false,
          points: 0,
          score: l.game_score,
          opponentScore: l.opponent_score,
        };
      });

      totalScore += teamPoints;

      return {
        teamId: team.id,
        name: team.name,
        seed: team.seed,
        region: team.region,
        pickNumber: team.pick_number,
        points: teamPoints,
        rounds: roundResults,
      };
    });

    return {
      contestantId: c.id,
      name: c.name,
      score: totalScore,
      tiebreakerScore: c.tiebreaker_score,
      teams: teamScores,
    };
  });

  // Sort by score desc, then tiebreaker (closest to actual championship total)
  results.sort((a, b) => b.score - a.score);

  return results;
}

/**
 * Calculate prize distribution.
 */
function calculatePrizes(buyIn, numContestants) {
  const pot = buyIn * numContestants;
  return {
    pot,
    first: Math.round(pot * 0.6 * 100) / 100,
    second: Math.round(pot * 0.3 * 100) / 100,
    third: Math.round(pot * 0.1 * 100) / 100,
  };
}

module.exports = { calculateScores, calculatePrizes, POINTS_BY_ROUND };
