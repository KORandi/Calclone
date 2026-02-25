// ═══════════════════════════════════════════
// WEIGHT-BASED MACRO RECALCULATION
// ═══════════════════════════════════════════

var WEIGHT_RECALC_REQUIRED_DAYS = 14;

/**
 * Check if user has logged food consistently for 14 days in a row
 * (ending today or yesterday). "Consistently" means at least 1 food entry per day.
 * Returns { eligible: boolean, streak: number, missingDays: number }
 */
function checkFoodLoggingStreak() {
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var streak = 0;

  // Check backwards from yesterday (today might not be complete yet)
  for (var i = 1; i <= WEIGHT_RECALC_REQUIRED_DAYS; i++) {
    var d = new Date(today);
    d.setDate(d.getDate() - i);
    var key =
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0");
    var entries = state.log[key];
    if (entries && entries.length > 0) {
      streak++;
    } else {
      break;
    }
  }

  return {
    eligible: streak >= WEIGHT_RECALC_REQUIRED_DAYS,
    streak: streak,
    missingDays: Math.max(0, WEIGHT_RECALC_REQUIRED_DAYS - streak),
  };
}

/**
 * Check if weight recalculation button should be enabled.
 * It's enabled when:
 * 1. User has 14-day logging streak
 * 2. The feature hasn't been used since the last streak was achieved
 *    (i.e., weightRecalcLastUsed is null or older than 14 days)
 */
function isWeightRecalcAvailable() {
  var streakInfo = checkFoodLoggingStreak();
  if (!streakInfo.eligible) return false;

  // If never used, it's available
  if (!state.weightRecalcLastUsed) return true;

  // If used before, check that 14 new days of logging have passed since last use
  var lastUsedDate = new Date(state.weightRecalcLastUsed);
  lastUsedDate.setHours(0, 0, 0, 0);
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var daysSinceLastUse = Math.floor(
    (today - lastUsedDate) / (1000 * 60 * 60 * 24)
  );

  // Must have logged consistently for 14 days AFTER the last use
  if (daysSinceLastUse < WEIGHT_RECALC_REQUIRED_DAYS) return false;

  // Verify the streak covers days after last use
  return true;
}

/**
 * Sum calorie and macro intake from the 14-day logging streak.
 * Returns { days, totalKcal, avgKcal, avgProtein, avgCarbs, avgFat }
 */
function getStreakDailyIntake() {
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var totalKcal = 0;
  var totalProtein = 0;
  var totalCarbs = 0;
  var totalFat = 0;
  var days = 0;

  for (var i = 1; i <= WEIGHT_RECALC_REQUIRED_DAYS; i++) {
    var d = new Date(today);
    d.setDate(d.getDate() - i);
    var key =
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0");
    var entries = state.log[key];
    if (entries && entries.length > 0) {
      days++;
      for (var j = 0; j < entries.length; j++) {
        totalKcal += entries[j].kcal || 0;
        totalProtein += entries[j].protein || 0;
        totalCarbs += entries[j].carbs || 0;
        totalFat += entries[j].fat || 0;
      }
    }
  }

  return {
    days: days,
    totalKcal: totalKcal,
    avgKcal: days > 0 ? Math.round(totalKcal / days) : 0,
    avgProtein: days > 0 ? Math.round(totalProtein / days) : 0,
    avgCarbs: days > 0 ? Math.round(totalCarbs / days) : 0,
    avgFat: days > 0 ? Math.round(totalFat / days) : 0,
  };
}

/**
 * Recalculate calories using empirical TDEE from actual food log data.
 *
 * With 14 days of intake data + weight change we can derive actual TDEE:
 *   1 kg body mass ≈ 6000 kcal (mixed-composition weight change;
 *     accounts for ~75% fat + ~25% lean/water loss per CALERIE study data)
 *   daily_energy_balance = (weight_change_kg * 6000) / days
 *   empirical_TDEE = avg_daily_intake - daily_energy_balance
 *
 * The new calorie goal is set to the empirical TDEE (true maintenance).
 */
function recalculateFromWeight(previousWeight, currentWeight) {
  if (!previousWeight || !currentWeight || previousWeight <= 0 || currentWeight <= 0) {
    return null;
  }

  var intake = getStreakDailyIntake();
  if (intake.days < WEIGHT_RECALC_REQUIRED_DAYS) return null;

  var weightChange = currentWeight - previousWeight;
  var totalEnergyBalance = weightChange * 6000;
  var dailyEnergyBalance = totalEnergyBalance / intake.days;

  // empirical TDEE = avg intake - daily energy balance
  // Lost weight → balance negative → TDEE > intake (body burned more than eaten)
  // Gained weight → balance positive → TDEE < intake (body stored excess)
  var empiricalTDEE = Math.round(intake.avgKcal - dailyEnergyBalance);
  empiricalTDEE = Math.max(800, empiricalTDEE);

  // Macro ratios from current goals
  var totalMacroKcal =
    state.goals.protein * 4 + state.goals.carbs * 4 + state.goals.fat * 9;
  var ratios;
  if (totalMacroKcal > 0) {
    ratios = {
      protein: (state.goals.protein * 4) / totalMacroKcal,
      carbs: (state.goals.carbs * 4) / totalMacroKcal,
      fat: (state.goals.fat * 9) / totalMacroKcal,
    };
  } else {
    ratios = { protein: 0.25, carbs: 0.5, fat: 0.25 };
  }

  return {
    previousWeight: previousWeight,
    currentWeight: currentWeight,
    weightDelta: +(currentWeight - previousWeight).toFixed(1),
    avgDailyIntake: intake.avgKcal,
    empiricalTDEE: empiricalTDEE,
    dailyBalance: Math.round(dailyEnergyBalance),
    trackedDays: intake.days,
    ratios: ratios,
  };
}

/**
 * Compute kcal + macros for a given goal adjustment relative to TDEE
 */
function computeGoalFromAdj(tdee, adj, ratios) {
  var kcal = Math.max(800, tdee + adj);
  var macros = calcMacrosFromKcal(kcal, ratios);
  return { kcal: kcal, protein: macros.protein, carbs: macros.carbs, fat: macros.fat };
}

/**
 * Open the weight recalculation modal
 */
function openWeightRecalcModal() {
  var modal = document.getElementById("weight-recalc-modal");

  // Pre-fill previous weight if available
  var prevWeightInput = document.getElementById("recalc-prev-weight");
  var curWeightInput = document.getElementById("recalc-cur-weight");

  if (state.weightRecalcLastWeight) {
    prevWeightInput.value = state.weightRecalcLastWeight;
  } else {
    prevWeightInput.value = "";
  }
  curWeightInput.value = "";

  // Reset to input step
  document.getElementById("recalc-step-input").style.display = "block";
  document.getElementById("recalc-step-preview").style.display = "none";

  modal.classList.add("active");
}

function closeWeightRecalcModal() {
  document.getElementById("weight-recalc-modal").classList.remove("active");
}

/**
 * Calculate and show preview of new goals
 */
function previewWeightRecalc() {
  var prevWeight =
    parseFloat(document.getElementById("recalc-prev-weight").value) || 0;
  var curWeight =
    parseFloat(document.getElementById("recalc-cur-weight").value) || 0;

  if (prevWeight <= 0 || curWeight <= 0) {
    showToast("Zadejte obě hmotnosti");
    return;
  }

  if (prevWeight < 20 || prevWeight > 400 || curWeight < 20 || curWeight > 400) {
    showToast("Hmotnost musí být mezi 20 a 400 kg");
    return;
  }

  var result = recalculateFromWeight(prevWeight, curWeight);
  if (!result) {
    showToast("Chyba ve výpočtu");
    return;
  }

  // Store for approval
  document.getElementById("weight-recalc-modal")._pendingResult = result;

  // Show preview
  document.getElementById("recalc-step-input").style.display = "none";
  document.getElementById("recalc-step-preview").style.display = "block";

  // Fill empirical analysis
  document.getElementById("recalc-avg-intake").textContent =
    result.avgDailyIntake + " kcal";
  document.getElementById("recalc-tracked-days").textContent =
    result.trackedDays + " dní";

  document.getElementById("recalc-weight-change").textContent =
    (result.weightDelta >= 0 ? "+" : "") + result.weightDelta + " kg";
  document.getElementById("recalc-weight-change").className =
    "recalc-delta " + (result.weightDelta >= 0 ? "gain" : "loss");

  var balanceEl = document.getElementById("recalc-daily-balance");
  balanceEl.textContent =
    (result.dailyBalance >= 0 ? "+" : "") + result.dailyBalance + " kcal/den";
  balanceEl.className =
    "recalc-delta " + (result.dailyBalance >= 0 ? "gain" : "loss");

  document.getElementById("recalc-tdee").textContent =
    result.empiricalTDEE + " kcal";

  // Fill kcal values into the goal options
  var goalOptions = document.querySelectorAll(".recalc-goal-option");
  goalOptions.forEach(function (opt) {
    var adj = parseInt(opt.dataset.goal);
    var kcal = Math.max(800, result.empiricalTDEE + adj);
    opt.querySelector(".recalc-goal-kcal").textContent = kcal + " kcal";
  });

  // Default: select the maintenance option (data-goal="0")
  goalOptions.forEach(function (opt) { opt.classList.remove("selected"); });
  var defaultOpt = document.querySelector('.recalc-goal-option[data-goal="0"]');
  if (defaultOpt) defaultOpt.classList.add("selected");

  // Current goals
  document.getElementById("recalc-old-kcal").textContent = state.goals.kcal;
  document.getElementById("recalc-old-protein").textContent =
    state.goals.protein;
  document.getElementById("recalc-old-carbs").textContent = state.goals.carbs;
  document.getElementById("recalc-old-fat").textContent = state.goals.fat;

  // Fill new goals based on selected option
  updateRecalcPreviewGoals();
}

/**
 * Get the currently selected goal adjustment value
 */
function getSelectedRecalcAdj() {
  var sel = document.querySelector(".recalc-goal-option.selected");
  return sel ? parseInt(sel.dataset.goal) : 0;
}

/**
 * Update the "new goals" column based on which goal option is selected
 */
function updateRecalcPreviewGoals() {
  var result = document.getElementById("weight-recalc-modal")._pendingResult;
  if (!result) return;

  var adj = getSelectedRecalcAdj();
  var chosen = computeGoalFromAdj(result.empiricalTDEE, adj, result.ratios);

  document.getElementById("recalc-new-kcal").textContent = chosen.kcal;
  document.getElementById("recalc-new-protein").textContent = chosen.protein;
  document.getElementById("recalc-new-carbs").textContent = chosen.carbs;
  document.getElementById("recalc-new-fat").textContent = chosen.fat;

  var kcalDelta = chosen.kcal - state.goals.kcal;
  var kcalDeltaEl = document.getElementById("recalc-kcal-delta");
  kcalDeltaEl.textContent =
    (kcalDelta >= 0 ? "+" : "") + kcalDelta + " kcal";
  kcalDeltaEl.className =
    "recalc-delta " + (kcalDelta >= 0 ? "gain" : "loss");
}

/**
 * Approve and apply the recalculated goals
 */
function approveWeightRecalc() {
  var modal = document.getElementById("weight-recalc-modal");
  var result = modal._pendingResult;
  if (!result) return;

  // Apply new goals based on selected goal option
  var adj = getSelectedRecalcAdj();
  var chosen = computeGoalFromAdj(result.empiricalTDEE, adj, result.ratios);

  state.goals.kcal = chosen.kcal;
  state.goals.protein = chosen.protein;
  state.goals.carbs = chosen.carbs;
  state.goals.fat = chosen.fat;

  // Record the recalculation
  state.weightRecalcLastUsed = new Date().toISOString();
  state.weightRecalcLastWeight = result.currentWeight;

  // Add to weight history
  if (!state.weightHistory) state.weightHistory = [];
  state.weightHistory.push({
    date: new Date().toISOString(),
    weight: result.currentWeight,
    previousWeight: result.previousWeight,
    tdee: result.empiricalTDEE,
    kcal: chosen.kcal,
    protein: chosen.protein,
    carbs: chosen.carbs,
    fat: chosen.fat,
  });

  saveState();
  updateGoalsDisplay();
  closeWeightRecalcModal();
  updateWeightRecalcUI();

  if (state.activePage === "page-today") renderToday();

  showToast("Cíle aktualizovány na základě nové hmotnosti");
}

/**
 * Update the weight recalc button state in settings
 */
function updateWeightRecalcUI() {
  var btn = document.getElementById("btn-weight-recalc");
  var statusEl = document.getElementById("weight-recalc-status");
  if (!btn || !statusEl) return;

  var available = isWeightRecalcAvailable();
  var streakInfo = checkFoodLoggingStreak();

  btn.disabled = !available;

  if (available) {
    statusEl.textContent = "K dispozici — 14 dní konzistentního záznamu dosaženo";
    statusEl.className = "weight-recalc-status available";
  } else {
    if (streakInfo.streak >= WEIGHT_RECALC_REQUIRED_DAYS && state.weightRecalcLastUsed) {
      // Used recently, need to wait for next streak
      var lastUsedDate = new Date(state.weightRecalcLastUsed);
      var daysSinceUse = Math.floor(
        (new Date() - lastUsedDate) / (1000 * 60 * 60 * 24)
      );
      var daysRemaining = WEIGHT_RECALC_REQUIRED_DAYS - daysSinceUse;
      if (daysRemaining > 0) {
        statusEl.textContent =
          "Zapisujte stravu dalších " + daysRemaining + " dní pro opětovné odemknutí";
      } else {
        statusEl.textContent =
          "Zaznamenejte stravu konzistentně " +
          streakInfo.missingDays +
          " dalších dní";
      }
    } else {
      statusEl.textContent =
        "Zaznamenejte stravu konzistentně " +
        streakInfo.missingDays +
        " dalších dní (" +
        streakInfo.streak +
        "/" +
        WEIGHT_RECALC_REQUIRED_DAYS +
        ")";
    }
    statusEl.className = "weight-recalc-status locked";
  }
}
