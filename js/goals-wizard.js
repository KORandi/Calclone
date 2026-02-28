// ═══════════════════════════════════════════
// GOAL CALCULATORS & WIZARD
// ═══════════════════════════════════════════
var MACRO_PRESETS = [
  { name: "Vyvážená strava", desc: "Univerzální rozložení pro udržení hmotnosti", protein: 0.25, carbs: 0.5, fat: 0.25 },
  { name: "Vysokobílkovinná", desc: "Pro budování svalů a regeneraci", protein: 0.35, carbs: 0.4, fat: 0.25 },
  { name: "Nízkosacharidová", desc: "Pro redukci váhy, omezené sacharidy", protein: 0.3, carbs: 0.25, fat: 0.45 },
  { name: "Keto", desc: "Velmi nízké sacharidy, vysoké tuky", protein: 0.25, carbs: 0.05, fat: 0.7 },
  { name: "Sportovní", desc: "Pro vytrvalostní a silový trénink", protein: 0.3, carbs: 0.5, fat: 0.2 },
];

function updateGoalsDisplay() {
  document.getElementById("goals-disp-kcal").textContent = state.goals.kcal;
  document.getElementById("goals-disp-protein").textContent = state.goals.protein;
  document.getElementById("goals-disp-carbs").textContent = state.goals.carbs;
  document.getElementById("goals-disp-fat").textContent = state.goals.fat;
}

// Wizard state
var wizState = { path: null, sex: "male", activity: null, goalAdj: null, presetIdx: null, helpPresetIdx: null };

function renderWizardPresets(listId, prefix) {
  const el = document.getElementById(listId);
  const allPresets = [...MACRO_PRESETS, { name: "Vlastní", desc: "Nastavte si vlastní poměr maker", protein: null, carbs: null, fat: null }];
  el.innerHTML = allPresets.map((p, i) =>
    `<div class="wizard-option" data-preset-idx="${i}">
      <div class="wizard-option-title">${p.name}</div>
      <div class="wizard-option-desc">${p.desc}${p.protein !== null ? ` — B ${Math.round(p.protein*100)}% · S ${Math.round(p.carbs*100)}% · T ${Math.round(p.fat*100)}%` : ''}</div>
    </div>`
  ).join("");
}

function getPresetRatios(idx, prefix) {
  if (idx < MACRO_PRESETS.length) {
    const p = MACRO_PRESETS[idx];
    return { protein: p.protein, carbs: p.carbs, fat: p.fat };
  }
  // Custom
  const pP = (parseFloat(document.getElementById(prefix + "-pct-protein").value) || 0) / 100;
  const pC = (parseFloat(document.getElementById(prefix + "-pct-carbs").value) || 0) / 100;
  const pF = (parseFloat(document.getElementById(prefix + "-pct-fat").value) || 0) / 100;
  return { protein: pP, carbs: pC, fat: pF };
}

function calcMacrosFromKcal(kcal, ratios) {
  return {
    protein: Math.round((kcal * ratios.protein) / 4),
    carbs: Math.round((kcal * ratios.carbs) / 4),
    fat: Math.round((kcal * ratios.fat) / 9),
  };
}

function updateKcalPreview() {
  if (wizState.presetIdx === null) return;
  const kcal = parseInt(document.getElementById("wizard-kcal-input").value) || 2000;
  const ratios = getPresetRatios(wizState.presetIdx, "wizard");
  const m = calcMacrosFromKcal(kcal, ratios);
  document.getElementById("wiz-prev-protein").textContent = m.protein;
  document.getElementById("wiz-prev-carbs").textContent = m.carbs;
  document.getElementById("wiz-prev-fat").textContent = m.fat;
}

function updateHelpPreview() {
  if (wizState.helpPresetIdx === null) return;
  const kcal = parseInt(document.getElementById("wizard-tdee-val").textContent) || 2000;
  const ratios = getPresetRatios(wizState.helpPresetIdx, "wizard-help");
  const m = calcMacrosFromKcal(kcal, ratios);
  document.getElementById("wiz-help-prev-protein").textContent = m.protein;
  document.getElementById("wiz-help-prev-carbs").textContent = m.carbs;
  document.getElementById("wiz-help-prev-fat").textContent = m.fat;
}

function updateLiveKcal() {
  const p = parseFloat(document.getElementById("wizard-macro-protein").value) || 0;
  const c = parseFloat(document.getElementById("wizard-macro-carbs").value) || 0;
  const f = parseFloat(document.getElementById("wizard-macro-fat").value) || 0;
  document.getElementById("wizard-live-kcal-val").textContent = Math.round(p * 4 + c * 4 + f * 9);
}

function validateCustomPct(prefix) {
  const pP = parseFloat(document.getElementById(prefix + "-pct-protein").value) || 0;
  const pC = parseFloat(document.getElementById(prefix + "-pct-carbs").value) || 0;
  const pF = parseFloat(document.getElementById(prefix + "-pct-fat").value) || 0;
  const sum = pP + pC + pF;
  const errEl = document.getElementById(prefix + "-pct-error");
  if (Math.abs(sum - 100) > 0.5) {
    errEl.textContent = `Součet: ${Math.round(sum)}% (musí být 100%)`;
    return false;
  }
  errEl.textContent = "";
  return true;
}

function calculateBMR() {
  const w = parseFloat(document.getElementById("wizard-weight").value) || 0;
  const h = parseFloat(document.getElementById("wizard-height").value) || 0;
  const a = parseFloat(document.getElementById("wizard-age").value) || 0;
  let bmr = 10 * w + 6.25 * h - 5 * a;
  bmr += wizState.sex === "male" ? 5 : -161;
  return Math.round(bmr);
}

function showWizardStep(stepId) {
  document.querySelectorAll("#goals-wizard-modal .wizard-step").forEach(s => s.classList.remove("active"));
  document.getElementById(stepId).classList.add("active");

  // Back button visibility
  const backBtn = document.getElementById("wizard-back-btn");
  backBtn.classList.toggle("visible", stepId !== "wizard-step-path");

  // Title
  const titles = {
    "wizard-step-path": "Nastavit cíle",
    "wizard-step-kcal": "Znám kalorie",
    "wizard-step-macros": "Znám makra",
    "wizard-step-body": "Základní údaje",
    "wizard-step-activity": "Úroveň aktivity",
    "wizard-step-goal": "Váš cíl",
    "wizard-step-helppreset": "Rozložení maker",
    "wizard-step-summary": "Shrnutí",
  };
  document.getElementById("wizard-title").textContent = titles[stepId] || "Nastavit cíle";

  // Progress dots for help-me path
  const helpSteps = ["wizard-step-body", "wizard-step-activity", "wizard-step-goal", "wizard-step-helppreset"];
  const progEl = document.getElementById("wizard-progress");
  if (helpSteps.includes(stepId)) {
    const currentIdx = helpSteps.indexOf(stepId);
    progEl.innerHTML = helpSteps.map((_, i) =>
      `<div class="wizard-dot ${i === currentIdx ? 'active' : i < currentIdx ? 'done' : ''}"></div>`
    ).join("");
  } else {
    progEl.innerHTML = "";
  }
}

function openGoalsWizard() {
  // Reset wizard state
  wizState.path = null;
  wizState.presetIdx = null;
  wizState.helpPresetIdx = null;
  wizState.activity = null;
  wizState.goalAdj = null;

  // Pre-fill with current goals
  document.getElementById("wizard-kcal-input").value = state.goals.kcal;
  document.getElementById("wizard-macro-protein").value = state.goals.protein;
  document.getElementById("wizard-macro-carbs").value = state.goals.carbs;
  document.getElementById("wizard-macro-fat").value = state.goals.fat;
  updateLiveKcal();

  // Pre-fill user profile data if previously saved
  if (state.userProfile) {
    wizState.sex = state.userProfile.sex || "male";
    document.querySelectorAll(".wizard-sex-btn").forEach(b => {
      b.classList.toggle("selected", b.dataset.sex === wizState.sex);
    });
    if (state.userProfile.age) document.getElementById("wizard-age").value = state.userProfile.age;
    if (state.userProfile.weight) document.getElementById("wizard-weight").value = state.userProfile.weight;
    if (state.userProfile.height) document.getElementById("wizard-height").value = state.userProfile.height;
  } else {
    wizState.sex = "male";
    document.querySelectorAll(".wizard-sex-btn").forEach(b => {
      b.classList.toggle("selected", b.dataset.sex === "male");
    });
    document.getElementById("wizard-age").value = "";
    document.getElementById("wizard-weight").value = "";
    document.getElementById("wizard-height").value = "";
  }

  // Reset selections
  document.querySelectorAll("#goals-wizard-modal .wizard-option.selected").forEach(el => el.classList.remove("selected"));

  // Render presets
  renderWizardPresets("wizard-preset-list", "wizard");
  renderWizardPresets("wizard-help-preset-list", "wizard-help");

  // Hide custom pct
  document.getElementById("wizard-custom-pct-wrap").style.display = "none";
  document.getElementById("wizard-help-custom-pct-wrap").style.display = "none";

  // Reset preview
  ["wiz-prev-protein","wiz-prev-carbs","wiz-prev-fat","wiz-help-prev-protein","wiz-help-prev-carbs","wiz-help-prev-fat"].forEach(id => {
    document.getElementById(id).textContent = "-";
  });

  // Disable next buttons
  document.getElementById("wizard-activity-next").disabled = true;
  document.getElementById("wizard-goal-next").disabled = true;
  document.getElementById("wizard-help-save").disabled = true;

  showWizardStep("wizard-step-path");
  document.getElementById("goals-wizard-modal").classList.add("active");
}

function closeGoalsWizard() {
  document.getElementById("goals-wizard-modal").classList.remove("active");
}

function saveWizardGoals(kcal, protein, carbs, fat) {
  state.goals.kcal = Math.round(kcal);
  state.goals.protein = Math.round(protein);
  state.goals.carbs = Math.round(carbs);
  state.goals.fat = Math.round(fat);
  saveState();
  updateGoalsDisplay();
  closeGoalsWizard();
  if (state.activePage === "page-today") renderToday();
}

function getWizardBackStep(currentStep) {
  const backMap = {
    "wizard-step-kcal": "wizard-step-path",
    "wizard-step-macros": "wizard-step-path",
    "wizard-step-body": "wizard-step-path",
    "wizard-step-activity": "wizard-step-body",
    "wizard-step-goal": "wizard-step-activity",
    "wizard-step-helppreset": "wizard-step-goal",
    "wizard-step-summary": "wizard-step-helppreset",
  };
  return backMap[currentStep] || "wizard-step-path";
}

function deleteCustomFood(idx) {
  const food = state.customFoods[idx];
  if (!food) return;
  if (!confirm(`Opravdu smazat "${food.name}"?`)) return;

  state.customFoods.splice(idx, 1);
  saveState();
  renderCategories();
  renderFoodList();
  renderCustomFoodsList();
}

function renderCustomFoodsList() {
  const el = document.getElementById("custom-foods-list");
  if (!state.customFoods || state.customFoods.length === 0) {
    el.innerHTML = "";
    return;
  }

  el.innerHTML = state.customFoods
    .map(
      (f, i) => `
    <div class="custom-food-item">
<div class="custom-food-item-info">
  <div class="custom-food-item-name">${escapeHtml(f.name)}</div>
  <div class="custom-food-item-detail">${f.recipe ? '<span class="cfw-recipe-badge">Recept</span>' : ''}${escapeHtml(f.cat)} · B: ${f.protein}g · S: ${f.carbs}g · T: ${f.fat}g</div>
</div>
<div class="custom-food-item-kcal">${Math.round(f.kcal)} kcal</div>
<div class="custom-food-item-actions">
  <button class="edit-btn" data-custom-idx="${i}">✎</button>
  <button class="delete-btn" data-custom-idx="${i}">&times;</button>
</div>
    </div>
  `,
    )
    .join("");
}

