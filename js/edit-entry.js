// ═══════════════════════════════════════════
// EDIT LOG ENTRY
// ═══════════════════════════════════════════
var editingIdx = null;
var editingKey = null; // day key being edited
var editingBase = null; // per-100g values

function openEditModal(idx, dayKey) {
  const key = dayKey || todayKey();
  const entry = state.log[key]?.[idx];
  if (!entry) return;

  editingIdx = idx;
  editingKey = key;
  // Back-calculate per-100g values from stored data
  const origRatio = entry.grams / 100;
  editingBase = {
    kcal: origRatio ? entry.kcal / origRatio : 0,
    protein: origRatio ? entry.protein / origRatio : 0,
    carbs: origRatio ? entry.carbs / origRatio : 0,
    fat: origRatio ? entry.fat / origRatio : 0,
    fiber: origRatio ? (entry.fiber || 0) / origRatio : 0,
  };

  const unit = entry.liquid ? "ml" : "g";
  document.getElementById("edit-modal-name").textContent = entry.name;
  document.getElementById("edit-modal-sub").textContent =
    `Upravit množství · ${entry.time}`;
  document.getElementById("edit-modal-unit-label").textContent =
    `Množství (${unit})`;
  document.getElementById("edit-modal-grams").value = entry.grams;
  document.getElementById("edit-quick-grams").innerHTML =
    buildQuickGramsHtml(unit);
  document.getElementById("edit-measurement-select").innerHTML =
    buildMeasurementSelectHtml(unit);
  initMeasurementSelect(
    "edit-measurement-select",
    "edit-modal-grams",
    "edit-quick-grams",
    updateEditModalMacros,
  );
  // Reset display state (measurement selection hides these)
  document.querySelector("#edit-modal .gram-input-wrap").style.display =
    "";
  document.getElementById("edit-quick-grams").style.display = "";
  // Meal category select
  const editMealWrap = document.getElementById("edit-meal-select-wrap");
  if (state.mealCategoriesEnabled) {
    editMealWrap.style.display = "block";
    document.getElementById("edit-meal-select").innerHTML =
      buildMealSelectHtml(entry.meal || "");
  } else {
    editMealWrap.style.display = "none";
  }
  // Update favorite button
  const editFavBtn = document.getElementById("btn-edit-toggle-fav");
  const fav = isFavorite(entry.name);
  editFavBtn.textContent = fav ? "★" : "☆";
  editFavBtn.classList.toggle("active", fav);
  updateEditModalMacros();
  document.getElementById("edit-modal").classList.add("active");
}

function closeEditModal() {
  document.getElementById("edit-modal").classList.remove("active");
  editingIdx = null;
  editingKey = null;
  editingBase = null;
}

function updateEditModalMacros() {
  if (!editingBase) return;
  const g =
    parseFloat(document.getElementById("edit-modal-grams").value) || 100;
  const ratio = g / 100;
  const b = editingBase;

  document.getElementById("edit-modal-macros").innerHTML = `
    <div class="modal-macro kcal"><div class="val">${Math.round(b.kcal * ratio)}</div><div class="label">kcal</div></div>
    <div class="modal-macro protein"><div class="val">${(b.protein * ratio).toFixed(1)}</div><div class="label">bílkoviny</div></div>
    <div class="modal-macro carbs"><div class="val">${(b.carbs * ratio).toFixed(1)}</div><div class="label">sacharidy</div></div>
    <div class="modal-macro fat"><div class="val">${(b.fat * ratio).toFixed(1)}</div><div class="label">tuky</div></div>
    ${b.fiber ? `<div class="modal-macro fiber"><div class="val">${(b.fiber * ratio).toFixed(1)}</div><div class="label">vláknina</div></div>` : ""}
  `;
}

function saveEditEntry() {
  if (
    editingIdx === null ||
    !editingKey ||
    !state.log[editingKey]?.[editingIdx]
  )
    return;

  const g =
    parseFloat(document.getElementById("edit-modal-grams").value) || 100;
  const ratio = g / 100;
  const b = editingBase;
  const entry = state.log[editingKey][editingIdx];

  entry.grams = g;
  entry.kcal = Math.round(b.kcal * ratio);
  entry.protein = +(b.protein * ratio).toFixed(1);
  entry.carbs = +(b.carbs * ratio).toFixed(1);
  entry.fat = +(b.fat * ratio).toFixed(1);
  entry.fiber = +(b.fiber * ratio).toFixed(1);
  if (state.mealCategoriesEnabled) {
    entry.meal = document.getElementById("edit-meal-select").value;
  }

  state.portionMemory[entry.name] = g;
  saveState();
  closeEditModal();
  if (state.activePage === "page-today") renderToday();
  if (state.activePage === "page-history") renderHistory();
  showToast("Změny uloženy");
}

function deleteLogEntryByKey(dayKey, idx) {
  const entry = state.log[dayKey]?.[idx];
  if (!entry) return;
  if (!confirm(`Smazat "${entry.name}"?`)) return;
  state.log[dayKey].splice(idx, 1);
  if (state.log[dayKey].length === 0) delete state.log[dayKey];
  saveState();
  renderHistory();
  showToast("Záznam smazán");
}

