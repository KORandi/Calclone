// ═══════════════════════════════════════════
// AI SETUP
// ═══════════════════════════════════════════
var AI_PROVIDERS = {
  gemini: {
    name: "Google Gemini",
    model: "gemini-2.0-flash",
    pricing: "Zdarma (15 req/min)",
    recommended: true,
    docsUrl: "https://ai.google.dev/gemini-api/docs/api-key",
    docsHtml: `<ol>
      <li>Přejděte na <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a></li>
      <li>Přihlaste se pomocí Google účtu</li>
      <li>Klikněte na <strong>"Create API key"</strong></li>
      <li>Zkopírujte vygenerovaný klíč</li>
    </ol>
    <a href="https://ai.google.dev/gemini-api/docs/api-key" target="_blank" rel="noopener" class="ai-docs-link">Oficiální dokumentace &rarr;</a>`,
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    buildRequest: function (apiKey, base64Image, mimeType) {
      return {
        url: this.endpoint + "?key=" + apiKey,
        options: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: AI_FOOD_PROMPT },
                { inline_data: { mime_type: mimeType, data: base64Image } }
              ]
            }]
          })
        },
        parseResponse: function (data) {
          var text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
          return parseAiJsonResponse(text);
        }
      };
    }
  },
  claude: {
    name: "Anthropic Claude",
    model: "claude-sonnet-4-20250514",
    pricing: "~0,80 Kč / snímek",
    docsUrl: "https://docs.anthropic.com/en/api/getting-started",
    docsHtml: `<ol>
      <li>Přejděte na <a href="https://console.anthropic.com/" target="_blank" rel="noopener">Anthropic Console</a></li>
      <li>Vytvořte si účet nebo se přihlaste</li>
      <li>V sekci <strong>"API Keys"</strong> vytvořte nový klíč</li>
      <li>Zkopírujte vygenerovaný klíč</li>
    </ol>
    <a href="https://docs.anthropic.com/en/api/getting-started" target="_blank" rel="noopener" class="ai-docs-link">Oficiální dokumentace &rarr;</a>`,
    endpoint: "https://api.anthropic.com/v1/messages",
    buildRequest: function (apiKey, base64Image, mimeType) {
      return {
        url: CORS_PROXY + encodeURIComponent(this.endpoint),
        options: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true"
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 1024,
            messages: [{
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: mimeType, data: base64Image } },
                { type: "text", text: AI_FOOD_PROMPT }
              ]
            }]
          })
        },
        parseResponse: function (data) {
          var text = data.content?.[0]?.text || "";
          return parseAiJsonResponse(text);
        }
      };
    }
  },
  openai: {
    name: "OpenAI",
    model: "gpt-4o",
    pricing: "~0,50 Kč / snímek",
    docsUrl: "https://platform.openai.com/docs/quickstart",
    docsHtml: `<ol>
      <li>Přejděte na <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">OpenAI Platform</a></li>
      <li>Vytvořte si účet nebo se přihlaste</li>
      <li>Klikněte na <strong>"Create new secret key"</strong></li>
      <li>Zkopírujte vygenerovaný klíč</li>
    </ol>
    <a href="https://platform.openai.com/docs/quickstart" target="_blank" rel="noopener" class="ai-docs-link">Oficiální dokumentace &rarr;</a>`,
    endpoint: "https://api.openai.com/v1/chat/completions",
    buildRequest: function (apiKey, base64Image, mimeType) {
      return {
        url: this.endpoint,
        options: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + apiKey
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 1024,
            messages: [{
              role: "user",
              content: [
                { type: "text", text: AI_FOOD_PROMPT },
                { type: "image_url", image_url: { url: "data:" + mimeType + ";base64," + base64Image } }
              ]
            }]
          })
        },
        parseResponse: function (data) {
          var text = data.choices?.[0]?.message?.content || "";
          return parseAiJsonResponse(text);
        }
      };
    }
  }
};

var AI_FOOD_PROMPT = `Analyze this food photo. Identify all visible food items/ingredients.
Return ONLY a JSON array of objects, each with:
- "name": food name in Czech (e.g. "Kuřecí prsa", "Rýže bílá")
- "name_en": food name in English for search fallback
- "estimated_grams": estimated weight in grams

Example: [{"name":"Kuřecí prsa","name_en":"chicken breast","estimated_grams":150},{"name":"Rýže bílá","name_en":"white rice","estimated_grams":200}]

Rules:
- Return ONLY the JSON array, no other text
- Be specific (e.g. "Rýže bílá" not just "Rýže")
- Estimate realistic portion sizes
- Include sauces, oils, garnishes if visible`;

var _aiSetupProvider = null;

function openAiSetupModal() {
  _aiSetupProvider = null;
  showAiSetupStep("ai-step-provider");
  document.querySelectorAll(".ai-provider-option").forEach(function (el) {
    el.classList.remove("selected");
  });
  document.getElementById("ai-setup-modal").classList.add("active");
}

function closeAiSetupModal() {
  document.getElementById("ai-setup-modal").classList.remove("active");
  // Reset wizard to initial state
  _aiSetupProvider = null;
  showAiSetupStep("ai-step-provider");
  document.querySelectorAll(".ai-provider-option").forEach(function (el) {
    el.classList.remove("selected");
  });
  document.getElementById("ai-api-key-input").value = "";
  document.getElementById("ai-selected-provider-name").textContent = "";
  document.getElementById("ai-docs-content").innerHTML = "";
}

function showAiSetupStep(stepId) {
  document.querySelectorAll(".ai-setup-step").forEach(function (el) {
    el.classList.remove("active");
  });
  document.getElementById(stepId).classList.add("active");
}

function selectAiProvider(provider) {
  var info = AI_PROVIDERS[provider];
  if (!info) {
    showToast("Neznámý AI provider");
    return;
  }
  _aiSetupProvider = provider;
  document.getElementById("ai-selected-provider-name").textContent = info.name;
  document.querySelectorAll(".ai-provider-option").forEach(function (el) {
    el.classList.toggle("selected", el.dataset.provider === provider);
  });
  showAiSetupStep("ai-step-haskey");
}

function showAiKeyEntry() {
  document.getElementById("ai-api-key-input").value = "";
  showAiSetupStep("ai-step-enter-key");
}

function showAiDocs() {
  if (!_aiSetupProvider || !AI_PROVIDERS[_aiSetupProvider]) {
    showToast("Nejdříve vyberte AI provider");
    return;
  }
  var info = AI_PROVIDERS[_aiSetupProvider];
  document.getElementById("ai-docs-content").innerHTML = info.docsHtml;
  showAiSetupStep("ai-step-get-key");
}

function saveAiApiKey() {
  var key = document.getElementById("ai-api-key-input").value.trim();
  if (!key) {
    showToast("Zadejte API klíč");
    return;
  }
  if (!_aiSetupProvider || !AI_PROVIDERS[_aiSetupProvider]) {
    showToast("Nejdříve vyberte AI provider");
    return;
  }
  state.aiProvider = _aiSetupProvider;
  state.aiApiKey = key;
  state.aiEnabled = true;
  saveState();
  closeAiSetupModal();
  updateAiSettingsUI();
  updateAiScanButton();
  showToast("AI model aktivován");
}

function removeAiApiKey() {
  if (!confirm("Opravdu odebrat API klíč?")) return;
  state.aiApiKey = null;
  state.aiProvider = null;
  state.aiEnabled = false;
  saveState();
  updateAiSettingsUI();
  updateAiScanButton();
  showToast("API klíč odebrán");
}

function updateAiSettingsUI() {
  var toggle = document.getElementById("toggle-ai-enabled");
  var section = document.getElementById("ai-settings-section");
  var statusDot = document.getElementById("ai-status-dot");
  var statusText = document.getElementById("ai-status-text");
  var removeBtn = document.getElementById("btn-ai-remove");

  toggle.checked = state.aiEnabled;
  section.style.display = state.aiEnabled ? "block" : "none";

  if (state.aiProvider && state.aiApiKey) {
    var info = AI_PROVIDERS[state.aiProvider];
    if (!info) {
      statusDot.className = "ai-status-dot inactive";
      statusText.textContent = "Neplatný AI provider";
      removeBtn.style.display = "block";
      return;
    }
    statusDot.className = "ai-status-dot active";
    statusText.textContent = info.name + " — aktivní";
    removeBtn.style.display = "block";
  } else {
    statusDot.className = "ai-status-dot inactive";
    statusText.textContent = "Žádný AI model není nastaven";
    removeBtn.style.display = "none";
  }
}

function updateAiScanButton() {
  var btn = document.getElementById("ai-scan-btn");
  btn.style.display = (state.aiEnabled && state.aiProvider && state.aiApiKey) ? "" : "none";
}

function parseAiJsonResponse(text) {
  // Try to extract JSON array from response text
  var jsonMatch = text.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.warn("AI JSON parse failed:", e);
    }
  }
  // Try parsing the whole text
  try {
    var parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {}
  return null;
}
