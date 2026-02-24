// ═══════════════════════════════════════════
// CATEGORIES (local only, API has its own)
// ═══════════════════════════════════════════
function getCategories() {
  const cats = new Set();
  localFoods().forEach((f) => cats.add(f.cat));
  const list = ["Vše", "★ Oblíbené", ...Array.from(cats)];
  return list;
}

function renderCategories() {
  const el = document.getElementById("cat-pills");
  // Hide categories when API search is active
  if (state.searchQuery && apiAvailable) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = getCategories()
    .map(
      (c) =>
        `<button class="cat-pill${state.activeCategory === c ? " active" : ""}" data-cat="${c}">${c}</button>`,
    )
    .join("");
}

// ═══════════════════════════════════════════
// RELEVANCE SCORING
// ═══════════════════════════════════════════
function normalizeStr(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function computeRelevanceScore(food, query) {
  let score = 0;

  // 1. Favorite bonus (+50)
  if (isFavorite(food.name)) score += 50;

  // 2. Usage frequency — up to 40 points (capped at 10 uses)
  const usage = state.foodUsage[food.name] || 0;
  score += Math.min(usage * 4, 40);

  // 3. Recency — up to 30 points, decaying over 30 days
  const rel = state.foodRelevance[food.name];
  if (rel && rel.lastUsed) {
    const daysSince = (Date.now() - rel.lastUsed) / (1000 * 60 * 60 * 24);
    if (daysSince < 1) score += 30;
    else if (daysSince < 30)
      score += Math.round(30 * (1 - daysSince / 30));
  }

  // 4. Click/selection count — up to 15 points
  if (rel && rel.clickCount) {
    score += Math.min(rel.clickCount * 3, 15);
  }

  // 5. Search match quality (when query is present) — up to 25 points
  if (query) {
    const q = normalizeStr(query);
    const name = normalizeStr(food.name);
    if (name === q) score += 25;
    else if (name.startsWith(q)) score += 15;
    else if (name.includes(q)) score += 5;
  }

  // 6. Source priority bonus
  if (food.source === "barcode") score += 20;
  else if (food.source === "local") score += 10;
  else if (food.source === "rohlik") score += 5;
  // api gets 0 bonus

  return score;
}

function sortByRelevance(foods, query) {
  return foods.sort((a, b) => {
    const scoreA = computeRelevanceScore(a, query);
    const scoreB = computeRelevanceScore(b, query);
    if (scoreB !== scoreA) return scoreB - scoreA;
    // Tie-break: alphabetical
    return a.name.localeCompare(b.name, "cs");
  });
}

