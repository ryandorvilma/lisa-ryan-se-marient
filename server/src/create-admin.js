// Usage: node src/create-admin.js <username> <password>
import bcrypt from "bcryptjs";
import { db } from "./db.js";

const [, , username, password] = process.argv;

if (!username || !password) {
  console.error("Usage: node src/create-admin.js <username> <password>");
  process.exit(1);
}

if (password.length < 10) {
  console.error("Le mot de passe doit contenir au moins 10 caractères.");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);

db.prepare(
  `INSERT INTO admins (username, password_hash) VALUES (?, ?)
   ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash`
).run(username, hash);

console.log(`Compte admin "${username}" créé/mis à jour.`);
