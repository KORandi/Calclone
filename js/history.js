// ═══════════════════════════════════════════
// HISTORY PAGE
// ═══════════════════════════════════════════
function renderTrends() {
  const container = document.getElementById("trends-section");
  if (!state.trendsEnabled) {
    container.innerHTML = "";
    return;
  }

  const period = state.trendsPeriod || 7;
  const today = new Date();
  let daysWithData = 0;
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

  for (let i = 0; i < period; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const entries = state.log[key];
    if (entries && entries.length > 0) {
      daysWithData++;
      entries.forEach((e) => {
        totals.kcal += e.kcal;
        totals.protein += e.protein;
        totals.carbs += e.carbs;
        totals.fat += e.fat;
      });
    }
  }

  const avg =
    daysWithData > 0
      ? {
          kcal: Math.round(totals.kcal / daysWithData),
          protein: Math.round(totals.protein / daysWithData),
          carbs: Math.round(totals.carbs / daysWithData),
          fat: Math.round(totals.fat / daysWithData),
        }
      : { kcal: 0, protein: 0, carbs: 0, fat: 0 };

  container.innerHTML = `
    <div class="trends-period-pills">
      <button class="trends-period-pill ${period === 7 ? "active" : ""}" data-period="7">7 dní</button>
      <button class="trends-period-pill ${period === 30 ? "active" : ""}" data-period="30">30 dní</button>
    </div>
    ${
      daysWithData === 0
        ? '<div class="empty-state" style="padding: 20px 0"><p>Žádná data za posledních ' +
          period +
          " dní</p></div>"
        : `
    <div class="trends-card">
      <div class="trends-avg-kcal">
        <div class="val">${avg.kcal}</div>
        <div class="label">Ø kcal / den</div>
      </div>
      <div class="trends-days-info">${daysWithData} ${daysWithData === 1 ? "den" : daysWithData < 5 ? "dny" : "dní"} se záznamy z posledních ${period}</div>
      <div class="macro-bars">
        <div class="macro-bar-item">
          <div class="macro-bar-label">Bílkoviny</div>
          <div class="macro-bar-track"><div class="macro-bar-fill protein" style="width:${Math.min((avg.protein / state.goals.protein) * 100, 100)}%"></div></div>
          <div class="macro-bar-val">${avg.protein} / ${state.goals.protein}g</div>
        </div>
        <div class="macro-bar-item">
          <div class="macro-bar-label">Sacharidy</div>
          <div class="macro-bar-track"><div class="macro-bar-fill carbs" style="width:${Math.min((avg.carbs / state.goals.carbs) * 100, 100)}%"></div></div>
          <div class="macro-bar-val">${avg.carbs} / ${state.goals.carbs}g</div>
        </div>
        <div class="macro-bar-item">
          <div class="macro-bar-label">Tuky</div>
          <div class="macro-bar-track"><div class="macro-bar-fill fat" style="width:${Math.min((avg.fat / state.goals.fat) * 100, 100)}%"></div></div>
          <div class="macro-bar-val">${avg.fat} / ${state.goals.fat}g</div>
        </div>
      </div>
    </div>`
    }
  `;
}

function renderHistory() {
  renderTrends();
  const datePicker = document.getElementById("history-date-picker");
  if (datePicker && !datePicker.value) datePicker.value = todayKey();
  const el = document.getElementById("history-list");
  const days = Object.keys(state.log).sort().reverse();

  if (days.length === 0) {
    el.innerHTML =
      '<div class="empty-state"><div class="icon">📊</div><p>Zatím žádná historie.</p></div>';
    return;
  }

  el.innerHTML = days
    .map((day) => {
      const entries = state.log[day];
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

      const parts = day.split("-");
      const date = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      const label = date.toLocaleDateString("cs-CZ", {
        weekday: "short",
        day: "numeric",
        month: "long",
      });
      const isExpanded = state.expandedHistoryDay === day;

      return `
<div class="history-day">
  <div class="history-header" data-day="${day}">
    <div>
      <div class="history-date">${label} · ${entries.length} položek</div>
      <div class="history-summary-inline">
        <span class="history-kcal-inline">${totals.kcal} kcal</span>
        <span class="macro protein">B: <b>${totals.protein.toFixed(0)}g</b></span>
        <span class="macro carbs">S: <b>${totals.carbs.toFixed(0)}g</b></span>
        <span class="macro fat">T: <b>${totals.fat.toFixed(0)}g</b></span>
      </div>
    </div>
    <span class="history-chevron ${isExpanded ? "open" : ""}">&#9662;</span>
  </div>
  ${
    isExpanded
      ? `
    <div class="history-entries">
      ${entries
        .map(
          (e, i) => `
        <div class="log-entry">
          <div class="log-entry-info">
            <div class="log-entry-name">${escapeHtml(e.name)}</div>
            <div class="log-entry-detail">${e.grams}${e.liquid ? "ml" : "g"} · ${e.time}</div>
          </div>
          <div class="log-entry-kcal">${e.kcal} kcal</div>
          <div class="log-entry-actions">
            <button class="edit-btn" data-day="${day}" data-log-idx="${i}">✎</button>
            <button class="delete-btn" data-day="${day}" data-log-idx="${i}">&times;</button>
          </div>
        </div>
      `,
        )
        .join("")}
      <button class="btn-add-to-day" data-add-to-day="${day}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Přidat potravinu</button>
      ${state.copyDayEnabled && day !== todayKey() ? `<button class="btn-copy-day" data-copy-day="${day}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Kopírovat do dneška</button>` : ""}
    </div>
  `
      : ""
  }
</div>
    `;
    })
    .join("");
}

function copyDayToToday(dayKey) {
  const entries = state.log[dayKey];
  if (!entries || entries.length === 0) return;
  if (
    !confirm(
      `Kopírovat ${entries.length} ${entries.length === 1 ? "záznam" : entries.length < 5 ? "záznamy" : "záznamů"} do dnešního dne?`,
    )
  )
    return;
  const today = todayKey();
  if (!state.log[today]) state.log[today] = [];
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  entries.forEach((e) => {
    const copy = { ...e, time };
    state.log[today].push(copy);
  });
  saveState();
  renderHistory();
  showToast(`Zkopírováno ${entries.length} záznamů`);
}

