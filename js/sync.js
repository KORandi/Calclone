// ═══════════════════════════════════════════
// SERVER SYNC (gymson2.0 /api/sync/nutrition)
// ═══════════════════════════════════════════
//
// Push/pull the nutrition dataset to a gymson2.0 server which acts as the
// source of truth. Single user, single server. All merges are last-write-wins
// by `updatedAt` (records) or Math.max (monotonic pref counters), mirroring the
// server's own merge semantics so a round-trip converges instead of ping-ponging.
//
// Field-name translation (Calclone local shape  ⇄  server wire shape):
//
//   LOG ENTRY (state.log[dateKey][])   FoodLogEntry
//     (dateKey)              → date
//     protein/carbs/fat/fiber→ proteinG/carbsG/fatG/fiberG
//     meal                  → mealCategory
//     guid                  → sourceGuid
//     liquid (bool)         → liquid (bool)
//     name/grams/kcal/time/source/uid/updatedAt/deletedAt  → same
//
//   CUSTOM FOOD (state.customFoods[])  CustomFood
//     cat                   → category
//     protein/carbs/fat/fiber→ proteinG/carbsG/fatG/fiberG
//     recipe.ingredients[].protein/carbs/fat → proteinG/carbsG/fatG
//     name/kcal/liquid/uid/updatedAt/deletedAt  → same
//
//   WEIGHT (state.weightHistory[])     WeightEntry
//     weight                → weightKg
//     previousWeight        → previousWeightKg
//     kcal/protein/carbs/fat→ kcalGoal/proteinGoal/carbsGoal/fatGoal
//     date/tdee/uid/updatedAt/deletedAt  → same
//
//   PREFS   favorites[] + foodUsage{} + foodRelevance{} + portionMemory{}
//           ⇄ one FoodPref[] keyed by foodName:
//     favorites.includes(name)          ⇄ favorite
//     foodUsage[name]                   ⇄ usageCount        (Math.max on merge)
//     foodRelevance[name].clickCount    ⇄ clickCount        (Math.max on merge)
//     foodRelevance[name].lastUsed (ms) ⇄ lastUsedMs        (Math.max on merge)
//     portionMemory[name]               ⇄ lastPortionGrams  (LWW)
//     (updatedAt derived from lastUsed ms, else now)
//
//   SETTINGS   state[key] + settingsUpdatedAt[key]  ⇄ { value, updatedAt }
//     Only the keys the server's NutritionSettings type knows about are synced
//     (see SYNCED_SETTINGS_KEYS). Deliberately EXCLUDED from SETTINGS_KEYS:
//       - aiEnabled / aiProvider / aiApiKey — client-only secrets, never leave
//         the device.
//       - weightHistory — already synced record-by-record via the weights table;
//         sending it as a settings blob too would double-write and fight LWW.

var KaltabSync = (() => {
  const CONFIG_KEY = "kaltab_sync";
  const ENDPOINT_PATH = "/api/sync/nutrition";
  const REQUEST_TIMEOUT_MS = 20000;
  const RETRY_ATTEMPTS = 2;
  const RETRY_DELAY_MS = 1000;
  const AUTOSYNC_DEBOUNCE_MS = 5000;

  // Settings keys understood by the server's NutritionSettings type. This is
  // the intersection of SETTINGS_KEYS with the server schema (secrets and the
  // separately-synced weightHistory are excluded — see header comment).
  const SYNCED_SETTINGS_KEYS = [
    "goals",
    "quickGrams",
    "customQuickGramsEnabled",
    "customMeasurements",
    "customMeasurementsEnabled",
    "mealCategories",
    "mealCategoryTimes",
    "mealCategoriesEnabled",
    "rohlikSearchEnabled",
    "autoFavEnabled",
    "trendsEnabled",
    "trendsPeriod",
    "copyDayEnabled",
    "qrShareEnabled",
    "theme",
    "userProfile",
    "weightRecalcLastUsed",
    "weightRecalcLastWeight",
  ];

  const nowIso = () => new Date().toISOString();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ─── Config storage ──────────────────────────────────────────────────────

  function getSyncConfig() {
    let cfg = {};
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) cfg = JSON.parse(raw) || {};
    } catch (e) {
      cfg = {};
    }
    const defaults = {
      serverUrl: "",
      token: "",
      autoSync: false,
      lastSyncAt: null,
      clientId: null,
    };
    const merged = Object.assign(defaults, cfg);
    // Generate a stable clientId once, on first use.
    if (!merged.clientId) {
      merged.clientId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "c-" + Date.now() + "-" + Math.random().toString(36).slice(2);
      try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(merged));
      } catch (e) {}
    }
    return merged;
  }

  function setSyncConfig(patch) {
    const current = getSyncConfig();
    const next = Object.assign(current, patch || {});
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    } catch (e) {}
    return next;
  }

  // ─── Translation: local → wire ───────────────────────────────────────────

  function entryToWire(e, dateKey) {
    const w = {
      uid: e.uid,
      date: dateKey,
      name: e.name,
      grams: e.grams,
      liquid: !!e.liquid,
      kcal: e.kcal || 0,
      proteinG: e.protein,
      carbsG: e.carbs,
      fatG: e.fat,
      fiberG: e.fiber,
      createdAt: e.createdAt || e.updatedAt,
      updatedAt: e.updatedAt,
    };
    if (e.time) w.time = e.time;
    if (e.meal) w.mealCategory = e.meal;
    if (e.source) w.source = e.source;
    if (e.guid) w.sourceGuid = e.guid;
    if (e.deletedAt) w.deletedAt = e.deletedAt;
    return w;
  }

  function recipeToWire(r) {
    if (!r) return undefined;
    return {
      totalWeight: r.totalWeight,
      ingredients: (r.ingredients || []).map((ing) => ({
        name: ing.name,
        grams: ing.grams,
        kcal: ing.kcal,
        proteinG: ing.protein,
        carbsG: ing.carbs,
        fatG: ing.fat,
      })),
    };
  }

  function customFoodToWire(f) {
    const w = {
      uid: f.uid,
      name: f.name,
      category: f.cat || "Vlastní",
      kcal: f.kcal || 0,
      proteinG: f.protein,
      carbsG: f.carbs,
      fatG: f.fat,
      fiberG: f.fiber,
      liquid: !!f.liquid,
      createdAt: f.createdAt || f.updatedAt,
      updatedAt: f.updatedAt,
    };
    if (f.recipe) w.recipe = recipeToWire(f.recipe);
    if (f.deletedAt) w.deletedAt = f.deletedAt;
    return w;
  }

  function weightToWire(w0) {
    const w = {
      uid: w0.uid,
      date: w0.date,
      weightKg: w0.weight,
      previousWeightKg: w0.previousWeight,
      tdee: w0.tdee,
      kcalGoal: w0.kcal,
      proteinGoal: w0.protein,
      carbsGoal: w0.carbs,
      fatGoal: w0.fat,
      createdAt: w0.createdAt || w0.updatedAt,
      updatedAt: w0.updatedAt,
    };
    if (w0.deletedAt) w.deletedAt = w0.deletedAt;
    return w;
  }

  function flattenEntries() {
    const out = [];
    const log = state.log || {};
    for (const dateKey of Object.keys(log)) {
      const arr = log[dateKey];
      if (!Array.isArray(arr)) continue;
      for (const e of arr) {
        if (!e || !e.uid) continue; // pre-identity records are skipped defensively
        out.push(entryToWire(e, dateKey));
      }
    }
    return out;
  }

  function prefsToWire() {
    const favorites = Array.isArray(state.favorites) ? state.favorites : [];
    const usage = state.foodUsage || {};
    const relevance = state.foodRelevance || {};
    const portion = state.portionMemory || {};

    const names = new Set();
    for (const n of favorites) names.add(n);
    for (const n of Object.keys(usage)) names.add(n);
    for (const n of Object.keys(relevance)) names.add(n);
    for (const n of Object.keys(portion)) names.add(n);

    const out = [];
    for (const name of names) {
      const rel = relevance[name] || {};
      const lastUsedMs = rel.lastUsed || 0;
      const pref = {
        foodName: name,
        favorite: favorites.includes(name),
        usageCount: usage[name] || 0,
        clickCount: rel.clickCount || 0,
        updatedAt: lastUsedMs ? new Date(lastUsedMs).toISOString() : nowIso(),
      };
      if (lastUsedMs) pref.lastUsedMs = lastUsedMs;
      if (portion[name] != null) pref.lastPortionGrams = portion[name];
      out.push(pref);
    }
    return out;
  }

  // Minimal soft-delete record synthesized from a tombstone. The real record is
  // already gone from local state (the UI removed it when the tombstone was
  // created); this just tells the server to mark its row deleted. Required
  // NOT-NULL columns are filled with harmless placeholders since the row won't
  // be displayed once `deletedAt` is set.
  function tombstoneToWire(t) {
    const dt = t.deletedAt || nowIso();
    const dateOnly = dt.slice(0, 10);
    if (t.type === "entry") {
      return {
        uid: t.uid,
        date: dateOnly,
        name: "",
        liquid: false,
        kcal: 0,
        createdAt: dt,
        updatedAt: dt,
        deletedAt: dt,
      };
    }
    if (t.type === "customFood") {
      return {
        uid: t.uid,
        name: "",
        category: "Vlastní",
        kcal: 0,
        liquid: false,
        createdAt: dt,
        updatedAt: dt,
        deletedAt: dt,
      };
    }
    // "weight"
    return {
      uid: t.uid,
      date: dateOnly,
      weightKg: 0,
      createdAt: dt,
      updatedAt: dt,
      deletedAt: dt,
    };
  }

  // Build the push payload. `since` null → full state (first sync); otherwise
  // only records whose updatedAt is strictly newer than the last sync cursor.
  function buildPush(since) {
    const isNew = (ts) => !since || (!!ts && ts > since);

    const entries = flattenEntries().filter((e) => isNew(e.updatedAt));
    const customFoods = (state.customFoods || [])
      .filter((f) => f && f.uid)
      .map(customFoodToWire)
      .filter((f) => isNew(f.updatedAt));
    const weights = (state.weightHistory || [])
      .filter((w) => w && w.uid)
      .map(weightToWire)
      .filter((w) => isNew(w.updatedAt));
    const prefs = prefsToWire().filter((p) => isNew(p.updatedAt));

    const settings = {};
    for (const key of SYNCED_SETTINGS_KEYS) {
      const u = settingsUpdatedAt[key];
      if (isNew(u)) {
        settings[key] = { value: state[key], updatedAt: u || nowIso() };
      }
    }

    // Append soft-delete records from tombstones.
    for (const t of state.syncTombstones || []) {
      if (!t || !t.uid) continue;
      const rec = tombstoneToWire(t);
      if (t.type === "entry") entries.push(rec);
      else if (t.type === "customFood") customFoods.push(rec);
      else if (t.type === "weight") weights.push(rec);
    }

    return { entries, customFoods, weights, prefs, settings };
  }

  // ─── Translation: wire → local ───────────────────────────────────────────

  function entryFromWire(w) {
    const e = {
      uid: w.uid,
      name: w.name,
      grams: w.grams != null ? w.grams : 0,
      liquid: !!w.liquid,
      kcal: w.kcal != null ? w.kcal : 0,
      protein: w.proteinG != null ? w.proteinG : 0,
      carbs: w.carbsG != null ? w.carbsG : 0,
      fat: w.fatG != null ? w.fatG : 0,
      fiber: w.fiberG != null ? w.fiberG : 0,
      time: w.time || "",
      meal: w.mealCategory || "",
      updatedAt: w.updatedAt,
    };
    if (w.source) e.source = w.source;
    if (w.sourceGuid) e.guid = w.sourceGuid;
    if (w.createdAt) e.createdAt = w.createdAt;
    return e;
  }

  function recipeFromWire(r) {
    if (!r) return undefined;
    return {
      totalWeight: r.totalWeight,
      ingredients: (r.ingredients || []).map((ing) => ({
        name: ing.name,
        grams: ing.grams,
        kcal: ing.kcal,
        protein: ing.proteinG,
        carbs: ing.carbsG,
        fat: ing.fatG,
      })),
    };
  }

  function customFoodFromWire(w) {
    const f = {
      uid: w.uid,
      name: w.name,
      cat: w.category || "Vlastní",
      kcal: w.kcal != null ? w.kcal : 0,
      protein: w.proteinG != null ? w.proteinG : 0,
      carbs: w.carbsG != null ? w.carbsG : 0,
      fat: w.fatG != null ? w.fatG : 0,
      updatedAt: w.updatedAt,
    };
    if (w.fiberG != null) f.fiber = w.fiberG;
    if (w.liquid) f.liquid = true;
    if (w.recipe) f.recipe = recipeFromWire(w.recipe);
    if (w.createdAt) f.createdAt = w.createdAt;
    return f;
  }

  function weightFromWire(w) {
    const rec = {
      uid: w.uid,
      date: w.date,
      weight: w.weightKg,
      previousWeight: w.previousWeightKg,
      tdee: w.tdee,
      kcal: w.kcalGoal,
      protein: w.proteinGoal,
      carbs: w.carbsGoal,
      fat: w.fatGoal,
      updatedAt: w.updatedAt,
    };
    if (w.createdAt) rec.createdAt = w.createdAt;
    return rec;
  }

  const newer = (a, b) => (a || "") > (b || "");

  function mergeEntries(incoming) {
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    // Flatten existing log into a uid-keyed map; keep any uid-less strays.
    const byUid = new Map();
    const strays = [];
    const log = state.log || {};
    for (const dateKey of Object.keys(log)) {
      const arr = log[dateKey];
      if (!Array.isArray(arr)) continue;
      for (const e of arr) {
        if (e && e.uid) byUid.set(e.uid, { dateKey, entry: e });
        else if (e) strays.push({ dateKey, entry: e });
      }
    }

    for (const w of incoming) {
      if (!w || !w.uid) continue;
      const cur = byUid.get(w.uid);
      if (w.deletedAt) {
        // Remove locally unless our copy is strictly newer than the deletion.
        if (cur && !newer(cur.entry.updatedAt, w.deletedAt)) byUid.delete(w.uid);
        continue;
      }
      if (!cur || newer(w.updatedAt, cur.entry.updatedAt)) {
        byUid.set(w.uid, { dateKey: w.date, entry: entryFromWire(w) });
      }
    }

    // Rebuild state.log grouped by date.
    const rebuilt = {};
    for (const { dateKey, entry } of byUid.values()) {
      (rebuilt[dateKey] = rebuilt[dateKey] || []).push(entry);
    }
    for (const { dateKey, entry } of strays) {
      (rebuilt[dateKey] = rebuilt[dateKey] || []).push(entry);
    }
    state.log = rebuilt;
  }

  function mergeCustomFoods(incoming) {
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    const byUid = new Map();
    const strays = [];
    for (const f of state.customFoods || []) {
      if (f && f.uid) byUid.set(f.uid, f);
      else if (f) strays.push(f);
    }
    for (const w of incoming) {
      if (!w || !w.uid) continue;
      const cur = byUid.get(w.uid);
      if (w.deletedAt) {
        if (cur && !newer(cur.updatedAt, w.deletedAt)) byUid.delete(w.uid);
        continue;
      }
      if (!cur || newer(w.updatedAt, cur.updatedAt)) {
        byUid.set(w.uid, customFoodFromWire(w));
      }
    }
    state.customFoods = [...byUid.values(), ...strays];
  }

  function mergeWeights(incoming) {
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    const byUid = new Map();
    const strays = [];
    for (const rec of state.weightHistory || []) {
      if (rec && rec.uid) byUid.set(rec.uid, rec);
      else if (rec) strays.push(rec);
    }
    for (const w of incoming) {
      if (!w || !w.uid) continue;
      const cur = byUid.get(w.uid);
      if (w.deletedAt) {
        if (cur && !newer(cur.updatedAt, w.deletedAt)) byUid.delete(w.uid);
        continue;
      }
      if (!cur || newer(w.updatedAt, cur.updatedAt)) {
        byUid.set(w.uid, weightFromWire(w));
      }
    }
    const merged = [...byUid.values(), ...strays];
    merged.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    state.weightHistory = merged;
  }

  // Split the server's merged FoodPref list back into the four local structures.
  // The pulled prefs are the authoritative post-merge truth (they already fold
  // in what we just pushed), so favorite/portion adopt the server value and the
  // monotonic counters take Math.max as a belt-and-suspenders guard.
  function mergePrefs(incoming) {
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    if (!Array.isArray(state.favorites)) state.favorites = [];
    if (!state.foodUsage) state.foodUsage = {};
    if (!state.foodRelevance) state.foodRelevance = {};
    if (!state.portionMemory) state.portionMemory = {};

    for (const p of incoming) {
      if (!p || !p.foodName) continue;
      const name = p.foodName;

      const isFav = state.favorites.includes(name);
      if (p.favorite && !isFav) state.favorites.push(name);
      else if (!p.favorite && isFav)
        state.favorites = state.favorites.filter((n) => n !== name);

      state.foodUsage[name] = Math.max(
        state.foodUsage[name] || 0,
        p.usageCount || 0,
      );

      const rel = state.foodRelevance[name] || { lastUsed: 0, clickCount: 0 };
      rel.lastUsed = Math.max(rel.lastUsed || 0, p.lastUsedMs || 0);
      rel.clickCount = Math.max(rel.clickCount || 0, p.clickCount || 0);
      state.foodRelevance[name] = rel;

      if (p.lastPortionGrams != null)
        state.portionMemory[name] = p.lastPortionGrams;
    }
  }

  function mergeSettings(incoming) {
    if (!incoming) return;
    for (const key of Object.keys(incoming)) {
      if (SYNCED_SETTINGS_KEYS.indexOf(key) === -1) continue; // ignore unknown/secret
      const val = incoming[key];
      if (!val || typeof val.updatedAt !== "string") continue;
      const localUpdated = settingsUpdatedAt[key];
      if (!localUpdated || val.updatedAt > localUpdated) {
        state[key] = val.value;
        settingsUpdatedAt[key] = val.updatedAt;
        // Keep saveState()'s change-detector baseline in step so it does NOT
        // re-stamp this key with "now" and cause a re-push loop.
        try {
          _lastSettingsSnapshot[key] = JSON.stringify(val.value);
        } catch (e) {}
      }
    }
  }

  function applyPull(pull) {
    if (!pull) return;
    mergeEntries(pull.entries);
    mergeCustomFoods(pull.customFoods);
    mergeWeights(pull.weights);
    mergePrefs(pull.prefs);
    mergeSettings(pull.settings);
  }

  // ─── Sync driver ─────────────────────────────────────────────────────────

  function makeSignal() {
    if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
      return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    }
    const ac = new AbortController();
    setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
    return ac.signal;
  }

  let _syncing = false;

  async function syncNow() {
    const config = getSyncConfig();
    if (!config.serverUrl || !config.token) {
      return { ok: false, reason: "not_configured" };
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { ok: false, reason: "offline" };
    }
    if (_syncing) {
      return { ok: false, reason: "busy" };
    }
    _syncing = true;

    try {
      const since = config.lastSyncAt || null;
      const push = buildPush(since);
      const pushedCounts = {
        entries: push.entries.length,
        customFoods: push.customFoods.length,
        weights: push.weights.length,
        prefs: push.prefs.length,
        settings: Object.keys(push.settings).length,
      };
      const tombstoneCount = (state.syncTombstones || []).length;

      const url = config.serverUrl.replace(/\/+$/, "") + ENDPOINT_PATH;
      const bodyStr = JSON.stringify({ since, push });

      // POST with a short retry/backoff on transient network failure.
      let resp = null;
      let lastErr = null;
      for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
        try {
          resp = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + config.token,
            },
            body: bodyStr,
            signal: makeSignal(),
          });
          break;
        } catch (e) {
          lastErr = e;
          if (attempt < RETRY_ATTEMPTS - 1) await sleep(RETRY_DELAY_MS);
        }
      }

      if (!resp) {
        return {
          ok: false,
          reason: "network_error",
          detail: lastErr ? String(lastErr.message || lastErr) : "no response",
        };
      }
      if (resp.status === 401 || resp.status === 403) {
        return { ok: false, reason: "auth_error", detail: "HTTP " + resp.status };
      }
      if (!resp.ok) {
        let detail = "HTTP " + resp.status;
        try {
          const errJson = await resp.json();
          if (errJson && errJson.error) detail = errJson.error;
        } catch (e) {}
        return { ok: false, reason: "server_error", detail };
      }

      let data;
      try {
        data = await resp.json();
      } catch (e) {
        return { ok: false, reason: "server_error", detail: "invalid JSON" };
      }
      if (!data || typeof data.serverTime !== "string") {
        return { ok: false, reason: "server_error", detail: "malformed response" };
      }

      const pull = data.pull || {};
      const pulledCounts = {
        entries: Array.isArray(pull.entries) ? pull.entries.length : 0,
        customFoods: Array.isArray(pull.customFoods) ? pull.customFoods.length : 0,
        weights: Array.isArray(pull.weights) ? pull.weights.length : 0,
        prefs: Array.isArray(pull.prefs) ? pull.prefs.length : 0,
        settings: pull.settings ? Object.keys(pull.settings).length : 0,
      };

      // Apply the merge. Only local state mutation happens here — any failure
      // above returned early without touching state.
      applyPull(pull);

      // The tombstones present at the start of this sync were included in the
      // push above and are now reflected server-side; drop them.
      if (Array.isArray(state.syncTombstones)) {
        state.syncTombstones = state.syncTombstones.slice(tombstoneCount);
      }

      // Advance the sync cursor.
      state.lastSyncAt = data.serverTime;
      setSyncConfig({ lastSyncAt: data.serverTime });

      // Persist the merged result (settings + IndexedDB data).
      try {
        saveState();
        await _saveToIndexedDB();
      } catch (e) {
        console.warn("[sync] persist after merge failed:", e);
      }

      // Refresh any visible views now that state changed.
      try {
        if (typeof renderCategories === "function") renderCategories();
        if (typeof renderFoodList === "function") renderFoodList();
        if (state.activePage === "page-today" && typeof renderToday === "function")
          renderToday();
        if (
          state.activePage === "page-history" &&
          typeof renderHistory === "function"
        )
          renderHistory();
      } catch (e) {}

      return { ok: true, pushed: pushedCounts, pulled: pulledCounts };
    } catch (e) {
      return {
        ok: false,
        reason: "server_error",
        detail: String((e && e.message) || e),
      };
    } finally {
      _syncing = false;
    }
  }

  // ─── Auto-sync ───────────────────────────────────────────────────────────

  let _autoSyncTimer = null;

  function scheduleAutoSync() {
    const config = getSyncConfig();
    if (!config.autoSync || !config.serverUrl || !config.token) return;
    if (_autoSyncTimer) clearTimeout(_autoSyncTimer);
    _autoSyncTimer = setTimeout(() => {
      _autoSyncTimer = null;
      syncNow().catch(() => {});
    }, AUTOSYNC_DEBOUNCE_MS);
  }

  // Called by events.js once initial IndexedDB load completes.
  function onAppReady() {
    const config = getSyncConfig();
    if (config.autoSync && config.serverUrl && config.token) {
      syncNow().catch(() => {});
    }
  }

  // Least-invasive mutation hook: wrap the single choke point (saveState) so
  // every data/settings mutation debounces an auto-sync. Suppressed while
  // syncNow() itself is persisting, to avoid a sync→save→sync loop.
  (function installSaveHook() {
    if (typeof saveState !== "function") return;
    const orig = saveState;
    // Reassign the global binding so all existing callers pick up the wrapper.
    // eslint-disable-next-line no-global-assign
    saveState = function () {
      const r = orig.apply(this, arguments);
      if (!_syncing) scheduleAutoSync();
      return r;
    };
    if (typeof window !== "undefined") window.saveState = saveState;
  })();

  return {
    getSyncConfig,
    setSyncConfig,
    syncNow,
    scheduleAutoSync,
    onAppReady,
    // Exposed for tests / T41 wiring.
    _buildPush: buildPush,
    _applyPull: applyPull,
  };
})();
