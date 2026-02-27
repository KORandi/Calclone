// ═══════════════════════════════════════════
// EASTER EGG – Mini Game Collection
// Three hidden games in different places!
//   1. Tap Challenge  → tap daily ring 5×
//   2. Food Catch     → type "hesoyam" in search
//   3. Emoji Memory   → tap "Nastavení" header 7×
// ═══════════════════════════════════════════

(function () {
  var FOOD_EMOJIS = [
    "🍕", "🍔", "🌮", "🍟", "🍩", "🍪", "🧁", "🎂", "🍰",
    "🍫", "🍿", "🥑", "🍣", "🥗", "🍜", "🍝", "🥐", "🍎",
    "🍇", "🍉", "🥕", "🌽", "🍗", "🥩", "🧀", "🥚", "🍌",
    "🍓", "🥞", "🧇", "🍤", "🥟", "🍱", "🥤", "🧃"
  ];

  var activeTimers = [];

  // Best scores
  var best = {
    tap: parseInt(localStorage.getItem("ee_best") || "0", 10),
    catch: parseInt(localStorage.getItem("ee_catch_best") || "0", 10),
    memory: parseInt(localStorage.getItem("ee_memory_best") || "0", 10)
  };

  // ── Trigger system ──
  function createTrigger(tapsNeeded, windowMs, callback) {
    var taps = [];
    return function () {
      var now = Date.now();
      taps.push(now);
      taps = taps.filter(function (t) { return now - t < windowMs; });
      if (taps.length >= tapsNeeded) {
        taps = [];
        callback();
      }
    };
  }

  // ── Helpers ──
  function clearAllTimers() {
    activeTimers.forEach(function (id) { clearInterval(id); clearTimeout(id); });
    activeTimers = [];
  }

  function addTimer(id) { activeTimers.push(id); return id; }

  function randomEmoji() {
    return FOOD_EMOJIS[Math.floor(Math.random() * FOOD_EMOJIS.length)];
  }

  function spawnEmoji(x, y, container) {
    var el = document.createElement("div");
    el.className = "ee-emoji";
    el.textContent = randomEmoji();
    var angle = Math.random() * Math.PI * 2;
    var dist = 40 + Math.random() * 80;
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.setProperty("--dx", Math.cos(angle) * dist + "px");
    el.style.setProperty("--dy", (Math.sin(angle) * dist - 60) + "px");
    el.style.fontSize = (20 + Math.random() * 16) + "px";
    container.appendChild(el);
    el.addEventListener("animationend", function () { el.remove(); });
  }

  function openModal(id) {
    clearAllTimers();
    var modal = document.getElementById(id);
    if (modal) modal.classList.add("active");
  }

  function closeModal(id) {
    clearAllTimers();
    catchActive = false;
    tapActive = false;
    var modal = document.getElementById(id);
    if (modal) modal.classList.remove("active");
  }

  // ═══════════════════════════════════════
  // GAME 1: TAP CHALLENGE
  // Trigger: tap daily ring 5× within 2s
  // ═══════════════════════════════════════
  var TAP_DURATION = 5;
  var tapCount = 0;
  var tapActive = false;

  function openTapGame() {
    openModal("ee-modal");
    tapCount = 0;
    tapActive = false;

    var resultEl = document.getElementById("ee-tap-result");
    var areaEl = document.getElementById("ee-tap-area");
    var countEl = document.getElementById("ee-tap-countdown");
    var timerEl = document.getElementById("ee-tap-timer");
    var scoreEl = document.getElementById("ee-tap-score");

    resultEl.style.display = "none";
    areaEl.style.display = "none";
    countEl.style.display = "flex";
    timerEl.textContent = TAP_DURATION + ".0";
    scoreEl.textContent = "0";

    var count = 3;
    countEl.textContent = count;
    countEl.classList.add("ee-pulse");

    var t = addTimer(setInterval(function () {
      count--;
      if (count > 0) {
        countEl.textContent = count;
      } else {
        clearInterval(t);
        countEl.style.display = "none";
        countEl.classList.remove("ee-pulse");
        tapRun();
      }
    }, 700));
  }

  function tapRun() {
    var areaEl = document.getElementById("ee-tap-area");
    var timerEl = document.getElementById("ee-tap-timer");
    var scoreEl = document.getElementById("ee-tap-score");

    tapCount = 0;
    tapActive = true;
    scoreEl.textContent = "0";
    areaEl.style.display = "flex";

    var remaining = TAP_DURATION * 10;
    timerEl.textContent = TAP_DURATION + ".0";

    var t = addTimer(setInterval(function () {
      remaining--;
      timerEl.textContent = (remaining / 10).toFixed(1);
      if (remaining <= 0) {
        clearInterval(t);
        tapEnd();
      }
    }, 100));
  }

  function handleTap(e) {
    if (!tapActive) return;
    tapCount++;
    document.getElementById("ee-tap-score").textContent = tapCount;

    var area = document.getElementById("ee-tap-area");
    var rect = area.getBoundingClientRect();
    var x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    var y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    for (var i = 0; i < 2 + Math.floor(Math.random() * 2); i++) spawnEmoji(x, y, area);

    var s = document.getElementById("ee-tap-score");
    s.classList.remove("ee-bump");
    void s.offsetWidth;
    s.classList.add("ee-bump");
  }

  function tapEnd() {
    tapActive = false;
    document.getElementById("ee-tap-area").style.display = "none";
    document.getElementById("ee-tap-result").style.display = "flex";
    document.getElementById("ee-tap-final").textContent = tapCount;

    var isNew = tapCount > best.tap;
    if (isNew) {
      best.tap = tapCount;
      localStorage.setItem("ee_best", String(best.tap));
    }
    document.getElementById("ee-tap-best").textContent = best.tap;
    document.getElementById("ee-tap-new-record").style.display = isNew ? "block" : "none";
  }

  // ═══════════════════════════════════════
  // GAME 2: FOOD CATCH
  // Trigger: type "hesoyam" in search box
  // ═══════════════════════════════════════
  var CATCH_DURATION = 20;
  var catchScore = 0;
  var catchActive = false;
  var catchSpawnTimer = null;

  function openCatchGame() {
    openModal("ee-catch-modal");
    catchScore = 0;
    catchActive = false;

    var resultEl = document.getElementById("ee-catch-result");
    var areaEl = document.getElementById("ee-catch-area");
    var countEl = document.getElementById("ee-catch-countdown");
    var timerEl = document.getElementById("ee-catch-timer");
    var scoreEl = document.getElementById("ee-catch-score");

    resultEl.style.display = "none";
    areaEl.style.display = "flex";
    areaEl.innerHTML = "";
    countEl.style.display = "flex";
    timerEl.textContent = CATCH_DURATION + ".0";
    scoreEl.textContent = "0";

    var count = 3;
    countEl.textContent = count;
    countEl.classList.add("ee-pulse");

    var t = addTimer(setInterval(function () {
      count--;
      if (count > 0) {
        countEl.textContent = count;
      } else {
        clearInterval(t);
        countEl.style.display = "none";
        countEl.classList.remove("ee-pulse");
        catchRun();
      }
    }, 700));
  }

  function catchRun() {
    var timerEl = document.getElementById("ee-catch-timer");
    var scoreEl = document.getElementById("ee-catch-score");

    catchScore = 0;
    catchActive = true;
    scoreEl.textContent = "0";

    var remaining = CATCH_DURATION * 10;
    timerEl.textContent = CATCH_DURATION + ".0";

    function spawnLoop() {
      if (!catchActive) return;
      spawnFallingFood();
      var elapsed = CATCH_DURATION - remaining / 10;
      var interval = Math.max(250, 600 - elapsed * 15);
      catchSpawnTimer = addTimer(setTimeout(spawnLoop, interval));
    }
    spawnLoop();

    var t = addTimer(setInterval(function () {
      remaining--;
      timerEl.textContent = (remaining / 10).toFixed(1);
      if (remaining <= 0) {
        clearInterval(t);
        catchEnd();
      }
    }, 100));
  }

  function spawnFallingFood() {
    var area = document.getElementById("ee-catch-area");
    if (!area || !catchActive) return;

    var el = document.createElement("div");
    el.className = "ee-falling-food";
    el.textContent = randomEmoji();
    el.style.left = (10 + Math.random() * 80) + "%";
    el.style.animationDuration = (2 + Math.random() * 1.5) + "s";

    el.addEventListener("click", function (e) {
      if (!catchActive) return;
      e.stopPropagation();
      catchScore++;
      document.getElementById("ee-catch-score").textContent = catchScore;
      el.classList.add("ee-caught");
      el.style.pointerEvents = "none";

      var s = document.getElementById("ee-catch-score");
      s.classList.remove("ee-bump");
      void s.offsetWidth;
      s.classList.add("ee-bump");
      setTimeout(function () { el.remove(); }, 200);
    });

    el.addEventListener("touchstart", function (e) {
      if (!catchActive) return;
      e.preventDefault();
      e.stopPropagation();
      el.click();
    }, { passive: false });

    el.addEventListener("animationend", function () { el.remove(); });
    area.appendChild(el);
  }

  function catchEnd() {
    catchActive = false;
    if (catchSpawnTimer) clearTimeout(catchSpawnTimer);

    var area = document.getElementById("ee-catch-area");
    var foods = area.querySelectorAll(".ee-falling-food");
    foods.forEach(function (f) { f.remove(); });

    document.getElementById("ee-catch-result").style.display = "flex";
    document.getElementById("ee-catch-final").textContent = catchScore;

    var isNew = catchScore > best.catch;
    if (isNew) {
      best.catch = catchScore;
      localStorage.setItem("ee_catch_best", String(best.catch));
    }
    document.getElementById("ee-catch-best-val").textContent = best.catch;
    document.getElementById("ee-catch-new-record").style.display = isNew ? "block" : "none";
  }

  // ═══════════════════════════════════════
  // GAME 3: EMOJI MEMORY
  // Trigger: tap "Nastavení" header 7× within 3s
  // ═══════════════════════════════════════
  var MEMORY_PAIRS = 6;
  var memoryCards = [];
  var memoryFlipped = [];
  var memoryMatched = 0;
  var memoryMoves = 0;
  var memoryLocked = false;
  var memoryTimerRef = null;
  var memorySeconds = 0;

  function openMemoryGame() {
    openModal("ee-memory-modal");
    memoryMatched = 0;
    memoryMoves = 0;
    memorySeconds = 0;
    memoryLocked = false;
    memoryFlipped = [];

    document.getElementById("ee-memory-moves").textContent = "0";
    document.getElementById("ee-memory-time").textContent = "0:00";
    document.getElementById("ee-memory-result").style.display = "none";

    // Pick 6 unique emojis
    var pool = FOOD_EMOJIS.slice();
    var picked = [];
    while (picked.length < MEMORY_PAIRS) {
      var idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }

    // Create pairs and shuffle (Fisher-Yates)
    memoryCards = [];
    picked.forEach(function (emoji) { memoryCards.push(emoji, emoji); });
    for (var i = memoryCards.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = memoryCards[i];
      memoryCards[i] = memoryCards[j];
      memoryCards[j] = tmp;
    }

    // Render board
    var board = document.getElementById("ee-memory-board");
    board.innerHTML = "";
    board.style.display = "grid";
    memoryCards.forEach(function (emoji, idx) {
      var card = document.createElement("button");
      card.className = "ee-memory-card";
      card.dataset.idx = idx;
      card.innerHTML = '<span class="ee-card-back">?</span><span class="ee-card-front">' + emoji + '</span>';
      card.addEventListener("click", function () { handleMemoryFlip(idx, card); });
      board.appendChild(card);
    });

    // Start timer
    memoryTimerRef = addTimer(setInterval(function () {
      memorySeconds++;
      var m = Math.floor(memorySeconds / 60);
      var s = memorySeconds % 60;
      document.getElementById("ee-memory-time").textContent = m + ":" + (s < 10 ? "0" : "") + s;
    }, 1000));
  }

  function handleMemoryFlip(idx, card) {
    if (memoryLocked) return;
    if (card.classList.contains("ee-flipped") || card.classList.contains("ee-matched")) return;

    card.classList.add("ee-flipped");
    memoryFlipped.push({ idx: idx, card: card });

    if (memoryFlipped.length === 2) {
      memoryMoves++;
      document.getElementById("ee-memory-moves").textContent = memoryMoves;

      var a = memoryFlipped[0];
      var b = memoryFlipped[1];

      if (memoryCards[a.idx] === memoryCards[b.idx]) {
        a.card.classList.add("ee-matched");
        b.card.classList.add("ee-matched");
        memoryMatched++;
        memoryFlipped = [];

        if (memoryMatched === MEMORY_PAIRS) {
          clearInterval(memoryTimerRef);
          addTimer(setTimeout(memoryEnd, 600));
        }
      } else {
        memoryLocked = true;
        addTimer(setTimeout(function () {
          a.card.classList.remove("ee-flipped");
          b.card.classList.remove("ee-flipped");
          memoryFlipped = [];
          memoryLocked = false;
        }, 800));
      }
    }
  }

  function memoryEnd() {
    document.getElementById("ee-memory-board").style.display = "none";
    var resultEl = document.getElementById("ee-memory-result");
    resultEl.style.display = "flex";

    document.getElementById("ee-memory-final-moves").textContent = memoryMoves;
    var m = Math.floor(memorySeconds / 60);
    var s = memorySeconds % 60;
    document.getElementById("ee-memory-final-time").textContent = m + ":" + (s < 10 ? "0" : "") + s;

    var isNew = best.memory === 0 || memoryMoves < best.memory;
    if (isNew) {
      best.memory = memoryMoves;
      localStorage.setItem("ee_memory_best", String(best.memory));
    }
    document.getElementById("ee-memory-best-val").textContent = best.memory;
    document.getElementById("ee-memory-new-record").style.display = isNew ? "block" : "none";
  }

  // ═══════════════════════════════════════
  // WIRE UP EVENTS
  // ═══════════════════════════════════════
  document.addEventListener("DOMContentLoaded", function () {
    // Trigger 1: daily ring → Tap Challenge
    var ring = document.getElementById("daily-ring");
    if (ring) ring.addEventListener("click", createTrigger(5, 2000, openTapGame));

    // Trigger 2: type "hesoyam" in search → Food Catch
    var searchInput = document.getElementById("search-input");
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        if (searchInput.value.toLowerCase().indexOf("hesoyam") !== -1) {
          searchInput.value = "";
          openCatchGame();
        }
      });
    }

    // Trigger 3: settings header → Emoji Memory
    var settHeader = document.querySelector("#page-settings .page-header");
    if (settHeader) settHeader.addEventListener("click", createTrigger(7, 3000, openMemoryGame));

    // Tap Challenge events
    var tapArea = document.getElementById("ee-tap-area");
    if (tapArea) {
      tapArea.addEventListener("click", handleTap);
      tapArea.addEventListener("touchstart", function (e) {
        e.preventDefault(); handleTap(e);
      }, { passive: false });
    }
    var tapRetry = document.getElementById("ee-tap-retry");
    if (tapRetry) tapRetry.addEventListener("click", openTapGame);

    // Food Catch events
    var catchRetry = document.getElementById("ee-catch-retry");
    if (catchRetry) catchRetry.addEventListener("click", openCatchGame);

    // Memory events
    var memoryRetry = document.getElementById("ee-memory-retry");
    if (memoryRetry) memoryRetry.addEventListener("click", openMemoryGame);

    // Close buttons
    document.getElementById("ee-close").addEventListener("click", function () { closeModal("ee-modal"); });
    document.getElementById("ee-catch-close").addEventListener("click", function () { closeModal("ee-catch-modal"); });
    document.getElementById("ee-memory-close").addEventListener("click", function () { closeModal("ee-memory-modal"); });
  });
})();
