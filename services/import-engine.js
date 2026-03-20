/**
 * Import engine for loading draft results from spreadsheets.
 * Handles team name resolution with aliases and fuzzy matching.
 */

const XLSX = require('xlsx');
const { generateSnakeOrder, NUM_CONTESTANTS, NUM_ROUNDS } = require('./draft-engine');

// Common aliases for team names (lowercase key → canonical DB name)
const TEAM_ALIASES = {
  // Play-in / abbreviated names
  'michigan state': 'Michigan St',
  'mich state': 'Michigan St',
  'mich st': 'Michigan St',
  'kennesaw state': 'Kennesaw St',
  'kennesaw': 'Kennesaw St',
  'north dakota state': 'N Dakota St',
  'north dakota st': 'N Dakota St',
  'nd state': 'N Dakota St',
  'ndsu': 'N Dakota St',
  'nc state/texas': 'NC St/Texas',
  'nc state': 'NC St/Texas',
  'nc st': 'NC St/Texas',
  'st johns': 'St. Johns',
  'st. john\'s': 'St. Johns',
  'saint johns': 'St. Johns',
  'saint john\'s': 'St. Johns',
  'st john\'s': 'St. Johns',
  'saint marys': 'Saint Marys',
  'saint mary\'s': 'Saint Marys',
  'st marys': 'Saint Marys',
  'st. marys': 'Saint Marys',
  'st. mary\'s': 'Saint Marys',
  'st mary\'s': 'Saint Marys',
  'uconn': 'UConn',
  'connecticut': 'UConn',
  'conn': 'UConn',
  'cal baptist': 'CA Baptist',
  'california baptist': 'CA Baptist',
  'cal bapt': 'CA Baptist',
  'pv/lehigh': 'PV/Lehigh',
  'prairie view': 'PV/Lehigh',
  'prairie view/lehigh': 'PV/Lehigh',
  'smu/miami oh': 'SMU/MiaOH',
  'smu/miaoh': 'SMU/MiaOH',
  'smu': 'SMU/MiaOH',
  'umbc/howard': 'UMBC/Howard',
  'umbc': 'UMBC/Howard',
  'south fla': 'South Florida',
  'usf': 'South Florida',
  's florida': 'South Florida',
  'unc': 'North Carolina',
  'n carolina': 'North Carolina',
  'iowa st': 'Iowa State',
  'texas am': 'Texas A&M',
  'texas a & m': 'Texas A&M',
  'tamu': 'Texas A&M',
  'tx tech': 'Texas Tech',
  'texas tt': 'Texas Tech',
  'utah st': 'Utah State',
  'tennessee state': 'Tennessee St',
  'tenn state': 'Tennessee St',
  'tenn st': 'Tennessee St',
  'northern ia': 'Northern Iowa',
  'uni': 'Northern Iowa',
  'n iowa': 'Northern Iowa',
  'wright state': 'Wright St',
  'long island u': 'Long Island',
  'liu': 'Long Island',
  'gonzaga': 'Gonzaga',
  'zags': 'Gonzaga',
  'byu': 'BYU',
  'brigham young': 'BYU',
  'ucf': 'UCF',
  'cent florida': 'UCF',
  'central florida': 'UCF',
  'vcu': 'VCU',
  'va commonwealth': 'VCU',
  'tcu': 'TCU',
  'nova': 'Villanova',
};

/**
 * Levenshtein distance between two strings.
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Build a lookup map from team names/aliases → team DB rows.
 */
function buildTeamAliasMap(db) {
  const teams = db.prepare('SELECT * FROM teams').all();
  const map = new Map();

  // Exact name matches (case-insensitive)
  for (const team of teams) {
    map.set(team.name.toLowerCase(), team);
  }

  // Add hardcoded aliases
  for (const [alias, canonical] of Object.entries(TEAM_ALIASES)) {
    const team = teams.find(t => t.name === canonical);
    if (team) {
      map.set(alias.toLowerCase(), team);
    }
  }

  return { map, teams };
}

/**
 * Parse a spreadsheet buffer (xlsx or csv) into structured data.
 * Format: Row 1 = contestant names (cols B-I), Rows 2-17 = picks.
 */
function parseSpreadsheet(buffer, format) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (data.length < 2) {
    throw new Error('Spreadsheet must have at least a header row and one round of picks');
  }

  // Row 0 = header with contestant names in columns B-I (indices 1-8)
  const headerRow = data[0];
  const contestants = [];
  for (let col = 1; col <= 8; col++) {
    const name = String(headerRow[col] || '').trim();
    if (!name) {
      throw new Error(`Missing contestant name in column ${String.fromCharCode(65 + col)} (header row)`);
    }
    contestants.push(name);
  }

  // Rows 1-16 = draft rounds
  const picks = [];
  const maxRounds = Math.min(data.length - 1, NUM_ROUNDS);
  for (let row = 1; row <= maxRounds; row++) {
    const rowData = data[row];
    if (!rowData) continue;

    for (let col = 1; col <= 8; col++) {
      const rawTeamName = String(rowData[col] || '').trim();
      if (!rawTeamName) continue;

      picks.push({
        contestant: contestants[col - 1],
        contestantIndex: col - 1,
        round: row,
        rawTeamName,
      });
    }
  }

  return { contestants, picks };
}

/**
 * Resolve raw team names to database team IDs.
 * Returns resolved picks, errors (unmatched), and warnings (fuzzy matches).
 */
function resolveTeams(picks, aliasMap) {
  const { map, teams } = aliasMap;
  const resolved = [];
  const errors = [];
  const warnings = [];

  for (const pick of picks) {
    const raw = pick.rawTeamName;
    const lower = raw.toLowerCase().trim();

    // 1. Exact match in alias map
    if (map.has(lower)) {
      resolved.push({ ...pick, team: map.get(lower), matchType: 'exact' });
      continue;
    }

    // 2. Fuzzy match via Levenshtein
    let bestMatch = null;
    let bestDist = Infinity;

    for (const team of teams) {
      const dist = levenshtein(lower, team.name.toLowerCase());
      if (dist < bestDist) {
        bestDist = dist;
        bestMatch = team;
      }
    }

    // Also check aliases
    for (const [alias, team] of map.entries()) {
      const dist = levenshtein(lower, alias);
      if (dist < bestDist) {
        bestDist = dist;
        bestMatch = team;
      }
    }

    if (bestDist <= 3 && bestMatch) {
      resolved.push({ ...pick, team: bestMatch, matchType: 'fuzzy' });
      warnings.push({
        round: pick.round,
        contestant: pick.contestant,
        raw: raw,
        resolved: bestMatch.name,
        distance: bestDist,
      });
    } else {
      errors.push({
        round: pick.round,
        contestant: pick.contestant,
        raw: raw,
        message: `Could not match team "${raw}"`,
      });
    }
  }

  return { resolved, errors, warnings };
}

/**
 * Validate a fully resolved import.
 */
function validateImport(contestants, resolved) {
  const validationErrors = [];

  // Check 8 contestants
  if (contestants.length !== NUM_CONTESTANTS) {
    validationErrors.push(`Expected ${NUM_CONTESTANTS} contestants, found ${contestants.length}`);
  }

  // Check each contestant has 16 picks
  const picksByContestant = {};
  for (const c of contestants) picksByContestant[c] = [];
  for (const pick of resolved) {
    if (picksByContestant[pick.contestant]) {
      picksByContestant[pick.contestant].push(pick);
    }
  }

  for (const [name, picks] of Object.entries(picksByContestant)) {
    if (picks.length !== NUM_ROUNDS) {
      validationErrors.push(`${name} has ${picks.length} picks (expected ${NUM_ROUNDS})`);
    }
  }

  // Check no team drafted more than 2x
  const teamDraftCounts = {};
  for (const pick of resolved) {
    const tid = pick.team.id;
    teamDraftCounts[tid] = (teamDraftCounts[tid] || 0) + 1;
    if (teamDraftCounts[tid] > 2) {
      validationErrors.push(`${pick.team.name} drafted ${teamDraftCounts[tid]} times (max 2)`);
    }
  }

  // Check no contestant has same team twice
  for (const [name, picks] of Object.entries(picksByContestant)) {
    const teamIds = new Set();
    for (const p of picks) {
      if (teamIds.has(p.team.id)) {
        validationErrors.push(`${name} has ${p.team.name} twice`);
      }
      teamIds.add(p.team.id);
    }
  }

  return validationErrors;
}

/**
 * Execute the import: create game, contestants, and all draft picks.
 */
function executeImport(db, gameName, contestants, resolved) {
  const { v4: uuidv4 } = require('uuid');

  // Generate 6-char game code
  const gameCode = uuidv4().substring(0, 6).toUpperCase();
  const snakeOrder = generateSnakeOrder();

  const insertGame = db.prepare(
    'INSERT INTO games (id, name, status) VALUES (?, ?, ?)'
  );
  const insertContestant = db.prepare(
    'INSERT INTO contestants (game_id, name, draft_position, session_token) VALUES (?, ?, ?, ?)'
  );
  const insertPick = db.prepare(
    'INSERT INTO draft_picks (game_id, contestant_id, team_id, pick_number, round) VALUES (?, ?, ?, ?, ?)'
  );

  const transaction = db.transaction(() => {
    // Create game as 'active' (draft already happened externally)
    insertGame.run(gameCode, gameName, 'active');

    // Insert contestants with draft positions 1-8
    const contestantIds = {};
    for (let i = 0; i < contestants.length; i++) {
      const token = uuidv4();
      const result = insertContestant.run(gameCode, contestants[i], i + 1, token);
      contestantIds[contestants[i]] = result.lastInsertRowid;
    }

    // Build picks in snake draft order
    // For each round, the snake order determines which draft_position picks in what order
    // We need to map the spreadsheet's contestant columns (which ARE the draft positions)
    // to the correct pick_numbers in snake order
    for (let round = 1; round <= NUM_ROUNDS; round++) {
      for (let col = 0; col < NUM_CONTESTANTS; col++) {
        const draftPosition = col + 1; // columns map to draft positions 1-8

        // Find the pick_number for this draft_position in this round
        const roundStartIdx = (round - 1) * NUM_CONTESTANTS;
        let pickNumber = null;
        for (let i = 0; i < NUM_CONTESTANTS; i++) {
          if (snakeOrder[roundStartIdx + i] === draftPosition) {
            pickNumber = roundStartIdx + i + 1; // 1-based
            break;
          }
        }

        // Find the resolved pick for this contestant in this round
        const contestantName = contestants[col];
        const pick = resolved.find(
          p => p.contestant === contestantName && p.round === round
        );

        if (pick && pickNumber) {
          insertPick.run(
            gameCode,
            contestantIds[contestantName],
            pick.team.id,
            pickNumber,
            round
          );
        }
      }
    }
  });

  transaction();
  return { gameCode };
}

module.exports = {
  buildTeamAliasMap,
  parseSpreadsheet,
  resolveTeams,
  validateImport,
  executeImport,
  levenshtein,
};
