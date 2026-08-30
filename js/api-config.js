// ═══════════════════════════════════════════
// API CONFIG
// ═══════════════════════════════════════════
// CORS proxies wrap the real URL to bypass cross-origin restrictions. They are
// tried in order and whichever answers is remembered, so a proxy going down
// costs one slow request instead of taking search down with it.
//
// A proxy really is required: fetching the source directly from the app's
// origin fails, so it sends no CORS headers of its own. Worth re-checking
// before adding another proxy here — from the app, in the console:
//   fetch(_h(_B) + "/foodstuff/filter-list?format=json&limit=1&query=tvaroh")
//     .then((r) => r.json()).then(console.log).catch(console.log)
// If that ever starts working, going direct beats every proxy below.

// corsproxy.io stopped serving anonymous traffic, so it now takes a key. The
// key ships in the client like everything else here — it identifies the app,
// it does not protect anything, and corsproxy.io restricts it by origin.
var CORSPROXY_KEY = "66c44bdb";
var CORSPROXY_IO = "https://corsproxy.io/?key=" + CORSPROXY_KEY + "&url=";

var CORS_PROXIES = [
  CORSPROXY_IO,
  // Keyless fallback for when the quota runs out or the key stops working.
  "https://api.allorigins.win/raw?url=",
];

// The keyless proxy above is GET-only and drops custom request headers. The
// Claude scan needs POST with an x-api-key header, so it goes through the
// keyed proxy directly rather than the failover list.
var CORS_PROXY_POST = CORSPROXY_IO;

var _h = (s) => atob(s);
var _B = "aHR0cHM6Ly93d3cua2Fsb3JpY2tldGFidWxreS5jeg==";
var _P1 = "L2F1dG9jb21wbGV0ZS9mb29kc3R1ZmYtYWN0aXZpdHktbWVhbA==";
var _P2 = "L2Zvb2RzdHVmZi9kZXRhaWwv";
var _P3 = "L2Zvb2RzdHVmZi9kZXRhaWwvZm9ybS8=";
var _P4 = "L2Zvb2RzdHVmZi9maWx0ZXItbGlzdA==";
var apiAvailable = true;

// index of the proxy that answered last; the next call starts there
var _corsProxyIdx = 0;

function apiUrl(path, params) {
  const qs = new URLSearchParams(params || {}).toString();
  return _h(_B) + path + (qs ? "?" + qs : "");
}

function viaProxy(proxy, realUrl) {
  return proxy + encodeURIComponent(realUrl);
}

// Fetch through the CORS proxies, last known good one first, falling over to
// the rest. Rejects only once every proxy has failed. An aborted request is
// the caller replacing it, not a proxy fault, so it is re-thrown at once
// instead of burning the remaining proxies on a request nobody wants.
async function proxyFetch(realUrl, options) {
  let lastError = null;
  for (let i = 0; i < CORS_PROXIES.length; i++) {
    const idx = (_corsProxyIdx + i) % CORS_PROXIES.length;
    let resp;
    try {
      resp = await fetch(viaProxy(CORS_PROXIES[idx], realUrl), options);
    } catch (e) {
      if (e.name === "AbortError") throw e;
      lastError = e;
      continue;
    }
    if (!resp.ok) {
      lastError = new Error(`HTTP ${resp.status} from ${CORS_PROXIES[idx]}`);
      continue;
    }
    if (idx !== _corsProxyIdx) {
      console.log("CORS proxy switched to", CORS_PROXIES[idx]);
      _corsProxyIdx = idx;
    }
    return resp;
  }
  throw lastError || new Error("all CORS proxies failed");
}
