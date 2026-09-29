const state = { rows: [] };

async function checkAuth() {
  const res = await fetch("/admin/api/me");
  const data = await res.json();
  if (!data.authenticated) {
    window.location.href = "/admin/login.html";
    throw new Error("not authenticated");
  }
}

async function loadStats() {
  const res = await fetch("/admin/api/stats");
  const s = await res.json();
  const cards = [
    ["Contactés", s.total],
    ["Confirmés", s.confirmed],
    ["Refus", s.declined],
    ["Adultes", s.adults],
    ["Enfants", s.children],
    ["Bébés", s.babies],
    ["Église", s.ceremony],
    ["Vin d'honneur", s.cocktail],
    ["Repas", s.dinner],
    ["Escale gourmande", s.brunch],
    ["Repas végétariens", s.vegetarian],
    ["Repas halal", s.halal],
    ["Régimes signalés", s.withDietary],
  ];
  document.getElementById("stats-grid").innerHTML = cards
    .map(([label, value]) => `<div class="stat-card"><div class="value">${value}</div><div class="label">${label}</div></div>`)
    .join("");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderRows(rows) {
  const body = document.getElementById("responses-body");
  const empty = document.getElementById("empty-state");
  if (!rows.length) {
    body.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  body.innerHTML = rows
    .map((r) => {
      const participation = [
        r.join_ceremony ? "Église" : null,
        r.join_cocktail ? "Vin d'honneur" : null,
        r.join_dinner ? "Repas" : null,
        r.join_brunch ? "Escale gourmande" : null,
      ]
        .filter(Boolean)
        .join(", ") || "—";
      const diet = [
        r.diet_vegetarian ? `Végétarien ×${r.diet_vegetarian}` : null,
        r.diet_halal ? `Halal ×${r.diet_halal}` : null,
        r.diet_notes ? escapeHtml(r.diet_notes) : null,
      ]
        .filter(Boolean)
        .join(", ") || "—";
      return `
      <tr class="${r.attending === "no" ? "absent" : ""}" data-id="${r.id}">
        <td>${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}</td>
        <td><span class="badge ${r.attending}">${r.attending === "yes" ? "Présent·e" : "Absent·e"}</span></td>
        <td>${r.attending === "yes" ? `${r.adults} adulte(s)${r.children ? `, ${r.children} enfant(s)` : ""}${r.babies ? `, ${r.babies} bébé(s)` : ""}` : "—"}</td>
        <td>${participation}</td>
        <td>${diet}</td>
        <td>${new Date(r.created_at + "Z").toLocaleDateString("fr-FR")}</td>
        <td class="row-actions"><button type="button" data-edit="${r.id}">Modifier</button></td>
      </tr>`;
    })
    .join("");

  body.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => openEditModal(btn.dataset.edit));
  });
}

async function loadResponses(query = "") {
  const res = await fetch(`/admin/api/responses?q=${encodeURIComponent(query)}`);
  state.rows = await res.json();
  renderRows(state.rows);
}

function openEditModal(id) {
  const r = state.rows.find((x) => String(x.id) === String(id));
  if (!r) return;
  document.getElementById("edit-id").value = r.id;
  document.getElementById("edit-first-name").value = r.first_name;
  document.getElementById("edit-last-name").value = r.last_name;
  document.getElementById("edit-attending").value = r.attending;
  document.getElementById("edit-adults").value = r.adults;
  document.getElementById("edit-children").value = r.children;
  document.getElementById("edit-babies").value = r.babies || 0;
  document.getElementById("edit-companions").value = r.companions;
  document.getElementById("edit-ceremony").checked = Boolean(r.join_ceremony);
  document.getElementById("edit-cocktail").checked = Boolean(r.join_cocktail);
  document.getElementById("edit-dinner").checked = Boolean(r.join_dinner);
  document.getElementById("edit-brunch").checked = Boolean(r.join_brunch);
  document.getElementById("edit-vegetarian").value = r.diet_vegetarian || 0;
  document.getElementById("edit-halal").value = r.diet_halal || 0;
  document.getElementById("edit-dietnotes").value = r.diet_notes;
  document.getElementById("edit-logistics").value = r.logistics;
  document.getElementById("edit-message").value = r.message;
  document.getElementById("modal-backdrop").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal-backdrop").classList.add("hidden");
}

document.getElementById("cancel-btn").addEventListener("click", closeModal);
document.getElementById("modal-backdrop").addEventListener("click", (e) => {
  if (e.target.id === "modal-backdrop") closeModal();
});

document.getElementById("edit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("edit-id").value;
  const payload = {
    first_name: document.getElementById("edit-first-name").value,
    last_name: document.getElementById("edit-last-name").value,
    attending: document.getElementById("edit-attending").value,
    adults: document.getElementById("edit-adults").value,
    children: document.getElementById("edit-children").value,
    babies: document.getElementById("edit-babies").value,
    companions: document.getElementById("edit-companions").value,
    join_ceremony: document.getElementById("edit-ceremony").checked,
    join_cocktail: document.getElementById("edit-cocktail").checked,
    join_dinner: document.getElementById("edit-dinner").checked,
    join_brunch: document.getElementById("edit-brunch").checked,
    diet_vegetarian: document.getElementById("edit-vegetarian").value,
    diet_halal: document.getElementById("edit-halal").value,
    diet_notes: document.getElementById("edit-dietnotes").value,
    logistics: document.getElementById("edit-logistics").value,
    message: document.getElementById("edit-message").value,
  };
  await fetch(`/admin/api/responses/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  closeModal();
  await Promise.all([loadStats(), loadResponses(document.getElementById("search-input").value)]);
});

document.getElementById("delete-btn").addEventListener("click", async () => {
  const id = document.getElementById("edit-id").value;
  if (!confirm("Supprimer définitivement cette réponse ?")) return;
  await fetch(`/admin/api/responses/${id}`, { method: "DELETE" });
  closeModal();
  await Promise.all([loadStats(), loadResponses(document.getElementById("search-input").value)]);
});

let searchTimer;
document.getElementById("search-input").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadResponses(e.target.value), 250);
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await fetch("/admin/api/logout", { method: "POST" });
  window.location.href = "/admin/login.html";
});

(async function init() {
  await checkAuth();
  await Promise.all([loadStats(), loadResponses()]);
})();
