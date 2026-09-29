// Convertit un fichier HEIC renommé en .jpg (courant avec les photos iPhone) en vrai JPEG,
// puis le redimensionne/compresse pour le web.
// Usage : node scripts/convert-heic.mjs public/images/story/monfichier.jpg
import convert from "heic-convert";
import sharp from "sharp";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/convert-heic.mjs <chemin/vers/fichier.jpg>");
  process.exit(1);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.isAbsolute(target) ? target : path.join(root, target);

const input = readFileSync(file);
const outputBuffer = await convert({ buffer: input, format: "JPEG", quality: 0.9 });
const resized = await sharp(outputBuffer)
  .rotate()
  .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
  .jpeg({ quality: 82, mozjpeg: true })
  .toBuffer();

const tmp = file + ".tmp";
writeFileSync(tmp, resized);
renameSync(tmp, file);
console.log(`Converted HEIC -> JPEG: ${(resized.length / 1024).toFixed(0)}KB`);
