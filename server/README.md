# Serveur RSVP + Admin

Node/Express + SQLite. Sert l'API `/api/rsvp`, `/api/calendar.ics`, l'espace `/admin`, et en production
le site statique construit par Astro (`../site/dist`).

## Variables d'environnement

Copier `.env.example` en `.env` et renseigner `SESSION_SECRET` (chaîne aléatoire ≥32 caractères).

## Déploiement sur un VPS Hostinger

1. Sur le VPS : Node.js 20+, puis cloner/copier le projet.
2. `cd site && npm install && npm run build` (génère `site/dist`).
3. `cd server && npm install --omit=dev`
4. `cp .env.example .env` puis éditer `NODE_ENV=production`, `SESSION_SECRET=...`.
5. `node src/create-admin.js <identifiant> <mot-de-passe>`
6. Démarrer avec PM2 : `pm2 start src/index.js --name lisa-ryan` puis `pm2 save`.
7. Nginx en reverse proxy vers `http://127.0.0.1:8787` (exemple ci-dessous), + certificat SSL
   (Let's Encrypt / Hostinger).

```nginx
server {
    listen 80;
    server_name lisaetryan.fr www.lisaetryan.fr;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Sauvegardes

La base est un seul fichier : `server/data/rsvp.sqlite3`. Un simple cron suffit :

```bash
0 4 * * * cp /path/to/server/data/rsvp.sqlite3 /path/to/backups/rsvp-$(date +\%F).sqlite3
```

## Commandes utiles

- `npm run dev` — serveur avec rechargement auto (local)
- `npm start` — production
- `npm run create-admin -- <identifiant> <mot-de-passe>` — créer/mettre à jour un compte admin
