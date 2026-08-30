// ═══════════════════════════════════════════
// API CONFIG
// ═══════════════════════════════════════════
// Every request goes through corsproxy.io, which wraps the real URL to get
// past cross-origin restrictions. A proxy is genuinely required: fetching the
// source directly from the app's origin fails, so it sends no CORS headers of
// its own. Worth re-checking now and then — from the app, in the console:
//   fetch(_h(_B) + "/foodstuff/filter-list?format=json&limit=1&query=tvaroh")
//     .then((r) => r.json()).then(console.log).catch(console.log)
// If that ever starts working, going direct beats the proxy on every count.
//
// The key ships in the client like everything else here. It identifies the app
// rather than protecting anything, and corsproxy.io restricts it by origin, so
// it needs to stay locked to the app's domain there.
var CORSPROXY_KEY = "66c44bdb";
var CORS_PROXY =
  "https://corsproxy.io/?key=" + CORSPROXY_KEY + "&url=";

var _h = (s) => atob(s);
var _B = "aHR0cHM6Ly93d3cua2Fsb3JpY2tldGFidWxreS5jeg==";
var _P1 = "L2F1dG9jb21wbGV0ZS9mb29kc3R1ZmYtYWN0aXZpdHktbWVhbA==";
var _P2 = "L2Zvb2RzdHVmZi9kZXRhaWwv";
var _P3 = "L2Zvb2RzdHVmZi9kZXRhaWwvZm9ybS8=";
var _P4 = "L2Zvb2RzdHVmZi9maWx0ZXItbGlzdA==";
var apiAvailable = true;

function apiUrl(path, params) {
  const qs = new URLSearchParams(params || {}).toString();
  return _h(_B) + path + (qs ? "?" + qs : "");
}

function viaProxy(realUrl) {
  return CORS_PROXY + encodeURIComponent(realUrl);
}

// Fetch a URL through the proxy. Throws on anything that is not a usable
// response, so callers can treat a rejection as "the source is unreachable".
// An abort is the caller replacing its own request, so it is re-thrown as-is
// for them to recognise rather than being reported as a proxy failure.
async function proxyFetch(realUrl, options) {
  let resp;
  try {
    resp = await fetch(viaProxy(realUrl), options);
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new Error("corsproxy.io unreachable: " + e.message);
  }
  if (!resp.ok) {
    // 401 here means the API key is rejected, not that the source is down.
    throw new Error(
      "HTTP " +
        resp.status +
        " from corsproxy.io" +
        (resp.status === 401 ? " (API key rejected)" : ""),
    );
  }
  return resp;
}
