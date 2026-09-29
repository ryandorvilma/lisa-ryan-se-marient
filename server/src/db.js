import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "data", "rsvp.sqlite3");

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    attending TEXT NOT NULL CHECK (attending IN ('yes','no')),
    adults INTEGER NOT NULL DEFAULT 0,
    children INTEGER NOT NULL DEFAULT 0,
    babies INTEGER NOT NULL DEFAULT 0,
    companions TEXT DEFAULT '',
    join_ceremony INTEGER NOT NULL DEFAULT 0,
    join_cocktail INTEGER NOT NULL DEFAULT 0,
    join_dinner INTEGER NOT NULL DEFAULT 0,
    join_brunch INTEGER NOT NULL DEFAULT 0,
    diet_vegetarian INTEGER NOT NULL DEFAULT 0,
    diet_halal INTEGER NOT NULL DEFAULT 0,
    diet_notes TEXT DEFAULT '',
    logistics TEXT DEFAULT '',
    message TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  );
`);

// Migration pour les bases déjà créées avant l'ajout de la colonne "babies".
try {
  db.exec(`ALTER TABLE responses ADD COLUMN babies INTEGER NOT NULL DEFAULT 0`);
} catch {
  // colonne déjà présente
}

export function insertResponse(r) {
  const stmt = db.prepare(`
    INSERT INTO responses
      (first_name, last_name, attending, adults, children, babies, companions,
       join_ceremony, join_cocktail, join_dinner, join_brunch,
       diet_vegetarian, diet_halal, diet_notes, logistics, message)
    VALUES (@first_name, @last_name, @attending, @adults, @children, @babies, @companions,
            @join_ceremony, @join_cocktail, @join_dinner, @join_brunch,
            @diet_vegetarian, @diet_halal, @diet_notes, @logistics, @message)
  `);
  return stmt.run(r);
}

export function updateResponse(id, r) {
  const stmt = db.prepare(`
    UPDATE responses SET
      first_name=@first_name, last_name=@last_name, attending=@attending,
      adults=@adults, children=@children, babies=@babies, companions=@companions,
      join_ceremony=@join_ceremony, join_cocktail=@join_cocktail,
      join_dinner=@join_dinner, join_brunch=@join_brunch,
      diet_vegetarian=@diet_vegetarian, diet_halal=@diet_halal, diet_notes=@diet_notes,
      logistics=@logistics, message=@message,
      updated_at=datetime('now')
    WHERE id=@id
  `);
  return stmt.run({ ...r, id });
}

export function listResponses(search = "") {
  if (search) {
    const like = `%${search}%`;
    return db
      .prepare(
        `SELECT * FROM responses WHERE first_name LIKE ? OR last_name LIKE ? ORDER BY created_at DESC`
      )
      .all(like, like);
  }
  return db.prepare(`SELECT * FROM responses ORDER BY created_at DESC`).all();
}

export function getResponse(id) {
  return db.prepare(`SELECT * FROM responses WHERE id = ?`).get(id);
}

function normalizeName(s) {
  return String(s ?? "").trim().toLocaleLowerCase("fr-FR");
}

// Une même personne qui renvoie le formulaire (même nom/prénom, insensible à la casse
// et aux accents de casse) met à jour sa fiche existante plutôt que d'en créer une nouvelle.
export function findResponseByName(firstName, lastName) {
  const fn = normalizeName(firstName);
  const ln = normalizeName(lastName);
  if (!fn || !ln) return null;
  const rows = db.prepare(`SELECT * FROM responses`).all();
  return rows.find((r) => normalizeName(r.first_name) === fn && normalizeName(r.last_name) === ln) || null;
}

export function deleteResponse(id) {
  return db.prepare(`DELETE FROM responses WHERE id = ?`).run(id);
}

export function getStats() {
  const total = db.prepare(`SELECT COUNT(*) c FROM responses`).get().c;
  const confirmed = db.prepare(`SELECT COUNT(*) c FROM responses WHERE attending='yes'`).get().c;
  const declined = db.prepare(`SELECT COUNT(*) c FROM responses WHERE attending='no'`).get().c;
  const adults = db.prepare(`SELECT COALESCE(SUM(adults),0) c FROM responses WHERE attending='yes'`).get().c;
  const children = db.prepare(`SELECT COALESCE(SUM(children),0) c FROM responses WHERE attending='yes'`).get().c;
  const babies = db.prepare(`SELECT COALESCE(SUM(babies),0) c FROM responses WHERE attending='yes'`).get().c;
  const ceremony = db.prepare(`SELECT COUNT(*) c FROM responses WHERE attending='yes' AND join_ceremony=1`).get().c;
  const cocktail = db.prepare(`SELECT COUNT(*) c FROM responses WHERE attending='yes' AND join_cocktail=1`).get().c;
  const dinner = db.prepare(`SELECT COUNT(*) c FROM responses WHERE attending='yes' AND join_dinner=1`).get().c;
  const brunch = db.prepare(`SELECT COUNT(*) c FROM responses WHERE attending='yes' AND join_brunch=1`).get().c;
  const vegetarian = db.prepare(`SELECT COALESCE(SUM(diet_vegetarian),0) c FROM responses WHERE attending='yes'`).get().c;
  const halal = db.prepare(`SELECT COALESCE(SUM(diet_halal),0) c FROM responses WHERE attending='yes'`).get().c;
  const withDietary = db
    .prepare(
      `SELECT COUNT(*) c FROM responses WHERE attending='yes' AND (diet_vegetarian>0 OR diet_halal>0 OR TRIM(diet_notes) <> '')`
    )
    .get().c;
  return { total, confirmed, declined, adults, children, babies, ceremony, cocktail, dinner, brunch, vegetarian, halal, withDietary };
}
