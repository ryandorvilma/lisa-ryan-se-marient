import "dotenv/config";
import express from "express";
import session from "express-session";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

import { rsvpRouter } from "./routes/rsvp.js";
import { calendarRouter } from "./routes/calendar.js";
import { adminRouter } from "./routes/admin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const PORT = process.env.PORT || 8787;
const IS_PROD = process.env.NODE_ENV === "production";
const SESSION_SECRET = process.env.SESSION_SECRET;

if (IS_PROD && (!SESSION_SECRET || SESSION_SECRET.length < 32)) {
  console.error("SESSION_SECRET manquant ou trop court (>=32 caractères) — voir .env.example");
  process.exit(1);
}

app.set("trust proxy", 1);
app.use(express.json({ limit: "50kb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(
  session({
    secret: SESSION_SECRET || "dev-only-secret-change-me",
    name: "lr.sid",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8, // 8h
    },
  })
);

app.use("/api/rsvp", rsvpRouter);
app.use("/api", calendarRouter);
app.use("/admin/api", adminRouter);

app.use("/admin", express.static(path.join(__dirname, "public", "admin")));

// Serve the built Astro site in production (npm run build in ../site → site/dist)
const siteDist = path.join(__dirname, "..", "..", "site", "dist");
if (IS_PROD && fs.existsSync(siteDist)) {
  app.use(express.static(siteDist));
  app.get(/^(?!\/api|\/admin).*/, (_req, res) => {
    res.sendFile(path.join(siteDist, "404.html"), (err) => {
      if (err) res.status(404).send("Page introuvable.");
    });
  });
}

app.listen(PORT, () => {
  console.log(`Serveur RSVP/admin démarré sur http://localhost:${PORT}`);
});
