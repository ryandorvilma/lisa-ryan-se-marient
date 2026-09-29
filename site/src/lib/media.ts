import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

// Les scripts tournent depuis la racine de site/ (astro dev/build) ; import.meta.url pointe vers le
// bundle dans le build de production, donc on ne peut pas s'en servir pour retrouver public/.
const PUBLIC_DIR = path.join(process.cwd(), "public");

// Résout un chemin public ("/images/story/2007.jpg") vers le disque et dit s'il existe déjà,
// pour basculer automatiquement placeholder → vraie photo dès qu'un fichier est ajouté.
export function publicFileExists(publicPath: string): boolean {
  const cleaned = publicPath.replace(/^\//, "");
  return existsSync(path.join(PUBLIC_DIR, cleaned));
}

export interface StoryPhoto {
  src: string;
  date: Date;
  year: number;
  /** "27 juillet" (jour+mois) ou "avril" (mois seul) selon la précision du nom de fichier */
  sublabel: string;
  /** Mini description tirée du nom de fichier après le "_" (ex. Princesse_Lylah → "Princesse Lylah") */
  caption: string | null;
  file: string;
}

// AAAAMMJJ.jpg, AAAAMM.jpg, ou avec description : AAAAMMJJ_Description.jpg
const DATE_RE = /^(\d{4})(\d{2})(\d{2})?(?:_(.+))?\.(jpe?g|png|webp)$/i;
const frDayMonth = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });
const frMonth = new Intl.DateTimeFormat("fr-FR", { month: "long" });

function humanizeCaption(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lit site/public/images/story/ et transforme les photos nommées par date
 * (AAAAMMJJ.jpg ou AAAAMM.jpg — ex. 20070727.jpg, 202604.jpg) en entrées de
 * carrousel triées chronologiquement, avec année + date générées automatiquement.
 * Un "_" suivi d'un texte ajoute une mini description (ex. 20220720_Princesse_Lylah.jpg).
 * Déposer une photo suffit : aucune donnée à éditer à la main.
 */
export function listStoryPhotos(): StoryPhoto[] {
  const dir = path.join(PUBLIC_DIR, "images", "story");
  if (!existsSync(dir)) return [];

  const photos: StoryPhoto[] = [];
  for (const file of readdirSync(dir)) {
    const match = file.match(DATE_RE);
    if (!match) continue;
    const [, y, m, d, rawCaption] = match;
    const date = new Date(Number(y), Number(m) - 1, d ? Number(d) : 1);
    const sublabel = d ? frDayMonth.format(date) : frMonth.format(date);
    const caption = rawCaption ? humanizeCaption(rawCaption) : null;
    photos.push({ src: `/images/story/${file}`, date, year: Number(y), sublabel, caption, file });
  }

  return photos.sort((a, b) => a.date.getTime() - b.date.getTime());
}
