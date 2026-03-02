// ═══════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════
function applyTheme(themeId) {
  if (themeId === "default") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", themeId);
  }
  // Update meta theme-color for mobile browsers
  const themeColors = {
    default: "#22c55e",
    dark: "#111827",
    ocean: "#0ea5e9",
    sunset: "#f97316",
    lavender: "#8b5cf6",
    midnight: "#0c0a1d",
    amoled: "#000000",
    pixel: "#83e04c",
  };
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta)
    meta.setAttribute("content", themeColors[themeId] || "#22c55e");
}

function loadSettingsUI() {
  updateGoalsDisplay();
  renderCustomFoodsList();

  // Quick grams toggle
  const qgToggle = document.getElementById("toggle-quick-grams");
  qgToggle.checked = state.customQuickGramsEnabled;
  document.getElementById("quick-grams-section").style.display =
    state.customQuickGramsEnabled ? "block" : "none";
  renderQuickGramsChips();

  // Custom measurements toggle
  document.getElementById("toggle-custom-measurements").checked =
    state.customMeasurementsEnabled;
  document.getElementById("custom-measurements-section").style.display =
    state.customMeasurementsEnabled ? "block" : "none";
  renderMeasurementsList();

  // Rohlik search toggle
  document.getElementById("toggle-rohlik-search").checked =
    state.rohlikSearchEnabled;

  // Auto-favorite toggle
  document.getElementById("toggle-auto-fav").checked =
    state.autoFavEnabled;

  // Meal categories toggle
  document.getElementById("toggle-meal-categories").checked =
    state.mealCategoriesEnabled;
  document.getElementById("meal-categories-section").style.display =
    state.mealCategoriesEnabled ? "block" : "none";
  renderMealCategoriesChips();

  // Trends toggle
  document.getElementById("toggle-trends").checked = state.trendsEnabled;

  // Copy day toggle
  document.getElementById("toggle-copy-day").checked =
    state.copyDayEnabled;

  // QR share toggle
  document.getElementById("toggle-qr-share").checked =
    state.qrShareEnabled;

  // AI settings
  updateAiSettingsUI();
  updateAiScanButton();

  // Cache limit
  document.getElementById("cache-limit-input").value =
    state.cacheSizeLimitMB;
  updateCacheUsageUI();

  // Theme
  document.querySelectorAll(".theme-option").forEach((el) => {
    el.classList.toggle("active", el.dataset.themeId === state.theme);
  });

  // Weight recalculation
  if (typeof updateWeightRecalcUI === "function") updateWeightRecalcUI();
}

function renderMeasurementsList() {
  const el = document.getElementById("measurements-list");
  if (state.customMeasurements.length === 0) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = state.customMeasurements
    .map(
      (m, i) =>
        `<div class="measurement-item">
          <div class="meas-info">
            <span class="meas-name">${escapeHtml(m.name)}</span>
            <span class="meas-grams">${m.grams} g</span>
          </div>
          <button class="delete-btn" data-meas-idx="${i}">&times;</button>
        </div>`,
    )
    .join("");
}

function renderQuickGramsChips() {
  const el = document.getElementById("quick-grams-chips");
  el.innerHTML = state.quickGrams
    .map(
      (g, i) =>
        `<div class="chip">
          <span>${g} g</span>
          <button class="chip-remove" data-qg-idx="${i}">&times;</button>
        </div>`,
    )
    .join("");
}


function renderMealCategoriesChips() {
  const el = document.getElementById("meal-categories-chips");
  const sorted = getSortedMealCategories();
  el.innerHTML = sorted
    .map((c) => {
      const origIdx = state.mealCategories.indexOf(c);
      const time = state.mealCategoryTimes[c] || "";
      return `<div class="chip-with-time">
          <input type="time" class="chip-time-input" data-mc-name="${escapeHtml(c)}" value="${time}" title="Čas od kdy platí">
          <span class="chip-name">${escapeHtml(c)}</span>
          <button class="chip-remove" data-mc-idx="${origIdx}">&times;</button>
        </div>`;
    })
    .join("");
}

