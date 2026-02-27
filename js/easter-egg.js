// ═══════════════════════════════════════════
// EASTER EGG – Tap Challenge Minigame
// Tap the daily ring 5× to activate!
// ═══════════════════════════════════════════

(function () {
  var TRIGGER_TAPS = 5;
  var TRIGGER_WINDOW = 2000; // ms – all taps must happen within this window
  var GAME_DURATION = 5; // seconds
  var FOOD_EMOJIS = [
    "🍕", "🍔", "🌮", "🍟", "🍩", "🍪", "🧁", "🎂", "🍰",
    "🍫", "🍿", "🥑", "🍣", "🥗", "🍜", "🍝", "🥐", "🍎",
    "🍇", "🍉", "🥕", "🌽", "🍗", "🥩", "🧀", "🥚", "🍌",
    "🍓", "🥞", "🧇", "🍤", "🥟", "🍱", "🥤", "🧃"
  ];

  var ringTaps = [];
  var gameTaps = 0;
  var gameActive = false;
  var gameTimer = null;
  var countdownTimer = null;
  var bestScore = parseInt(localStorage.getItem("ee_best") || "0", 10);

  // ── Trigger detection on daily ring ──
  function handleRingTap() {
    var now = Date.now();
    ringTaps.push(now);
    // Keep only taps within the window
    ringTaps = ringTaps.filter(function (t) { return now - t < TRIGGER_WINDOW; });
    if (ringTaps.length >= TRIGGER_TAPS) {
      ringTaps = [];
      openGame();
    }
  }

  // ── Emoji explosion ──
  function spawnEmoji(x, y, container) {
    var el = document.createElement("div");
    el.className = "ee-emoji";
    el.textContent = FOOD_EMOJIS[Math.floor(Math.random() * FOOD_EMOJIS.length)];

    // Random offset from tap point
    var angle = Math.random() * Math.PI * 2;
    var dist = 40 + Math.random() * 80;
    var dx = Math.cos(angle) * dist;
    var dy = Math.sin(angle) * dist;

    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.setProperty("--dx", dx + "px");
    el.style.setProperty("--dy", (dy - 60) + "px"); // bias upward
    el.style.fontSize = (20 + Math.random() * 16) + "px";

    container.appendChild(el);
    el.addEventListener("animationend", function () { el.remove(); });
  }

  // ── Open game modal ──
  function openGame() {
    var modal = document.getElementById("ee-modal");
    if (!modal) return;
    modal.classList.add("active");

    gameTaps = 0;
    gameActive = false;
    showCountdown();
  }

  // ── 3-2-1 countdown then start ──
  function showCountdown() {
    var countEl = document.getElementById("ee-countdown");
    var areaEl = document.getElementById("ee-tap-area");
    var timerEl = document.getElementById("ee-timer");
    var scoreEl = document.getElementById("ee-score");
    var resultEl = document.getElementById("ee-result");

    resultEl.style.display = "none";
    areaEl.style.display = "none";
    countEl.style.display = "flex";
    timerEl.textContent = GAME_DURATION + ".0";
    scoreEl.textContent = "0";

    var count = 3;
    countEl.textContent = count;
    countEl.classList.add("ee-pulse");

    countdownTimer = setInterval(function () {
      count--;
      if (count > 0) {
        countEl.textContent = count;
      } else {
        clearInterval(countdownTimer);
        countEl.style.display = "none";
        countEl.classList.remove("ee-pulse");
        startGame();
      }
    }, 700);
  }

  // ── Start tapping game ──
  function startGame() {
    var areaEl = document.getElementById("ee-tap-area");
    var timerEl = document.getElementById("ee-timer");
    var scoreEl = document.getElementById("ee-score");

    gameTaps = 0;
    gameActive = true;
    scoreEl.textContent = "0";
    areaEl.style.display = "flex";

    var remaining = GAME_DURATION * 10; // tenths of second
    timerEl.textContent = GAME_DURATION + ".0";

    gameTimer = setInterval(function () {
      remaining--;
      var secs = (remaining / 10).toFixed(1);
      timerEl.textContent = secs;
      if (remaining <= 0) {
        clearInterval(gameTimer);
        endGame();
      }
    }, 100);
  }

  // ── Handle tap during game ──
  function handleGameTap(e) {
    if (!gameActive) return;

    gameTaps++;
    document.getElementById("ee-score").textContent = gameTaps;

    // Spawn 2-3 emojis per tap
    var area = document.getElementById("ee-tap-area");
    var rect = area.getBoundingClientRect();
    var x, y;

    if (e.touches && e.touches.length > 0) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    var count = 2 + Math.floor(Math.random() * 2);
    for (var i = 0; i < count; i++) {
      spawnEmoji(x, y, area);
    }

    // Pulse the score
    var scoreEl = document.getElementById("ee-score");
    scoreEl.classList.remove("ee-bump");
    void scoreEl.offsetWidth; // reflow
    scoreEl.classList.add("ee-bump");
  }

  // ── End game, show results ──
  function endGame() {
    gameActive = false;
    var resultEl = document.getElementById("ee-result");
    var areaEl = document.getElementById("ee-tap-area");
    var finalEl = document.getElementById("ee-final-score");
    var bestEl = document.getElementById("ee-best-score");
    var newRecordEl = document.getElementById("ee-new-record");

    areaEl.style.display = "none";
    resultEl.style.display = "flex";

    finalEl.textContent = gameTaps;

    var isNewRecord = gameTaps > bestScore;
    if (isNewRecord) {
      bestScore = gameTaps;
      localStorage.setItem("ee_best", String(bestScore));
    }
    bestEl.textContent = bestScore;
    newRecordEl.style.display = isNewRecord ? "block" : "none";
  }

  // ── Close modal ──
  function closeGame() {
    gameActive = false;
    clearInterval(gameTimer);
    clearInterval(countdownTimer);
    var modal = document.getElementById("ee-modal");
    if (modal) modal.classList.remove("active");
  }

  // ── Wire up events after DOM ready ──
  document.addEventListener("DOMContentLoaded", function () {
    // Trigger: tap the daily ring
    var ring = document.getElementById("daily-ring");
    if (ring) {
      ring.addEventListener("click", handleRingTap);
    }

    // Game tap area
    var area = document.getElementById("ee-tap-area");
    if (area) {
      area.addEventListener("click", handleGameTap);
      area.addEventListener("touchstart", function (e) {
        e.preventDefault();
        handleGameTap(e);
      }, { passive: false });
    }

    // Close button
    var closeBtn = document.getElementById("ee-close");
    if (closeBtn) closeBtn.addEventListener("click", closeGame);

    // Overlay close
    var modal = document.getElementById("ee-modal");
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === e.currentTarget) closeGame();
      });
    }

    // Retry button
    var retryBtn = document.getElementById("ee-retry");
    if (retryBtn) {
      retryBtn.addEventListener("click", function () {
        gameTaps = 0;
        showCountdown();
      });
    }
  });
})();
