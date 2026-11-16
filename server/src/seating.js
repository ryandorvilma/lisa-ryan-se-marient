import { db } from "./db.js";

db.exec(`
  CREATE TABLE IF NOT EXISTS seating_tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 8,
    notes TEXT DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS seat_assignments (
    person_key TEXT PRIMARY KEY,
    table_id INTEGER NOT NULL REFERENCES seating_tables(id) ON DELETE CASCADE
  );
`);

// "table" = table classique, "kids" = espace repas dédié aux enfants
try {
  db.exec(`ALTER TABLE seating_tables ADD COLUMN kind TEXT NOT NULL DEFAULT 'table'`);
} catch {
  // colonne déjà présente
}

// "Lisa MEYRE — Halal; Paul X — Végétarien, allergie : noix" → Map(nom normalisé → précisions)
function parseDietNotes(notes) {
  const map = new Map();
  for (const chunk of String(notes || "").split(";")) {
    const [name, detail] = chunk.split(" — ");
    if (name && detail) map.set(name.trim().toLocaleLowerCase("fr-FR"), detail.trim());
  }
  return map;
}

/**
 * Transforme chaque réponse "présente au repas" en liste de personnes individuelles.
 * Clé stable : `${responseId}:a0` (invité principal), `a1..` (adultes accompagnants),
 * `c0..` (enfants), `b0..` (bébés). Les accompagnants sont stockés "Prénom Nom, Prénom Nom"
 * dans l'ordre adultes puis enfants (cf. formulaire RSVP).
 */
export function listPersons({ dinnerOnly = true } = {}) {
  const rows = db
    .prepare(`SELECT * FROM responses WHERE attending='yes' ${dinnerOnly ? "AND join_dinner=1" : ""} ORDER BY last_name, first_name`)
    .all();
  const persons = [];
  for (const r of rows) {
    const family = `${r.first_name} ${r.last_name}`.trim();
    const diets = parseDietNotes(r.diet_notes);
    const names = String(r.companions || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const push = (key, name, type) =>
      persons.push({
        key: `${r.id}:${key}`,
        responseId: r.id,
        family,
        name,
        type,
        diet: diets.get(name.toLocaleLowerCase("fr-FR")) || "",
      });

    push("a0", family, "adult");
    let n = 0;
    for (let i = 1; i < r.adults; i++) push(`a${i}`, names[n++] || `Adulte ${i + 1} (${family})`, "adult");
    for (let i = 0; i < r.children; i++) push(`c${i}`, names[n++] || `Enfant ${i + 1} (${family})`, "child");
    for (let i = 0; i < (r.babies || 0); i++) push(`b${i}`, `Bébé ${i + 1} (${family})`, "baby");
  }
  return persons;
}

export function getSeating() {
  const persons = listPersons();
  const assignments = new Map(db.prepare(`SELECT person_key, table_id FROM seat_assignments`).all().map((a) => [a.person_key, a.table_id]));
  // Nettoie les affectations orphelines (réponse supprimée, nombre d'invités réduit, absent au repas)
  const valid = new Set(persons.map((p) => p.key));
  const del = db.prepare(`DELETE FROM seat_assignments WHERE person_key = ?`);
  for (const key of assignments.keys()) if (!valid.has(key)) del.run(key);

  const tables = db.prepare(`SELECT * FROM seating_tables ORDER BY sort, id`).all();
  return {
    tables,
    persons: persons.map((p) => ({ ...p, tableId: assignments.get(p.key) ?? null })),
  };
}

export function createTable({ name, capacity, notes, kind = "table" }) {
  const sort = db.prepare(`SELECT COALESCE(MAX(sort),0)+1 s FROM seating_tables`).get().s;
  return db
    .prepare(`INSERT INTO seating_tables (name, capacity, notes, sort, kind) VALUES (?, ?, ?, ?, ?)`)
    .run(name, capacity, notes, sort, kind === "kids" ? "kids" : "table");
}

export function updateTable(id, { name, capacity, notes }) {
  return db.prepare(`UPDATE seating_tables SET name=?, capacity=?, notes=? WHERE id=?`).run(name, capacity, notes, id);
}

export function deleteTable(id) {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM seat_assignments WHERE table_id = ?`).run(id);
    db.prepare(`DELETE FROM seating_tables WHERE id = ?`).run(id);
  });
  tx();
}

export function tableExists(id) {
  return Boolean(db.prepare(`SELECT 1 FROM seating_tables WHERE id = ?`).get(id));
}

export function assignSeats(keys, tableId) {
  const tx = db.transaction(() => {
    const del = db.prepare(`DELETE FROM seat_assignments WHERE person_key = ?`);
    const ins = db.prepare(`INSERT INTO seat_assignments (person_key, table_id) VALUES (?, ?)`);
    for (const k of keys) {
      del.run(k);
      if (tableId) ins.run(k, tableId);
    }
  });
  tx();
}

/** Effectifs en personnes (et non en réponses), par moment de la journée. */
export function getHeadcount() {
  const rows = db.prepare(`SELECT * FROM responses`).all();
  const empty = () => ({ adults: 0, children: 0, babies: 0, total: 0, seats: 0 });
  const events = { ceremony: empty(), cocktail: empty(), dinner: empty(), brunch: empty(), global: empty() };
  const add = (bucket, r) => {
    bucket.adults += r.adults;
    bucket.children += r.children;
    bucket.babies += r.babies || 0;
    bucket.total += r.adults + r.children + (r.babies || 0);
    bucket.seats += r.adults + r.children;
  };
  let vegetarian = 0;
  let halal = 0;
  let allergies = 0;
  for (const r of rows) {
    if (r.attending !== "yes") continue;
    add(events.global, r);
    if (r.join_ceremony) add(events.ceremony, r);
    if (r.join_cocktail) add(events.cocktail, r);
    if (r.join_dinner) {
      add(events.dinner, r);
      vegetarian += r.diet_vegetarian;
      halal += r.diet_halal;
      allergies += (String(r.diet_notes || "").match(/allergie/gi) || []).length;
    }
  }
  const dinnerSeats = events.dinner.seats;
  return {
    responses: {
      total: rows.length,
      confirmed: rows.filter((r) => r.attending === "yes").length,
      declined: rows.filter((r) => r.attending === "no").length,
    },
    events,
    meals: {
      standard: Math.max(0, dinnerSeats - vegetarian - halal),
      vegetarian,
      halal,
      allergies,
      childMenus: events.dinner.children,
      highChairs: events.dinner.babies,
    },
  };
}
