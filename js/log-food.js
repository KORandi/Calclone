// ═══════════════════════════════════════════
// LOG FOOD
// ═══════════════════════════════════════════
function logFood() {
  const f = state.selectedFood;
  if (!f) return;
  const g =
    parseFloat(document.getElementById("modal-grams").value) || 100;
  const ratio = g / 100;
  const key = logTargetKey();
  if (!state.log[key]) state.log[key] = [];
  const entry = {
    name: f.name,
    grams: g,
    liquid: !!f.liquid,
    kcal: Math.round((f.kcal || 0) * ratio),
    protein: +((f.protein || 0) * ratio).toFixed(1),
    carbs: +((f.carbs || 0) * ratio).toFixed(1),
    fat: +((f.fat || 0) * ratio).toFixed(1),
    fiber: +((f.fiber || 0) * ratio).toFixed(1),
    time: new Date().toLocaleTimeString("cs-CZ", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    meal: state.mealCategoriesEnabled
      ? document.getElementById("modal-meal-select").value
      : "",
  };
  if (f.guid) entry.guid = f.guid;
  if (f.source) entry.source = f.source;
  state.log[key].push(entry);
  state.portionMemory[f.name] = g;

  // Track usage and auto-favorite
  if (state.autoFavEnabled) {
    state.foodUsage[f.name] = (state.foodUsage[f.name] || 0) + 1;
    if (
      state.foodUsage[f.name] >= AUTO_FAV_THRESHOLD &&
      !isFavorite(f.name)
    ) {
      state.favorites.push(f.name);
    }
  }

  // Track relevance data (lastUsed timestamp)
  if (!state.foodRelevance[f.name]) {
    state.foodRelevance[f.name] = { lastUsed: 0, clickCount: 0 };
  }
  state.foodRelevance[f.name].lastUsed = Date.now();

  const wasTargetDate = state.logTargetDate;
  saveState();
  closeModal();
  if (state.activePage === "page-today") renderToday();
  if (wasTargetDate && wasTargetDate !== todayKey()) {
    showToast(`Přidáno do ${formatDateLabel(wasTargetDate)}`);
  } else {
    showToast("Přidáno do záznamu");
  }
}

function deleteLogEntry(idx) {
  const key = todayKey();
  const entry = state.log[key]?.[idx];
  if (!entry) return;
  if (!confirm(`Smazat "${entry.name}"?`)) return;
  state.log[key].splice(idx, 1);
  if (state.log[key].length === 0) delete state.log[key];
  saveState();
  renderToday();
  showToast("Záznam smazán");
}

