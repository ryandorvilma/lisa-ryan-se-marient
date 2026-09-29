import { Router } from "express";
import rateLimit from "express-rate-limit";
import { insertResponse, updateResponse, findResponseByName } from "../db.js";

export const rsvpRouter = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives, merci de réessayer plus tard." },
});

function clampInt(value, min, max, fallback = 0) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function truncate(value, max) {
  return String(value ?? "").slice(0, max).trim();
}

function checked(value) {
  return value === "1" || value === true;
}

rsvpRouter.post("/", limiter, (req, res) => {
  const body = req.body || {};

  // Honeypot: bots fill every field, humans never see/fill this one.
  if (truncate(body.website, 100)) {
    return res.status(200).json({ ok: true });
  }

  const firstName = truncate(body.firstName, 80);
  const lastName = truncate(body.lastName, 80);

  if (!firstName || !lastName) {
    return res.status(400).json({ error: "Merci de compléter votre identité." });
  }

  const joinCeremony = checked(body.joinCeremony);
  const joinCocktail = checked(body.joinCocktail);
  const joinDinner = checked(body.joinDinner);
  const joinBrunch = checked(body.joinBrunch);
  const attending = joinCeremony || joinCocktail || joinDinner || joinBrunch ? "yes" : "no";

  const adults = attending === "yes" ? clampInt(body.adults, 1, 10, 1) : 0;
  const children = attending === "yes" ? clampInt(body.children, 0, 10, 0) : 0;
  const babies = attending === "yes" ? clampInt(body.babies, 0, 10, 0) : 0;
  const totalGuests = adults + children;

  const dietVegetarian = checked(body.dietVegetarian) ? clampInt(body.dietVegetarianCount, 1, totalGuests || 1, 1) : 0;
  const dietHalal = checked(body.dietHalal) ? clampInt(body.dietHalalCount, 1, totalGuests || 1, 1) : 0;

  if (dietVegetarian + dietHalal > totalGuests) {
    return res.status(400).json({ error: "Le nombre de repas spéciaux ne peut pas dépasser le nombre d'invités." });
  }

  const record = {
    first_name: firstName,
    last_name: lastName,
    attending,
    adults,
    children,
    babies,
    companions: truncate(body.companions, 500),
    join_ceremony: joinCeremony ? 1 : 0,
    join_cocktail: joinCocktail ? 1 : 0,
    join_dinner: joinDinner ? 1 : 0,
    join_brunch: joinBrunch ? 1 : 0,
    diet_vegetarian: dietVegetarian,
    diet_halal: dietHalal,
    diet_notes: truncate(body.dietNotes, 500),
    logistics: truncate(body.logistics, 500),
    message: truncate(body.message, 1000),
  };

  try {
    // Même nom/prénom qu'une réponse déjà reçue (insensible à la casse) : on met à jour
    // la fiche existante au lieu d'en créer une deuxième — l'invité peut renvoyer le
    // formulaire pour corriger sa réponse sans dupliquer sa ligne côté admin.
    const existing = findResponseByName(firstName, lastName);
    if (existing) {
      updateResponse(existing.id, record);
    } else {
      insertResponse(record);
    }
    return res.status(201).json({ ok: true, updated: Boolean(existing) });
  } catch (err) {
    console.error("RSVP insert failed:", err);
    return res.status(500).json({ error: "Une erreur est survenue, merci de réessayer." });
  }
});
