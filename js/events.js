// ═══════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  // Phase 1: Load settings from localStorage (synchronous, instant UI)
  loadState();
  applyTheme(state.theme);
  renderCategories();
  renderFoodList();

  // Phase 2: Load large data from IndexedDB (async, re-render when ready)
  loadFromIndexedDB()
    .then(() => {
      renderCategories();
      renderFoodList();
      if (state.activePage === "page-today") renderToday();
      if (state.activePage === "page-history") renderHistory();
      updateCacheUsageUI();
      if (typeof updateWeightRecalcUI === "function") updateWeightRecalcUI();
    })
    .catch((e) => {
      console.warn("IndexedDB init failed:", e);
    });

  // Tab bar
  document.querySelector(".tab-bar").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-page]");
    if (btn) navigate(btn.dataset.page);
  });

  // Category pills
  document.getElementById("cat-pills").addEventListener("click", (e) => {
    const pill = e.target.closest(".cat-pill");
    if (pill) {
      state.activeCategory = pill.dataset.cat;
      renderCategories();
      renderFoodList();
    }
  });

  // Search input
  const searchInput = document.getElementById("search-input");
  const searchClear = document.getElementById("search-clear");
  searchInput.addEventListener("input", (e) => {
    state.barcodeResults = [];
    handleSearch(e.target.value);
  });

  // Clear search
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    state.barcodeResults = [];
    state.rohlikResults = [];
    handleSearch("");
    searchInput.focus();
  });

  // Food card click
  document.getElementById("food-list").addEventListener("click", (e) => {
    const card = e.target.closest(".food-card");
    if (!card) return;

    const idx = parseInt(card.dataset.idx);
    const food = lastRenderedFoods[idx];
    if (!food) return;

    if (food.source === "api") {
      openFoodModal(food);
    } else {
      openFoodModal({ ...food, source: "local" });
    }
  });

  // Modal overlay close
  document.getElementById("food-modal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Quick grams
  document
    .getElementById("quick-grams")
    .addEventListener("click", (e) => {
      const btn = e.target.closest(".quick-gram");
      if (btn) {
        document.getElementById("modal-grams").value = btn.dataset.g;
        updateModalMacros();
      }
    });

  // Gram input change
  document
    .getElementById("modal-grams")
    .addEventListener("input", updateModalMacros);

  // Stepper buttons (+/- on both modals)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".stepper-btn");
    if (!btn) return;
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    const step = parseInt(btn.dataset.step);
    const val = Math.max(1, (parseFloat(input.value) || 0) + step);
    input.value = val;
    input.dispatchEvent(new Event("input"));
  });

  // Log food
  document
    .getElementById("btn-log-food")
    .addEventListener("click", logFood);

  // Toggle favorite
  document
    .getElementById("btn-toggle-fav")
    .addEventListener("click", () => {
      if (!state.selectedFood) return;
      toggleFavorite(state.selectedFood.name);
      const favBtn = document.getElementById("btn-toggle-fav");
      const fav = isFavorite(state.selectedFood.name);
      favBtn.textContent = fav ? "★" : "☆";
      favBtn.classList.toggle("active", fav);
      renderFoodList();
    });

  // Edit / Delete log entry
  document.getElementById("today-log").addEventListener("click", (e) => {
    const editBtn = e.target.closest(".edit-btn");
    if (editBtn) return openEditModal(parseInt(editBtn.dataset.logIdx));
    const delBtn = e.target.closest(".delete-btn");
    if (delBtn) deleteLogEntry(parseInt(delBtn.dataset.logIdx));
  });

  // Edit modal
  document.getElementById("edit-modal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeEditModal();
  });
  document
    .getElementById("edit-modal-grams")
    .addEventListener("input", updateEditModalMacros);
  document
    .getElementById("edit-quick-grams")
    .addEventListener("click", (e) => {
      const btn = e.target.closest(".quick-gram");
      if (btn) {
        document.getElementById("edit-modal-grams").value = btn.dataset.g;
        updateEditModalMacros();
      }
    });
  document
    .getElementById("btn-save-edit")
    .addEventListener("click", saveEditEntry);

  // Toggle favorite in edit modal
  document
    .getElementById("btn-edit-toggle-fav")
    .addEventListener("click", () => {
      const key = editingKey || todayKey();
      const entry = state.log[key]?.[editingIdx];
      if (!entry) return;
      toggleFavorite(entry.name);
      const editFavBtn = document.getElementById("btn-edit-toggle-fav");
      const fav = isFavorite(entry.name);
      editFavBtn.textContent = fav ? "★" : "☆";
      editFavBtn.classList.toggle("active", fav);
      renderFoodList();
    });

  // History: toggle day expand + edit/delete entries
  document
    .getElementById("history-list")
    .addEventListener("click", (e) => {
      // Edit button in history
      const editBtn = e.target.closest(".edit-btn[data-day]");
      if (editBtn) {
        e.stopPropagation();
        return openEditModal(
          parseInt(editBtn.dataset.logIdx),
          editBtn.dataset.day,
        );
      }
      // Delete button in history
      const delBtn = e.target.closest(".delete-btn[data-day]");
      if (delBtn) {
        e.stopPropagation();
        return deleteLogEntryByKey(
          delBtn.dataset.day,
          parseInt(delBtn.dataset.logIdx),
        );
      }
      // Add food to specific day button
      const addBtn = e.target.closest(".btn-add-to-day[data-add-to-day]");
      if (addBtn) {
        e.stopPropagation();
        state.logTargetDate = addBtn.dataset.addToDay;
        navigate("page-database");
        return;
      }
      // Copy day button
      const copyBtn = e.target.closest(".btn-copy-day[data-copy-day]");
      if (copyBtn) {
        e.stopPropagation();
        return copyDayToToday(copyBtn.dataset.copyDay);
      }
      // Toggle expand
      const header = e.target.closest(".history-header");
      if (header) {
        const day = header.dataset.day;
        state.expandedHistoryDay =
          state.expandedHistoryDay === day ? null : day;
        renderHistory();
      }
    });

  // History FAB → open date picker modal
  document.getElementById("history-fab").addEventListener("click", () => {
    const dateInput = document.getElementById("history-date-picker");
    dateInput.value = todayKey();
    document.getElementById("date-picker-modal").classList.add("active");
  });

  // Date picker modal overlay close
  document
    .getElementById("date-picker-modal")
    .addEventListener("click", (e) => {
      if (e.target === e.currentTarget)
        e.currentTarget.classList.remove("active");
    });

  // Add food to picked date from date picker modal
  document
    .getElementById("btn-add-to-picked-date")
    .addEventListener("click", () => {
      const dateInput = document.getElementById("history-date-picker");
      const val = dateInput.value;
      if (!val) {
        showToast("Vyberte datum");
        return;
      }
      document
        .getElementById("date-picker-modal")
        .classList.remove("active");
      state.logTargetDate = val;
      navigate("page-database");
    });

  // Trends period pill click
  document
    .getElementById("trends-section")
    .addEventListener("click", (e) => {
      const pill = e.target.closest(".trends-period-pill[data-period]");
      if (!pill) return;
      state.trendsPeriod = parseInt(pill.dataset.period);
      saveState();
      renderTrends();
    });

  // Theme picker
  document.getElementById("theme-grid").addEventListener("click", (e) => {
    const option = e.target.closest(".theme-option[data-theme-id]");
    if (!option) return;
    const themeId = option.dataset.themeId;
    state.theme = themeId;
    applyTheme(themeId);
    document.querySelectorAll(".theme-option").forEach((el) => {
      el.classList.toggle("active", el.dataset.themeId === themeId);
    });
    saveState();
  });

  // Weight recalculation
  document.getElementById("btn-weight-recalc").addEventListener("click", () => {
    if (!isWeightRecalcAvailable()) return;
    openWeightRecalcModal();
  });
  document.getElementById("weight-recalc-modal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeWeightRecalcModal();
  });
  document.getElementById("btn-recalc-preview").addEventListener("click", previewWeightRecalc);
  document.getElementById("btn-recalc-cancel").addEventListener("click", closeWeightRecalcModal);
  document.getElementById("btn-recalc-approve").addEventListener("click", approveWeightRecalc);
  document.getElementById("recalc-goal-list").addEventListener("click", (e) => {
    var opt = e.target.closest(".recalc-goal-option");
    if (!opt) return;
    document.querySelectorAll(".recalc-goal-option").forEach(el => el.classList.remove("selected"));
    opt.classList.add("selected");
    updateRecalcPreviewGoals();
  });
  document.getElementById("btn-recalc-back").addEventListener("click", () => {
    document.getElementById("recalc-step-input").style.display = "block";
    document.getElementById("recalc-step-preview").style.display = "none";
  });

  // Goals wizard - open
  document.getElementById("btn-set-goals").addEventListener("click", openGoalsWizard);

  // Goals wizard - close on overlay click
  document.getElementById("goals-wizard-modal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeGoalsWizard();
  });

  // Goals wizard - back button
  document.getElementById("wizard-back-btn").addEventListener("click", () => {
    const active = document.querySelector("#goals-wizard-modal .wizard-step.active");
    if (active) showWizardStep(getWizardBackStep(active.id));
  });

  // Goals wizard - path selection (step 1)
  document.getElementById("wizard-step-path").addEventListener("click", (e) => {
    const opt = e.target.closest(".wizard-option");
    if (!opt) return;
    const path = opt.dataset.path;
    wizState.path = path;
    if (path === "know-kcal") showWizardStep("wizard-step-kcal");
    else if (path === "know-macros") showWizardStep("wizard-step-macros");
    else if (path === "help-me") showWizardStep("wizard-step-body");
  });

  // Path 1: Know kcal - stepper buttons
  document.getElementById("wizard-kcal-minus").addEventListener("click", () => {
    const inp = document.getElementById("wizard-kcal-input");
    inp.value = Math.max(800, (parseInt(inp.value) || 2000) - 50);
    updateKcalPreview();
  });
  document.getElementById("wizard-kcal-plus").addEventListener("click", () => {
    const inp = document.getElementById("wizard-kcal-input");
    inp.value = Math.min(8000, (parseInt(inp.value) || 2000) + 50);
    updateKcalPreview();
  });
  document.getElementById("wizard-kcal-input").addEventListener("input", updateKcalPreview);

  // Path 1: Preset selection
  document.getElementById("wizard-preset-list").addEventListener("click", (e) => {
    const opt = e.target.closest(".wizard-option");
    if (!opt) return;
    const idx = parseInt(opt.dataset.presetIdx);
    wizState.presetIdx = idx;
    document.querySelectorAll("#wizard-preset-list .wizard-option").forEach((el, i) => {
      el.classList.toggle("selected", i === idx);
    });
    const isCustom = idx >= MACRO_PRESETS.length;
    document.getElementById("wizard-custom-pct-wrap").style.display = isCustom ? "block" : "none";
    updateKcalPreview();
  });

  // Path 1: Custom pct inputs
  ["wizard-pct-protein", "wizard-pct-carbs", "wizard-pct-fat"].forEach(id => {
    document.getElementById(id).addEventListener("input", () => {
      validateCustomPct("wizard");
      updateKcalPreview();
    });
  });

  // Path 1: Save
  document.getElementById("wizard-save-kcal").addEventListener("click", () => {
    if (wizState.presetIdx === null) return;
    if (wizState.presetIdx >= MACRO_PRESETS.length && !validateCustomPct("wizard")) return;
    const kcal = parseInt(document.getElementById("wizard-kcal-input").value) || 2000;
    const ratios = getPresetRatios(wizState.presetIdx, "wizard");
    const m = calcMacrosFromKcal(kcal, ratios);
    saveWizardGoals(kcal, m.protein, m.carbs, m.fat);
  });

  // Path 2: Know macros - live kcal
  ["wizard-macro-protein", "wizard-macro-carbs", "wizard-macro-fat"].forEach(id => {
    document.getElementById(id).addEventListener("input", updateLiveKcal);
  });

  // Path 2: Save
  document.getElementById("wizard-save-macros").addEventListener("click", () => {
    const p = parseFloat(document.getElementById("wizard-macro-protein").value) || 0;
    const c = parseFloat(document.getElementById("wizard-macro-carbs").value) || 0;
    const f = parseFloat(document.getElementById("wizard-macro-fat").value) || 0;
    const kcal = Math.round(p * 4 + c * 4 + f * 9);
    saveWizardGoals(kcal, p, c, f);
  });

  // Path 3: Sex toggle
  document.querySelectorAll(".wizard-sex-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      wizState.sex = btn.dataset.sex;
      document.querySelectorAll(".wizard-sex-btn").forEach(b => b.classList.toggle("selected", b === btn));
    });
  });

  // Path 3: Body next
  document.getElementById("wizard-body-next").addEventListener("click", () => {
    const age = document.getElementById("wizard-age").value;
    const weight = document.getElementById("wizard-weight").value;
    const height = document.getElementById("wizard-height").value;
    if (!age || !weight || !height) return;
    showWizardStep("wizard-step-activity");
  });

  // Path 3: Activity selection
  document.getElementById("wizard-step-activity").addEventListener("click", (e) => {
    const opt = e.target.closest(".wizard-option");
    if (!opt) return;
    wizState.activity = parseFloat(opt.dataset.activity);
    document.querySelectorAll("#wizard-step-activity .wizard-option").forEach(el => {
      el.classList.toggle("selected", el === opt);
    });
    document.getElementById("wizard-activity-next").disabled = false;
  });
  document.getElementById("wizard-activity-next").addEventListener("click", () => {
    if (wizState.activity === null) return;
    showWizardStep("wizard-step-goal");
  });

  // Path 3: Goal selection
  document.getElementById("wizard-step-goal").addEventListener("click", (e) => {
    const opt = e.target.closest(".wizard-option");
    if (!opt) return;
    wizState.goalAdj = parseInt(opt.dataset.goal);
    document.querySelectorAll("#wizard-step-goal .wizard-option").forEach(el => {
      el.classList.toggle("selected", el === opt);
    });
    document.getElementById("wizard-goal-next").disabled = false;
  });
  document.getElementById("wizard-goal-next").addEventListener("click", () => {
    if (wizState.goalAdj === null) return;
    // Calculate TDEE
    const bmr = calculateBMR();
    const tdee = Math.round(bmr * wizState.activity);
    const target = Math.max(800, tdee + wizState.goalAdj);
    document.getElementById("wizard-tdee-val").textContent = target;
    wizState.helpPresetIdx = null;
    document.querySelectorAll("#wizard-help-preset-list .wizard-option").forEach(el => el.classList.remove("selected"));
    document.getElementById("wizard-help-custom-pct-wrap").style.display = "none";
    ["wiz-help-prev-protein","wiz-help-prev-carbs","wiz-help-prev-fat"].forEach(id => {
      document.getElementById(id).textContent = "-";
    });
    document.getElementById("wizard-help-save").disabled = true;
    showWizardStep("wizard-step-helppreset");
  });

  // Path 3: Help preset selection
  document.getElementById("wizard-help-preset-list").addEventListener("click", (e) => {
    const opt = e.target.closest(".wizard-option");
    if (!opt) return;
    const idx = parseInt(opt.dataset.presetIdx);
    wizState.helpPresetIdx = idx;
    document.querySelectorAll("#wizard-help-preset-list .wizard-option").forEach((el, i) => {
      el.classList.toggle("selected", i === idx);
    });
    const isCustom = idx >= MACRO_PRESETS.length;
    document.getElementById("wizard-help-custom-pct-wrap").style.display = isCustom ? "block" : "none";
    document.getElementById("wizard-help-save").disabled = false;
    updateHelpPreview();
  });

  // Path 3: Help custom pct inputs
  ["wizard-help-pct-protein", "wizard-help-pct-carbs", "wizard-help-pct-fat"].forEach(id => {
    document.getElementById(id).addEventListener("input", () => {
      validateCustomPct("wizard-help");
      updateHelpPreview();
    });
  });

  // Path 3: Save from preset step (goes to summary)
  document.getElementById("wizard-help-save").addEventListener("click", () => {
    if (wizState.helpPresetIdx === null) return;
    if (wizState.helpPresetIdx >= MACRO_PRESETS.length && !validateCustomPct("wizard-help")) return;
    const bmr = calculateBMR();
    const tdee = Math.round(bmr * wizState.activity);
    const target = Math.max(800, tdee + wizState.goalAdj);
    const ratios = getPresetRatios(wizState.helpPresetIdx, "wizard-help");
    const m = calcMacrosFromKcal(target, ratios);

    // Fill summary
    document.getElementById("wiz-sum-bmr").textContent = bmr + " kcal";
    document.getElementById("wiz-sum-activity").textContent = "×" + wizState.activity;
    document.getElementById("wiz-sum-tdee").textContent = tdee + " kcal";
    const adj = wizState.goalAdj;
    document.getElementById("wiz-sum-adjust").textContent = (adj >= 0 ? "+" : "") + adj + " kcal";
    document.getElementById("wiz-sum-kcal").textContent = target + " kcal";
    document.getElementById("wiz-sum-protein").textContent = m.protein;
    document.getElementById("wiz-sum-carbs").textContent = m.carbs;
    document.getElementById("wiz-sum-fat").textContent = m.fat;

    showWizardStep("wizard-step-summary");
  });

  // Path 3: Final save from summary
  document.getElementById("wizard-summary-save").addEventListener("click", () => {
    const kcal = parseInt(document.getElementById("wiz-sum-kcal").textContent) || 2000;
    const p = parseInt(document.getElementById("wiz-sum-protein").textContent) || 0;
    const c = parseInt(document.getElementById("wiz-sum-carbs").textContent) || 0;
    const f = parseInt(document.getElementById("wiz-sum-fat").textContent) || 0;
    saveWizardGoals(kcal, p, c, f);
  });

  // Info icon tooltips
  document.addEventListener("click", (e) => {
    const icon = e.target.closest(".info-icon");
    // Close all open tooltips first
    document.querySelectorAll(".info-icon.show-tooltip").forEach((el) => {
      if (el !== icon) el.classList.remove("show-tooltip");
    });
    if (icon) {
      e.stopPropagation();
      icon.classList.toggle("show-tooltip");
    }
  });

  // Custom food wizard
  document.getElementById("btn-open-custom-food-wizard").addEventListener("click", () => openCustomFoodWizard());

  document.getElementById("custom-food-wizard-modal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeCfwWizard();
  });

  document.getElementById("cfw-back-btn").addEventListener("click", () => {
    const active = document.querySelector("#custom-food-wizard-modal .wizard-step.active");
    if (!active) return;
    if (cfwState.editIdx !== null) { closeCfwWizard(); return; }
    const backMap = { "cfw-step-macros": "cfw-step-path", "cfw-step-ingredients": "cfw-step-path" };
    if (backMap[active.id]) showCfwStep(backMap[active.id]);
    else closeCfwWizard();
  });

  document.getElementById("cfw-step-path").addEventListener("click", (e) => {
    const opt = e.target.closest(".wizard-option");
    if (!opt) return;
    cfwState.path = opt.dataset.cfwPath;
    if (cfwState.path === "know-macros") showCfwStep("cfw-step-macros");
    else if (cfwState.path === "know-ingredients") showCfwStep("cfw-step-ingredients");
  });

  document.getElementById("cfw-save-macros").addEventListener("click", saveCfwMacros);
  document.getElementById("cfw-save-recipe").addEventListener("click", saveCfwRecipe);

  document.getElementById("cfw-ingredient-search").addEventListener("input", (e) => {
    clearTimeout(cfwState.searchTimeout);
    const val = e.target.value.trim();
    document.getElementById("cfw-search-clear").classList.toggle("active", val.length > 0);
    cfwState.searchTimeout = setTimeout(() => cfwSearchIngredients(val), 150);
  });

  document.getElementById("cfw-search-clear").addEventListener("click", () => {
    document.getElementById("cfw-ingredient-search").value = "";
    document.getElementById("cfw-search-clear").classList.remove("active");
    document.getElementById("cfw-search-results").classList.remove("visible");
  });

  document.getElementById("cfw-barcode-btn").addEventListener("click", () => {
    cfwState.barcodeMode = true;
    openBarcodeScanner();
  });

  document.getElementById("cfw-search-results").addEventListener("click", (e) => {
    const item = e.target.closest(".cfw-search-result-item");
    if (!item || item.dataset.cfwRidx === undefined) return;
    const results = document.getElementById("cfw-search-results")._results;
    if (results && results[parseInt(item.dataset.cfwRidx)]) cfwAddIngredient(results[parseInt(item.dataset.cfwRidx)]);
  });

  document.getElementById("cfw-ingredients-list").addEventListener("input", (e) => {
    if (e.target.classList.contains("ing-grams")) {
      const idx = parseInt(e.target.dataset.ingIdx);
      cfwState.ingredients[idx].grams = parseFloat(e.target.value) || 0;
      const row = e.target.closest(".cfw-ingredient-item");
      const ing = cfwState.ingredients[idx];
      const g = ing.grams;
      row.querySelector(".ing-macros").textContent =
        `${Math.round(ing.kcalPer100 * g / 100)} kcal · B:${(ing.proteinPer100 * g / 100).toFixed(1)}g · S:${(ing.carbsPer100 * g / 100).toFixed(1)}g · T:${(ing.fatPer100 * g / 100).toFixed(1)}g`;
      // Update total weight display
      const sum = cfwState.ingredients.reduce((s, i) => s + (i.grams || 0), 0);
      document.getElementById("cfw-total-weight").textContent = sum + " g";
      updateCfwRecipePreview();
    }
  });

  document.getElementById("cfw-ingredients-list").addEventListener("click", (e) => {
    const btn = e.target.closest(".ing-remove");
    if (!btn) return;
    cfwState.ingredients.splice(parseInt(btn.dataset.ingIdx), 1);
    renderCfwIngredients();
    updateCfwRecipePreview();
  });

  document.getElementById("cfw-recipe-name").addEventListener("input", validateCfwRecipe);

  // Close search dropdown when clicking outside
  document.getElementById("custom-food-wizard-modal").addEventListener("click", (e) => {
    if (!e.target.closest(".cfw-ingredient-search-wrap")) {
      document.getElementById("cfw-search-results").classList.remove("visible");
    }
  });

  // Custom foods list: edit & delete
  document
    .getElementById("custom-foods-list")
    .addEventListener("click", (e) => {
      const editBtn = e.target.closest(".edit-btn[data-custom-idx]");
      if (editBtn)
        return openCustomFoodWizard(parseInt(editBtn.dataset.customIdx));
      const delBtn = e.target.closest(".delete-btn[data-custom-idx]");
      if (delBtn)
        return deleteCustomFood(parseInt(delBtn.dataset.customIdx));
    });

  // Export / Import
  document
    .getElementById("btn-export")
    .addEventListener("click", exportData);
  const importFile = document.getElementById("import-file");
  document
    .getElementById("btn-import")
    .addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = "";
  });

  // Clear today's log
  document
    .getElementById("btn-clear-log")
    .addEventListener("click", () => {
      if (confirm("Opravdu smazat dnešní záznamy?")) {
        delete state.log[todayKey()];
        saveState();
        renderToday();
      }
    });

  // Clear all data
  document
    .getElementById("btn-clear-all")
    .addEventListener("click", async () => {
      if (
        confirm("Opravdu smazat VŠECHNA data? Tato akce je nevratná.")
      ) {
        state.log = {};
        state.detailCache = {};
        state.searchCache = {};
        state.foodIndex = {};
        state.barcodeCache = {};
        _cachedSizeBytes = null;
        state.portionMemory = {};
        state.foodUsage = {};
        state.foodRelevance = {};
        state.favorites = [];
        state.customFoods = [];
        state.goals = { kcal: 2000, protein: 120, carbs: 250, fat: 65 };
        state.weightRecalcLastUsed = null;
        state.weightRecalcLastWeight = null;
        state.weightHistory = [];
        state.theme = "default";
        applyTheme("default");
        saveState();
        saveCache();
        // Clear all IndexedDB stores
        try {
          await KaltabDB.open();
          await KaltabDB.clear("logs");
          await KaltabDB.clear("cache");
          await KaltabDB.clear("userData");
        } catch (e) {}
        loadSettingsUI();
        renderCategories();
        renderFoodList();
        renderToday();
      }
    });

  // Quick grams toggle
  document
    .getElementById("toggle-quick-grams")
    .addEventListener("change", (e) => {
      state.customQuickGramsEnabled = e.target.checked;
      document.getElementById("quick-grams-section").style.display = e
        .target.checked
        ? "block"
        : "none";
      saveState();
    });

  // Custom measurements toggle
  document
    .getElementById("toggle-custom-measurements")
    .addEventListener("change", (e) => {
      state.customMeasurementsEnabled = e.target.checked;
      document.getElementById(
        "custom-measurements-section",
      ).style.display = e.target.checked ? "block" : "none";
      saveState();
    });

  // Rohlik search toggle
  document
    .getElementById("toggle-rohlik-search")
    .addEventListener("change", (e) => {
      state.rohlikSearchEnabled = e.target.checked;
      if (!e.target.checked) {
        state.rohlikResults = [];
        renderFoodList();
      }
      saveState();
    });

  // Auto-favorite toggle
  document
    .getElementById("toggle-auto-fav")
    .addEventListener("change", (e) => {
      state.autoFavEnabled = e.target.checked;
      saveState();
    });

  // Meal categories toggle
  document
    .getElementById("toggle-meal-categories")
    .addEventListener("change", (e) => {
      state.mealCategoriesEnabled = e.target.checked;
      document.getElementById("meal-categories-section").style.display = e
        .target.checked
        ? "block"
        : "none";
      saveState();
    });

  // Add meal category
  document
    .getElementById("btn-add-meal-category")
    .addEventListener("click", () => {
      const input = document.getElementById("new-meal-category");
      const val = input.value.trim();
      if (!val) return;
      if (state.mealCategories.includes(val)) {
        input.value = "";
        return;
      }
      state.mealCategories.push(val);
      saveState();
      input.value = "";
      renderMealCategoriesChips();
    });

  // Remove meal category (delegated)
  document
    .getElementById("meal-categories-chips")
    .addEventListener("click", (e) => {
      const btn = e.target.closest(".chip-remove[data-mc-idx]");
      if (!btn) return;
      const idx = parseInt(btn.dataset.mcIdx);
      const removed = state.mealCategories[idx];
      state.mealCategories.splice(idx, 1);
      delete state.mealCategoryTimes[removed];
      saveState();
      renderMealCategoriesChips();
    });

  // Change meal category time (delegated)
  document
    .getElementById("meal-categories-chips")
    .addEventListener("change", (e) => {
      const input = e.target.closest(".chip-time-input[data-mc-name]");
      if (!input) return;
      const name = input.dataset.mcName;
      const time = input.value;
      if (time) {
        state.mealCategoryTimes[name] = time;
      } else {
        delete state.mealCategoryTimes[name];
      }
      saveState();
      renderMealCategoriesChips();
    });

  // Reset meal categories to defaults
  document
    .getElementById("btn-reset-meal-categories")
    .addEventListener("click", () => {
      state.mealCategories = ["Snídaně", "Oběd", "Večeře", "Svačina"];
      state.mealCategoryTimes = {
        Snídaně: "06:00",
        Oběd: "11:00",
        Svačina: "14:00",
        Večeře: "17:00",
      };
      saveState();
      renderMealCategoriesChips();
    });

  // Trends toggle
  document
    .getElementById("toggle-trends")
    .addEventListener("change", (e) => {
      state.trendsEnabled = e.target.checked;
      saveState();
      if (state.activePage === "page-history") renderHistory();
    });

  // Copy day toggle
  document
    .getElementById("toggle-copy-day")
    .addEventListener("change", (e) => {
      state.copyDayEnabled = e.target.checked;
      saveState();
      if (state.activePage === "page-history") renderHistory();
    });

  // QR share toggle
  document
    .getElementById("toggle-qr-share")
    .addEventListener("change", (e) => {
      state.qrShareEnabled = e.target.checked;
      saveState();
      document.getElementById("share-fab").style.display =
        state.qrShareEnabled && state.activePage === "page-history"
          ? "flex"
          : "none";
    });

  // Cache limit input
  const cacheLimitInput = document.getElementById("cache-limit-input");
  cacheLimitInput.addEventListener("input", () => {
    const val = parseFloat(cacheLimitInput.value);
    const msgEl = document.getElementById("cache-validation-msg");
    if (isNaN(val) || val < 0.5 || val > 50) {
      cacheLimitInput.classList.add("invalid");
      if (isNaN(val) || val === "")
        msgEl.textContent = "Zadejte platnou hodnotu";
      else if (val < 0.5) msgEl.textContent = "Minimum je 0.5 MB";
      else msgEl.textContent = "Maximum je 50 MB";
      return;
    }
    cacheLimitInput.classList.remove("invalid");
    msgEl.textContent = "";
    state.cacheSizeLimitMB = val;
    saveState();
    updateCacheUsageUI();
    // If current cache exceeds the new limit, evict
    const currentSize = getCacheSizeBytes();
    if (currentSize > val * 1024 * 1024) {
      evictCacheEntries(val * 1024 * 1024);
      saveCache();
    }
  });

  // Clear cache button
  document
    .getElementById("btn-clear-cache")
    .addEventListener("click", async () => {
      if (!confirm("Vymazat mezipaměť vyhledávání?")) return;
      state.searchCache = {};
      state.foodIndex = {};
      state.detailCache = {};
      state.barcodeCache = {};
      _cachedSizeBytes = null;
      saveCache();
      showToast("Mezipaměť vymazána");
    });

  // Add measurement
  document
    .getElementById("btn-add-measurement")
    .addEventListener("click", () => {
      const nameEl = document.getElementById("meas-name");
      const gramsEl = document.getElementById("meas-grams");
      const name = nameEl.value.trim();
      const grams = parseFloat(gramsEl.value);
      if (!name || !grams || grams <= 0) return;
      state.customMeasurements.push({ name, grams });
      saveState();
      nameEl.value = "";
      gramsEl.value = "";
      renderMeasurementsList();
    });

  // Delete measurement (delegated)
  document
    .getElementById("measurements-list")
    .addEventListener("click", (e) => {
      const delBtn = e.target.closest(".delete-btn[data-meas-idx]");
      if (!delBtn) return;
      const idx = parseInt(delBtn.dataset.measIdx);
      state.customMeasurements.splice(idx, 1);
      saveState();
      renderMeasurementsList();
    });

  // Add quick gram
  document
    .getElementById("btn-add-quick-gram")
    .addEventListener("click", () => {
      const input = document.getElementById("new-quick-gram");
      const val = parseInt(input.value);
      if (!val || val <= 0) return;
      if (state.quickGrams.includes(val)) {
        input.value = "";
        return;
      }
      state.quickGrams.push(val);
      state.quickGrams.sort((a, b) => a - b);
      saveState();
      input.value = "";
      renderQuickGramsChips();
    });

  // Remove quick gram (delegated)
  document
    .getElementById("quick-grams-chips")
    .addEventListener("click", (e) => {
      const btn = e.target.closest(".chip-remove[data-qg-idx]");
      if (!btn) return;
      const idx = parseInt(btn.dataset.qgIdx);
      state.quickGrams.splice(idx, 1);
      saveState();
      renderQuickGramsChips();
    });

  // Reset quick grams to defaults
  document
    .getElementById("btn-reset-quick-grams")
    .addEventListener("click", () => {
      state.quickGrams = [...DEFAULT_QUICK_GRAMS];
      saveState();
      renderQuickGramsChips();
    });
});

// Refresh today page when app becomes visible (handles overnight date change)
var lastVisibleDate = new Date().toDateString();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    const now = new Date().toDateString();
    if (now !== lastVisibleDate) {
      lastVisibleDate = now;
      if (state.activePage === "page-today") renderToday();
    }
  }
});


// ═══════════════════════════════════════════
// BARCODE EVENT LISTENERS
// ═══════════════════════════════════════════
document
  .getElementById("barcode-btn")
  .addEventListener("click", openBarcodeScanner);
document
  .getElementById("barcode-cancel")
  .addEventListener("click", closeBarcodeScanner);
document
  .getElementById("barcode-modal")
  .addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeBarcodeScanner();
  });

// ═══════════════════════════════════════════
// LOCK BODY SCROLL WHEN MODAL IS OPEN
// ═══════════════════════════════════════════
(function () {
  var scrollY = 0;
  function lockBody() {
    scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = "-" + scrollY + "px";
    document.body.style.left = "0";
    document.body.style.right = "0";
  }
  function unlockBody() {
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    window.scrollTo(0, scrollY);
  }
  function updateBodyLock() {
    var anyOpen = !!document.querySelector(".modal-overlay.active");
    if (anyOpen) lockBody();
    else unlockBody();
  }
  var observer = new MutationObserver(updateBodyLock);
  document.querySelectorAll(".modal-overlay").forEach(function (el) {
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
  });
})();

// ═══════════════════════════════════════════
// MODAL SWIPE-TO-DISMISS
// ═══════════════════════════════════════════
(function () {
  var modalClosers = {
    "food-modal": closeModal,
    "edit-modal": closeEditModal,
    "goals-wizard-modal": closeGoalsWizard,
    "weight-recalc-modal": closeWeightRecalcModal,
    "custom-food-wizard-modal": closeCfwWizard,
    "qr-share-modal": closeQrShareModal,
    "qr-select-modal": closeQrSelectModal,
    "qr-preview-modal": closeQrPreviewModal,
    "barcode-modal": closeBarcodeScanner,
  };
  var dragState = null;

  document.addEventListener("touchstart", function (e) {
    var modal = e.target.closest(".modal");
    if (!modal) return;
    // Only start drag if modal is scrolled to top
    if (modal.scrollTop > 0) return;
    var overlay = modal.closest(".modal-overlay");
    if (!overlay || !modalClosers[overlay.id]) return;
    dragState = {
      modal: modal,
      overlayId: overlay.id,
      startY: e.touches[0].clientY,
      startTime: Date.now(),
      currentY: 0,
      dragging: false,
    };
  }, { passive: true });

  document.addEventListener("touchmove", function (e) {
    if (!dragState) return;
    var delta = e.touches[0].clientY - dragState.startY;
    // Only track downward movement
    if (delta < 0) {
      if (dragState.dragging) {
        dragState.modal.style.transform = "";
        dragState.modal.classList.remove("dragging");
        dragState.dragging = false;
      }
      return;
    }
    // Start dragging after 10px threshold
    if (!dragState.dragging && delta > 10) {
      dragState.dragging = true;
      dragState.modal.classList.add("dragging");
    }
    if (dragState.dragging) {
      dragState.currentY = delta;
      dragState.modal.style.transform = "translateY(" + delta + "px)";
      // Prevent scroll while dragging
      if (dragState.modal.scrollTop <= 0) e.preventDefault();
    }
  }, { passive: false });

  document.addEventListener("touchend", function () {
    if (!dragState) return;
    var s = dragState;
    dragState = null;
    if (!s.dragging) return;
    s.modal.classList.remove("dragging");
    var velocity = s.currentY / (Date.now() - s.startTime);
    // Dismiss if dragged far enough or fast enough
    if (s.currentY > 100 || velocity > 0.5) {
      s.modal.classList.add("dismissing");
      s.modal.style.transform = "";
      setTimeout(function () {
        s.modal.classList.remove("dismissing");
        var closer = modalClosers[s.overlayId];
        if (closer) closer();
      }, 200);
    } else {
      // Snap back
      s.modal.style.transition = "transform 0.2s ease-out";
      s.modal.style.transform = "";
      setTimeout(function () {
        s.modal.style.transition = "";
      }, 200);
    }
  });
})();

// ═══════════════════════════════════════════
// PULL-TO-REFRESH (circle progress + resistance)
// ═══════════════════════════════════════════
(function () {
  var THRESHOLD = 110;       // px of damped distance to trigger refresh
  var MAX_PULL = 140;        // max damped distance (visual cap)
  var RESISTANCE = 0.4;      // exponential damping coefficient
  var CIRCUMFERENCE = 106.81; // 2 * PI * 17 (SVG circle r=17)

  var container = document.getElementById("ptr-container");
  var progressCircle = container ? container.querySelector(".ptr-progress") : null;

  var startY = 0;
  var pulling = false;
  var armed = false;

  // Exponential resistance: caps at MAX_PULL no matter how far you pull
  function dampen(rawDelta) {
    return MAX_PULL * (1 - Math.exp(-RESISTANCE * rawDelta / MAX_PULL));
  }

  function setProgress(dampedY) {
    if (!container || !progressCircle) return;
    // Move container into view (from -60px start)
    container.style.transform = "translateY(" + (dampedY - 20) + "px)";
    // Fill circle proportionally (0 at 0, full at THRESHOLD)
    var ratio = Math.min(dampedY / THRESHOLD, 1);
    var offset = CIRCUMFERENCE * (1 - ratio);
    progressCircle.style.strokeDashoffset = offset;
  }

  function resetIndicator(animate) {
    if (!container) return;
    if (animate) {
      container.classList.add("snapping");
    }
    container.style.transform = "translateY(-60px)";
    if (progressCircle) progressCircle.style.strokeDashoffset = CIRCUMFERENCE;
    container.classList.remove("spinning");
    if (animate) {
      var onEnd = function () {
        container.removeEventListener("transitionend", onEnd);
        container.classList.remove("snapping");
      };
      container.addEventListener("transitionend", onEnd);
    }
  }

  document.addEventListener("touchstart", function (e) {
    if (document.querySelector(".modal-overlay.active")) return;
    if (document.scrollingElement.scrollTop > 0) return;
    startY = e.touches[0].clientY;
    pulling = true;
    armed = false;
    // Remove any lingering transition so drag is instant
    if (container) {
      container.classList.remove("snapping");
      container.classList.remove("refreshing");
      container.classList.remove("spinning");
    }
  }, { passive: true });

  document.addEventListener("touchmove", function (e) {
    if (!pulling) return;
    if (document.scrollingElement.scrollTop > 0) {
      pulling = false;
      resetIndicator(false);
      return;
    }
    var rawDelta = e.touches[0].clientY - startY;
    if (rawDelta <= 0) {
      resetIndicator(false);
      return;
    }
    var dampedY = dampen(rawDelta);
    setProgress(dampedY);
    armed = dampedY >= THRESHOLD;
  }, { passive: true });

  document.addEventListener("touchend", function (e) {
    if (!pulling) return;
    pulling = false;

    if (armed && container) {
      // Show spinning state, hold position, then reload
      container.classList.add("spinning");
      container.classList.add("refreshing");
      container.style.transform = "translateY(" + (THRESHOLD * 0.45) + "px)";
      setTimeout(function () {
        location.reload();
      }, 400);
    } else {
      // Snap back
      resetIndicator(true);
    }
  });
})();
