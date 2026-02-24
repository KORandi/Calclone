// ═══════════════════════════════════════════
// BARCODE SCANNER
// ═══════════════════════════════════════════
var barcodeStream = null;
var barcodeDetector = null;
var barcodeScanInterval = null;

async function openBarcodeScanner() {
  const modal = document.getElementById("barcode-modal");
  const video = document.getElementById("barcode-video");
  const status = document.getElementById("barcode-status");

  modal.classList.add("active");
  status.textContent = "Spouštění kamery...";
  status.className = "barcode-status";

  try {
    // Try full constraints first, fall back to simple for Safari compatibility
    try {
      barcodeStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
    } catch {
      barcodeStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
    }
    video.srcObject = barcodeStream;
    video.setAttribute("webkit-playsinline", "true");
    await video.play();
    status.textContent = "Hledám čárový kód...";

    if ("BarcodeDetector" in window) {
      barcodeDetector = new BarcodeDetector({
        formats: [
          "ean_13",
          "ean_8",
          "upc_a",
          "upc_e",
          "code_128",
          "code_39",
        ],
      });
    } else {
      status.textContent = "Skener není podporován v tomto prohlížeči.";
      status.className = "barcode-status error";
      return;
    }

    startBarcodeScanning(video, status);
  } catch (err) {
    console.error("Camera error:", err);
    if (err.name === "NotAllowedError") {
      status.textContent =
        "Přístup ke kameře zamítnut. Povolte v Nastavení > Safari > Kamera.";
    } else if (err.name === "NotFoundError") {
      status.textContent = "Kamera nebyla nalezena.";
    } else {
      status.textContent =
        "Nelze spustit kameru. Povolte přístup ke kameře.";
    }
    status.className = "barcode-status error";
  }
}

function startBarcodeScanning(video, status) {
  barcodeScanInterval = setInterval(async () => {
    if (!video.videoWidth) return;

    try {
      let barcodes = [];

      if (barcodeDetector) {
        barcodes = await barcodeDetector.detect(video);
      }

      if (barcodes.length > 0) {
        const code = barcodes[0].rawValue;
        status.textContent = "Nalezeno: " + code;
        status.className = "barcode-status success";
        closeBarcodeScanner();
        handleBarcodeResult(code);
      }
    } catch (e) {
      // Detection failed, keep trying
    }
  }, 250);
}

function closeBarcodeScanner() {
  clearInterval(barcodeScanInterval);
  barcodeScanInterval = null;

  if (barcodeStream) {
    barcodeStream.getTracks().forEach((t) => t.stop());
    barcodeStream = null;
  }

  const video = document.getElementById("barcode-video");
  video.srcObject = null;
  document.getElementById("barcode-modal").classList.remove("active");
}

function isOffLiquid(p) {
  const qty = (p.quantity || "").toLowerCase();
  if (/\d\s*(ml|l|cl|dl)\b/.test(qty)) return true;
  const cats = (p.categories_tags || []).join(" ").toLowerCase();
  if (
    /beverages|drinks|napoje|milk|juice|water|soda|beer|wine/.test(cats)
  )
    return true;
  return false;
}

function parseBarcodeProduct(code, p) {
  const n = p.nutriments || {};
  const name =
    p.product_name || p.product_name_cs || p.product_name_en || code;
  const brand = p.brands || "";
  return {
    name: brand ? `${name} (${brand})` : name,
    cat: p.categories_tags?.[0]?.replace("en:", "") || "Skenováno",
    kcal:
      n["energy-kcal_100g"] ||
      Math.round((n["energy_100g"] || 0) / 4.184) ||
      0,
    protein: n.proteins_100g || 0,
    carbs: n.carbohydrates_100g || 0,
    fat: n.fat_100g || 0,
    fiber: n.fiber_100g || 0,
    liquid: isOffLiquid(p),
    source: "local",
  };
}

async function handleBarcodeResult(code) {
  // If scanning for ingredient wizard, handle separately
  if (cfwState.barcodeMode) {
    cfwState.barcodeMode = false;
    await handleCfwBarcodeResult(code);
    return;
  }
  const searchInput = document.getElementById("search-input");
  searchInput.value = code;
  state.barcodeResults = [];

  setSearchLoading(true);

  // Check barcode cache first
  const cached = getCached(state.barcodeCache, code);
  if (cached) {
    state.barcodeResults = Array.isArray(cached) ? cached : [cached];
    const productName = state.barcodeResults[0]?.name || code;
    searchInput.value = productName;
    setSearchLoading(false);
    state.searchQuery = productName;
    renderCategories();
    renderFoodList();
    handleSearch(productName);
    return;
  }

  // Look up the barcode on Open Food Facts
  try {
    const resp = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`,
    );
    if (resp.ok) {
      const data = await resp.json();
      if (data.status === 1 && data.product) {
        const food = parseBarcodeProduct(code, data.product);
        state.barcodeResults = [food];

        setCache(state.barcodeCache, code, state.barcodeResults);

        const productName = food.name;
        searchInput.value = productName;
        setSearchLoading(false);
        state.searchQuery = productName;
        renderCategories();
        renderFoodList();
        handleSearch(productName);
        return;
      }
    }
  } catch (e) {
    console.warn("Open Food Facts lookup failed:", e);
  }

  setSearchLoading(false);
  handleSearch(code);
}

