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
 * Recalculate calories based on weight change using the same
 * Mifflin-St Jeor approach from the goals wizard.
 * If we don't have full body stats, use a proportional scaling approach.
 */
function recalculateFromWeight(previousWeight, currentWeight) {
  if (!previousWeight || !currentWeight || previousWeight <= 0 || currentWeight <= 0) {
    return null;
  }

  // Use proportional approach: scale current kcal by weight ratio
  // The BMR formula (Mifflin-St Jeor): BMR = 10*weight + 6.25*height - 5*age +/- offset
  // The weight component is linear, so a weight change proportionally affects BMR
  // We scale the current goals proportionally to the weight change
  var weightRatio = currentWeight / previousWeight;

  // Calculate new calorie target
  // We use a dampened ratio since not all of TDEE scales linearly with weight
  // ~60% of TDEE comes from BMR, and weight is only one factor in BMR
  // A simpler approach: adjust by the actual BMR weight component difference
  var bmrDelta = 10 * (currentWeight - previousWeight); // Mifflin-St Jeor weight coefficient is 10
  var currentKcal = state.goals.kcal;
  var newKcal = Math.round(currentKcal + bmrDelta);
  newKcal = Math.max(800, newKcal); // Safety floor

  // Keep the same macro ratios
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

  var newMacros = calcMacrosFromKcal(newKcal, ratios);

  return {
    kcal: newKcal,
    protein: newMacros.protein,
    carbs: newMacros.carbs,
    fat: newMacros.fat,
    previousWeight: previousWeight,
    currentWeight: currentWeight,
    weightDelta: +(currentWeight - previousWeight).toFixed(1),
    kcalDelta: newKcal - currentKcal,
  };
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

  // Fill preview values
  document.getElementById("recalc-weight-change").textContent =
    (result.weightDelta >= 0 ? "+" : "") + result.weightDelta + " kg";
  document.getElementById("recalc-weight-change").className =
    "recalc-delta " + (result.weightDelta >= 0 ? "gain" : "loss");

  // Current goals
  document.getElementById("recalc-old-kcal").textContent = state.goals.kcal;
  document.getElementById("recalc-old-protein").textContent =
    state.goals.protein;
  document.getElementById("recalc-old-carbs").textContent = state.goals.carbs;
  document.getElementById("recalc-old-fat").textContent = state.goals.fat;

  // New goals
  document.getElementById("recalc-new-kcal").textContent = result.kcal;
  document.getElementById("recalc-new-protein").textContent = result.protein;
  document.getElementById("recalc-new-carbs").textContent = result.carbs;
  document.getElementById("recalc-new-fat").textContent = result.fat;

  // Kcal delta
  var kcalDeltaEl = document.getElementById("recalc-kcal-delta");
  kcalDeltaEl.textContent =
    (result.kcalDelta >= 0 ? "+" : "") + result.kcalDelta + " kcal";
  kcalDeltaEl.className =
    "recalc-delta " + (result.kcalDelta >= 0 ? "gain" : "loss");
}

/**
 * Approve and apply the recalculated goals
 */
function approveWeightRecalc() {
  var modal = document.getElementById("weight-recalc-modal");
  var result = modal._pendingResult;
  if (!result) return;

  // Apply new goals
  state.goals.kcal = result.kcal;
  state.goals.protein = result.protein;
  state.goals.carbs = result.carbs;
  state.goals.fat = result.fat;

  // Record the recalculation
  state.weightRecalcLastUsed = new Date().toISOString();
  state.weightRecalcLastWeight = result.currentWeight;

  // Add to weight history
  if (!state.weightHistory) state.weightHistory = [];
  state.weightHistory.push({
    date: new Date().toISOString(),
    weight: result.currentWeight,
    previousWeight: result.previousWeight,
    kcal: result.kcal,
    protein: result.protein,
    carbs: result.carbs,
    fat: result.fat,
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
