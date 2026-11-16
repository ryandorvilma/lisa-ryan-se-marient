(function () {
  const seat = { tables: [], persons: [], selected: null };
  const api = (url, method = "GET", body) =>
    fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Erreur serveur.");
      return data;
    });

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TYPE = { adult: "", child: '<span class="tag child">enfant</span>', baby: '<span class="tag baby">bébé</span>' };

  function personChip(p) {
    const diet = p.diet ? `<span class="diet" title="${esc(p.diet)}">${esc(p.diet)}</span>` : "";
    const sel = seat.selected?.includes(p.key) ? " selected" : "";
    return `<div class="person${sel}" draggable="true" data-keys="${esc(p.key)}">
      <span class="pname">${esc(p.name)}</span>${TYPE[p.type]}${diet}
      ${p.tableId ? `<button type="button" class="unseat" data-unseat="${esc(p.key)}" title="Retirer de la table" aria-label="Retirer ${esc(p.name)} de la table">×</button>` : ""}
    </div>`;
  }

  function groupByFamily(list) {
    const map = new Map();
    list.forEach((p) => {
      if (!map.has(p.responseId)) map.set(p.responseId, { family: p.family, members: [] });
      map.get(p.responseId).members.push(p);
    });
    return [...map.values()];
  }

  function renderPool() {
    const q = document.getElementById("pool-search").value.trim().toLocaleLowerCase("fr-FR");
    const unassigned = seat.persons.filter((p) => !p.tableId);
    const visible = unassigned.filter(
      (p) => !q || p.name.toLocaleLowerCase("fr-FR").includes(q) || p.family.toLocaleLowerCase("fr-FR").includes(q)
    );
    const seated = unassigned.filter((p) => p.type !== "baby").length;
    document.getElementById("unassigned-count").textContent = `(${seated})`;
    document.getElementById("pool-list").innerHTML =
      groupByFamily(visible)
        .map((g) => {
          const keys = g.members.map((m) => m.key).join(",");
          const sel = seat.selected && seat.selected.join(",") === keys ? " selected" : "";
          return `<div class="family">
            <div class="family-head${sel}" draggable="true" data-keys="${esc(keys)}" title="Glisser pour placer toute la famille">
              ${esc(g.family)} <span class="count">${g.members.length}</span>
            </div>
            ${g.members.map(personChip).join("")}
          </div>`;
        })
        .join("") || `<p class="empty">${unassigned.length ? "Aucun résultat." : "Tout le monde est placé 🎉"}</p>`;
  }

  const kidsSpace = () => seat.tables.find((t) => t.kind === "kids") || null;

  function renderKids() {
    const k = kidsSpace();
    const el = document.getElementById("kids-space");
    document.getElementById("create-kids-btn").classList.toggle("hidden", Boolean(k));
    document.getElementById("send-kids-btn").classList.toggle("hidden", !k);
    if (!k) {
      el.innerHTML = "";
      el.classList.add("hidden");
      return;
    }
    const members = seat.persons.filter((p) => p.tableId === k.id);
    const totalChildren = seat.persons.filter((p) => p.type === "child").length;
    const over = members.length > k.capacity;
    el.className = `kids-space dropzone${over ? " over" : ""}`;
    el.dataset.tableId = k.id;
    el.innerHTML = `
      <header>
        <div>
          <h4>🧸 ${esc(k.name)}</h4>
          <span class="cap">${members.length} enfant${members.length > 1 ? "s" : ""} placé${members.length > 1 ? "s" : ""} sur ${totalChildren} · capacité ${k.capacity}</span>
        </div>
        <div class="tactions">
          <button type="button" data-edit-table="${k.id}" title="Modifier">✎</button>
          <button type="button" data-delete-table="${k.id}" title="Supprimer">🗑</button>
        </div>
      </header>
      ${k.notes ? `<p class="tnotes">${esc(k.notes)}</p>` : ""}
      <div class="members kids-members">${members.map(personChip).join("") || '<p class="empty small">Déposez les enfants ici</p>'}</div>`;
  }

  function renderTables() {
    const grid = document.getElementById("tables-grid");
    const regular = seat.tables.filter((t) => t.kind !== "kids");
    if (!regular.length) {
      grid.innerHTML = `<p class="empty">Aucune table. Ajoutez-en une ci-dessus, ou créez-en plusieurs d'un coup.</p>`;
      return;
    }
    grid.innerHTML = regular
      .map((t) => {
        const members = seat.persons.filter((p) => p.tableId === t.id);
        const used = members.filter((p) => p.type !== "baby").length;
        const babies = members.length - used;
        const pct = Math.min(100, Math.round((used / t.capacity) * 100));
        const state = used > t.capacity ? "over" : used === t.capacity ? "full" : "";
        return `<article class="seat-table dropzone ${state}" data-table-id="${t.id}">
          <header>
            <div>
              <h4>${esc(t.name)}</h4>
              <span class="cap">${used} / ${t.capacity} places${babies ? ` · ${babies} chaise${babies > 1 ? "s" : ""} haute${babies > 1 ? "s" : ""}` : ""}</span>
            </div>
            <div class="tactions">
              <button type="button" data-edit-table="${t.id}" title="Modifier">✎</button>
              <button type="button" data-delete-table="${t.id}" title="Supprimer">🗑</button>
            </div>
          </header>
          <div class="bar"><span style="width:${pct}%"></span></div>
          ${t.notes ? `<p class="tnotes">${esc(t.notes)}</p>` : ""}
          <div class="members">${members.map(personChip).join("") || '<p class="empty small">Déposez des invités ici</p>'}</div>
        </article>`;
      })
      .join("");
  }

  function render() {
    renderPool();
    renderKids();
    renderTables();
  }

  /**
   * Avec un espace enfants : déposer une famille sur une table installe les adultes et
   * les bébés à la table et envoie automatiquement les enfants dans l'espace enfants ;
   * déposer une famille sur l'espace enfants n'y envoie que les enfants.
   * Un invité déposé seul va toujours là où on le dépose.
   */
  function place(keys, tableId) {
    const k = kidsSpace();
    if (!k || keys.length < 2) return assign(keys, tableId);
    const people = seat.persons.filter((p) => keys.includes(p.key));
    const children = people.filter((p) => p.type === "child").map((p) => p.key);
    const others = people.filter((p) => p.type !== "child").map((p) => p.key);
    if (tableId === k.id) return children.length ? assign(children, k.id) : assign(keys, tableId);
    if (tableId === null || !children.length) return assign(keys, tableId);
    return assign(others, tableId).then(() => assign(children, k.id));
  }

  async function load() {
    const data = await api("/admin/api/seating");
    seat.tables = data.tables;
    seat.persons = data.persons;
    render();
  }
  window.loadSeating = load;

  async function assign(keys, tableId) {
    // mise à jour optimiste
    const prev = seat.persons.map((p) => ({ ...p }));
    seat.persons.forEach((p) => {
      if (keys.includes(p.key)) p.tableId = tableId;
    });
    seat.selected = null;
    render();
    try {
      await api("/admin/api/seating/assign", "PUT", { keys, tableId });
    } catch (e) {
      seat.persons = prev;
      render();
      alert(e.message);
    }
  }

  // ---------- glisser-déposer ----------
  const root = document.getElementById("tab-seating");
  root.addEventListener("dragstart", (e) => {
    const el = e.target.closest("[data-keys]");
    if (!el) return;
    e.dataTransfer.setData("text/plain", el.dataset.keys);
    e.dataTransfer.effectAllowed = "move";
  });
  root.addEventListener("dragover", (e) => {
    const zone = e.target.closest(".dropzone");
    if (!zone) return;
    e.preventDefault();
    zone.classList.add("over-zone");
  });
  root.addEventListener("dragleave", (e) => {
    const zone = e.target.closest(".dropzone");
    if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove("over-zone");
  });
  root.addEventListener("drop", (e) => {
    const zone = e.target.closest(".dropzone");
    if (!zone) return;
    e.preventDefault();
    zone.classList.remove("over-zone");
    const keys = e.dataTransfer.getData("text/plain").split(",").filter(Boolean);
    const tableId = zone.dataset.tableId ? Number(zone.dataset.tableId) : null;
    if (keys.length) place(keys, tableId);
  });

  // ---------- clic : sélectionner puis cliquer une table (mobile) ----------
  root.addEventListener("click", async (e) => {
    const unseat = e.target.closest("[data-unseat]");
    if (unseat) return assign([unseat.dataset.unseat], null);

    const editBtn = e.target.closest("[data-edit-table]");
    if (editBtn) {
      const t = seat.tables.find((x) => x.id === Number(editBtn.dataset.editTable));
      const name = prompt("Nom de la table", t.name);
      if (name === null) return;
      const capacity = prompt("Nombre de places", t.capacity);
      if (capacity === null) return;
      const notes = prompt("Note (facultatif)", t.notes || "");
      try {
        await api(`/admin/api/tables/${t.id}`, "PUT", { name, capacity, notes: notes ?? "" });
        await load();
      } catch (err) {
        alert(err.message);
      }
      return;
    }

    const delBtn = e.target.closest("[data-delete-table]");
    if (delBtn) {
      const t = seat.tables.find((x) => x.id === Number(delBtn.dataset.deleteTable));
      if (!confirm(`Supprimer « ${t.name} » ? Ses invités repasseront dans « Non placés ».`)) return;
      await api(`/admin/api/tables/${t.id}`, "DELETE");
      return load();
    }

    const targetTable = e.target.closest(".seat-table, .kids-space");
    if (seat.selected && targetTable) {
      const tid = Number(targetTable.dataset.tableId);
      const alreadyThere = seat.persons.filter((p) => seat.selected.includes(p.key)).every((p) => p.tableId === tid);
      if (!alreadyThere) return place(seat.selected, tid);
    }

    const chip = e.target.closest("[data-keys]");
    if (chip) {
      const keys = chip.dataset.keys.split(",");
      seat.selected = seat.selected && seat.selected.join(",") === keys.join(",") ? null : keys;
      return render();
    }

    const zone = e.target.closest(".dropzone");
    if (zone && seat.selected) {
      place(seat.selected, zone.dataset.tableId ? Number(zone.dataset.tableId) : null);
    }
  });

  document.getElementById("pool-search").addEventListener("input", renderPool);

  document.getElementById("add-table-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameEl = document.getElementById("new-table-name");
    const capEl = document.getElementById("new-table-capacity");
    try {
      await api("/admin/api/tables", "POST", { name: nameEl.value, capacity: capEl.value });
      nameEl.value = "";
      await load();
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById("bulk-tables-btn").addEventListener("click", async () => {
    // avec un espace enfants, seuls les adultes ont besoin d'une place à table
    const seated = seat.persons.filter((p) => (kidsSpace() ? p.type === "adult" : p.type !== "baby")).length;
    const who = kidsSpace() ? "adultes" : "invités assis";
    const capacity = parseInt(prompt("Places par table ?", "8"), 10);
    if (!capacity) return;
    const suggested = Math.max(1, Math.ceil(seated / capacity));
    const count = parseInt(prompt(`Combien de tables ? (${seated} ${who} → ${suggested} tables suggérées)`, String(suggested)), 10);
    if (!count || count > 60) return;
    const start = seat.tables.filter((t) => t.kind !== "kids").length + 1;
    for (let i = 0; i < count; i++) {
      await api("/admin/api/tables", "POST", { name: `Table ${start + i}`, capacity });
    }
    await load();
  });

  document.getElementById("create-kids-btn").addEventListener("click", async () => {
    const totalChildren = seat.persons.filter((p) => p.type === "child").length;
    const name = prompt("Nom de l'espace", "Espace enfants");
    if (!name) return;
    const capacity = parseInt(prompt("Capacité de l'espace enfants", String(Math.max(totalChildren, 10))), 10);
    if (!capacity) return;
    try {
      await api("/admin/api/tables", "POST", { name, capacity, kind: "kids", notes: "" });
      await load();
      const unplaced = seat.persons.filter((p) => p.type === "child" && !p.tableId);
      if (unplaced.length && confirm(`Y placer dès maintenant les ${unplaced.length} enfant(s) non placés ?`)) {
        await assign(unplaced.map((p) => p.key), kidsSpace().id);
      }
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById("send-kids-btn").addEventListener("click", async () => {
    const k = kidsSpace();
    const children = seat.persons.filter((p) => p.type === "child" && p.tableId !== k.id);
    if (!children.length) return alert("Tous les enfants sont déjà dans l'espace enfants.");
    const atTables = children.filter((p) => p.tableId).length;
    const msg = atTables
      ? `Envoyer ${children.length} enfant(s) dans « ${k.name} » ? (dont ${atTables} actuellement à une table d'adultes)`
      : `Envoyer ${children.length} enfant(s) dans « ${k.name} » ?`;
    if (confirm(msg)) await assign(children.map((p) => p.key), k.id);
  });
})();
