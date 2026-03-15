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
  // 2025 NCAA Tournament teams - placeholder data
  // These get updated each year when bracket is announced
  const espnLogo = (id) => `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png`;

  const teamData = [
    // East Region
    { name: 'Duke', seed: 1, region: 'East', espn_id: '150', primary_color: '#003087' },
    { name: 'Alabama', seed: 2, region: 'East', espn_id: '333', primary_color: '#9E1B32' },
    { name: 'Wisconsin', seed: 3, region: 'East', espn_id: '275', primary_color: '#C5050C' },
    { name: 'Arizona', seed: 4, region: 'East', espn_id: '12', primary_color: '#CC0033' },
    { name: 'Oregon', seed: 5, region: 'East', espn_id: '2483', primary_color: '#154733' },
    { name: 'BYU', seed: 6, region: 'East', espn_id: '252', primary_color: '#002E5D' },
    { name: 'St. Marys', seed: 7, region: 'East', espn_id: '2608', primary_color: '#D0202E' },
    { name: 'Mississippi St', seed: 8, region: 'East', espn_id: '344', primary_color: '#660000' },
    { name: 'Creighton', seed: 9, region: 'East', espn_id: '156', primary_color: '#005CA9' },
    { name: 'New Mexico', seed: 10, region: 'East', espn_id: '167', primary_color: '#BA0C2F' },
    { name: 'VCU', seed: 11, region: 'East', espn_id: '2670', primary_color: '#000000' },
    { name: 'Liberty', seed: 12, region: 'East', espn_id: '2335', primary_color: '#002D62' },
    { name: 'Akron', seed: 13, region: 'East', espn_id: '2006', primary_color: '#041E42' },
    { name: 'Montana', seed: 14, region: 'East', espn_id: '149', primary_color: '#6C2740' },
    { name: 'Robert Morris', seed: 15, region: 'East', espn_id: '2523', primary_color: '#14234B' },
    { name: 'Am. University', seed: 16, region: 'East', espn_id: '44', primary_color: '#ED1B2E' },

    // West Region
    { name: 'Florida', seed: 1, region: 'West', espn_id: '57', primary_color: '#0021A5' },
    { name: 'St. Johns', seed: 2, region: 'West', espn_id: '2599', primary_color: '#D41B2C' },
    { name: 'Texas Tech', seed: 3, region: 'West', espn_id: '2641', primary_color: '#CC0000' },
    { name: 'Maryland', seed: 4, region: 'West', espn_id: '120', primary_color: '#E03a3E' },
    { name: 'Memphis', seed: 5, region: 'West', espn_id: '235', primary_color: '#003087' },
    { name: 'Missouri', seed: 6, region: 'West', espn_id: '142', primary_color: '#F1B82D' },
    { name: 'Kansas', seed: 7, region: 'West', espn_id: '2305', primary_color: '#0051BA' },
    { name: 'UConn', seed: 8, region: 'West', espn_id: '41', primary_color: '#000E2F' },
    { name: 'Oklahoma', seed: 9, region: 'West', espn_id: '201', primary_color: '#841617' },
    { name: 'Arkansas', seed: 10, region: 'West', espn_id: '8', primary_color: '#9D2235' },
    { name: 'Drake', seed: 11, region: 'West', espn_id: '2181', primary_color: '#004477' },
    { name: 'Colorado St', seed: 12, region: 'West', espn_id: '36', primary_color: '#1E4D2B' },
    { name: 'Yale', seed: 13, region: 'West', espn_id: '43', primary_color: '#00356B' },
    { name: 'Lipscomb', seed: 14, region: 'West', espn_id: '288', primary_color: '#461D7C' },
    { name: 'Omaha', seed: 15, region: 'West', espn_id: '2350', primary_color: '#000000' },
    { name: 'Norfolk St', seed: 16, region: 'West', espn_id: '2450', primary_color: '#007A33' },

    // South Region
    { name: 'Auburn', seed: 1, region: 'South', espn_id: '2', primary_color: '#0C2340' },
    { name: 'Michigan St', seed: 2, region: 'South', espn_id: '127', primary_color: '#18453B' },
    { name: 'Iowa St', seed: 3, region: 'South', espn_id: '66', primary_color: '#C8102E' },
    { name: 'Texas A&M', seed: 4, region: 'South', espn_id: '245', primary_color: '#500000' },
    { name: 'Clemson', seed: 5, region: 'South', espn_id: '228', primary_color: '#F56600' },
    { name: 'Illinois', seed: 6, region: 'South', espn_id: '356', primary_color: '#E84A27' },
    { name: 'UCLA', seed: 7, region: 'South', espn_id: '26', primary_color: '#2D68C4' },
    { name: 'Louisville', seed: 8, region: 'South', espn_id: '97', primary_color: '#AD0000' },
    { name: 'Gonzaga', seed: 9, region: 'South', espn_id: '2250', primary_color: '#002967' },
    { name: 'Georgia', seed: 10, region: 'South', espn_id: '61', primary_color: '#BA0C2F' },
    { name: 'NC State', seed: 11, region: 'South', espn_id: '152', primary_color: '#CC0000' },
    { name: 'UC San Diego', seed: 12, region: 'South', espn_id: '28', primary_color: '#182B49' },
    { name: 'Charleston', seed: 13, region: 'South', espn_id: '232', primary_color: '#800000' },
    { name: 'Troy', seed: 14, region: 'South', espn_id: '2653', primary_color: '#8B2332' },
    { name: 'Wofford', seed: 15, region: 'South', espn_id: '2747', primary_color: '#886829' },
    { name: 'AL St/SF Austin', seed: 16, region: 'South', espn_id: '2011', primary_color: '#D2A441' },

    // Midwest Region
    { name: 'Houston', seed: 1, region: 'Midwest', espn_id: '248', primary_color: '#C8102E' },
    { name: 'Tennessee', seed: 2, region: 'Midwest', espn_id: '2633', primary_color: '#FF8200' },
    { name: 'Kentucky', seed: 3, region: 'Midwest', espn_id: '96', primary_color: '#0033A0' },
    { name: 'Purdue', seed: 4, region: 'Midwest', espn_id: '2509', primary_color: '#CEB888' },
    { name: 'Michigan', seed: 5, region: 'Midwest', espn_id: '130', primary_color: '#00274C' },
    { name: 'Marquette', seed: 6, region: 'Midwest', espn_id: '269', primary_color: '#003366' },
    { name: 'Baylor', seed: 7, region: 'Midwest', espn_id: '239', primary_color: '#154734' },
    { name: 'San Diego St', seed: 8, region: 'Midwest', espn_id: '21', primary_color: '#A6192E' },
    { name: 'Georgia Tech', seed: 9, region: 'Midwest', espn_id: '59', primary_color: '#B3A369' },
    { name: 'Vanderbilt', seed: 10, region: 'Midwest', espn_id: '238', primary_color: '#866D4B' },
    { name: 'Dayton', seed: 11, region: 'Midwest', espn_id: '2182', primary_color: '#CE1141' },
    { name: 'McNeese', seed: 12, region: 'Midwest', espn_id: '2377', primary_color: '#005DAA' },
    { name: 'High Point', seed: 13, region: 'Midwest', espn_id: '2272', primary_color: '#330072' },
    { name: 'Grand Canyon', seed: 14, region: 'Midwest', espn_id: '2253', primary_color: '#522D80' },
    { name: 'SIUE', seed: 15, region: 'Midwest', espn_id: '2565', primary_color: '#CC0000' },
    { name: 'SFA/Al State', seed: 16, region: 'Midwest', espn_id: '2617', primary_color: '#3E2680' },
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
