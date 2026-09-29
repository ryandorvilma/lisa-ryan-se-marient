# Lisa & Ryan — 31 juillet 2027

Site de mariage. Deux projets séparés :

- **`site/`** — le site public (Astro + Tailwind). Toutes les 9 rubriques du cahier des charges.
- **`server/`** — l'API RSVP + l'espace admin privé (Node/Express + SQLite), pensé pour un VPS Hostinger.

## Démarrer en local

Deux terminaux :

```bash
cd server && npm install && npm run dev
```

```bash
cd site && npm install && npm run dev
```

Le site est sur `http://localhost:4321`, l'espace admin sur `http://localhost:4321/admin/login.html`
(proxifié automatiquement vers le serveur Node sur le port 8787).

Créer le premier compte admin :

```bash
cd server
node src/create-admin.js <identifiant> <mot-de-passe-solide>
```

## Ce qui est fait

- Les 9 rubriques (Accueil, Notre histoire, Plan de vol, Destination, Escale gourmande, Préparer votre
  voyage, RSVP, Carnet de voyage, Informations passagers), mobile-first, `prefers-reduced-motion` respecté.
- RSVP en parcours progressif (identité → présence → voyageurs → participation → repas conditionnel →
  complémentaire → message → confirmation), branché sur une vraie API.
- Espace admin protégé par mot de passe : statistiques, recherche, édition, export CSV/Excel.
- Contenu centralisé dans `site/src/data/*.json` — un seul endroit à modifier pour les horaires, adresses,
  FAQ, textes.

## Ce qu'il reste à faire avant la mise en ligne

1. **Palette exacte** — les couleurs viennent d'une lecture visuelle du PDF du faire-part
   (`Support/DORVILMA MEYRE FAIRE PART.pdf`). Si vous avez le fichier source (Canva/Illustrator/Figma),
   on ajuste les HEX dans `site/src/styles/global.css` (`@theme`).
2. **Photos réelles** — remplacer les placeholders :
   - **Notre histoire** : déposez vos photos dans `site/public/images/story/`, nommées par date
     (`20070727.jpg` = 27/07/2007, ou `202604.jpg` = avril 2026 si le jour importe peu). Ajoutez
     `_UneDescription` après la date pour une légende (`20220720_Princesse_Lylah.jpg` → « Princesse
     Lylah »). La chronologie (photo, année, légende, tri, points sur la timeline) se génère toute
     seule — rien à éditer ailleurs.
   - `site/src/data/venue.json` (château) → `site/public/images/`
   - `site/src/pages/carnet-de-voyage.astro` → `site/public/images/carnet/`
   - une image de couverture pour le partage WhatsApp → `site/public/images/og-cover.jpg`
   - Avant de déposer : compressez avec `node scripts/optimize-photos.mjs public/images/story` (depuis
     `site/`) — divise le poids par 10-50x. Si une photo vient d'un iPhone et ne s'affiche pas, elle est
     peut-être en HEIC malgré l'extension `.jpg` : `node scripts/convert-heic.mjs public/images/story/xxx.jpg`.
3. **Infos à compléter** dans `site/src/data/practical-info.json` : hôtels recommandés, dress code précis.
4. **Nom de domaine + hébergement** — voir `server/README.md` pour le déploiement sur un VPS Hostinger
   (Nginx + PM2 + Node).

## Où modifier quoi

| Je veux changer... | Fichier |
|---|---|
| Horaires de la journée / brunch | `site/src/data/schedule.json` |
| Adresse, parking, accessibilité du château | `site/src/data/venue.json` |
| Rubrique "Préparer votre voyage" | `site/src/data/practical-info.json` |
| Questions/réponses "Informations passagers" | `site/src/data/faq.json` |
| Date limite RSVP, contacts, email | `site/src/data/site.json` |
| Couleurs, typographies | `site/src/styles/global.css` |
