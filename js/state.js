// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════
var DEFAULT_QUICK_GRAMS = [25, 50, 100, 150, 200, 250, 500];
var DEFAULT_MEASUREMENTS = [
  { name: "Lžíce", grams: 15 },
  { name: "Lžička", grams: 5 },
  { name: "Hrnek", grams: 250 },
  { name: "Odměrka", grams: 30 },
];

var state = {
  activePage: "page-database",
  activeCategory: "Vše",
  searchQuery: "",
  selectedFood: null,
  goals: { kcal: 2000, protein: 120, carbs: 250, fat: 65 },
  log: {},
  customFoods: [],
  apiResults: [],
  rohlikResults: [],
  barcodeResults: [],
  detailCache: {},
  searchCache: {},
  foodIndex: {},
  barcodeCache: {},
  portionMemory: {},
  favorites: [],
  foodUsage: {},
  foodRelevance: {}, // { [foodName]: { lastUsed: timestamp, clickCount: number } }
  expandedHistoryDay: null,
  customMeasurementsEnabled: false,
  customMeasurements: [],
  customQuickGramsEnabled: true,
  quickGrams: [...DEFAULT_QUICK_GRAMS],
  rohlikSearchEnabled: false,
  cacheSizeLimitMB: 4,
  autoFavEnabled: true,
  mealCategoriesEnabled: false,
  mealCategories: ["Snídaně", "Oběd", "Večeře", "Svačina"],
  mealCategoryTimes: {
    Snídaně: "06:00",
    Oběd: "11:00",
    Svačina: "14:00",
    Večeře: "17:00",
  },
  mealNotificationsEnabled: false,
  trendsEnabled: false,
  trendsPeriod: 7,
  copyDayEnabled: false,
  qrShareEnabled: false,
  logTargetDate: null, // null = today, or "YYYY-MM-DD" for specific date
  theme: "default",
  aiEnabled: false,
  aiProvider: null, // "gemini" | "claude" | "openai"
  aiApiKey: null, // encrypted/stored locally only
  weightRecalcLastUsed: null, // ISO date string of last recalculation
  weightRecalcLastWeight: null, // last recorded weight in kg
  weightHistory: [], // array of { date, weight, previousWeight, kcal, protein, carbs, fat }
  userProfile: null, // { sex, age, weight, height } — saved from goals wizard for pre-filling
};

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showToast(msg, duration = 2000) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), duration);
}

// ─── Settings keys stored in localStorage (small, sync) ───
var SETTINGS_KEYS = [
  "goals",
  "customMeasurementsEnabled",
  "customMeasurements",
  "customQuickGramsEnabled",
  "quickGrams",
  "rohlikSearchEnabled",
  "cacheSizeLimitMB",
  "autoFavEnabled",
  "mealCategoriesEnabled",
  "mealCategories",
  "mealCategoryTimes",
  "mealNotificationsEnabled",
  "trendsEnabled",
  "trendsPeriod",
  "copyDayEnabled",
  "qrShareEnabled",
  "theme",
  "aiEnabled",
  "aiProvider",
  "aiApiKey",
  "weightRecalcLastUsed",
  "weightRecalcLastWeight",
  "weightHistory",
  "userProfile",
];

// ─── Data keys stored in IndexedDB (large, async) ───
var USERDATA_KEYS = [
  "customFoods",
  "portionMemory",
  "favorites",
  "foodUsage",
  "foodRelevance",
];

function loadState() {
  // 1) Load settings from localStorage (synchronous — instant UI)
  try {
    const saved = localStorage.getItem("kaltab_state");
    if (saved) {
      const parsed = JSON.parse(saved);
      state.goals = parsed.goals || state.goals;
      state.customMeasurementsEnabled =
        parsed.customMeasurementsEnabled !== undefined
          ? parsed.customMeasurementsEnabled
          : true;
      state.customMeasurements =
        parsed.customMeasurements && parsed.customMeasurements.length > 0
          ? parsed.customMeasurements
          : [...DEFAULT_MEASUREMENTS];
      state.customQuickGramsEnabled =
        parsed.customQuickGramsEnabled !== undefined
          ? parsed.customQuickGramsEnabled
          : true;
      state.quickGrams = parsed.quickGrams || [...DEFAULT_QUICK_GRAMS];
      state.rohlikSearchEnabled = parsed.rohlikSearchEnabled || false;
      state.cacheSizeLimitMB =
        parsed.cacheSizeLimitMB !== undefined
          ? parsed.cacheSizeLimitMB
          : 4;
      state.autoFavEnabled =
        parsed.autoFavEnabled !== undefined
          ? parsed.autoFavEnabled
          : true;
      state.mealCategoriesEnabled =
        parsed.mealCategoriesEnabled !== undefined
          ? parsed.mealCategoriesEnabled
          : false;
      state.mealCategories = parsed.mealCategories || [
        "Snídaně",
        "Oběd",
        "Večeře",
        "Svačina",
      ];
      state.mealCategoryTimes = parsed.mealCategoryTimes || {
        Snídaně: "06:00",
        Oběd: "11:00",
        Svačina: "14:00",
        Večeře: "17:00",
      };
      state.mealNotificationsEnabled =
        parsed.mealNotificationsEnabled !== undefined
          ? parsed.mealNotificationsEnabled
          : false;
      state.trendsEnabled =
        parsed.trendsEnabled !== undefined ? parsed.trendsEnabled : false;
      state.trendsPeriod = parsed.trendsPeriod || 7;
      state.copyDayEnabled =
        parsed.copyDayEnabled !== undefined
          ? parsed.copyDayEnabled
          : false;
      state.qrShareEnabled =
        parsed.qrShareEnabled !== undefined
          ? parsed.qrShareEnabled
          : false;
      state.theme = parsed.theme || "default";
      state.aiEnabled = parsed.aiEnabled || false;
      state.aiProvider = parsed.aiProvider || null;
      state.aiApiKey = parsed.aiApiKey || null;
      state.weightRecalcLastUsed = parsed.weightRecalcLastUsed || null;
      state.weightRecalcLastWeight = parsed.weightRecalcLastWeight || null;
      state.weightHistory = parsed.weightHistory || [];
      state.userProfile = parsed.userProfile || null;
    }
  } catch (e) {}
}

// 2) Load large data from IndexedDB (async — after initial render)
async function loadFromIndexedDB() {
  try {
    await KaltabDB.open();

    // Check if we need to migrate from old localStorage format
    const needsMigration = await _checkMigration();
    if (needsMigration) {
      await _migrateToIndexedDB();
      return; // migration already populated state
    }

    // Load logs
    const logs = await KaltabDB.getAll("logs");
    if (Object.keys(logs).length > 0) {
      state.log = logs;
    }

    // Load user data (customFoods, favorites, etc.)
    for (const key of USERDATA_KEYS) {
      const val = await KaltabDB.get("userData", key);
      if (val !== undefined) state[key] = val;
    }

    // Load caches (invalidate if version mismatch)
    const caches = await KaltabDB.get("cache", "apiCaches");
    if (caches && caches._v === CACHE_VERSION) {
      state.searchCache = caches.searchCache || {};
      state.foodIndex = caches.foodIndex || {};
      state.detailCache = caches.detailCache || {};
      state.barcodeCache = caches.barcodeCache || {};
    } else if (caches) {
      console.log("Cache version mismatch, clearing caches");
      await KaltabDB.put("cache", "apiCaches", { _v: CACHE_VERSION });
    }
  } catch (e) {
    console.warn(
      "IndexedDB load failed, falling back to localStorage:",
      e,
    );
    _loadLegacyData();
  }
}

// Fallback: load data from localStorage if IndexedDB fails
function _loadLegacyData() {
  try {
    const saved = localStorage.getItem("kaltab_state");
    if (saved) {
      const parsed = JSON.parse(saved);
      state.log = parsed.log || {};
      state.customFoods = parsed.customFoods || [];
      state.portionMemory = parsed.portionMemory || {};
      state.favorites = parsed.favorites || [];
      state.foodUsage = parsed.foodUsage || {};
      state.foodRelevance = parsed.foodRelevance || {};
    }
  } catch (e) {}
  try {
    const saved = localStorage.getItem("kaltab_cache");
    if (saved) {
      const parsed = JSON.parse(saved);
      state.searchCache = parsed.searchCache || {};
      state.foodIndex = parsed.foodIndex || {};
      state.detailCache = parsed.detailCache || {};
      state.barcodeCache = parsed.barcodeCache || {};
    }
  } catch (e) {}
}

// Check if old localStorage data exists but IndexedDB is empty
async function _checkMigration() {
  const saved = localStorage.getItem("kaltab_state");
  if (!saved) return false;
  const parsed = JSON.parse(saved);
  // If old state has logs or user data, we need migration
  const hasLog = parsed.log && Object.keys(parsed.log).length > 0;
  const hasCustomFoods =
    parsed.customFoods && parsed.customFoods.length > 0;
  const hasFavorites = parsed.favorites && parsed.favorites.length > 0;
  const hasUsage =
    parsed.foodUsage && Object.keys(parsed.foodUsage).length > 0;
  const hasRelevance =
    parsed.foodRelevance && Object.keys(parsed.foodRelevance).length > 0;
  const hasPortion =
    parsed.portionMemory && Object.keys(parsed.portionMemory).length > 0;
  const hasLegacyData =
    hasLog ||
    hasCustomFoods ||
    hasFavorites ||
    hasUsage ||
    hasRelevance ||
    hasPortion;
  if (!hasLegacyData) return false;
  // Only migrate if IndexedDB logs store is empty
  const existingLogs = await KaltabDB.getAll("logs");
  return Object.keys(existingLogs).length === 0;
}

// One-time migration from localStorage to IndexedDB
async function _migrateToIndexedDB() {
  try {
    const saved = localStorage.getItem("kaltab_state");
    if (!saved) return;
    const parsed = JSON.parse(saved);

    // Migrate logs
    const log = parsed.log || {};
    state.log = log;
    await KaltabDB.putAllLogs(log);

    // Migrate user data
    for (const key of USERDATA_KEYS) {
      if (parsed[key] !== undefined) {
        state[key] = parsed[key];
        await KaltabDB.put("userData", key, parsed[key]);
      }
    }

    // Migrate caches (from kaltab_state or kaltab_cache)
    let searchCache = parsed.searchCache || {};
    let detailCache = parsed.detailCache || {};
    let barcodeCache = parsed.barcodeCache || {};
    try {
      const cacheStr = localStorage.getItem("kaltab_cache");
      if (cacheStr) {
        const cacheParsed = JSON.parse(cacheStr);
        searchCache = cacheParsed.searchCache || searchCache;
        detailCache = cacheParsed.detailCache || detailCache;
        barcodeCache = cacheParsed.barcodeCache || barcodeCache;
      }
    } catch (e) {}
    state.searchCache = searchCache;
    state.foodIndex = {};
    state.detailCache = detailCache;
    state.barcodeCache = barcodeCache;
    await KaltabDB.put("cache", "apiCaches", {
      _v: CACHE_VERSION,
      searchCache,
      foodIndex: state.foodIndex,
      detailCache,
      barcodeCache,
    });

    // Clean up: remove large data from localStorage, keep only settings
    const settingsOnly = {};
    for (const key of SETTINGS_KEYS) {
      if (parsed[key] !== undefined) settingsOnly[key] = parsed[key];
    }
    localStorage.setItem("kaltab_state", JSON.stringify(settingsOnly));
    localStorage.removeItem("kaltab_cache");

    console.log("Migration to IndexedDB complete");
  } catch (e) {
    console.warn("Migration failed:", e);
    _loadLegacyData();
  }
}

function saveState() {
  // Save settings to localStorage (synchronous, small)
  try {
    const settings = {};
    for (const key of SETTINGS_KEYS) {
      settings[key] = state[key];
    }
    localStorage.setItem("kaltab_state", JSON.stringify(settings));
  } catch (e) {}

  // Save large data to IndexedDB (async, fire-and-forget)
  _saveToIndexedDB();
}

async function _saveToIndexedDB() {
  try {
    await KaltabDB.open();

    // Save logs
    await KaltabDB.putAllLogs(state.log);

    // Save user data
    for (const key of USERDATA_KEYS) {
      await KaltabDB.put("userData", key, state[key]);
    }
  } catch (e) {
    console.warn("IndexedDB save failed:", e);
  }
}

var _saveCacheTimer = null;
function saveCache() {
  if (_saveCacheTimer) return;
  _saveCacheTimer = setTimeout(() => {
    _saveCacheTimer = null;
    _saveCacheToIndexedDB();
    updateCacheUsageUI();
  }, 500);
}

var _cachedSizeBytes = null;

async function _saveCacheToIndexedDB() {
  try {
    await KaltabDB.open();

    const limitBytes = state.cacheSizeLimitMB * 1024 * 1024;
    const currentSize = getCacheSizeBytes();
    if (currentSize > limitBytes) {
      evictCacheEntries(limitBytes);
    }

    await KaltabDB.put("cache", "apiCaches", {
      _v: CACHE_VERSION,
      searchCache: state.searchCache,
      foodIndex: state.foodIndex,
      detailCache: state.detailCache,
      barcodeCache: state.barcodeCache,
    });
  } catch (e) {
    console.warn("IndexedDB cache save failed:", e);
  }
}

function evictCacheEntries(targetBytes) {
  // Collect all cache entries with estimated sizes
  const allEntries = [];
  for (const [cacheName, cache] of [
    ["searchCache", state.searchCache],
    ["detailCache", state.detailCache],
    ["barcodeCache", state.barcodeCache],
  ]) {
    for (const key of Object.keys(cache)) {
      const entryJson = JSON.stringify(cache[key]);
      allEntries.push({
        cacheName,
        key,
        ts: cache[key].ts || 0,
        size: entryJson.length * 2 + key.length * 2, // approximate bytes (UTF-16)
      });
    }
  }
  // Sort oldest first
  allEntries.sort((a, b) => a.ts - b.ts);

  // Remove oldest entries, tracking freed bytes
  let currentSize = getCacheSizeBytes();
  for (const entry of allEntries) {
    if (currentSize <= targetBytes) break;
    currentSize -= entry.size;
    delete state[entry.cacheName][entry.key];
  }
  // Clean up orphaned foodIndex entries
  pruneOrphanedFoodIndex();
  _cachedSizeBytes = null; // invalidate cached size
}

function pruneOrphanedFoodIndex() {
  // Collect all refs still used by searchCache
  const usedRefs = new Set();
  for (const entry of Object.values(state.searchCache)) {
    if (entry.refs) {
      for (const ref of entry.refs) usedRefs.add(ref);
    }
  }
  // Remove foodIndex entries not referenced by any searchCache entry
  for (const key of Object.keys(state.foodIndex)) {
    if (!usedRefs.has(key)) delete state.foodIndex[key];
  }
}

function getCacheSizeBytes() {
  if (_cachedSizeBytes !== null) return _cachedSizeBytes;
  const json = JSON.stringify({
    searchCache: state.searchCache,
    foodIndex: state.foodIndex,
    detailCache: state.detailCache,
    barcodeCache: state.barcodeCache,
  });
  _cachedSizeBytes = new Blob([json]).size;
  return _cachedSizeBytes;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  var kb = bytes / 1024;
  if (kb < 100) return kb.toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function updateCacheUsageUI() {
  const usageText = document.getElementById("cache-usage-text");
  const limitText = document.getElementById("cache-usage-limit-text");
  const fill = document.getElementById("cache-usage-fill");
  if (!usageText || !limitText || !fill) return;

  const sizeBytes = getCacheSizeBytes();
  const limitBytes = state.cacheSizeLimitMB * 1024 * 1024;
  const pct = Math.min((sizeBytes / limitBytes) * 100, 100);

  usageText.textContent = formatBytes(sizeBytes);
  limitText.textContent =
    "/ " + state.cacheSizeLimitMB.toFixed(1) + " MB";
  fill.style.width = pct.toFixed(1) + "%";
  fill.classList.remove("warning", "danger");
  if (pct > 90) fill.classList.add("danger");
  else if (pct > 70) fill.classList.add("warning");
}

function exportData() {
  // Merge settings (localStorage) + data (in-memory from IndexedDB) into one export
  const merged = {};
  // Settings
  for (const key of SETTINGS_KEYS) {
    merged[key] = state[key];
  }
  // User data
  for (const key of USERDATA_KEYS) {
    merged[key] = state[key];
  }
  // Logs
  merged.log = state.log;
  // Caches
  merged.searchCache = state.searchCache;
  merged.foodIndex = state.foodIndex;
  merged.detailCache = state.detailCache;
  merged.barcodeCache = state.barcodeCache;

  const blob = new Blob([JSON.stringify(merged)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `calclone-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.goals && !parsed.log && !parsed.customFoods) {
        alert("Neplatný soubor. Data nebyla importována.");
        return;
      }
      if (!confirm("Importovat data? Stávající data budou přepsána."))
        return;

      // Settings
      state.goals = parsed.goals || state.goals;
      state.customMeasurementsEnabled =
        parsed.customMeasurementsEnabled !== undefined
          ? parsed.customMeasurementsEnabled
          : true;
      state.customMeasurements =
        parsed.customMeasurements && parsed.customMeasurements.length > 0
          ? parsed.customMeasurements
          : [...DEFAULT_MEASUREMENTS];
      state.customQuickGramsEnabled =
        parsed.customQuickGramsEnabled !== undefined
          ? parsed.customQuickGramsEnabled
          : true;
      state.quickGrams = parsed.quickGrams || [...DEFAULT_QUICK_GRAMS];
      state.rohlikSearchEnabled = parsed.rohlikSearchEnabled || false;
      state.cacheSizeLimitMB =
        parsed.cacheSizeLimitMB !== undefined
          ? parsed.cacheSizeLimitMB
          : 4;
      state.autoFavEnabled =
        parsed.autoFavEnabled !== undefined
          ? parsed.autoFavEnabled
          : true;
      state.mealCategoriesEnabled =
        parsed.mealCategoriesEnabled !== undefined
          ? parsed.mealCategoriesEnabled
          : false;
      state.mealCategories = parsed.mealCategories || [
        "Snídaně",
        "Oběd",
        "Večeře",
        "Svačina",
      ];
      state.mealCategoryTimes = parsed.mealCategoryTimes || {
        Snídaně: "06:00",
        Oběd: "11:00",
        Svačina: "14:00",
        Večeře: "17:00",
      };
      state.mealNotificationsEnabled =
        parsed.mealNotificationsEnabled !== undefined
          ? parsed.mealNotificationsEnabled
          : false;
      state.trendsEnabled =
        parsed.trendsEnabled !== undefined ? parsed.trendsEnabled : false;
      state.trendsPeriod = parsed.trendsPeriod || 7;
      state.copyDayEnabled =
        parsed.copyDayEnabled !== undefined
          ? parsed.copyDayEnabled
          : false;
      state.qrShareEnabled =
        parsed.qrShareEnabled !== undefined
          ? parsed.qrShareEnabled
          : false;
      state.theme = parsed.theme || state.theme;
      state.aiEnabled = parsed.aiEnabled || false;
      state.aiProvider = parsed.aiProvider || null;
      state.aiApiKey = parsed.aiApiKey || null;
      state.weightRecalcLastUsed = parsed.weightRecalcLastUsed || null;
      state.weightRecalcLastWeight = parsed.weightRecalcLastWeight || null;
      state.weightHistory = parsed.weightHistory || [];
      state.userProfile = parsed.userProfile || null;

      // Data (stored in IndexedDB)
      state.log = parsed.log || {};
      state.customFoods = parsed.customFoods || [];
      state.portionMemory = parsed.portionMemory || {};
      state.favorites = parsed.favorites || [];
      state.foodUsage = parsed.foodUsage || {};
      state.foodRelevance = parsed.foodRelevance || {};
      state.searchCache = parsed.searchCache || {};
      state.foodIndex = parsed.foodIndex || {};
      state.detailCache = parsed.detailCache || {};
      state.barcodeCache = parsed.barcodeCache || {};

      saveState();
      saveCache();
      loadSettingsUI();
      renderCategories();
      renderFoodList();
      renderToday();
      alert("Data úspěšně importována.");
    } catch (e) {
      alert("Chyba při čtení souboru. Zkontrolujte formát.");
    }
  };
  reader.readAsText(file);
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function logTargetKey() {
  return state.logTargetDate || todayKey();
}

function todayLog() {
  return state.log[todayKey()] || [];
}

function formatDateLabel(dateKey) {
  const parts = dateKey.split("-");
  const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  return d.toLocaleDateString("cs-CZ", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

function localFoods() {
  return [...LOCAL_FOODS, ...state.customFoods];
}


// ═══════════════════════════════════════════
// API CACHE HELPERS
// ═══════════════════════════════════════════
var CACHE_VERSION = 2;
var CACHE_TTL = 1 * 24 * 60 * 60 * 1000; // 1 day

function normalizeCacheKey(key) {
  return key
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function getCached(cache, key) {
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    delete cache[key];
    _cachedSizeBytes = null;
    return null;
  }
  // searchCache entries store refs → resolve from foodIndex
  if (entry.refs) return resolveSearchCache(entry);
  return entry.data;
}

function setCache(cache, key, data) {
  cache[key] = { data, ts: Date.now() };
  _cachedSizeBytes = null;
  saveCache();
}


function resolveSearchCache(entry) {
  if (!entry || !entry.refs) return entry ? entry.data || null : null;
  return entry.refs
    .map((ref) => state.foodIndex[ref])
    .filter(Boolean);
}

function getSortedMealCategories() {
  return [...state.mealCategories].sort((a, b) => {
    const ta = state.mealCategoryTimes[a] || "";
    const tb = state.mealCategoryTimes[b] || "";
    if (ta && tb) return ta.localeCompare(tb);
    if (ta && !tb) return -1;
    if (!ta && tb) return 1;
    return 0;
  });
}
