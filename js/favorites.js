// ═══════════════════════════════════════════
// FAVORITES
// ═══════════════════════════════════════════
var AUTO_FAV_THRESHOLD = 3;

function isFavorite(name) {
  return state.favorites.includes(name);
}

function toggleFavorite(name) {
  const idx = state.favorites.indexOf(name);
  if (idx >= 0) {
    state.favorites.splice(idx, 1);
    delete state.foodUsage[name];
    showToast("Odebráno z oblíbených");
  } else {
    state.favorites.push(name);
    showToast("Přidáno do oblíbených");
  }
  saveState();
}

