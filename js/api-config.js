// ═══════════════════════════════════════════
// API CONFIG
// ═══════════════════════════════════════════
// CORS proxy wraps the real URL to bypass cross-origin restrictions
var CORS_PROXY = "https://corsproxy.io/?url=";
var _h = (s) => atob(s);
var _B = "aHR0cHM6Ly93d3cua2Fsb3JpY2tldGFidWxreS5jeg==";
var _P1 = "L2F1dG9jb21wbGV0ZS9mb29kc3R1ZmYtYWN0aXZpdHktbWVhbA==";
var _P2 = "L2Zvb2RzdHVmZi9kZXRhaWwv";
var _P3 = "L2Zvb2RzdHVmZi9kZXRhaWwvZm9ybS8=";
var apiAvailable = true;

function proxyUrl(path, params) {
  const qs = new URLSearchParams(params).toString();
  const realUrl = _h(_B) + path + (qs ? "?" + qs : "");
  return CORS_PROXY + encodeURIComponent(realUrl);
}

