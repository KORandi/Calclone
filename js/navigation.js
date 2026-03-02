// ═══════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════
function updateTargetDateUI() {
  const banner = document.getElementById("target-date-banner");
  const target = state.logTargetDate;
  if (target && target !== todayKey()) {
    banner.innerHTML = `<div class="modal-target-date">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      Přidáváte pro: ${formatDateLabel(target)}
      <button onclick="state.logTargetDate=null;updateTargetDateUI();" style="border:none;background:none;color:var(--blue);cursor:pointer;font-weight:700;font-size:14px;padding:0 4px;" title="Zrušit">&times;</button>
    </div>`;
    banner.style.display = "block";
  } else {
    banner.style.display = "none";
    banner.innerHTML = "";
  }
}

function updateModalTargetDate() {
  const btn = document.getElementById("btn-log-food");
  const target = state.logTargetDate;
  if (target && target !== todayKey()) {
    btn.textContent = `Přidat do ${formatDateLabel(target)}`;
  } else {
    btn.textContent = "Přidat do denního záznamu";
  }
}

function navigate(pageId) {
  state.activePage = pageId;
  // Clear target date when navigating away from database (unless going to food modal)
  if (pageId !== "page-database") {
    state.logTargetDate = null;
  }
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document.getElementById(pageId).classList.add("active");
  document
    .querySelectorAll(".tab-bar button")
    .forEach((b) =>
      b.classList.toggle("active", b.dataset.page === pageId),
    );

  if (pageId === "page-database") updateTargetDateUI();
  if (pageId === "page-today") renderToday();
  if (pageId === "page-history") renderHistory();
  if (pageId === "page-settings") loadSettingsUI();
  document.getElementById("history-fab").style.display =
    pageId === "page-history" ? "flex" : "none";
  document.getElementById("share-fab").style.display =
    pageId === "page-history" && state.qrShareEnabled ? "flex" : "none";
}

// ═══════════════════════════════════════════
// SEARCH SPINNER / CLEAR BUTTON TOGGLE
// ═══════════════════════════════════════════
function setSearchLoading(loading) {
  const spinner = document.getElementById("search-spinner");
  const clear = document.getElementById("search-clear");
  const barcodeBtn = document.getElementById("barcode-btn");
  const aiScanBtn = document.getElementById("ai-scan-btn");
  const searchWrap = document.querySelector(".search-wrap");
  const hasText =
    document.getElementById("search-input").value.length > 0;
  const aiActive = state.aiEnabled && state.aiProvider && state.aiApiKey;
  if (loading) {
    spinner.classList.add("active");
    clear.classList.remove("active");
    barcodeBtn.style.display = "none";
    if (aiScanBtn) aiScanBtn.style.display = "none";
    searchWrap.classList.remove("has-ai-btn");
  } else {
    spinner.classList.remove("active");
    clear.classList.toggle("active", hasText);
    barcodeBtn.style.display = "flex";
    if (aiScanBtn) aiScanBtn.style.display = aiActive ? "flex" : "none";
    searchWrap.classList.toggle("has-ai-btn", aiActive);
  }
}

// ═══════════════════════════════════════════
// SEARCH WITH API + DEBOUNCE
// ═══════════════════════════════════════════
var searchGen = 0;

function handleSearch(query) {
  state.searchQuery = query;

  if (searchTimeout) clearTimeout(searchTimeout);

  if (!query || query.length < 3) {
    searchGen++;
    state.apiResults = [];
    state.rohlikResults = [];
    state.barcodeResults = [];
    setSearchLoading(false);
    renderCategories();
    renderFoodList();
    return;
  }

  // Show local results immediately
  renderCategories();
  renderFoodList();

  // Debounce API calls (300ms) — run both in parallel
  setSearchLoading(true);
  const gen = ++searchGen;
  searchTimeout = setTimeout(async () => {
    const searches = [apiSearch(query)];
    if (state.rohlikSearchEnabled) searches.push(rohlikSearch(query));
    const results = await Promise.all(searches);

    if (gen !== searchGen) return; // Stale — discard

    setSearchLoading(false);
    if (results[0] !== null) {
      state.apiResults = parseAutoResults(results[0]);
    }
    if (state.rohlikSearchEnabled && results[1] !== null) {
      state.rohlikResults = results[1];
    }
    renderFoodList();
  }, 300);
}
