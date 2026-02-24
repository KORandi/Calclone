// ═══════════════════════════════════════════
// TODAY PAGE
// ═══════════════════════════════════════════
function renderToday() {
  const entries = todayLog();
  const totals = entries.reduce(
    (acc, e) => {
      acc.kcal += e.kcal;
      acc.protein += e.protein;
      acc.carbs += e.carbs;
      acc.fat += e.fat;
      return acc;
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const now = new Date();
  document.getElementById("today-date").textContent =
    now.toLocaleDateString("cs-CZ", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  const kcalRatio = totals.kcal / state.goals.kcal;
  const pct = Math.min(kcalRatio, 1);
  const remaining = Math.max(state.goals.kcal - totals.kcal, 0);
  const circumference = 2 * Math.PI * 65;
  const offset = circumference * (1 - pct);
  const ringColor =
    kcalRatio > 1.1
      ? "#ef4444"
      : kcalRatio > 1.05
        ? "#f59e0b"
        : "#22c55e";

  document.getElementById("daily-ring").innerHTML = `
    <svg viewBox="0 0 160 160">
<circle cx="80" cy="80" r="65" fill="none" stroke="var(--border)" stroke-width="10"/>
<circle cx="80" cy="80" r="65" fill="none" stroke="${ringColor}" stroke-width="10"
  stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
  transform="rotate(-90 80 80)" style="transition: stroke-dashoffset .5s"/>
<text x="80" y="72" text-anchor="middle" fill="var(--text)" font-size="28" font-weight="700">${totals.kcal}</text>
<text x="80" y="92" text-anchor="middle" fill="var(--text-secondary)" font-size="12">z ${state.goals.kcal} kcal</text>
<text x="80" y="110" text-anchor="middle" fill="var(--text-secondary)" font-size="11">zbývá ${remaining} kcal</text>
    </svg>
  `;

  const macroBarData = [
    { label: "Bílkoviny", key: "protein", cls: "protein", unit: "g" },
    { label: "Sacharidy", key: "carbs", cls: "carbs", unit: "g" },
    { label: "Tuky", key: "fat", cls: "fat", unit: "g" },
  ];
  document.getElementById("macro-bars").innerHTML = macroBarData
    .map((m) => {
      const pct = Math.min(
        (totals[m.key] / state.goals[m.key]) * 100,
        100,
      );
      return `
<div class="macro-bar-item">
  <div class="macro-bar-label">${m.label}</div>
  <div class="macro-bar-track"><div class="macro-bar-fill ${m.cls}" style="width:${pct}%"></div></div>
  <div class="macro-bar-val">${totals[m.key].toFixed(0)} / ${state.goals[m.key]}${m.unit}</div>
</div>
    `;
    })
    .join("");

  const logEl = document.getElementById("today-log");
  if (entries.length === 0) {
    logEl.innerHTML =
      '<div class="empty-state"><div class="icon">📋</div><p>Zatím žádné záznamy.<br>Přidejte potraviny z tabulek.</p></div>';
    return;
  }

  function renderLogEntry(e, i) {
    return `<div class="log-entry">
      <div class="log-entry-info">
        <div class="log-entry-name">${escapeHtml(e.name)}</div>
        <div class="log-entry-detail">${e.grams}${e.liquid ? "ml" : "g"} · ${e.time}</div>
      </div>
      <div class="log-entry-kcal">${e.kcal} kcal</div>
      <div class="log-entry-actions">
        <button class="edit-btn" data-log-idx="${i}">✎</button>
        <button class="delete-btn" data-log-idx="${i}">&times;</button>
      </div>
    </div>`;
  }

  if (state.mealCategoriesEnabled) {
    const groups = {};
    entries.forEach((e, i) => {
      const key = e.meal || "";
      if (!groups[key]) groups[key] = [];
      groups[key].push({ entry: e, idx: i });
    });
    const order = [...getSortedMealCategories(), ""];
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    logEl.innerHTML = sortedKeys
      .map((key) => {
        const label = key || "Ostatní";
        const groupEntries = groups[key];
        const items = groupEntries
          .map(({ entry: e, idx: i }) => renderLogEntry(e, i))
          .join("");
        const gt = groupEntries.reduce(
          (acc, { entry: e }) => {
            acc.kcal += e.kcal;
            acc.protein += e.protein;
            acc.carbs += e.carbs;
            acc.fat += e.fat;
            return acc;
          },
          { kcal: 0, protein: 0, carbs: 0, fat: 0 },
        );
        const summary = `<div class="meal-group-summary">
          <span>${Math.round(gt.kcal)} kcal</span>
          <span>B: ${Math.round(gt.protein)}g</span>
          <span>S: ${Math.round(gt.carbs)}g</span>
          <span>T: ${Math.round(gt.fat)}g</span>
        </div>`;
        return `<div class="meal-group-header">${escapeHtml(label)}</div>${summary}${items}`;
      })
      .join("");
  } else {
    logEl.innerHTML = entries
      .map((e, i) => renderLogEntry(e, i))
      .join("");
  }
}

