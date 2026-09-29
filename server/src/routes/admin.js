import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import ExcelJS from "exceljs";
import { db, listResponses, getResponse, updateResponse, deleteResponse, getStats } from "../db.js";
import { requireAuth } from "../auth.js";

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
