// ═══════════════════════════════════════════
// QR SHARE FEATURE
// ═══════════════════════════════════════════
var qrSelectedEntries = {}; // { "YYYY-MM-DD": Set of indices }
var qrScanStream = null;
var qrScanInterval = null;
var qrPendingImport = null; // parsed data waiting for confirmation

// --- Diacritics encoding for QR (ASCII-safe) ---
var _qrDiacMap = {
  á: "a~",
  č: "c~",
  ď: "d~",
  é: "e~",
  ě: "e~~",
  í: "i~",
  ň: "n~",
  ó: "o~",
  ř: "r~",
  š: "s~",
  ť: "t~",
  ú: "u~",
  ů: "u~~",
  ý: "y~",
  ž: "z~",
  Á: "A~",
  Č: "C~",
  Ď: "D~",
  É: "E~",
  Ě: "E~~",
  Í: "I~",
  Ň: "N~",
  Ó: "O~",
  Ř: "R~",
  Š: "S~",
  Ť: "T~",
  Ú: "U~",
  Ů: "U~~",
  Ý: "Y~",
  Ž: "Z~",
};
var _qrDiacMapRev = Object.fromEntries(
  Object.entries(_qrDiacMap).map(([k, v]) => [v, k]),
);
function qrEncDiac(s) {
  return s.replace(
    /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/g,
    (m) => _qrDiacMap[m] || m,
  );
}
function qrDecDiac(s) {
  return s.replace(
    /([A-Za-z])~~|([A-Za-z])~/g,
    (m) => _qrDiacMapRev[m] || m,
  );
}

// --- Compact data format for QR ---
// Format: "K\nDYYYYMMDD\n..." with two line types:
//   R|guid|name|grams|time|meal        — API food (fetch nutrition by guid)
//   F|name|g|k|p|c|f|fb|l|time|meal    — full inline data
function compressLogForQR(selected) {
  const lines = [];
  const days = Object.keys(selected).sort();
  for (const day of days) {
    const entries = state.log[day];
    if (!entries) continue;
    const idxArr = Array.from(selected[day]).sort((a, b) => a - b);
    lines.push("D" + day.replace(/-/g, ""));
    for (const i of idxArr) {
      const e = entries[i];
      if (!e) continue;
      const t = (e.time || "").replace(":", "");
      const ml = qrEncDiac(e.meal || "");
      if (e.guid && e.source === "api") {
        // Reference line — just ID, short name, grams, time, meal
        lines.push(
          "R|" +
            [e.guid, qrEncDiac(e.name.slice(0, 6)), e.grams, t, ml].join(
              "|",
            ),
        );
      } else {
        // Full data line
        lines.push(
          "F|" +
            [
              qrEncDiac(e.name),
              e.grams,
              e.kcal,
              e.protein,
              e.carbs,
              e.fat,
              e.fiber || 0,
              e.liquid ? 1 : 0,
              t,
              ml,
            ].join("|"),
        );
      }
    }
  }
  return "K\n" + lines.join("\n");
}

function decompressQRData(raw) {
  try {
    if (!raw.startsWith("K\n")) return null;
    const lines = raw.split("\n");
    const result = {};
    let currentDay = null;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      if (line.startsWith("D") && line.length === 9) {
        const ds = line.slice(1);
        currentDay =
          ds.slice(0, 4) + "-" + ds.slice(4, 6) + "-" + ds.slice(6, 8);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(currentDay)) {
          currentDay = null;
          continue;
        }
        result[currentDay] = [];
        continue;
      }
      if (!currentDay) continue;
      const p = line.split("|");
      if (p[0] === "R" && p.length >= 4) {
        // Reference entry — needs API fetch
        const timeRaw = p[4] || "";
        const time =
          timeRaw.length >= 3
            ? timeRaw.slice(0, -2).padStart(2, "0") +
              ":" +
              timeRaw.slice(-2)
            : "00:00";
        result[currentDay].push({
          guid: p[1],
          name: qrDecDiac(p[2] || "?"),
          grams: +p[3] || 100,
          time,
          meal: qrDecDiac(p[5] || ""),
          _needsFetch: true,
        });
      } else if (p[0] === "F" && p.length >= 7) {
        // Full inline entry
        const timeRaw = p[9] || "";
        const time =
          timeRaw.length >= 3
            ? timeRaw.slice(0, -2).padStart(2, "0") +
              ":" +
              timeRaw.slice(-2)
            : "00:00";
        result[currentDay].push({
          name: qrDecDiac(p[1] || "?"),
          grams: +p[2] || 0,
          kcal: +p[3] || 0,
          protein: +p[4] || 0,
          carbs: +p[5] || 0,
          fat: +p[6] || 0,
          fiber: +p[7] || 0,
          liquid: p[8] === "1",
          time,
          meal: qrDecDiac(p[10] || ""),
        });
      }
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

// --- Selection modal ---
function openQrShareModal() {
  document.getElementById("qr-share-modal").classList.add("active");
}
function closeQrShareModal() {
  document.getElementById("qr-share-modal").classList.remove("active");
}

function openQrSelectModal() {
  closeQrShareModal();
  qrSelectedEntries = {};
  renderQrSelectList();
  document.getElementById("qr-select-modal").classList.add("active");
}
function closeQrSelectModal() {
  document.getElementById("qr-select-modal").classList.remove("active");
}

function renderQrSelectList() {
  const el = document.getElementById("qr-select-list");
  const days = Object.keys(state.log).sort().reverse();

  if (days.length === 0) {
    el.innerHTML =
      '<div class="empty-state"><p>Žádná historie k sdílení.</p></div>';
    document.getElementById("btn-generate-qr").disabled = true;
    return;
  }

  el.innerHTML = days
    .map((day) => {
      const entries = state.log[day];
      const parts = day.split("-");
      const date = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      const label = date.toLocaleDateString("cs-CZ", {
        weekday: "short",
        day: "numeric",
        month: "long",
      });
      const totals = entries.reduce(
        (a, e) => {
          a.kcal += e.kcal;
          return a;
        },
        { kcal: 0 },
      );

      const selectedSet = qrSelectedEntries[day] || new Set();
      const allSelected =
        entries.length > 0 && selectedSet.size === entries.length;

      return `
      <div class="qr-day-group">
        <label class="qr-day-header">
          <input type="checkbox" data-qr-day="${day}" ${allSelected ? "checked" : ""}>
          <span>${escapeHtml(label)} · ${entries.length} pol. · ${totals.kcal} kcal</span>
        </label>
        ${entries
          .map(
            (e, i) => `
          <div class="qr-entry-item">
            <input type="checkbox" data-qr-day="${day}" data-qr-idx="${i}" ${selectedSet.has(i) ? "checked" : ""}>
            <div class="qr-entry-info">
              <div class="qr-entry-name">${escapeHtml(e.name)}</div>
              <div class="qr-entry-detail">${e.grams}${e.liquid ? "ml" : "g"} · ${e.time || ""}</div>
            </div>
            <div class="qr-entry-kcal">${e.kcal} kcal</div>
          </div>
        `,
          )
          .join("")}
      </div>
    `;
    })
    .join("");

  updateQrGenerateButton();
}

function updateQrSelection(day, idx, checked) {
  if (!qrSelectedEntries[day]) qrSelectedEntries[day] = new Set();
  if (idx !== null) {
    if (checked) qrSelectedEntries[day].add(idx);
    else qrSelectedEntries[day].delete(idx);
    if (qrSelectedEntries[day].size === 0) delete qrSelectedEntries[day];
  } else {
    // Toggle all entries for this day
    const entries = state.log[day];
    if (!entries) return;
    if (checked) {
      qrSelectedEntries[day] = new Set(entries.map((_, i) => i));
    } else {
      delete qrSelectedEntries[day];
    }
  }
  renderQrSelectList();
}

function getSelectedEntryCount() {
  let count = 0;
  for (const s of Object.values(qrSelectedEntries)) count += s.size;
  return count;
}

function updateQrGenerateButton() {
  const count = getSelectedEntryCount();
  const btn = document.getElementById("btn-generate-qr");
  btn.disabled = count === 0;
  const label =
    count === 0
      ? "Vytvořit QR kód"
      : `Vytvořit QR kód (${count} ${count === 1 ? "záznam" : count < 5 ? "záznamy" : "záznamů"})`;
  const svg = btn.querySelector("svg");
  btn.textContent = label;
  if (svg) btn.prepend(svg);

  // Check data size for warnings
  const warning = document.getElementById("qr-size-warning");
  if (count > 0) {
    const data = compressLogForQR(qrSelectedEntries);
    const bytes = new Blob([data]).size;
    if (bytes > 2200) {
      warning.style.display = "block";
      warning.textContent = `Data jsou příliš velká (${bytes} B). Maximální kapacita QR kódu je ~2200 B. Vyberte méně záznamů.`;
      btn.disabled = true;
    } else if (bytes > 1800) {
      warning.style.display = "block";
      warning.textContent = `Data: ${bytes} B — blízko limitu QR kódu. Kód může být obtížně skenovatelný.`;
    } else {
      warning.style.display = "none";
    }
  } else {
    warning.style.display = "none";
  }
}

// --- QR code generation ---
function generateQrCode() {
  const data = compressLogForQR(qrSelectedEntries);
  const bytes = new Blob([data]).size;
  if (bytes > 2200) {
    showToast("Data příliš velká pro QR kód");
    return;
  }

  closeQrSelectModal();

  // Determine QR type number based on data length
  let typeNumber = 0; // auto
  try {
    const qr = qrcode(typeNumber, "M");
    qr.addData(data);
    qr.make();

    const wrap = document.getElementById("qr-display-wrap");
    wrap.innerHTML = "";
    const img = document.createElement("img");
    img.src = qr.createDataURL(6, 4);
    img.alt = "QR kód";
    wrap.appendChild(img);

    const count = getSelectedEntryCount();
    const dayCount = Object.keys(qrSelectedEntries).length;
    document.getElementById("qr-display-info").textContent =
      `${count} ${count === 1 ? "záznam" : count < 5 ? "záznamy" : "záznamů"} z ${dayCount} ${dayCount === 1 ? "dne" : "dnů"} · ${bytes} B`;

    document.getElementById("qr-display-modal").classList.add("active");
  } catch (err) {
    showToast("Chyba při generování QR kódu");
    console.error("QR generation error:", err);
  }
}

// --- QR code scanning ---
function openQrScanModal() {
  closeQrShareModal();
  document.getElementById("qr-scan-modal").classList.add("active");
  document.getElementById("qr-scan-status").textContent =
    "Spouštění kamery...";
  startQrScanning();
}

function closeQrScanModal() {
  document.getElementById("qr-scan-modal").classList.remove("active");
  stopQrScanning();
}

async function startQrScanning() {
  try {
    const video = document.getElementById("qr-scan-video");
    qrScanStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    video.srcObject = qrScanStream;
    await video.play();
    document.getElementById("qr-scan-status").textContent =
      "Hledám QR kód...";

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let lastInvalidTime = 0;

    qrScanInterval = setInterval(() => {
      try {
        if (video.readyState < 2) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        );
        const code = jsQR(
          imageData.data,
          imageData.width,
          imageData.height,
          {
            inversionAttempts: "dontInvert",
          },
        );
        if (code && code.data) {
          const parsed = decompressQRData(code.data);
          if (parsed && Object.keys(parsed).length > 0) {
            closeQrScanModal();
            openQrPreviewModal(parsed);
          } else {
            const now = Date.now();
            if (now - lastInvalidTime > 3000) {
              lastInvalidTime = now;
              document.getElementById("qr-scan-status").textContent =
                "Neplatný QR kód. Zkuste Calclone QR kód.";
            }
          }
        }
      } catch {}
    }, 200);
  } catch (err) {
    console.error("Camera error:", err);
    document.getElementById("qr-scan-status").textContent =
      "Nepodařilo se spustit kameru. Zkontrolujte oprávnění.";
  }
}

function stopQrScanning() {
  if (qrScanInterval) {
    clearInterval(qrScanInterval);
    qrScanInterval = null;
  }
  if (qrScanStream) {
    qrScanStream.getTracks().forEach((t) => t.stop());
    qrScanStream = null;
  }
  const video = document.getElementById("qr-scan-video");
  video.srcObject = null;
}

// --- Import preview ---
async function openQrPreviewModal(data) {
  qrPendingImport = data;
  const el = document.getElementById("qr-preview-list");
  const btn = document.getElementById("btn-confirm-import");
  const summaryEl = document.getElementById("qr-preview-summary");
  const days = Object.keys(data).sort().reverse();
  let totalEntries = 0;
  const needsFetch = [];

  // Collect entries that need API fetch
  for (const day of days) {
    for (const e of data[day]) {
      totalEntries++;
      if (e._needsFetch) needsFetch.push(e);
    }
  }

  // Render preview immediately
  function renderPreview() {
    let totalKcal = 0;
    el.innerHTML = days
      .map((day) => {
        const entries = data[day];
        const parts = day.split("-");
        const date = new Date(+parts[0], +parts[1] - 1, +parts[2]);
        const label = date.toLocaleDateString("cs-CZ", {
          weekday: "short",
          day: "numeric",
          month: "long",
          year: "numeric",
        });
        return `
        <div class="qr-preview-day">
          <div class="qr-preview-day-label">${escapeHtml(label)} · ${entries.length} pol.</div>
          ${entries
            .map((e) => {
              const loading = e._needsFetch && !e._fetched;
              totalKcal += e.kcal || 0;
              return `
              <div class="qr-preview-entry">
                <div>
                  <div class="qr-preview-entry-name">${escapeHtml(e.name)}</div>
                  <div class="qr-preview-entry-detail">${
                    loading
                      ? `${e.grams}g · Načítání...`
                      : `${e.grams}${e.liquid ? "ml" : "g"} · B:${e.protein}g S:${e.carbs}g T:${e.fat}g`
                  }</div>
                </div>
                <div class="qr-preview-entry-kcal">${loading ? "···" : `${e.kcal} kcal`}</div>
              </div>
            `;
            })
            .join("")}
        </div>
      `;
      })
      .join("");
    const label =
      totalEntries === 1
        ? "záznam"
        : totalEntries < 5
          ? "záznamy"
          : "záznamů";
    summaryEl.textContent = needsFetch.some((e) => !e._fetched)
      ? `Celkem: ${totalEntries} ${label} · Načítání hodnot...`
      : `Celkem: ${totalEntries} ${label} · ${totalKcal} kcal`;
  }

  renderPreview();
  btn.disabled = needsFetch.length > 0;
  document.getElementById("qr-preview-modal").classList.add("active");

  // Fetch nutrition for reference entries in parallel
  if (needsFetch.length > 0) {
    await Promise.all(
      needsFetch.map(async (e) => {
        try {
          const detail = await apiDetail({ guid: e.guid, kcal: 0 });
          if (detail.name) e.name = detail.name;
          const ratio = e.grams / 100;
          e.kcal = Math.round((detail.kcal || 0) * ratio);
          e.protein = +((detail.protein || 0) * ratio).toFixed(1);
          e.carbs = +((detail.carbs || 0) * ratio).toFixed(1);
          e.fat = +((detail.fat || 0) * ratio).toFixed(1);
          e.fiber = +((detail.fiber || 0) * ratio).toFixed(1);
          e.liquid = detail.liquid || false;
          e.source = "api";
          e._fetched = true;
        } catch {
          // Fallback: mark as fetched with zeros
          e.kcal = 0;
          e.protein = 0;
          e.carbs = 0;
          e.fat = 0;
          e.fiber = 0;
          e.liquid = false;
          e._fetched = true;
        }
      }),
    );
    renderPreview();
    btn.disabled = false;
  }
}

function closeQrPreviewModal() {
  document.getElementById("qr-preview-modal").classList.remove("active");
  qrPendingImport = null;
}

function confirmQrImport() {
  if (!qrPendingImport) return;
  let totalAdded = 0;
  for (const [day, entries] of Object.entries(qrPendingImport)) {
    if (!state.log[day]) state.log[day] = [];
    entries.forEach((e) => {
      const entry = {
        name: e.name,
        grams: e.grams,
        liquid: !!e.liquid,
        kcal: e.kcal || 0,
        protein: e.protein || 0,
        carbs: e.carbs || 0,
        fat: e.fat || 0,
        fiber: e.fiber || 0,
        time: e.time,
        meal: e.meal || "",
      };
      if (e.guid) entry.guid = e.guid;
      if (e.source) entry.source = e.source;
      state.log[day].push(entry);
      totalAdded++;
    });
  }
  saveState();
  closeQrPreviewModal();
  if (state.activePage === "page-history") renderHistory();
  if (state.activePage === "page-today") renderToday();
  showToast(
    `Přidáno ${totalAdded} ${totalAdded === 1 ? "záznam" : totalAdded < 5 ? "záznamy" : "záznamů"}`,
  );
}

// --- QR from image ---
function handleQrImageFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  closeQrShareModal();
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });
    if (code && code.data) {
      const parsed = decompressQRData(code.data);
      if (parsed && Object.keys(parsed).length > 0) {
        openQrPreviewModal(parsed);
        return;
      }
    }
    showToast("QR kód nebyl nalezen v obrázku");
  };
  img.onerror = () => showToast("Nepodařilo se načíst obrázek");
  img.src = URL.createObjectURL(file);
}

// --- QR Event Listeners ---
document
  .getElementById("share-fab")
  .addEventListener("click", openQrShareModal);
document
  .getElementById("qr-action-send")
  .addEventListener("click", openQrSelectModal);
document
  .getElementById("qr-action-scan")
  .addEventListener("click", openQrScanModal);

document
  .getElementById("qr-action-image")
  .addEventListener("click", () => {
    document.getElementById("qr-image-input").click();
  });
document
  .getElementById("qr-image-input")
  .addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleQrImageFile(file);
    e.target.value = "";
  });

document
  .getElementById("qr-share-modal")
  .addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeQrShareModal();
  });

document
  .getElementById("qr-select-modal")
  .addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeQrSelectModal();
  });

document
  .getElementById("qr-display-modal")
  .addEventListener("click", (e) => {
    if (e.target === e.currentTarget)
      e.currentTarget.classList.remove("active");
  });

document
  .getElementById("qr-scan-modal")
  .addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeQrScanModal();
  });

document
  .getElementById("qr-scan-cancel")
  .addEventListener("click", closeQrScanModal);

document
  .getElementById("qr-preview-modal")
  .addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeQrPreviewModal();
  });

document
  .getElementById("btn-generate-qr")
  .addEventListener("click", generateQrCode);
document
  .getElementById("btn-confirm-import")
  .addEventListener("click", confirmQrImport);
document
  .getElementById("btn-cancel-import")
  .addEventListener("click", closeQrPreviewModal);

// Delegated checkbox handler for selection list
document
  .getElementById("qr-select-list")
  .addEventListener("change", (e) => {
    const cb = e.target.closest("input[type='checkbox'][data-qr-day]");
    if (!cb) return;
    const day = cb.dataset.qrDay;
    const idx =
      cb.dataset.qrIdx !== undefined ? parseInt(cb.dataset.qrIdx) : null;
    updateQrSelection(day, idx, cb.checked);
  });

