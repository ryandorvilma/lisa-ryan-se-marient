# Mode opératoire — déployer une mise à jour (GitHub → serveur)

Site : https://lisa-ryan-se-marient.fr
Dépôt : https://github.com/ryandorvilma/lisa-ryan-se-marient (branche `main`)
Serveur : VPS Hostinger `72.62.236.111` (Ubuntu, Docker + Traefik pour le HTTPS)

## En bref (3 étapes)

1. **Pousser** sur GitHub, branche `main` :
   ```bash
   git add -A && git commit -m "Description du changement" && git push origin main
   ```
2. **Se connecter** au VPS (hPanel → VPS → Terminal navigateur, ou en SSH) et lancer :
   ```bash
   /docker/mariage/deploy.sh
   ```
3. **Vérifier** : la dernière ligne doit être `OK (HTTP 200)`, puis ouvrir le site avec **Ctrl+F5**.

Durée : environ 1 à 2 minutes. Le site reste en ligne pendant la construction ; il n'est coupé que quelques secondes au redémarrage.

## Ce que fait `deploy.sh`

1. Sauvegarde la base des réponses RSVP dans `/docker/mariage/backups/rsvp-avant-deploy-<date>.sqlite3`.
2. Récupère `origin/main` depuis GitHub (`git fetch` + `git reset --hard`).
3. Reconstruit l'image Docker : build Astro du site, puis installation du serveur Node.
4. Redémarre le conteneur `mariage`.
5. Contrôle que le site répond (HTTP 200), sinon affiche `ECHEC`.

## Ce qui n'est PAS touché par un déploiement

- **Les réponses RSVP** : elles sont dans le volume Docker `mariage_mariage_data` (fichier `/data/rsvp.sqlite3`), indépendant du code.
- **Le compte admin** : stocké dans cette même base.
- **Le secret de session** : `/docker/mariage/.env` (jamais dans GitHub).
- **n8n, Traefik et les autres conteneurs** du serveur.

## Règles à retenir

- **Toujours pousser avant de déployer** : le serveur ne lit que GitHub, pas votre PC. Un fichier non poussé n'existe pas en ligne.
- Les photos vont dans `site/public/images/…` et doivent être **commitées** (elles ne sont pas ignorées par Git).
- Ne jamais commiter `.env`, `*.sqlite3` ni `node_modules` (déjà dans `.gitignore`).
- Après un déploiement, si une page semble ancienne : **Ctrl+F5** (cache du navigateur).

## Vérifications rapides

```bash
docker ps --filter name=mariage        # le conteneur est "Up"
docker logs mariage --tail 20          # doit finir par "Serveur RSVP/admin démarré..."
git -C /docker/mariage/repo log --oneline -1   # version de GitHub actuellement déployée
```

Test depuis n'importe où : `https://lisa-ryan-se-marient.fr/`, `/rsvp/`, `/admin/login.html`.

## Revenir en arrière

**Code** : sur votre PC, annuler le commit fautif et repousser, puis relancer `deploy.sh` :
```bash
git revert <id-du-commit> && git push origin main
```

**Base RSVP** (uniquement en cas de vraie perte de données) :
```bash
cd /docker/mariage
docker cp backups/<fichier>.sqlite3 mariage:/data/rsvp.sqlite3
docker restart mariage
```
Sauvegardes disponibles : une copie automatique chaque nuit à 4h (60 jours conservés) + une copie avant chaque déploiement, dans `/docker/mariage/backups/`.

## Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| `ECHEC (HTTP 000/502)` | le conteneur ne démarre pas | `docker logs mariage --tail 50` |
| Le build échoue à `npm run build` | erreur dans le code du site | corriger, pousser, relancer |
| La modification n'apparaît pas | non poussée, ou cache navigateur | `git -C /docker/mariage/repo log -1` puis Ctrl+F5 |
| Site inaccessible / certificat | Traefik ou DNS | `docker ps` (traefik doit être Up) ; DNS : enregistrement `A` → `72.62.236.111` |
| `git fetch` refuse | dépôt devenu privé | le repasser en public ou ajouter une clé de déploiement |

## Réinstallation complète (serveur neuf)

1. Installer Docker, Git, et Traefik (réseau + Let's Encrypt).
2. `git clone https://github.com/ryandorvilma/lisa-ryan-se-marient.git /docker/mariage/repo`
3. Recréer dans `/docker/mariage/` : `Dockerfile.build`, `docker-compose.yml` (labels Traefik pour le domaine), `deploy.sh`, et `.env` avec `SESSION_SECRET=<64 caractères aléatoires>` (`openssl rand -hex 32`).
4. `./deploy.sh`
5. Créer le compte admin : `docker exec mariage node src/create-admin.js <identifiant> <mot-de-passe>`
6. Pointer le DNS (`A` du domaine vers l'IP du serveur).

## Mémo

- Dossier serveur : `/docker/mariage/` (`repo/`, `Dockerfile.build`, `docker-compose.yml`, `deploy.sh`, `.env`, `backups/`)
- Conteneur : `mariage` (port interne 8787, exposé en HTTPS par Traefik)
- Admin : https://lisa-ryan-se-marient.fr/admin/login.html (identifiant `lisa-ryan`)
- Domaine acheté chez Hostinger, expire le 29/09/2027 (renouvellement à activer dans hPanel)
