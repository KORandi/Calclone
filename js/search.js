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

  try {
    const resp = await proxyFetch(apiUrl(_h(_P1), { query, format: "json" }), {
      signal: searchAbort.signal,
    });
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

// ═══════════════════════════════════════════
// NUTRITION PARSING
// ═══════════════════════════════════════════
// The detail endpoint has not always answered with the same shape: fields get
// renamed, nested a level deeper, or the page is served as HTML when the json
// format is ignored. Reading one fixed path meant any of those quietly turned
// into a food with 0 g of every macro, so instead we look for known nutrient
// names anywhere in the answer and fall back to the page itself.

// canonical key → field / label names it can appear under (diacritics stripped)
var NUTRIENT_ALIASES = {
  kcal: [
    "energy",
    "energykcal",
    "energyvalue",
    "energyvaluekcal",
    "kcal",
    "calories",
    "calorie",
    "energie",
    "energiekcal",
    "energetickahodnota",
  ],
  kj: ["energykj", "energyvaluekj", "kj", "kilojoule", "energiekj"],
  protein: ["protein", "proteins", "bilkoviny", "bilkovina"],
  carbs: [
    "carbohydrate",
    "carbohydrates",
    "carbs",
    "saccharide",
    "saccharides",
    "sacharidy",
    "sacharid",
  ],
  fat: ["fat", "fats", "tuk", "tuky"],
  fiber: ["fiber", "fibre", "fibers", "vlaknina"],
  sugar: ["sugar", "sugars", "cukr", "cukry"],
};

var NUTRIENT_BY_ALIAS = (() => {
  const map = {};
  for (const [canon, aliases] of Object.entries(NUTRIENT_ALIASES))
    for (const alias of aliases) map[alias] = canon;
  return map;
})();

// lowercase, strip diacritics, keep only a-z0-9
function normNutrientKey(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// Tolerant number parse: 1,23 · "13,5 g" · "1 420 kJ" · { value: 12 } · 12
// Returns null when there is no number to read, so a missing field stays
// distinguishable from a genuine zero.
function czFloat(v) {
  if (v == null || v === "" || typeof v === "boolean") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v === "object") {
    for (const k of ["value", "amount", "val", "quantity", "number"])
      if (v[k] != null) return czFloat(v[k]);
    return null;
  }
  const s = String(v)
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/(\d)[ ](?=\d{3}(?:\D|$))/g, "$1") // 1 420 → 1420
    .replace(",", ".");
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

// "energy" turns up in both kcal and kJ; believe the unit written next to the
// number rather than the field name.
function energyTarget(canon, hint) {
  if (canon !== "kcal" && canon !== "kj") return canon;
  const s = String(hint == null ? "" : hint);
  if (/kcal/i.test(s)) return "kcal";
  if (/kj/i.test(s)) return "kj";
  return canon;
}

// Walk a parsed json answer breadth-first and take the first (shallowest)
// value found per nutrient. Understands both { protein: 7.1 } objects and
// [{ name: "Bílkoviny", value: 7.1 }] rows.
function collectNutrients(root) {
  const out = {};
  const queue = [root];
  const seen = new Set();
  let steps = 0;
  while (queue.length && steps++ < 2000) {
    const node = queue.shift();
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node) queue.push(child);
      continue;
    }
    // nutrient rows carrying their own label
    const label = node.name ?? node.title ?? node.label ?? node.key;
    const rawLabelCanon =
      typeof label === "string"
        ? NUTRIENT_BY_ALIAS[normNutrientKey(label)]
        : null;
    let labelCanon = rawLabelCanon;
    if (rawLabelCanon) {
      const rowVal = node.value ?? node.amount ?? node.val ?? node.quantity;
      labelCanon = energyTarget(
        rawLabelCanon,
        node.unit ?? node.units ?? (typeof rowVal === "string" ? rowVal : ""),
      );
      if (out[labelCanon] == null) {
        const num = czFloat(rowVal);
        if (num != null) out[labelCanon] = num;
      }
    }
    for (const [rawKey, val] of Object.entries(node)) {
      const rawCanon = NUTRIENT_BY_ALIAS[normNutrientKey(rawKey)];
      if (rawCanon) {
        const canon = energyTarget(
          rawCanon,
          typeof val === "string"
            ? val
            : val && typeof val === "object"
              ? (val.unit ?? val.units ?? "")
              : "",
        );
        if (out[canon] == null) {
          const num = czFloat(val);
          if (num != null) out[canon] = num;
        }
      }
      if (val && typeof val === "object") queue.push(val);
    }
    if (out._unit == null) {
      const u = node.baseUnit ?? node.baseUnitName ?? node.defaultUnit;
      if (typeof u === "string" && u) out._unit = u.toLowerCase().trim();
    }
    if (out._name == null && !labelCanon) {
      const n = node.name ?? node.title;
      if (typeof n === "string" && n.trim()) out._name = n.trim();
    }
  }
  return out;
}

// Last resort: read the values off the detail page itself.
function scrapeNutrientsFromHtml(html) {
  const flat = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " | ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\s+/g, " ");

  // text right after a label, where its value lives
  const after = (re) => {
    const m = re.exec(flat);
    if (!m) return null;
    const start = m.index + m[0].length;
    return flat.slice(start, start + 80);
  };

  const out = {};
  const energyWin = after(
    /(?:energetick\S*\s*hodnota|kalorick\S*\s*hodnota|energie|energy)\s*[:|]*/i,
  );
  if (energyWin) {
    const kcalM = energyWin.match(/([\d][\d .,]*)\s*kcal/i);
    const kjM = energyWin.match(/([\d][\d .,]*)\s*kj/i);
    if (kcalM) out.kcal = czFloat(kcalM[1]);
    else if (kjM) out.kj = czFloat(kjM[1]);
    else out.kcal = czFloat(energyWin);
  }
  const LABELS = [
    ["protein", /b[ií]lkoviny\s*[:|]*/i],
    ["carbs", /sacharidy\s*[:|]*/i],
    ["fat", /tuky\s*[:|]*/i],
    ["fiber", /vl[áa]knina\s*[:|]*/i],
    ["sugar", /cukry\s*[:|]*/i],
  ];
  for (const [canon, re] of LABELS) {
    const win = after(re);
    if (win == null) continue;
    const num = czFloat(win);
    if (num != null) out[canon] = num;
  }
  return out;
}

// A detail answer is only usable if at least one macro came back.
function hasMacros(n) {
  return !!n && (n.protein != null || n.carbs != null || n.fat != null);
}

function finalizeDetail(n, food) {
  let kcal = n.kcal;
  if (kcal == null && n.kj != null) kcal = n.kj / 4.184;
  if (kcal == null) kcal = (food && food.kcal) || 0;
  const unit = n._unit;
  return {
    name: n._name || null,
    kcal: Math.round(kcal * 10) / 10,
    protein: n.protein ?? 0,
    carbs: n.carbs ?? 0,
    fat: n.fat ?? 0,
    fiber: n.fiber ?? 0,
    sugar: n.sugar ?? 0,
    liquid: unit ? unit === "ml" || unit === "l" : !!(food && food.liquid),
  };
}

// Failures are never written to the detail cache (zeroes there would mask the
// real values for a whole day), so remember them here instead: long enough to
// stop reopening a food from re-firing the same doomed requests, short enough
// that a recovered source is picked up straight away.
var detailFailedAt = {};
var DETAIL_RETRY_COOLDOWN = 60 * 1000;

function detailFailure(food) {
  return {
    name: null,
    kcal: (food && food.kcal) || 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    sugar: 0,
    liquid: !!(food && food.liquid),
    incomplete: true,
  };
}

async function apiDetail(food) {
  const cacheKey = food.guid;
  const cached = getCached(state.detailCache, cacheKey);
  if (cached) return cached;

  const failedAt = detailFailedAt[cacheKey];
  if (failedAt && Date.now() - failedAt < DETAIL_RETRY_COOLDOWN)
    return detailFailure(food);

  const attempts = [
    apiUrl(_h(_P2) + food.guid + "/100/0000000000000001", { format: "json" }),
    apiUrl(_h(_P2) + food.guid, { format: "json" }),
    apiUrl(_h(_P2) + food.guid, {}),
  ];
  if (food.url) {
    attempts.push(
      /^https?:/i.test(food.url)
        ? food.url
        : _h(_B) + (food.url[0] === "/" ? "" : "/") + food.url,
    );
  }

  let lastError = null;
  for (const url of attempts) {
    let body;
    try {
      body = await (await proxyFetch(url)).text();
    } catch (e) {
      // Every proxy already refused this one. Walking the remaining URLs
      // would just multiply the load on whatever is failing — stop here.
      lastError = e;
      break;
    }
    let nutrients;
    try {
      nutrients = collectNutrients(JSON.parse(body));
    } catch {
      nutrients = scrapeNutrientsFromHtml(body);
    }
    if (hasMacros(nutrients)) {
      delete detailFailedAt[cacheKey];
      const result = finalizeDetail(nutrients, food);
      setCache(state.detailCache, cacheKey, result);
      return result;
    }
    lastError = new Error("no nutrition values in response");
  }
  detailFailedAt[cacheKey] = Date.now();

  console.warn("API detail failed for", food.guid, lastError);
  return detailFailure(food);
}

async function apiFormDetail(guid) {
  const cacheKey = "form_" + guid;
  const cached = getCached(state.detailCache, cacheKey);
  if (cached) return cached;

  try {
    const resp = await proxyFetch(
      apiUrl(_h(_P3) + guid, { format: "json", default: "true" }),
    );
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
  try {
    const resp = await proxyFetch(ROHLIK_URL + "?" + params.toString(), {
      signal: rohlikAbort.signal,
      headers: { "x-origin": "WEB" },
    });
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

