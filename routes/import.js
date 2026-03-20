/**
 * Import routes — preview and confirm spreadsheet draft imports.
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const {
  buildTeamAliasMap,
  parseSpreadsheet,
  resolveTeams,
  validateImport,
  executeImport,
} = require('../services/import-engine');
const { updateScores } = require('../services/espn');

/**
 * POST /api/import/preview
 * Parse and validate a spreadsheet, return preview data.
 * Body: { gameName, file?: base64string, sheetsUrl?: string }
 */
router.post('/preview', async (req, res) => {
  try {
    const { gameName, file, sheetsUrl } = req.body;

    if (!gameName || !gameName.trim()) {
      return res.status(400).json({ error: 'Game name is required' });
    }

    let buffer;

    if (file) {
      // Base64-encoded file upload
      buffer = Buffer.from(file, 'base64');
    } else if (sheetsUrl) {
      // Google Sheets URL → CSV export
      buffer = await fetchGoogleSheet(sheetsUrl);
    } else {
      return res.status(400).json({ error: 'Provide a file upload or Google Sheets URL' });
    }

    const db = getDb();
    const aliasMap = buildTeamAliasMap(db);
    const parsed = parseSpreadsheet(buffer);
    const { resolved, errors, warnings } = resolveTeams(parsed.picks, aliasMap);
    const validationErrors = errors.length === 0
      ? validateImport(parsed.contestants, resolved)
      : [];

    // Build preview grid: 16 rounds × 8 contestants
    const grid = buildPreviewGrid(parsed.contestants, resolved, errors);

    res.json({
      gameName: gameName.trim(),
      contestants: parsed.contestants,
      grid,
      resolved: resolved.length,
      totalExpected: 128,
      errors,
      warnings,
      validationErrors,
      canConfirm: errors.length === 0 && validationErrors.length === 0,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * POST /api/import/confirm
 * Re-validate and execute the import.
 * Body: { gameName, file?: base64string, sheetsUrl?: string }
 */
router.post('/confirm', async (req, res) => {
  try {
    const { gameName, file, sheetsUrl } = req.body;

    if (!gameName || !gameName.trim()) {
      return res.status(400).json({ error: 'Game name is required' });
    }

    let buffer;
    if (file) {
      buffer = Buffer.from(file, 'base64');
    } else if (sheetsUrl) {
      buffer = await fetchGoogleSheet(sheetsUrl);
    } else {
      return res.status(400).json({ error: 'Provide a file upload or Google Sheets URL' });
    }

    const db = getDb();
    const aliasMap = buildTeamAliasMap(db);
    const parsed = parseSpreadsheet(buffer);
    const { resolved, errors } = resolveTeams(parsed.picks, aliasMap);

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Unresolved team names', errors });
    }

    const validationErrors = validateImport(parsed.contestants, resolved);
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: validationErrors[0], validationErrors });
    }

    const result = executeImport(db, gameName.trim(), parsed.contestants, resolved);

    // Trigger ESPN score update in background
    updateScores(db).catch(() => {});

    res.json({ gameCode: result.gameCode, message: 'Draft imported successfully' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * Fetch a Google Sheets document as CSV.
 */
async function fetchGoogleSheet(url) {
  // Extract spreadsheet ID from various Google Sheets URL formats
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    throw new Error('Invalid Google Sheets URL. Expected format: https://docs.google.com/spreadsheets/d/{ID}/...');
  }

  const id = match[1];
  const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;

  const response = await fetch(csvUrl);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Google Sheet not found. Check the URL and ensure the sheet is shared as "Anyone with the link can view".');
    }
    throw new Error(`Failed to fetch Google Sheet (HTTP ${response.status}). Make sure the sheet is publicly shared.`);
  }

  const text = await response.text();
  return Buffer.from(text, 'utf-8');
}

/**
 * Build a preview grid from resolved picks and errors.
 */
function buildPreviewGrid(contestants, resolved, errors) {
  const grid = [];
  for (let round = 1; round <= 16; round++) {
    const row = [];
    for (let col = 0; col < 8; col++) {
      const contestantName = contestants[col];
      const pick = resolved.find(
        p => p.contestant === contestantName && p.round === round
      );
      const error = errors.find(
        e => e.contestant === contestantName && e.round === round
      );

      if (pick) {
        row.push({
          team: pick.team.name,
          seed: pick.team.seed,
          region: pick.team.region,
          matchType: pick.matchType,
          raw: pick.rawTeamName,
        });
      } else if (error) {
        row.push({
          team: null,
          raw: error.raw,
          error: error.message,
        });
      } else {
        row.push({ team: null, raw: '', empty: true });
      }
    }
    grid.push(row);
  }
  return grid;
}

module.exports = router;
