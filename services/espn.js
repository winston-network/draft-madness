/**
 * ESPN API integration for live NCAA tournament scores.
 * Uses the public ESPN API (no key required).
 */

const https = require('https');

const SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';

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

  // Fallback: try season type info
  return null;
}

/**
 * Parse ESPN scoreboard data into our format.
 * Returns array of game results: { espnGameId, teamId, opponentId, won, score, opponentScore, round }
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
 * Update tournament results in the database by polling ESPN.
 */
async function updateScores(db) {
  // Build ESPN ID -> our team ID lookup
  const teams = db.prepare('SELECT id, espn_id FROM teams').all();
  const teamLookup = {};
  teams.forEach((t) => {
    if (t.espn_id) teamLookup[t.espn_id] = t.id;
  });

  // Check tournament dates (March-April)
  const now = new Date();
  const month = now.getMonth() + 1;
  if (month < 3 || month > 4) {
    return { updated: 0, message: 'Outside tournament window' };
  }

  // Fetch scores for today and yesterday (to catch late games)
  const dates = [formatDate(now)];
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  dates.push(formatDate(yesterday));

  let totalUpdated = 0;

  for (const date of dates) {
    try {
      const data = await fetchScoreboard(date);
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

  return { updated: totalUpdated };
}

function formatDate(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

module.exports = { updateScores, fetchScoreboard, parseResults };
