/**
 * SQLite database singleton using better-sqlite3.
 * All tables are created on first run via init().
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve("./data/roof-tool.db");

// Ensure the data directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    initSchema(_db);
    migrateSchema(_db);
  }
  return _db;
}

/** Safe column-add: does nothing if column already exists */
function addColumnIfMissing(db: Database.Database, table: string, column: string, type: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

/** Run schema migrations for existing databases */
function migrateSchema(db: Database.Database) {
  addColumnIfMissing(db, "clients", "lat", "REAL");
  addColumnIfMissing(db, "clients", "lng", "REAL");
  addColumnIfMissing(db, "measurements", "source", "TEXT NOT NULL DEFAULT 'manual'");
}

function initSchema(db: Database.Database) {
  db.exec(`
    -- Clients
    CREATE TABLE IF NOT EXISTS clients (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      name              TEXT NOT NULL,
      drive_folder_name TEXT NOT NULL,
      address           TEXT,
      phone             TEXT,
      email             TEXT,
      lat               REAL,
      lng               REAL,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Jobs
    CREATE TABLE IF NOT EXISTS jobs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id     INTEGER NOT NULL REFERENCES clients(id),
      status        TEXT NOT NULL DEFAULT 'created',
      error_message TEXT,
      notes         TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at  TEXT
    );

    -- Images attached to a job
    CREATE TABLE IF NOT EXISTS job_images (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id           INTEGER NOT NULL REFERENCES jobs(id),
      drive_file_id    TEXT NOT NULL,
      angle            TEXT NOT NULL DEFAULT 'other',
      filename         TEXT NOT NULL,
      thumbnail_url    TEXT,
      exif_lat         REAL,
      exif_lng         REAL,
      exif_altitude    REAL,
      exif_gimbal_angle REAL
    );

    -- Measurements derived from ODM output, satellite, manual, or blended
    CREATE TABLE IF NOT EXISTS measurements (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id            INTEGER NOT NULL REFERENCES jobs(id),
      source            TEXT NOT NULL DEFAULT 'manual',
      total_sqft        REAL NOT NULL,
      pitch_degrees     REAL NOT NULL,
      pitch_bracket     TEXT NOT NULL,
      ridge_length_ft   REAL NOT NULL DEFAULT 0,
      eave_length_ft    REAL NOT NULL DEFAULT 0,
      valley_length_ft  REAL NOT NULL DEFAULT 0,
      complexity_score  REAL NOT NULL DEFAULT 1.0,
      odm_task_id       TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Satellite estimates (kept separately for blending)
    CREATE TABLE IF NOT EXISTS satellite_estimates (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id            INTEGER NOT NULL REFERENCES jobs(id),
      footprint_sqft    REAL NOT NULL,
      roof_sqft         REAL NOT NULL,
      pitch_degrees     REAL NOT NULL DEFAULT 26.57,
      pitch_bracket     TEXT NOT NULL DEFAULT 'medium',
      eave_length_ft    REAL NOT NULL DEFAULT 0,
      osm_building_id   TEXT,
      source            TEXT NOT NULL DEFAULT 'osm',
      polygon_json      TEXT,
      lat               REAL,
      lng               REAL,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Quotes (service_types is a JSON array, e.g. '["reroof","gutter_clean"]')
    CREATE TABLE IF NOT EXISTS quotes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id        INTEGER NOT NULL REFERENCES jobs(id),
      service_types TEXT NOT NULL DEFAULT '[]',
      line_items    TEXT NOT NULL DEFAULT '[]',
      subtotal      REAL NOT NULL DEFAULT 0,
      tax_rate      REAL NOT NULL DEFAULT 0,
      tax           REAL NOT NULL DEFAULT 0,
      total         REAL NOT NULL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'draft',
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- App-wide settings (key/value)
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Seed default pricing if not present
    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('reroof_per_sqft',        '10.00'),
      ('spray_per_sqft',         '1.00'),
      ('tuneup_per_sqft',        '0.15'),
      ('gutter_clean_per_linft', '0.40'),
      ('pitch_flat',             '1.00'),
      ('pitch_low',              '1.10'),
      ('pitch_medium',           '1.25'),
      ('pitch_steep',            '1.45'),
      ('pitch_very_steep',       '1.70'),
      ('tax_rate',               '0.00');
  `);
}
