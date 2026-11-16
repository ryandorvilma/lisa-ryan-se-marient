import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import ExcelJS from "exceljs";
import { db, listResponses, getResponse, updateResponse, deleteResponse, getStats } from "../db.js";
import { requireAuth } from "../auth.js";
import { getSeating, createTable, updateTable, deleteTable, tableExists, assignSeats, getHeadcount } from "../seating.js";

export const adminRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives, merci de réessayer plus tard." },
});

adminRouter.post("/login", loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Identifiants requis." });

  const admin = db.prepare(`SELECT * FROM admins WHERE username = ?`).get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: "Identifiants incorrects." });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: "Erreur serveur." });
    req.session.adminId = admin.id;
    res.json({ ok: true });
  });
});

adminRouter.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

adminRouter.get("/me", (req, res) => {
  res.json({ authenticated: Boolean(req.session?.adminId) });
});

// Everything below requires authentication.
adminRouter.use(requireAuth);

adminRouter.get("/stats", (_req, res) => {
  res.json(getStats());
});

adminRouter.get("/headcount", (_req, res) => {
  res.json(getHeadcount());
});

// ---------- Plan de table ----------
function parseTable(b) {
  const name = String(b?.name ?? "").trim().slice(0, 60);
  const kind = b?.kind === "kids" ? "kids" : "table";
  // l'espace enfants peut accueillir beaucoup plus de monde qu'une table
  const capacity = Math.max(1, Math.min(kind === "kids" ? 150 : 30, parseInt(b?.capacity, 10) || 8));
  const notes = String(b?.notes ?? "").slice(0, 200);
  return { name, capacity, notes, kind };
}

adminRouter.get("/seating", (_req, res) => {
  res.json(getSeating());
});

adminRouter.post("/tables", (req, res) => {
  const t = parseTable(req.body);
  if (!t.name) return res.status(400).json({ error: "Nom de table requis." });
  const r = createTable(t);
  res.status(201).json({ id: r.lastInsertRowid });
});

adminRouter.put("/tables/:id", (req, res) => {
  const current = db.prepare(`SELECT kind FROM seating_tables WHERE id = ?`).get(req.params.id);
  if (!current) return res.status(404).json({ error: "Table introuvable." });
  const t = parseTable({ ...req.body, kind: current.kind });
  if (!t.name) return res.status(400).json({ error: "Nom de table requis." });
  updateTable(req.params.id, t);
  res.json({ ok: true });
});

adminRouter.delete("/tables/:id", (req, res) => {
  deleteTable(req.params.id);
  res.json({ ok: true });
});

adminRouter.put("/seating/assign", (req, res) => {
  const keys = Array.isArray(req.body?.keys) ? req.body.keys.map(String).filter((k) => /^\d+:[acb]\d+$/.test(k)).slice(0, 50) : [];
  const tableId = req.body?.tableId == null ? null : parseInt(req.body.tableId, 10);
  if (!keys.length) return res.status(400).json({ error: "Aucun invité." });
  if (tableId !== null && !tableExists(tableId)) return res.status(404).json({ error: "Table introuvable." });
  assignSeats(keys, tableId);
  res.json({ ok: true });
});

adminRouter.get("/seating.xlsx", async (_req, res) => {
  const { tables, persons } = getSeating();
  const typeLabel = { adult: "Adulte", child: "Enfant", baby: "Bébé" };
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Plan de table");
  sheet.columns = [
    { header: "Table", key: "table", width: 22 },
    { header: "Invité", key: "name", width: 30 },
    { header: "Type", key: "type", width: 10 },
    { header: "Famille", key: "family", width: 26 },
    { header: "Régime / allergies", key: "diet", width: 36 },
  ];
  sheet.getRow(1).font = { bold: true };
  const byTable = new Map(tables.map((t) => [t.id, t.name]));
  const sorted = [...persons].sort((a, b) => {
    const ia = a.tableId ? tables.findIndex((t) => t.id === a.tableId) : 1e9;
    const ib = b.tableId ? tables.findIndex((t) => t.id === b.tableId) : 1e9;
    return ia - ib || a.family.localeCompare(b.family, "fr");
  });
  sorted.forEach((p) =>
    sheet.addRow({ table: p.tableId ? byTable.get(p.tableId) : "— Non placé —", name: p.name, type: typeLabel[p.type], family: p.family, diet: p.diet })
  );
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="plan-de-table-lisa-ryan.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

adminRouter.get("/responses", (req, res) => {
  const search = String(req.query.q || "");
  res.json(listResponses(search));
});

adminRouter.put("/responses/:id", (req, res) => {
  const existing = getResponse(req.params.id);
  if (!existing) return res.status(404).json({ error: "Introuvable." });
  const b = req.body || {};
  const adults = Math.max(0, Math.min(10, parseInt(b.adults, 10) || 0));
  const children = Math.max(0, Math.min(10, parseInt(b.children, 10) || 0));
  const babies = Math.max(0, Math.min(10, parseInt(b.babies, 10) || 0));
  const totalGuests = adults + children;
  const dietVegetarian = Math.max(0, Math.min(totalGuests, parseInt(b.diet_vegetarian, 10) || 0));
  const dietHalal = Math.max(0, Math.min(totalGuests, parseInt(b.diet_halal, 10) || 0));

  if (dietVegetarian + dietHalal > totalGuests) {
    return res.status(400).json({ error: "Le nombre de repas spéciaux ne peut pas dépasser le nombre d'invités." });
  }

  const record = {
    first_name: String(b.first_name ?? existing.first_name).slice(0, 80),
    last_name: String(b.last_name ?? existing.last_name).slice(0, 80),
    attending: b.attending === "no" ? "no" : "yes",
    adults,
    children,
    babies,
    companions: String(b.companions ?? "").slice(0, 500),
    join_ceremony: b.join_ceremony ? 1 : 0,
    join_cocktail: b.join_cocktail ? 1 : 0,
    join_dinner: b.join_dinner ? 1 : 0,
    join_brunch: b.join_brunch ? 1 : 0,
    diet_vegetarian: dietVegetarian,
    diet_halal: dietHalal,
    diet_notes: String(b.diet_notes ?? "").slice(0, 500),
    logistics: String(b.logistics ?? "").slice(0, 500),
    message: String(b.message ?? "").slice(0, 1000),
  };
  updateResponse(req.params.id, record);
  res.json({ ok: true });
});

adminRouter.delete("/responses/:id", (req, res) => {
  deleteResponse(req.params.id);
  res.json({ ok: true });
});

const EXPORT_COLUMNS = [
  { header: "Prénom", key: "first_name" },
  { header: "Nom", key: "last_name" },
  { header: "Présence", key: "attending" },
  { header: "Adultes", key: "adults" },
  { header: "Enfants", key: "children" },
  { header: "Bébés", key: "babies" },
  { header: "Accompagnants", key: "companions" },
  { header: "Église", key: "join_ceremony" },
  { header: "Vin d'honneur", key: "join_cocktail" },
  { header: "Repas", key: "join_dinner" },
  { header: "Escale gourmande", key: "join_brunch" },
  { header: "Végétarien", key: "diet_vegetarian" },
  { header: "Halal", key: "diet_halal" },
  { header: "Allergies / précisions", key: "diet_notes" },
  { header: "Transport / hébergement", key: "logistics" },
  { header: "Message", key: "message" },
  { header: "Reçu le", key: "created_at" },
];

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

adminRouter.get("/export.csv", (_req, res) => {
  const rows = listResponses();
  const header = EXPORT_COLUMNS.map((c) => c.header).join(";");
  const lines = rows.map((r) => EXPORT_COLUMNS.map((c) => csvEscape(r[c.key])).join(";"));
  const csv = "﻿" + [header, ...lines].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="rsvp-lisa-ryan.csv"');
  res.send(csv);
});

adminRouter.get("/export.xlsx", async (_req, res) => {
  const rows = listResponses();
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("RSVP");
  sheet.columns = EXPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 22 }));
  sheet.getRow(1).font = { bold: true };
  rows.forEach((r) => sheet.addRow(r));

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", 'attachment; filename="rsvp-lisa-ryan.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});
