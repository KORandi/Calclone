// ═══════════════════════════════════════════
// AI FOOD SCAN
// ═══════════════════════════════════════════
var aiScanStream = null;
var _aiCapturedImage = null; // { base64, mimeType }

function openAiScanModal() {
  if (!state.aiEnabled || !state.aiProvider || !state.aiApiKey) {
    showToast("Nejdříve nastavte AI model v Nastavení");
    return;
  }
  showAiScanStep("ai-scan-step-capture");
  document.getElementById("ai-scan-preview").style.display = "none";
  document.getElementById("ai-scan-video").style.display = "block";
  document.getElementById("btn-ai-capture").style.display = "";
  document.getElementById("btn-ai-retake").style.display = "none";
  document.getElementById("btn-ai-analyze").style.display = "none";
  document.getElementById("ai-scan-modal").classList.add("active");
  _aiCapturedImage = null;
  startAiCamera();
}

function closeAiScanModal() {
  stopAiCamera();
  document.getElementById("ai-scan-modal").classList.remove("active");
  _aiCapturedImage = null;
}

function showAiScanStep(stepId) {
  document.querySelectorAll(".ai-scan-step").forEach(function (el) {
    el.classList.remove("active");
  });
  document.getElementById(stepId).classList.add("active");
}

async function startAiCamera() {
  var video = document.getElementById("ai-scan-video");
  try {
    try {
      aiScanStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
      });
    } catch (e) {
      aiScanStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
    }
    video.srcObject = aiScanStream;
    video.setAttribute("webkit-playsinline", "true");
    await video.play();
  } catch (err) {
    console.error("AI camera error:", err);
    showAiScanStep("ai-scan-step-error");
    document.getElementById("ai-scan-error-text").textContent =
      err.name === "NotAllowedError"
        ? "Přístup ke kameře zamítnut. Povolte v nastavení prohlížeče."
        : "Nelze spustit kameru.";
  }
}

function stopAiCamera() {
  if (aiScanStream) {
    aiScanStream.getTracks().forEach(function (t) { t.stop(); });
    aiScanStream = null;
  }
  var video = document.getElementById("ai-scan-video");
  video.srcObject = null;
}

function captureAiPhoto() {
  var video = document.getElementById("ai-scan-video");
  var canvas = document.getElementById("ai-scan-canvas");
  var preview = document.getElementById("ai-scan-preview");

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  var ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0);

  var dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  var base64 = dataUrl.split(",")[1];
  _aiCapturedImage = { base64: base64, mimeType: "image/jpeg" };

  preview.src = dataUrl;
  preview.style.display = "block";
  video.style.display = "none";
  stopAiCamera();

  document.getElementById("btn-ai-capture").style.display = "none";
  document.getElementById("btn-ai-retake").style.display = "";
  document.getElementById("btn-ai-analyze").style.display = "";
}

function retakeAiPhoto() {
  _aiCapturedImage = null;
  document.getElementById("ai-scan-preview").style.display = "none";
  document.getElementById("ai-scan-video").style.display = "block";
  document.getElementById("btn-ai-capture").style.display = "";
  document.getElementById("btn-ai-retake").style.display = "none";
  document.getElementById("btn-ai-analyze").style.display = "none";
  startAiCamera();
}

async function analyzeAiPhoto() {
  if (!_aiCapturedImage) return;

  showAiScanStep("ai-scan-step-loading");

  var provider = AI_PROVIDERS[state.aiProvider];
  if (!provider) {
    showAiScanError("Neznámý AI provider");
    return;
  }

  var req = provider.buildRequest(state.aiApiKey, _aiCapturedImage.base64, _aiCapturedImage.mimeType);

  try {
    var resp = await fetch(req.url, req.options);
    if (!resp.ok) {
      var errText = "";
      try { errText = await resp.text(); } catch (e) {}
      if (resp.status === 401 || resp.status === 403) {
        showAiScanError("Neplatný API klíč. Zkontrolujte klíč v Nastavení.");
      } else if (resp.status === 429) {
        showAiScanError("Příliš mnoho požadavků. Zkuste to za chvíli.");
      } else {
        showAiScanError("Chyba API (" + resp.status + "): " + (errText.slice(0, 100) || "Neznámá chyba"));
      }
      return;
    }

    var data = await resp.json();
    var ingredients = req.parseResponse(data);

    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      showAiScanError("AI nedokázala rozpoznat žádné ingredience. Zkuste lepší fotku.");
      return;
    }

    renderAiIngredients(ingredients);
    showAiScanStep("ai-scan-step-results");
  } catch (e) {
    console.error("AI analysis error:", e);
    showAiScanError("Chyba při komunikaci s AI: " + e.message);
  }
}

function showAiScanError(msg) {
  document.getElementById("ai-scan-error-text").textContent = msg;
  showAiScanStep("ai-scan-step-error");
}

function renderAiIngredients(ingredients) {
  var list = document.getElementById("ai-ingredients-list");
  list.innerHTML = ingredients.map(function (ing, i) {
    var name = escapeHtml(ing.name || ing.name_en || "Neznámé");
    var grams = ing.estimated_grams || "?";
    return '<label class="ai-ingredient-item">' +
      '<input type="checkbox" checked data-ai-idx="' + i + '" ' +
      'data-name="' + escapeHtml(ing.name || "") + '" ' +
      'data-name-en="' + escapeHtml(ing.name_en || "") + '" ' +
      'data-grams="' + grams + '" />' +
      '<div class="ai-ingredient-info">' +
      '<span class="ai-ingredient-name">' + name + '</span>' +
      '<span class="ai-ingredient-grams">~' + grams + ' g</span>' +
      '</div>' +
      '</label>';
  }).join("");
}

async function searchAiIngredients() {
  var checkboxes = document.querySelectorAll("#ai-ingredients-list input[type=checkbox]:checked");
  if (checkboxes.length === 0) {
    showToast("Vyberte alespoň jednu ingredienci");
    return;
  }

  var selected = [];
  checkboxes.forEach(function (cb) {
    selected.push({
      name: cb.dataset.name,
      nameEn: cb.dataset.nameEn,
      grams: parseInt(cb.dataset.grams) || 100
    });
  });

  closeAiScanModal();

  // Search for the first ingredient to populate the food list
  if (selected.length === 1) {
    // Single ingredient: just search for it
    var searchInput = document.getElementById("search-input");
    searchInput.value = selected[0].name || selected[0].nameEn;
    handleSearch(searchInput.value);
  } else {
    // Multiple ingredients: search for each and show combined results
    var searchInput = document.getElementById("search-input");
    var combinedNames = selected.map(function (s) { return s.name || s.nameEn; }).join(", ");
    searchInput.value = combinedNames;

    // Run parallel searches for each ingredient
    setSearchLoading(true);
    var allResults = [];

    var searchPromises = selected.map(function (item) {
      var query = item.name || item.nameEn;
      return apiSearch(query).then(function (results) {
        if (results) {
          var parsed = parseAutoResults(results);
          // Tag with estimated grams
          parsed.forEach(function (r) {
            r.portionGrams = item.grams;
          });
          return parsed;
        }
        return [];
      }).catch(function () { return []; });
    });

    var results = await Promise.all(searchPromises);
    results.forEach(function (r) {
      allResults = allResults.concat(r);
    });

    setSearchLoading(false);
    state.searchQuery = combinedNames;
    state.apiResults = allResults;
    renderCategories();
    renderFoodList();
  }
}
