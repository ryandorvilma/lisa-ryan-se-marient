export function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) return next();
  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "Non authentifié." });
  }
  return res.redirect("/admin/login.html");
}
