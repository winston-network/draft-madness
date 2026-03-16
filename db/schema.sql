CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  buy_in REAL DEFAULT 0,
  status TEXT DEFAULT 'lobby',
  pick_timer INTEGER DEFAULT 180,
  current_pick_deadline DATETIME,
  paused_remaining INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contestants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL REFERENCES games(id),
  name TEXT NOT NULL,
  draft_position INTEGER,
  tiebreaker_score INTEGER,
  session_token TEXT UNIQUE,
  UNIQUE(game_id, name)
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  seed INTEGER NOT NULL,
  region TEXT NOT NULL,
  espn_id TEXT,
  primary_color TEXT DEFAULT '#1e3a6e',
  logo_url TEXT
);

CREATE TABLE IF NOT EXISTS draft_picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL REFERENCES games(id),
  contestant_id INTEGER NOT NULL REFERENCES contestants(id),
  team_id INTEGER NOT NULL REFERENCES teams(id),
  pick_number INTEGER NOT NULL,
  round INTEGER NOT NULL,
  picked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(game_id, pick_number)
);

CREATE TABLE IF NOT EXISTS tournament_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  tournament_round INTEGER NOT NULL,
  won BOOLEAN NOT NULL,
  game_score INTEGER,
  opponent_score INTEGER,
  espn_game_id TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, tournament_round)
);
