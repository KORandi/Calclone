// ═══════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════
function buildQuickGramsHtml(unit) {
  if (!state.customQuickGramsEnabled) return "";
  return state.quickGrams
    .map(
      (v) =>
        `<button class="quick-gram" data-g="${v}">${v} ${unit}</button>`,
    )
    .join("");
}

function buildMeasurementSelectHtml(unit, apiPortions) {
  const hasCustom =
    state.customMeasurementsEnabled &&
    state.customMeasurements.length > 0;
  const hasApi = apiPortions && apiPortions.length > 0;
  if (!hasCustom && !hasApi) return "";
  let optionsHtml = "";
  if (hasApi) {
    const apiOpts = apiPortions
      .map(
        (m, i) =>
          `<option value="api_${i}">${escapeHtml(m.name)}</option>`,
      )
      .join("");
    optionsHtml += hasCustom
      ? `<optgroup label="Porce z databáze">${apiOpts}</optgroup>`
      : apiOpts;
  }
  if (hasCustom) {
    const customOpts = state.customMeasurements
      .map(
        (m, i) =>
          `<option value="custom_${i}">${escapeHtml(m.name)} (${m.grams} ${unit})</option>`,
      )
      .join("");
    optionsHtml += hasApi
      ? `<optgroup label="Vlastní porce">${customOpts}</optgroup>`
      : customOpts;
  }
  return `<div class="measurement-select-wrap">
    <select class="measurement-select">
      <option value="">— Porce —</option>
      ${optionsHtml}
    </select>
    <div class="measurement-amount-row" style="display:none">
      <label>Počet</label>
      <div class="gram-stepper">
        <button class="stepper-btn minus measurement-stepper" data-step="-1">−1</button>
        <input type="number" class="measurement-amount" value="1" min="0.25" step="0.25" />
        <button class="stepper-btn plus measurement-stepper" data-step="1">+1</button>
      </div>
    </div>
  </div>`;
}

function getDefaultMealByTime() {
  const now = new Date();
  const nowStr =
    now.getHours().toString().padStart(2, "0") +
    ":" +
    now.getMinutes().toString().padStart(2, "0");
  const catsWithTime = state.mealCategories
    .filter((c) => state.mealCategoryTimes[c])
    .sort((a, b) =>
      state.mealCategoryTimes[a].localeCompare(
        state.mealCategoryTimes[b],
      ),
    );
  if (catsWithTime.length === 0) return "";
  let result = "";
  for (const cat of catsWithTime) {
    if (nowStr >= state.mealCategoryTimes[cat]) {
      result = cat;
    }
  }
  return result;
}

function buildMealSelectHtml(selectedMeal) {
  if (!state.mealCategoriesEnabled) return "";
  const options = ["", ...getSortedMealCategories()];
  return options
    .map(
      (m) =>
        `<option value="${escapeHtml(m)}" ${m === (selectedMeal || "") ? "selected" : ""}>${m ? escapeHtml(m) : "Bez kategorie"}</option>`,
    )
    .join("");
}

function updateMealSelects(selectedMeal) {
  const show = state.mealCategoriesEnabled;
  const logWrap = document.getElementById("modal-meal-select-wrap");
  const editWrap = document.getElementById("edit-meal-select-wrap");
  if (logWrap) {
    logWrap.style.display = show ? "block" : "none";
    if (show)
      document.getElementById("modal-meal-select").innerHTML =
        buildMealSelectHtml(selectedMeal || "");
  }
  if (editWrap) {
    editWrap.style.display = show ? "block" : "none";
    if (show)
      document.getElementById("edit-meal-select").innerHTML =
        buildMealSelectHtml(selectedMeal || "");
  }
}

function initMeasurementSelect(
  containerId,
  gramsInputId,
  quickGramsId,
  updateMacrosFn,
  apiPortions,
) {
  const container = document.getElementById(containerId);
  const select = container.querySelector(".measurement-select");
  if (!select) return;
  const amountRow = container.querySelector(".measurement-amount-row");
  const amountInput = container.querySelector(".measurement-amount");
  const gramsInput = document.getElementById(gramsInputId);
  const gramWrap = gramsInput.closest(".gram-input-wrap");
  const quickGramsEl = document.getElementById(quickGramsId);

  function getMeasurement(val) {
    if (val.startsWith("api_")) {
      const idx = parseInt(val.slice(4));
      return apiPortions && apiPortions[idx];
    }
    if (val.startsWith("custom_")) {
      const idx = parseInt(val.slice(7));
      return state.customMeasurements[idx];
    }
    const idx = parseInt(val);
    if (!isNaN(idx)) return state.customMeasurements[idx];
    return null;
  }

  function recalc() {
    const m = getMeasurement(select.value);
    if (!m) return;
    const amount = parseFloat(amountInput.value) || 1;
    const totalGrams = Math.round(m.grams * amount);
    gramsInput.value = totalGrams;
    updateMacrosFn();
  }

  select.addEventListener("change", () => {
    if (select.value === "") {
      amountRow.style.display = "none";
      gramWrap.style.display = "";
      quickGramsEl.style.display = "";
    } else {
      amountRow.style.display = "flex";
      amountInput.value = 1;
      gramWrap.style.display = "none";
      quickGramsEl.style.display = "none";
      recalc();
    }
  });

  amountInput.addEventListener("input", recalc);

  // Stepper buttons for measurement amount
  container.querySelectorAll(".measurement-stepper").forEach((btn) => {
    btn.addEventListener("click", () => {
      const step = parseFloat(btn.dataset.step);
      const val = Math.max(
        0.25,
        (parseFloat(amountInput.value) || 1) + step,
      );
      amountInput.value = val;
      recalc();
    });
  });
}

async function openFoodModal(food) {
  state.selectedFood = food;
  // Track food selection for relevance scoring
  if (!state.foodRelevance[food.name]) {
    state.foodRelevance[food.name] = { lastUsed: 0, clickCount: 0 };
  }
  state.foodRelevance[food.name].clickCount =
    (state.foodRelevance[food.name].clickCount || 0) + 1;
  const unit = food.liquid ? "ml" : "g";
  document.getElementById("modal-food-name").textContent = food.name;
  document.getElementById("modal-food-portion").textContent =
    food.source === "api"
      ? `Hodnoty na 100 ${unit}`
      : `Hodnoty na 100 ${unit} | ${food.cat}`;
  const remembered = state.portionMemory[food.name];
  document.getElementById("modal-grams").value =
    remembered || (food.portionGrams ? String(food.portionGrams) : "100");
  document.querySelector(".gram-input-wrap label").textContent =
    `Množství (${unit})`;
  document.getElementById("quick-grams").innerHTML =
    buildQuickGramsHtml(unit);
  document.getElementById("modal-measurement-select").innerHTML =
    buildMeasurementSelectHtml(unit, food.measurements);
  initMeasurementSelect(
    "modal-measurement-select",
    "modal-grams",
    "quick-grams",
    updateModalMacros,
    food.measurements,
  );
  // Reset display state (measurement selection hides these)
  document.querySelector("#food-modal .gram-input-wrap").style.display =
    "";
  document.getElementById("quick-grams").style.display = "";
  updateMealSelects(getDefaultMealByTime());
  // Update favorite button
  const favBtn = document.getElementById("btn-toggle-fav");
  const fav = isFavorite(food.name);
  favBtn.textContent = fav ? "★" : "☆";
  favBtn.classList.toggle("active", fav);

  document.getElementById("food-modal").classList.add("active");
  updateModalTargetDate();

  // If API food, scrape the food page for full nutrition data
  if (food.source === "api" && food.guid) {
    document.getElementById("modal-loading").style.display = "block";
    document.getElementById("modal-content").style.display = "none";
    document.getElementById("btn-log-food").disabled = true;

    const [nutrition, apiPortions] = await Promise.all([
      apiDetail(food),
      apiFormDetail(food.guid),
    ]);
    if (nutrition) {
      state.selectedFood = {
        ...food,
        kcal: nutrition.kcal || food.kcal || 0,
        protein: nutrition.protein || 0,
        carbs: nutrition.carbs || 0,
        fat: nutrition.fat || 0,
        fiber: nutrition.fiber || 0,
        liquid: nutrition.liquid || food.liquid,
      };
      // Update unit display if API returned baseUnit
      const updatedUnit = state.selectedFood.liquid ? "ml" : "g";
      document.getElementById("modal-food-portion").textContent =
        `Hodnoty na 100 ${updatedUnit}`;
      document.querySelector(".gram-input-wrap label").textContent =
        `Množství (${updatedUnit})`;
      document.getElementById("quick-grams").innerHTML =
        buildQuickGramsHtml(updatedUnit);
      document.getElementById("modal-measurement-select").innerHTML =
        buildMeasurementSelectHtml(updatedUnit, apiPortions);
      initMeasurementSelect(
        "modal-measurement-select",
        "modal-grams",
        "quick-grams",
        updateModalMacros,
        apiPortions,
      );
    }

    document.getElementById("modal-loading").style.display = "none";
    document.getElementById("modal-content").style.display = "block";
    document.getElementById("btn-log-food").disabled = false;
  }

  updateModalMacros();
}

function closeModal() {
  document.getElementById("food-modal").classList.remove("active");
  document.getElementById("modal-loading").style.display = "none";
  document.getElementById("modal-content").style.display = "block";
  state.selectedFood = null;
}

function updateModalMacros() {
  const f = state.selectedFood;
  if (!f) return;
  const g =
    parseFloat(document.getElementById("modal-grams").value) || 100;
  const ratio = g / 100;
  const kcal = f.kcal || 0;
  const protein = f.protein || 0;
  const carbs = f.carbs || 0;
  const fat = f.fat || 0;
  const fiber = f.fiber || 0;

  document.getElementById("modal-macros").innerHTML = `
    <div class="modal-macro kcal"><div class="val">${Math.round(kcal * ratio)}</div><div class="label">kcal</div></div>
    <div class="modal-macro protein"><div class="val">${(protein * ratio).toFixed(1)}</div><div class="label">bílkoviny</div></div>
    <div class="modal-macro carbs"><div class="val">${(carbs * ratio).toFixed(1)}</div><div class="label">sacharidy</div></div>
    <div class="modal-macro fat"><div class="val">${(fat * ratio).toFixed(1)}</div><div class="label">tuky</div></div>
    ${fiber ? `<div class="modal-macro fiber"><div class="val">${(fiber * ratio).toFixed(1)}</div><div class="label">vláknina</div></div>` : ""}
  `;
}

