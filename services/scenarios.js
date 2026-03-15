/**
 * Scenarios engine — calculates all possible outcomes
 * when tournament reaches Final Four or Championship.
 */

const { POINTS_BY_ROUND } = require('./scoring');

/**
 * Get teams still alive in the tournament (haven't lost yet).
 */
function getTeamsAlive(db) {
  // Teams that have no losses in tournament_results
  const alive = db
    .prepare(
      `SELECT t.id, t.name, t.seed, t.region
       FROM teams t
       WHERE t.id NOT IN (
         SELECT team_id FROM tournament_results WHERE won = 0
       )
       AND t.id IN (
         SELECT team_id FROM tournament_results WHERE won = 1
         UNION
         SELECT t2.id FROM teams t2
       )`
    )
    .all();

  // Filter to only teams that have won at least their first game
  // OR if tournament hasn't started, all teams
  const withWins = db
    .prepare('SELECT DISTINCT team_id FROM tournament_results WHERE won = 1')
    .all()
    .map((r) => r.team_id);

  const withLosses = db
    .prepare('SELECT DISTINCT team_id FROM tournament_results WHERE won = 0')
    .all()
    .map((r) => r.team_id);

  const lossSet = new Set(withLosses);

  if (withWins.length === 0) return []; // Tournament hasn't started

  // Alive = has at least one win and no losses
  return alive.filter((t) => !lossSet.has(t.id) && withWins.includes(t.id));
}

/**
 * Determine which tournament round we're currently in based on how many teams are alive.
 */
function getCurrentRound(teamsAliveCount) {
  if (teamsAliveCount > 16) return 1; // Still in round 1 or 2
  if (teamsAliveCount > 8) return 3;  // Sweet 16
  if (teamsAliveCount > 4) return 4;  // Elite 8
  if (teamsAliveCount > 2) return 5;  // Final Four
  if (teamsAliveCount === 2) return 6; // Championship
  return 7; // Tournament over
}

/**
 * Generate all possible outcomes for remaining games.
 * Returns array of scenarios, each with a results map and contestant standings.
 */
function generateScenarios(db, gameId) {
  const teamsAlive = getTeamsAlive(db);
  const aliveCount = teamsAlive.length;

  // Only generate scenarios for Final Four (4 teams) or Championship (2 teams)
  if (aliveCount > 4) {
    return { available: false, message: 'Scenarios available when 4 or fewer teams remain' };
  }

  if (aliveCount === 0) {
    return { available: false, message: 'Tournament has not started or is complete' };
  }

  const currentRound = getCurrentRound(aliveCount);

  // Get current scores for all contestants
  const contestants = db
    .prepare('SELECT id, name, tiebreaker_score FROM contestants WHERE game_id = ?')
    .all(gameId);

  const contestantTeams = {};
  contestants.forEach((c) => {
    const teams = db
      .prepare(
        'SELECT team_id FROM draft_picks WHERE game_id = ? AND contestant_id = ?'
      )
      .all(gameId, c.id)
      .map((r) => r.team_id);
    contestantTeams[c.id] = new Set(teams);
  });

  // Current base scores (from already completed games)
  const baseScores = {};
  contestants.forEach((c) => {
    const score = db
      .prepare(
        `SELECT COALESCE(SUM(
          CASE tr.tournament_round
            WHEN 1 THEN 1 WHEN 2 THEN 1
            WHEN 3 THEN 2 WHEN 4 THEN 2
            WHEN 5 THEN 4 WHEN 6 THEN 4
          END
        ), 0) as total
        FROM draft_picks dp
        JOIN tournament_results tr ON tr.team_id = dp.team_id AND tr.won = 1
        WHERE dp.game_id = ? AND dp.contestant_id = ?`
      )
      .get(gameId, c.id);
    baseScores[c.id] = score.total;
  });

  let scenarios;

  if (aliveCount === 2) {
    // Championship: 2 scenarios (team A wins or team B wins)
    scenarios = generateChampionshipScenarios(
      teamsAlive, contestants, contestantTeams, baseScores
    );
  } else if (aliveCount <= 4) {
    // Final Four: up to 8 scenarios (2 semis × 1 final = 2×2×2 = 8)
    scenarios = generateFinalFourScenarios(
      teamsAlive, contestants, contestantTeams, baseScores
    );
  }

  return { available: true, scenarios, teamsAlive };
}

function generateChampionshipScenarios(teamsAlive, contestants, contestantTeams, baseScores) {
  const [teamA, teamB] = teamsAlive;
  const scenarios = [];

  for (const winner of [teamA, teamB]) {
    const loser = winner === teamA ? teamB : teamA;
    const standings = contestants.map((c) => {
      let score = baseScores[c.id];
      if (contestantTeams[c.id].has(winner.id)) {
        score += POINTS_BY_ROUND[6]; // 4 points
      }
      return { contestantId: c.id, name: c.name, score, tiebreaker: c.tiebreaker_score };
    });
    standings.sort((a, b) => b.score - a.score);

    scenarios.push({
      description: `${winner.name} wins championship`,
      winner: winner.name,
      loser: loser.name,
      standings,
    });
  }

  return scenarios;
}

function generateFinalFourScenarios(teamsAlive, contestants, contestantTeams, baseScores) {
  // Pair teams for semis (by region convention, but we'll just pair 0v1, 2v3)
  const semi1 = [teamsAlive[0], teamsAlive[1]];
  const semi2 = [teamsAlive[2], teamsAlive[3]];

  const scenarios = [];

  // 2 outcomes for each semi × 2 outcomes for final = 8 total
  for (const s1Winner of semi1) {
    for (const s2Winner of semi2) {
      for (const champion of [s1Winner, s2Winner]) {
        const standings = contestants.map((c) => {
          let score = baseScores[c.id];

          // Semi 1 winner gets round 5 points
          if (contestantTeams[c.id].has(s1Winner.id)) {
            score += POINTS_BY_ROUND[5];
          }
          // Semi 2 winner gets round 5 points
          if (contestantTeams[c.id].has(s2Winner.id)) {
            score += POINTS_BY_ROUND[5];
          }
          // Champion gets round 6 points
          if (contestantTeams[c.id].has(champion.id)) {
            score += POINTS_BY_ROUND[6];
          }

          return { contestantId: c.id, name: c.name, score, tiebreaker: c.tiebreaker_score };
        });
        standings.sort((a, b) => b.score - a.score);

        const s1Loser = s1Winner === semi1[0] ? semi1[1] : semi1[0];
        const s2Loser = s2Winner === semi2[0] ? semi2[1] : semi2[0];
        const runnerUp = champion === s1Winner ? s2Winner : s1Winner;

        scenarios.push({
          description: `${s1Winner.name} over ${s1Loser.name}, ${s2Winner.name} over ${s2Loser.name}, ${champion.name} wins title`,
          semi1Winner: s1Winner.name,
          semi2Winner: s2Winner.name,
          champion: champion.name,
          standings,
        });
      }
    }
  }

  return scenarios;
}

module.exports = { generateScenarios, getTeamsAlive };
