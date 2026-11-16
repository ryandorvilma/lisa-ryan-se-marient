const state = { rows: [] };

async function checkAuth() {
  const res = await fetch("/admin/api/me");
  const data = await res.json();
  if (!data.authenticated) {
    window.location.href = "/admin/login.html";
    throw new Error("not authenticated");
  }
}

const card = ([label, value, sub]) =>
  `<div class="stat-card"><div class="value">${value}</div><div class="label">${label}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;

async function loadStats() {
  const [hc, seating] = await Promise.all([
    fetch("/admin/api/headcount").then((r) => r.json()),
    fetch("/admin/api/seating").then((r) => r.json()),
  ]);
  const g = hc.events.global;
  document.getElementById("kpis").innerHTML = [
    ["Personnes attendues", g.total, `${g.adults} adultes · ${g.children} enfants · ${g.babies} bébés`],
    ["Réponses « présent »", hc.responses.confirmed, `${hc.responses.total} réponses reçues`],
    ["Réponses « absent »", hc.responses.declined],
    ["Au dîner", hc.events.dinner.total, `${hc.events.dinner.seats} places assises`],
  ]
    .map(card)
    .join("");

  const rows = [
    ["Église", hc.events.ceremony],
    ["Vin d'honneur", hc.events.cocktail],
    ["Dîner & soirée", hc.events.dinner],
    ["Escale gourmande", hc.events.brunch],
  ];
  document.getElementById("headcount-body").innerHTML = rows
    .map(([label, e]) => `<tr><th>${label}</th><td>${e.adults}</td><td>${e.children}</td><td>${e.babies}</td><td><strong>${e.total}</strong></td><td>${e.seats}</td></tr>`)
    .join("");

  const m = hc.meals;
  document.getElementById("meals").innerHTML = [
    ["Standard (adultes + enfants)", m.standard],
    ["Végétariens", m.vegetarian],
    ["Halal", m.halal],
    ["Menus enfants", m.childMenus],
    ["Chaises hautes", m.highChairs],
    ["Allergies signalées", m.allergies],
  ]
    .map(card)
    .join("");

  const seated = seating.persons.filter((p) => p.type !== "baby");
  const placed = seated.filter((p) => p.tableId).length;
  const kids = seating.tables.find((t) => t.kind === "kids");
  const regular = seating.tables.filter((t) => t.kind !== "kids");
  const capacity = regular.reduce((s, t) => s + t.capacity, 0);
  // avec un espace enfants, les enfants ne prennent pas de place aux tables des adultes
  const needTable = kids ? seated.filter((p) => p.type === "adult" || (p.tableId && p.tableId !== kids.id)).length : seated.length;
  const inKids = kids ? seating.persons.filter((p) => p.tableId === kids.id).length : 0;
  const totalChildren = seated.filter((p) => p.type === "child").length;
  document.getElementById("seating-summary").innerHTML = [
    ["Tables", regular.length],
    ["Places aux tables", capacity, capacity < needTable ? `⚠ il manque ${needTable - capacity} places` : `${needTable} nécessaires`],
    ["Espace enfants", kids ? `${inKids} / ${totalChildren}` : "—", kids ? "enfants placés" : "pas encore créé"],
    ["Invités placés", `${placed} / ${seated.length}`],
    ["Restant à placer", seated.length - placed],
  ]
    .map(card)
    .join("");
}

// ---------- onglets ----------
function showTab(name) {
  document.querySelectorAll(".tabs [data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("hidden", p.id !== `tab-${name}`));
  try { localStorage.setItem("admin-tab", name); } catch {}
  if (name === "dashboard") loadStats();
  if (name === "seating" && window.loadSeating) window.loadSeating();
}
document.querySelectorAll(".tabs [data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

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
  const res = await fetch(`/admin/api/responses/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || "Enregistrement impossible.");
    return;
  }
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
  await loadResponses();
  let tab = "dashboard";
  try { tab = localStorage.getItem("admin-tab") || tab; } catch {}
  showTab(["dashboard", "responses", "seating"].includes(tab) ? tab : "dashboard");
})();
