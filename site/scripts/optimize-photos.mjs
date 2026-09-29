// Redimensionne et compresse toutes les photos d'un dossier pour le web.
// Usage : node scripts/optimize-photos.mjs public/images/story
//         node scripts/optimize-photos.mjs public/images/carnet
import sharp from "sharp";
import { readdirSync, statSync, writeFileSync, renameSync, unlinkSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const target = process.argv[2] || "public/images/story";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.isAbsolute(target) ? target : path.join(root, target);

const files = readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f));

// Windows verrouille parfois brièvement un fichier qu'on vient d'écrire (antivirus,
// indexation) : on retente le remplacement quelques fois avant d'abandonner.
function replaceWithRetry(tmp, dest, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try {
      if (existsSync(dest)) unlinkSync(dest);
      renameSync(tmp, dest);
      return;
    } catch (err) {
      if (i === attempts - 1) throw err;
    }
  }
}

for (const file of files) {
  const full = path.join(dir, file);
  const before = statSync(full).size;
  const buf = await sharp(full)
    .rotate()
    .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const tmp = full + ".tmp";
  writeFileSync(tmp, buf);
  replaceWithRetry(tmp, full);
  const after = statSync(full).size;
  console.log(`${file}: ${(before / 1024 / 1024).toFixed(2)}MB -> ${(after / 1024).toFixed(0)}KB`);
}
