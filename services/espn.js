/**
 * ESPN API integration for live NCAA tournament scores.
 * Uses the public ESPN API (no key required).
 *
 * Smart polling logic:
 * - No polling before the first game tip time of the day
 * - Every 10 min from first tip until all games are final
 * - Stops once all games for the day are final (scores posted)
 * - No polling on days with no tournament games
 * - Window extends 5 hours past last tip time as a safety net
 */

const https = require('https');

const SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';

// Polling state
let lastPollTime = null;
let todaySchedule = null;
let scheduleDate = null; // YYYYMMDD of cached schedule

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse ESPN response'));
        }
      });
      res.on('error', reject);
    });
  });
}

/**
 * Fetch tournament scoreboard for a specific date.
 * @param {string} date - YYYYMMDD format
 */
async function fetchScoreboard(date) {
  const url = `${SCOREBOARD_URL}?groups=100&dates=${date}&limit=100`;
  return fetchJSON(url);
}

/**
 * Determine tournament round from ESPN event data.
 */
function getTournamentRound(event) {
  const notes = event.notes || [];
  const headline = (notes[0] && notes[0].headline) || '';
  const lower = headline.toLowerCase();

  if (lower.includes('1st round') || lower.includes('first round')) return 1;
  if (lower.includes('2nd round') || lower.includes('second round')) return 2;
  if (lower.includes('sweet 16') || lower.includes('sweet sixteen')) return 3;
  if (lower.includes('elite 8') || lower.includes('elite eight') || lower.includes('regional final')) return 4;
  if (lower.includes('final four') || lower.includes('semifinal')) return 5;
  if (lower.includes('championship') || lower.includes('national championship')) return 6;

  return null;
}

/**
 * Parse ESPN scoreboard data into our format.
 */
function parseResults(data, teamLookup) {
  const results = [];

  if (!data.events) return results;

  for (const event of data.events) {
    const round = getTournamentRound(event);
    if (!round) continue;

    const competition = event.competitions && event.competitions[0];
    if (!competition) continue;

    const isComplete = competition.status && competition.status.type && competition.status.type.completed;
    if (!isComplete) continue;

    const competitors = competition.competitors || [];
    if (competitors.length !== 2) continue;

    for (const comp of competitors) {
      const espnId = comp.team && comp.team.id;
      const teamId = teamLookup[espnId];
      if (!teamId) continue;

      const won = comp.winner === true;
      const score = parseInt(comp.score, 10);

      const opponent = competitors.find((c) => c !== comp);
      const oppScore = parseInt(opponent.score, 10);

      results.push({
        espnGameId: event.id,
        teamId,
        won,
        score,
        opponentScore: oppScore,
        round,
      });
    }
  }

  return results;
}

/**
 * Analyze ESPN scoreboard data to determine game schedule status.
 */
function analyzeSchedule(data) {
  const info = {
    hasGames: false,
    gamesInProgress: false,
    allComplete: false,
    firstTipTime: null,
    lastTipTime: null,
    totalGames: 0,
    completedGames: 0,
  };

  if (!data.events || data.events.length === 0) return info;

  const tourneyEvents = data.events.filter((e) => getTournamentRound(e) !== null);
  if (tourneyEvents.length === 0) return info;

  info.hasGames = true;
  info.totalGames = tourneyEvents.length;

  let completed = 0;
  let inProgress = 0;
  let earliestTip = null;
  let latestTip = null;

  for (const event of tourneyEvents) {
    const competition = event.competitions && event.competitions[0];
    if (!competition || !competition.status || !competition.status.type) continue;

    const statusType = competition.status.type;

    if (statusType.completed) {
      completed++;
    } else if (statusType.name === 'STATUS_IN_PROGRESS' || statusType.state === 'in') {
      inProgress++;
    }

    // Track tip times for all games (completed or not)
    const startTime = competition.date ? new Date(competition.date) : null;
    if (startTime) {
      if (!earliestTip || startTime < earliestTip) earliestTip = startTime;
      if (!latestTip || startTime > latestTip) latestTip = startTime;
    }
  }

  info.completedGames = completed;
  info.gamesInProgress = inProgress > 0;
  info.allComplete = completed === tourneyEvents.length;
  info.firstTipTime = earliestTip ? earliestTip.toISOString() : null;
  info.lastTipTime = latestTip ? latestTip.toISOString() : null;

  return info;
}

/**
 * Should we poll right now? Returns { shouldPoll, reason, nextCheckMs }
 *
 * Rules:
 * 1. No games today → don't poll, check schedule again in 1 hour
 * 2. Before first tip time → don't poll, check at first tip time
 * 3. All games final → don't poll, done for the day
 * 4. Between first tip and 5h after last tip → poll every 10 min
 * 5. Past 5h after last tip → stop (safety net expired)
 */
function shouldPollNow() {
  const now = Date.now();

  if (!todaySchedule || !todaySchedule.hasGames) {
    return { shouldPoll: false, reason: 'No tournament games today', nextCheckMs: 60 * 60 * 1000 };
  }

  if (todaySchedule.allComplete) {
    return { shouldPoll: false, reason: 'All games final', nextCheckMs: 60 * 60 * 1000 };
  }

  const firstTip = todaySchedule.firstTipTime ? new Date(todaySchedule.firstTipTime).getTime() : null;
  const lastTip = todaySchedule.lastTipTime ? new Date(todaySchedule.lastTipTime).getTime() : null;

  if (firstTip && now < firstTip) {
    const untilTip = firstTip - now;
    return { shouldPoll: false, reason: 'Before first tip', nextCheckMs: Math.min(untilTip + 60000, 30 * 60 * 1000) };
  }

  // Safety net: stop 5 hours after last tip time
  if (lastTip && now > lastTip + 5 * 60 * 60 * 1000) {
    return { shouldPoll: false, reason: 'Past 5h after last tip', nextCheckMs: 60 * 60 * 1000 };
  }

  // We're in the game window — poll every 10 minutes
  return { shouldPoll: true, reason: 'Game window active', nextCheckMs: 10 * 60 * 1000 };
}

/**
 * Get current polling status for the frontend.
 */
function getPollStatus() {
  const decision = shouldPollNow();
  return {
    lastPollTime,
    schedule: todaySchedule,
    ...decision,
  };
}

/**
 * Update tournament results in the database by polling ESPN.
 */
async function updateScores(db) {
  const teams = db.prepare('SELECT id, espn_id FROM teams').all();
  const teamLookup = {};
  teams.forEach((t) => {
    if (t.espn_id) teamLookup[t.espn_id] = t.id;
  });

  const now = new Date();
  const month = now.getMonth() + 1;
  if (month < 3 || month > 4) {
    return { updated: 0, message: 'Outside tournament window' };
  }

  const todayStr = formatDate(now);
  const dates = [todayStr];
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  dates.push(formatDate(yesterday));

  let totalUpdated = 0;

  for (const date of dates) {
    try {
      const data = await fetchScoreboard(date);

      // Update schedule cache for today
      if (date === todayStr) {
        todaySchedule = analyzeSchedule(data);
        scheduleDate = todayStr;
      }

      const results = parseResults(data, teamLookup);

      const upsert = db.prepare(`
        INSERT INTO tournament_results (team_id, tournament_round, won, game_score, opponent_score, espn_game_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(team_id, tournament_round)
        DO UPDATE SET won = excluded.won, game_score = excluded.game_score,
                      opponent_score = excluded.opponent_score, updated_at = datetime('now')
      `);

      const tx = db.transaction((rows) => {
        let count = 0;
        for (const r of rows) {
          upsert.run(r.teamId, r.round, r.won ? 1 : 0, r.score, r.opponentScore, r.espnGameId);
          count++;
        }
        return count;
      });

      totalUpdated += tx(results);
    } catch (err) {
      console.error(`Error fetching scores for ${date}:`, err.message);
    }
  }

  lastPollTime = now.toISOString();
  return { updated: totalUpdated, schedule: todaySchedule };
}

function formatDate(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

module.exports = { updateScores, fetchScoreboard, parseResults, shouldPollNow, getPollStatus };
