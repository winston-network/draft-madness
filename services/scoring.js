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

const ROUND_LABELS = {
  1: 'R1',
  2: 'R2',
  3: 'Sweet 16',
  4: 'Elite 8',
  5: 'Final Four',
  6: 'Championship',
};

/**
 * Calculate scores for all contestants in a game.
 * Returns sorted array with per-round breakdowns.
 */
function calculateScores(db, gameId) {
  // Figure out which tournament rounds have any results
  const roundsPlayed = db
    .prepare('SELECT DISTINCT tournament_round FROM tournament_results ORDER BY tournament_round')
    .all()
    .map((r) => r.tournament_round);

  // Championship complete = round 6 has a winner
  const championshipComplete =
    roundsPlayed.includes(6) &&
    !!db.prepare('SELECT 1 FROM tournament_results WHERE tournament_round = 6 AND won = 1').get();

  const contestants = db
    .prepare('SELECT id, name, tiebreaker_score FROM contestants WHERE game_id = ?')
    .all(gameId);

  const results = contestants.map((c) => {
    const teams = db
      .prepare(
        `SELECT t.id, t.name, t.seed, t.region, t.espn_id, dp.pick_number
         FROM draft_picks dp
         JOIN teams t ON t.id = dp.team_id
         WHERE dp.game_id = ? AND dp.contestant_id = ?
         ORDER BY dp.pick_number`
      )
      .all(gameId, c.id);

    let totalScore = 0;
    // Per-round point totals for this contestant
    const roundScores = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

    const teamScores = teams.map((team) => {
      const allResults = db
        .prepare(
          `SELECT tournament_round, won, game_score, opponent_score
           FROM tournament_results
           WHERE team_id = ?`
        )
        .all(team.id);

      let teamPoints = 0;
      const roundResults = {};
      allResults.forEach((r) => {
        const pts = r.won ? (POINTS_BY_ROUND[r.tournament_round] || 0) : 0;
        teamPoints += pts;
        roundScores[r.tournament_round] += pts;
        roundResults[r.tournament_round] = {
          won: !!r.won,
          points: pts,
          score: r.game_score,
          opponentScore: r.opponent_score,
        };
      });

      totalScore += teamPoints;

      // Is this team still alive? (no losses recorded)
      const eliminated = allResults.some((r) => !r.won);

      return {
        teamId: team.id,
        name: team.name,
        seed: team.seed,
        region: team.region,
        espnId: team.espn_id,
        pickNumber: team.pick_number,
        points: teamPoints,
        rounds: roundResults,
        eliminated,
      };
    });

    const teamsAlive = teamScores.filter((t) => !t.eliminated).length;

    return {
      contestantId: c.id,
      name: c.name,
      score: totalScore,
      roundScores,
      teamsAlive,
      tiebreakerScore: c.tiebreaker_score,
      teams: teamScores,
    };
  });

  // Sort by score desc, then tiebreaker (closest to actual championship total)
  results.sort((a, b) => b.score - a.score);

  return {
    standings: results,
    roundsPlayed,
    championshipComplete,
    roundLabels: ROUND_LABELS,
  };
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
