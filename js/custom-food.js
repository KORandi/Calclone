// ═══════════════════════════════════════════
// CUSTOM FOOD WIZARD
// ═══════════════════════════════════════════
var cfwState = {
  path: null,
  editIdx: null,
  ingredients: [],
  searchTimeout: null,
  barcodeMode: false,
};

function openCustomFoodWizard(editIdx = null) {
  cfwState.path = null;
  cfwState.editIdx = editIdx;
  cfwState.ingredients = [];

  ["cfw-name","cfw-cat","cfw-kcal","cfw-protein","cfw-carbs","cfw-fat",
   "cfw-recipe-name","cfw-recipe-cat","cfw-ingredient-search"
  ].forEach(id => { document.getElementById(id).value = ""; });
  document.getElementById("cfw-total-weight").textContent = "0 g";

  if (editIdx !== null) {
    const food = state.customFoods[editIdx];
    if (food.recipe) {
      cfwState.path = "know-ingredients";
      cfwState.ingredients = food.recipe.ingredients.map(ing => ({
        name: ing.name, grams: ing.grams,
        kcalPer100: ing.kcal, proteinPer100: ing.protein,
        carbsPer100: ing.carbs, fatPer100: ing.fat,
      }));
      document.getElementById("cfw-recipe-name").value = food.name;
      document.getElementById("cfw-recipe-cat").value = food.cat === "Vlastní" ? "" : food.cat;
      renderCfwIngredients();
      updateCfwRecipePreview();
      showCfwStep("cfw-step-ingredients");
    } else {
      cfwState.path = "know-macros";
      document.getElementById("cfw-name").value = food.name;
      document.getElementById("cfw-cat").value = food.cat === "Vlastní" ? "" : food.cat;
      document.getElementById("cfw-kcal").value = food.kcal;
      document.getElementById("cfw-protein").value = food.protein;
      document.getElementById("cfw-carbs").value = food.carbs;
      document.getElementById("cfw-fat").value = food.fat;
      showCfwStep("cfw-step-macros");
    }
  } else {
    renderCfwIngredients();
    showCfwStep("cfw-step-path");
  }

  document.getElementById("cfw-search-results").classList.remove("visible");
  document.getElementById("custom-food-wizard-modal").classList.add("active");
}

function closeCfwWizard() {
  document.getElementById("custom-food-wizard-modal").classList.remove("active");
  cfwState.path = null;
  cfwState.editIdx = null;
  cfwState.ingredients = [];
  clearTimeout(cfwState.searchTimeout);
}

function showCfwStep(stepId) {
  document.querySelectorAll("#custom-food-wizard-modal .wizard-step").forEach(s => s.classList.remove("active"));
  document.getElementById(stepId).classList.add("active");

  const backBtn = document.getElementById("cfw-back-btn");
  backBtn.classList.toggle("visible", stepId !== "cfw-step-path");

  const titles = {
    "cfw-step-path": cfwState.editIdx !== null ? "Upravit potravinu" : "Přidat vlastní potravinu",
    "cfw-step-macros": "Zadat hodnoty",
    "cfw-step-ingredients": "Sestavit recept",
  };
  document.getElementById("cfw-title").textContent = titles[stepId] || "Přidat vlastní potravinu";
  document.getElementById("cfw-progress").innerHTML = "";
}

var cfwSearchGen = 0;

function cfwRenderSearchResults(results) {
  const el = document.getElementById("cfw-search-results");
  if (results.length === 0) {
    el.innerHTML = '<div class="cfw-search-result-item"><span class="name">Nic nenalezeno</span></div>';
  } else {
    el.innerHTML = results.map((f, i) => {
      const hasMacros = f.protein != null;
      const catText = (f.cat && f.cat !== "API") ? escapeHtml(f.cat) : "";
      const macroHtml = hasMacros
        ? `<span style="color:var(--blue)">B:${f.protein}g</span> <span style="color:var(--orange)">S:${f.carbs}g</span> <span style="color:var(--red)">T:${f.fat}g</span>`
        : "";
      const detailParts = [catText, macroHtml].filter(Boolean).join(" · ");
      return `
      <div class="cfw-search-result-item" data-cfw-ridx="${i}">
        <div>
          <div class="name">${escapeHtml(f.name)}</div>
          ${detailParts ? `<div class="detail">${detailParts}</div>` : ""}
        </div>
        <div class="kcal">${f.kcal != null ? Math.round(f.kcal) : ''}<span style="font-weight:400;font-size:11px;color:var(--text-secondary)"> kcal</span></div>
      </div>`;
    }).join("");
  }
  el._results = results;
  el.classList.add("visible");
}

function cfwSearchIngredients(query) {
  if (!query || query.length < 1) {
    document.getElementById("cfw-search-results").classList.remove("visible");
    return;
  }
  const q = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Show local results immediately
  let localResults = localFoods()
    .map(f => ({ ...f, source: f.source || "local" }))
    .filter(f => {
      const n = f.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const c = f.cat.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return n.includes(q) || c.includes(q);
    });
  sortByRelevance(localResults, query);
  localResults = localResults.slice(0, 8);
  cfwRenderSearchResults(localResults);

  // Also search APIs (debounced by the caller) if query is long enough
  if (query.length >= 3) {
    const gen = ++cfwSearchGen;
    (async () => {
      const searches = [apiSearch(query)];
      if (state.rohlikSearchEnabled) searches.push(rohlikSearch(query));
      const results = await Promise.all(searches);
      if (gen !== cfwSearchGen) return; // stale

      let apiResults = results[0] ? parseAutoResults(results[0]) : [];
      let rohlikResults = (state.rohlikSearchEnabled && results[1]) ? results[1] : [];

      // Merge: local first, then API/Rohlik (deduplicate by name)
      const seen = new Set(localResults.map(f => f.name.toLowerCase()));
      const extra = [...rohlikResults, ...apiResults].filter(f => {
        const key = f.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const combined = [...localResults, ...extra].slice(0, 10);
      cfwRenderSearchResults(combined);
    })();
  }
}

async function cfwAddIngredient(food) {
  // If API food without macros, fetch full details first
  if (food.source === "api" && food.guid && food.protein == null) {
    showToast("Načítám detaily...");
    const detail = await apiDetail(food);
    if (detail) {
      food = { ...food, ...detail, name: food.name };
    }
  }
  cfwState.ingredients.push({
    name: food.name, grams: 100,
    kcalPer100: food.kcal || 0, proteinPer100: food.protein || 0,
    carbsPer100: food.carbs || 0, fatPer100: food.fat || 0,
  });
  document.getElementById("cfw-ingredient-search").value = "";
  document.getElementById("cfw-search-clear").classList.remove("active");
  document.getElementById("cfw-search-results").classList.remove("visible");
  renderCfwIngredients();
  updateCfwRecipePreview();
}

function renderCfwIngredients() {
  const el = document.getElementById("cfw-ingredients-list");
  const weightGroup = document.getElementById("cfw-weight-group");
  const previewEl = document.getElementById("cfw-recipe-preview");

  if (cfwState.ingredients.length === 0) {
    el.innerHTML = '<div class="cfw-empty-ingredients">Zatím žádné ingredience</div>';
    weightGroup.style.display = "none";
    previewEl.style.display = "none";
    document.getElementById("cfw-save-recipe").disabled = true;
    return;
  }

  weightGroup.style.display = "block";
  previewEl.style.display = "block";

  const sum = cfwState.ingredients.reduce((s, ing) => s + (ing.grams || 0), 0);
  document.getElementById("cfw-total-weight").textContent = sum + " g";

  el.innerHTML = cfwState.ingredients.map((ing, i) => `
    <div class="cfw-ingredient-item" data-ing-idx="${i}">
      <div class="ing-info">
        <div class="ing-name">${escapeHtml(ing.name)}</div>
        <div class="ing-macros">${Math.round(ing.kcalPer100 * ing.grams / 100)} kcal · B:${(ing.proteinPer100 * ing.grams / 100).toFixed(1)}g · S:${(ing.carbsPer100 * ing.grams / 100).toFixed(1)}g · T:${(ing.fatPer100 * ing.grams / 100).toFixed(1)}g</div>
      </div>
      <input type="number" class="ing-grams" value="${ing.grams}" min="1" data-ing-idx="${i}" />
      <span class="ing-unit">g</span>
      <button class="ing-remove" data-ing-idx="${i}">&times;</button>
    </div>`).join("");
}

function updateCfwRecipePreview() {
  if (cfwState.ingredients.length === 0) return;
  let tKcal = 0, tProt = 0, tCarbs = 0, tFat = 0;
  for (const ing of cfwState.ingredients) {
    const g = ing.grams || 0;
    tKcal += (ing.kcalPer100 * g) / 100;
    tProt += (ing.proteinPer100 * g) / 100;
    tCarbs += (ing.carbsPer100 * g) / 100;
    tFat += (ing.fatPer100 * g) / 100;
  }
  const tw = cfwState.ingredients.reduce((s, ing) => s + (ing.grams || 0), 0);
  if (tw > 0) {
    document.getElementById("cfw-prev-kcal").textContent = Math.round((tKcal / tw) * 100);
    document.getElementById("cfw-prev-protein").textContent = ((tProt / tw) * 100).toFixed(1);
    document.getElementById("cfw-prev-carbs").textContent = ((tCarbs / tw) * 100).toFixed(1);
    document.getElementById("cfw-prev-fat").textContent = ((tFat / tw) * 100).toFixed(1);
    validateCfwRecipe();
  } else {
    ["cfw-prev-kcal","cfw-prev-protein","cfw-prev-carbs","cfw-prev-fat"].forEach(id => {
      document.getElementById(id).textContent = "-";
    });
    document.getElementById("cfw-save-recipe").disabled = true;
  }
}

function validateCfwRecipe() {
  const name = document.getElementById("cfw-recipe-name").value.trim();
  const weight = cfwState.ingredients.reduce((s, ing) => s + (ing.grams || 0), 0);
  document.getElementById("cfw-save-recipe").disabled = !(name && weight > 0 && cfwState.ingredients.length > 0);
}

function saveCfwMacros() {
  const name = document.getElementById("cfw-name").value.trim();
  if (!name) return;
  const food = {
    name,
    cat: document.getElementById("cfw-cat").value.trim() || "Vlastní",
    kcal: parseFloat(document.getElementById("cfw-kcal").value) || 0,
    protein: parseFloat(document.getElementById("cfw-protein").value) || 0,
    carbs: parseFloat(document.getElementById("cfw-carbs").value) || 0,
    fat: parseFloat(document.getElementById("cfw-fat").value) || 0,
  };
  if (cfwState.editIdx !== null) {
    state.customFoods[cfwState.editIdx] = food;
  } else {
    state.customFoods.push(food);
  }
  saveState();
  renderCategories();
  renderFoodList();
  renderCustomFoodsList();
  closeCfwWizard();
  showToast(cfwState.editIdx !== null ? "Potravina upravena" : "Potravina přidána");
}

async function handleCfwBarcodeResult(code) {
  // Ensure wizard modal stays open
  document.getElementById("custom-food-wizard-modal").classList.add("active");

  let food = null;

  // Check barcode cache first
  const cached = getCached(state.barcodeCache, code);
  if (cached) {
    food = Array.isArray(cached) ? cached[0] : cached;
  } else {
    // Look up on Open Food Facts
    try {
      const resp = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`,
      );
      if (resp.ok) {
        const data = await resp.json();
        if (data.status === 1 && data.product) {
          food = parseBarcodeProduct(code, data.product);
          setCache(state.barcodeCache, code, [food]);
        }
      }
    } catch (e) {
      console.warn("[CFW] Barcode lookup failed:", e);
    }
  }

  // Ensure wizard is visible
  document.getElementById("custom-food-wizard-modal").classList.add("active");
  showCfwStep("cfw-step-ingredients");

  if (food) {
    cfwAddIngredient(food);
    showToast(`Přidáno: ${food.name}`);
  } else {
    // Product not in Open Food Facts — fall back to API search like the main barcode flow
    const searchInput = document.getElementById("cfw-ingredient-search");
    searchInput.value = code;
    document.getElementById("cfw-search-clear").classList.add("active");
    // Try API search and show results in dropdown
    try {
      const apiData = await apiSearch(code);
      if (apiData) {
        const parsed = parseAutoResults(apiData);
        if (parsed.length > 0) {
          cfwRenderSearchResults(parsed.slice(0, 8));
          return;
        }
      }
    } catch (e) {
      console.warn("[CFW] API search fallback failed:", e);
    }
    // Also try local search by barcode number
    cfwSearchIngredients(code);
    if (document.getElementById("cfw-search-results").innerHTML.includes("Nic nenalezeno")) {
      showToast("Produkt nenalezen");
    }
  }
}

function saveCfwRecipe() {
  const name = document.getElementById("cfw-recipe-name").value.trim();
  if (!name || cfwState.ingredients.length === 0) return;
  const totalWeight = cfwState.ingredients.reduce((s, ing) => s + (ing.grams || 0), 0);
  if (totalWeight <= 0) return;

  let tKcal = 0, tProt = 0, tCarbs = 0, tFat = 0;
  for (const ing of cfwState.ingredients) {
    const g = ing.grams || 0;
    tKcal += (ing.kcalPer100 * g) / 100;
    tProt += (ing.proteinPer100 * g) / 100;
    tCarbs += (ing.carbsPer100 * g) / 100;
    tFat += (ing.fatPer100 * g) / 100;
  }

  const food = {
    name,
    cat: document.getElementById("cfw-recipe-cat").value.trim() || "Vlastní",
    kcal: +((tKcal / totalWeight) * 100).toFixed(1),
    protein: +((tProt / totalWeight) * 100).toFixed(1),
    carbs: +((tCarbs / totalWeight) * 100).toFixed(1),
    fat: +((tFat / totalWeight) * 100).toFixed(1),
    recipe: {
      totalWeight,
      ingredients: cfwState.ingredients.map(ing => ({
        name: ing.name, grams: ing.grams,
        kcal: ing.kcalPer100, protein: ing.proteinPer100,
        carbs: ing.carbsPer100, fat: ing.fatPer100,
      })),
    },
  };
  if (cfwState.editIdx !== null) {
    state.customFoods[cfwState.editIdx] = food;
  } else {
    state.customFoods.push(food);
  }
  saveState();
  renderCategories();
  renderFoodList();
  renderCustomFoodsList();
  closeCfwWizard();
  showToast(cfwState.editIdx !== null ? "Recept upraven" : "Recept přidán");
}

