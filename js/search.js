// ═══════════════════════════════════════════
// API search
// ═══════════════════════════════════════════
var searchAbort = null;
var searchTimeout = null;

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function foodIndexKey(item) {
  return item.id || ("t:" + hashStr(item.title || ""));
}

function storeSearchResults(normKey, items) {
  if (!Array.isArray(items)) items = [];
  var refs = [];
  for (var item of items) {
    var key = foodIndexKey(item);
    if (!key || key === "t:") continue;
    state.foodIndex[key] = item;
    refs.push(key);
  }
  state.searchCache[normKey] = { refs, ts: Date.now() };
  _cachedSizeBytes = null;
  saveCache();
}

async function apiSearch(query) {
  // Check search cache first
  const cacheKeyNorm = normalizeCacheKey(query);
  const entry = getCached(state.searchCache, cacheKeyNorm);
  if (entry !== null) {
    apiAvailable = true;
    return entry;
  }

  if (searchAbort) searchAbort.abort();
  searchAbort = new AbortController();

  const url = proxyUrl(_h(_P1), { query, format: "json" });
  try {
    const resp = await fetch(url, { signal: searchAbort.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    apiAvailable = true;

    // Store items in foodIndex, refs in searchCache
    storeSearchResults(cacheKeyNorm, data);

    return data;
  } catch (e) {
    if (e.name === "AbortError") return null;
    console.warn("API search failed:", e);
    apiAvailable = false;

    // Offline fallback: search through all foodIndex items
    const q = query
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const seen = new Set();
    const offlineResults = [];
    for (const item of Object.values(state.foodIndex)) {
      if (!item.title || (item.clazz && item.clazz !== "foodstuff"))
        continue;
      if (item.id && seen.has(item.id)) continue;
      const title = item.title
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      if (title.includes(q)) {
        if (item.id) seen.add(item.id);
        offlineResults.push(item);
      }
    }
    return offlineResults.length > 0 ? offlineResults : null;
  }
}

// Parse Czech decimal string "1,23" → 1.23
function czFloat(s) {
  if (s == null) return 0;
  return parseFloat(String(s).replace(",", ".")) || 0;
}

async function apiDetail(food) {
  const cacheKey = food.guid;
  const cached = getCached(state.detailCache, cacheKey);
  if (cached) return cached;

  const url = proxyUrl(_h(_P2) + food.guid + "/100/0000000000000001", {
    format: "json",
  });
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const fs = data.foodstuff || {};
    const result = {
      name: fs.name || fs.title || null,
      kcal: czFloat(fs.energy) || food.kcal || 0,
      protein: czFloat(fs.protein),
      carbs: czFloat(fs.carbohydrate),
      fat: czFloat(fs.fat),
      fiber: czFloat(fs.fiber),
      sugar: czFloat(fs.sugar),
      liquid: fs.baseUnit === "ml",
    };
    setCache(state.detailCache, cacheKey, result);
    return result;
  } catch (e) {
    console.warn("API detail failed:", e);
    return {
      kcal: food.kcal || 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
    };
  }
}

async function apiFormDetail(guid) {
  const cacheKey = "form_" + guid;
  const cached = getCached(state.detailCache, cacheKey);
  if (cached) return cached;

  const url = proxyUrl(_h(_P3) + guid, {
    format: "json",
    default: "true",
  });
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const opts = (data.unitOptions || [])
      .filter((o) => o.multiplier > 1)
      .map((o) => ({ name: o.title, grams: o.multiplier }));
    setCache(state.detailCache, cacheKey, opts);
    return opts;
  } catch (e) {
    console.warn("API form detail failed:", e);
    return [];
  }
}

// Parse autocomplete result into normalized food items
function parseAutoResults(data) {
  if (!data) return [];
  const items = Array.isArray(data) ? data : [];

  return items
    .filter((item) => !item.clazz || item.clazz === "foodstuff")
    .slice(0, 30)
    .map((item) => {
      const cached = item.id
        ? getCached(state.detailCache, item.id)
        : null;
      return {
        name: item.title || "",
        guid: item.id || null,
        url: item.url || null,
        cat: item.brandName || "API",
        kcal: parseFloat(item.value) || null,
        protein: cached ? cached.protein : null,
        carbs: cached ? cached.carbs : null,
        fat: cached ? cached.fat : null,
        fiber: cached ? cached.fiber : null,
        liquid: cached ? cached.liquid : false,
        source: "api",
      };
    });
}

// ═══════════════════════════════════════════
// ROHLIK SEARCH
// ═══════════════════════════════════════════
var ROHLIK_URL =
  "https://www.rohlik.cz/services/frontend-service/search-metadata";
var rohlikAbort = null;

async function rohlikSearch(query) {
  // Check cache first
  const cacheKeyNorm = "rohlik_" + normalizeCacheKey(query);
  const cached = getCached(state.searchCache, cacheKeyNorm);
  if (cached !== null) return cached;

  if (rohlikAbort) rohlikAbort.abort();
  rohlikAbort = new AbortController();

  const params = new URLSearchParams({
    search: query,
    offset: "0",
    limit: "10",
    companyId: "1",
  });
  const url =
    CORS_PROXY + encodeURIComponent(ROHLIK_URL + "?" + params.toString());
  try {
    const resp = await fetch(url, {
      signal: rohlikAbort.signal,
      headers: { "x-origin": "WEB" },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    const products = json.data?.productList || [];
    const results = products
      .filter((p) => p.composition?.nutritionalValues)
      .slice(0, 10)
      .map((p) => {
        const nv = p.composition.nutritionalValues;
        const isLiquid = p.unit === "l";
        const measurements = [];
        const ta = p.textualAmount || "";
        const ta2 = ta.replace(/^cca\s*/i, "");
        const mG = ta2.match(/^([\d.,]+)\s*g$/i);
        const mKg = ta2.match(/^([\d.,]+)\s*kg$/i);
        const mMl = ta2.match(/^([\d.,]+)\s*ml$/i);
        const mL = ta2.match(/^([\d.,]+)\s*l$/i);
        if (mG) {
          const g = parseFloat(mG[1].replace(",", "."));
          if (g > 0 && g !== 100)
            measurements.push({
              name: `${ta} (balení)`,
              grams: g,
            });
        } else if (mKg) {
          const g = parseFloat(mKg[1].replace(",", ".")) * 1000;
          if (g > 0 && g !== 100)
            measurements.push({
              name: `${ta} (balení)`,
              grams: g,
            });
        } else if (mMl) {
          const ml = parseFloat(mMl[1].replace(",", "."));
          if (ml > 0 && ml !== 100)
            measurements.push({
              name: `${ta} (balení)`,
              grams: ml,
            });
        } else if (mL) {
          const ml = parseFloat(mL[1].replace(",", ".")) * 1000;
          if (ml > 0 && ml !== 100)
            measurements.push({
              name: `${ta} (balení)`,
              grams: ml,
            });
        } else if (p.unit === "ks") {
          const nameLower = (p.productName || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
          if (nameLower.includes("vejce") || nameLower.includes("vajic"))
            measurements.push({ name: "kus (~58 g)", grams: 58 });
        }
        return {
          name: p.productName,
          cat: "Rohlik",
          kcal: nv.energyValueKcal || 0,
          protein: nv.proteins || 0,
          carbs: nv.carbohydrates || 0,
          fat: nv.fats || 0,
          fiber: nv.fiber || 0,
          liquid: isLiquid,
          portion: ta || "100 g",
          measurements:
            measurements.length > 0 ? measurements : undefined,
          source: "rohlik",
        };
      });
    setCache(state.searchCache, cacheKeyNorm, results);
    return results;
  } catch (e) {
    if (e.name === "AbortError") return null;
    console.warn("Rohlik search failed:", e);
    return [];
  }
}

