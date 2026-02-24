// ═══════════════════════════════════════════
// FOOD LIST RENDERING
// ═══════════════════════════════════════════
function renderFoodList() {
  const el = document.getElementById("food-list");

  // If we have API results from search, show those
  if (
    state.searchQuery &&
    (state.apiResults.length > 0 ||
      state.rohlikResults.length > 0 ||
      state.barcodeResults.length > 0)
  ) {
    // Also add matching local results
    const q = state.searchQuery
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const localMatches = localFoods()
      .filter((f) => {
        const name = f.name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        return name.includes(q);
      })
      .map((f) => ({ ...f, source: "local" }));

    // Combine all sources and sort by relevance
    const barcodeItems = state.barcodeResults.map((f) => ({
      ...f,
      source: "barcode",
    }));
    const combined = [
      ...barcodeItems,
      ...state.rohlikResults,
      ...state.apiResults,
      ...localMatches,
    ];
    sortByRelevance(combined, state.searchQuery);
    renderFoodCards(el, combined);
    return;
  }

  // No search or API unavailable -> show local
  let foods = localFoods().map((f) => ({ ...f, source: "local" }));

  if (state.activeCategory === "★ Oblíbené") {
    if (state.favorites.length === 0) {
      el.innerHTML =
        '<div class="empty-state"><div class="icon">☆</div><p>Zatím nemáte žádné oblíbené potraviny</p><p style="font-size:13px;color:var(--text-secondary)">Klikněte na ★ u potraviny pro přidání</p></div>';
      return;
    }
    foods = foods.filter((f) => isFavorite(f.name));
    // Also include favorited foods not in local DB (e.g. API/barcode foods)
    const localNames = new Set(foods.map((f) => f.name));
    const missingFavs = state.favorites.filter((n) => !localNames.has(n));
    if (missingFavs.length > 0) {
      // Reconstruct from most recent log entry
      const logFoods = new Map();
      for (const entries of Object.values(state.log)) {
        for (const e of entries) {
          if (missingFavs.includes(e.name) && !logFoods.has(e.name)) {
            logFoods.set(e.name, {
              name: e.name,
              kcal: Math.round((e.kcal / e.grams) * 100),
              protein: +((e.protein / e.grams) * 100).toFixed(1),
              carbs: +((e.carbs / e.grams) * 100).toFixed(1),
              fat: +((e.fat / e.grams) * 100).toFixed(1),
              fiber: e.fiber
                ? +((e.fiber / e.grams) * 100).toFixed(1)
                : 0,
              liquid: !!e.liquid,
              cat: "API",
              source: "local",
            });
          }
        }
      }
      foods.push(...logFoods.values());
    }
  } else if (state.activeCategory !== "Vše") {
    foods = foods.filter((f) => f.cat === state.activeCategory);
  }

  if (state.searchQuery) {
    const q = state.searchQuery
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    foods = foods.filter((f) => {
      const name = f.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const cat = f.cat
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      return name.includes(q) || cat.includes(q);
    });
  }

  // Sort by relevance (favorites, usage frequency, recency, etc.)
  sortByRelevance(foods, state.searchQuery);

  renderFoodCards(el, foods);
}

var lastRenderedFoods = [];

function renderFoodCards(el, foods) {
  lastRenderedFoods = foods;
  if (foods.length === 0) {
    el.innerHTML =
      '<div class="empty-state"><div class="icon">🔍</div><p>Nic nenalezeno</p></div>';
    return;
  }

  el.innerHTML = foods
    .map((f, i) => {
      const kcalText =
        f.kcal != null
          ? `${Math.round(f.kcal)} <span>kcal</span>`
          : "<span>...</span>";
      const showMacros =
        f.protein != null &&
        (f.source === "local" ||
          f.source === "barcode" ||
          f.source === "rohlik");
      const macroHtml = showMacros
        ? `<div class="macros">
    <span class="macro protein">B: <b>${f.protein}g</b></span>
    <span class="macro carbs">S: <b>${f.carbs}g</b></span>
    <span class="macro fat">T: <b>${f.fat}g</b></span>
  </div>`
        : "";
      const badgeHtml =
        f.source === "barcode"
          ? '<span class="barcode-badge">Čárový kód</span>'
          : f.source === "rohlik"
            ? '<span class="rohlik-badge">Rohlik</span>'
            : "";
      const favHtml = isFavorite(f.name)
        ? '<span class="fav-badge">★</span>'
        : "";

      return `
<div class="food-card${f.source === "barcode" ? " barcode-match" : ""}" data-idx="${i}" data-source="${f.source}" data-guid="${f.guid || ""}" data-name="${escapeHtml(f.name)}">
  <div>
    <div class="food-name">${favHtml}${escapeHtml(f.name)}${badgeHtml}</div>
    <div class="food-portion">${escapeHtml(f.portion || (f.cat !== "API" ? f.cat : `na 100 ${f.liquid ? "ml" : "g"}`))}</div>
    ${macroHtml}
  </div>
  <div class="food-kcal">${kcalText}</div>
</div>
    `;
    })
    .join("");
}

