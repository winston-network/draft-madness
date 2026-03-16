const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'march_madness.db');
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Run schema
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    db.exec(schema);

    // Migrate: add timer columns if missing (for existing databases)
    const gameColumns = db.prepare("PRAGMA table_info(games)").all().map(c => c.name);
    if (!gameColumns.includes('pick_timer')) {
      db.exec('ALTER TABLE games ADD COLUMN pick_timer INTEGER DEFAULT 180');
    }
    if (!gameColumns.includes('current_pick_deadline')) {
      db.exec('ALTER TABLE games ADD COLUMN current_pick_deadline DATETIME');
    }

    // Migrate: add team color/logo columns if missing (for existing databases)
    const teamColumns = db.prepare("PRAGMA table_info(teams)").all().map(c => c.name);
    if (!teamColumns.includes('primary_color')) {
      db.exec("ALTER TABLE teams ADD COLUMN primary_color TEXT DEFAULT '#1e3a6e'");
    }
    if (!teamColumns.includes('logo_url')) {
      db.exec('ALTER TABLE teams ADD COLUMN logo_url TEXT');
    }

    // Backfill logo_url for existing teams that have espn_id but no logo_url
    const needsLogo = db.prepare('SELECT COUNT(*) as c FROM teams WHERE espn_id IS NOT NULL AND logo_url IS NULL').get();
    if (needsLogo.c > 0) {
      db.exec("UPDATE teams SET logo_url = 'https://a.espncdn.com/i/teamlogos/ncaa/500/' || espn_id || '.png' WHERE espn_id IS NOT NULL AND logo_url IS NULL");
    }

    // Seed teams if empty
    const count = db.prepare('SELECT COUNT(*) as c FROM teams').get();
    if (count.c === 0) {
      seedTeams();
    }
  }
  return db;
}

function seedTeams() {
  // 2026 NCAA Tournament — REAL bracket (Selection Sunday 2026)
  // First Four TBD slots use placeholder; update after First Four games
  const espnLogo = (id) => `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png`;

  const teamData = [
    // ─── EAST REGION ───
    { name: 'Duke', seed: 1, region: 'East', espn_id: '150', primary_color: '#003087' },
    { name: 'UConn', seed: 2, region: 'East', espn_id: '41', primary_color: '#000E2F' },
    { name: 'Michigan St', seed: 3, region: 'East', espn_id: '127', primary_color: '#18453B' },
    { name: 'Kansas', seed: 4, region: 'East', espn_id: '2305', primary_color: '#0051BA' },
    { name: 'St. Johns', seed: 5, region: 'East', espn_id: '2599', primary_color: '#D41B2C' },
    { name: 'Louisville', seed: 6, region: 'East', espn_id: '97', primary_color: '#AD0000' },
    { name: 'UCLA', seed: 7, region: 'East', espn_id: '26', primary_color: '#2D68C4' },
    { name: 'Ohio State', seed: 8, region: 'East', espn_id: '194', primary_color: '#BB0000' },
    { name: 'TCU', seed: 9, region: 'East', espn_id: '2628', primary_color: '#4D1979' },
    { name: 'UCF', seed: 10, region: 'East', espn_id: '2116', primary_color: '#000000' },
    { name: 'South Florida', seed: 11, region: 'East', espn_id: '58', primary_color: '#006747' },
    { name: 'Northern Iowa', seed: 12, region: 'East', espn_id: '2460', primary_color: '#4B116F' },
    { name: 'CA Baptist', seed: 13, region: 'East', espn_id: '2856', primary_color: '#002B5C' },
    { name: 'N Dakota St', seed: 14, region: 'East', espn_id: '2449', primary_color: '#006633' },
    { name: 'Furman', seed: 15, region: 'East', espn_id: '231', primary_color: '#582C83' },
    { name: 'Siena', seed: 16, region: 'East', espn_id: '2561', primary_color: '#006838' },

    // ─── WEST REGION ───
    { name: 'Arizona', seed: 1, region: 'West', espn_id: '12', primary_color: '#CC0033' },
    { name: 'Purdue', seed: 2, region: 'West', espn_id: '2509', primary_color: '#CEB888' },
    { name: 'Gonzaga', seed: 3, region: 'West', espn_id: '2250', primary_color: '#002967' },
    { name: 'Arkansas', seed: 4, region: 'West', espn_id: '8', primary_color: '#9D2235' },
    { name: 'Wisconsin', seed: 5, region: 'West', espn_id: '275', primary_color: '#C5050C' },
    { name: 'BYU', seed: 6, region: 'West', espn_id: '252', primary_color: '#002E5D' },
    { name: 'Miami', seed: 7, region: 'West', espn_id: '2390', primary_color: '#F47321' },
    { name: 'Villanova', seed: 8, region: 'West', espn_id: '222', primary_color: '#003366' },
    { name: 'Utah State', seed: 9, region: 'West', espn_id: '328', primary_color: '#0F2439' },
    { name: 'Missouri', seed: 10, region: 'West', espn_id: '142', primary_color: '#F1B82D' },
    { name: 'NC St/Texas', seed: 11, region: 'West', espn_id: '152', primary_color: '#CC0000' },
    { name: 'High Point', seed: 12, region: 'West', espn_id: '2272', primary_color: '#330072' },
    { name: 'Hawaii', seed: 13, region: 'West', espn_id: '62', primary_color: '#024731' },
    { name: 'Kennesaw St', seed: 14, region: 'West', espn_id: '2320', primary_color: '#FDBB30' },
    { name: 'Queens', seed: 15, region: 'West', espn_id: '3101', primary_color: '#002D72' },
    { name: 'Long Island', seed: 16, region: 'West', espn_id: '112358', primary_color: '#003DA5' },

    // ─── SOUTH REGION ───
    { name: 'Florida', seed: 1, region: 'South', espn_id: '57', primary_color: '#0021A5' },
    { name: 'Houston', seed: 2, region: 'South', espn_id: '248', primary_color: '#C8102E' },
    { name: 'Illinois', seed: 3, region: 'South', espn_id: '356', primary_color: '#E84A27' },
    { name: 'Nebraska', seed: 4, region: 'South', espn_id: '158', primary_color: '#D00000' },
    { name: 'Vanderbilt', seed: 5, region: 'South', espn_id: '238', primary_color: '#866D4B' },
    { name: 'North Carolina', seed: 6, region: 'South', espn_id: '153', primary_color: '#7BAFD4' },
    { name: 'Saint Marys', seed: 7, region: 'South', espn_id: '2608', primary_color: '#D0202E' },
    { name: 'Clemson', seed: 8, region: 'South', espn_id: '228', primary_color: '#F56600' },
    { name: 'Iowa', seed: 9, region: 'South', espn_id: '2294', primary_color: '#FFCD00' },
    { name: 'Texas A&M', seed: 10, region: 'South', espn_id: '245', primary_color: '#500000' },
    { name: 'VCU', seed: 11, region: 'South', espn_id: '2670', primary_color: '#000000' },
    { name: 'McNeese', seed: 12, region: 'South', espn_id: '2377', primary_color: '#005DAA' },
    { name: 'Troy', seed: 13, region: 'South', espn_id: '2653', primary_color: '#8B2332' },
    { name: 'Penn', seed: 14, region: 'South', espn_id: '219', primary_color: '#011F5B' },
    { name: 'Idaho', seed: 15, region: 'South', espn_id: '70', primary_color: '#B5985A' },
    { name: 'PV/Lehigh', seed: 16, region: 'South', espn_id: '2504', primary_color: '#46166B' },

    // ─── MIDWEST REGION ───
    { name: 'Michigan', seed: 1, region: 'Midwest', espn_id: '130', primary_color: '#00274C' },
    { name: 'Iowa State', seed: 2, region: 'Midwest', espn_id: '66', primary_color: '#C8102E' },
    { name: 'Virginia', seed: 3, region: 'Midwest', espn_id: '258', primary_color: '#232D4B' },
    { name: 'Alabama', seed: 4, region: 'Midwest', espn_id: '333', primary_color: '#9E1B32' },
    { name: 'Texas Tech', seed: 5, region: 'Midwest', espn_id: '2641', primary_color: '#CC0000' },
    { name: 'Tennessee', seed: 6, region: 'Midwest', espn_id: '2633', primary_color: '#FF8200' },
    { name: 'Kentucky', seed: 7, region: 'Midwest', espn_id: '96', primary_color: '#0033A0' },
    { name: 'Georgia', seed: 8, region: 'Midwest', espn_id: '61', primary_color: '#BA0C2F' },
    { name: 'Saint Louis', seed: 9, region: 'Midwest', espn_id: '139', primary_color: '#003DA5' },
    { name: 'Santa Clara', seed: 10, region: 'Midwest', espn_id: '2541', primary_color: '#862633' },
    { name: 'SMU/MiaOH', seed: 11, region: 'Midwest', espn_id: '2567', primary_color: '#CC0035' },
    { name: 'Akron', seed: 12, region: 'Midwest', espn_id: '2006', primary_color: '#041E42' },
    { name: 'Hofstra', seed: 13, region: 'Midwest', espn_id: '2275', primary_color: '#003591' },
    { name: 'Wright St', seed: 14, region: 'Midwest', espn_id: '2750', primary_color: '#007A33' },
    { name: 'Tennessee St', seed: 15, region: 'Midwest', espn_id: '2634', primary_color: '#003E7E' },
    { name: 'UMBC/Howard', seed: 16, region: 'Midwest', espn_id: '2674', primary_color: '#000000' },
  ];

  const insert = db.prepare(
    'INSERT INTO teams (name, seed, region, espn_id, primary_color, logo_url) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const insertMany = db.transaction((teams) => {
    for (const t of teams) {
      insert.run(t.name, t.seed, t.region, t.espn_id, t.primary_color, espnLogo(t.espn_id));
    }
  });

  insertMany(teamData);
}

module.exports = { getDb };
