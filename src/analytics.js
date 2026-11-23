// Lightweight visitor analytics. Counting and storage happen in the Google Sheet (Apps Script backend).
// Only anonymous data is collected: a random visitor ID, the page, the referrer (no query string), UTM tags,
// device / browser / OS names and - only if a lookup service is configured - a coarse city / region / country.
const ENDPOINT = import.meta.env.VITE_ORDER_ENDPOINT;
// Optional (off by default): URL of a JSON IP-location service, e.g. https://ipwho.is/ or https://ipapi.co/json/
// Its response is reduced to city / region / country here; the IP address is never read, sent or stored by this site.
const GEO_URL = import.meta.env.VITE_GEO_LOOKUP_URL;

const VID_KEY = "kfm_visitor_id";
const GEO_KEY = "kfm_geo";
const VID_OK = /^[A-Za-z0-9_-]{8,64}$/;
const HEADERS = { "Content-Type": "text/plain;charset=utf-8" };

function makeId() {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* fall through */ }
  const a = new Uint8Array(16);
  try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256); }
  return Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
}

// Persistent anonymous Visitor ID. If storage is blocked a temporary ID is used (that visit counts as a new visitor).
export function getVisitorId() {
  try {
    let id = localStorage.getItem(VID_KEY);
    if (!id || !VID_OK.test(id)) { id = makeId(); localStorage.setItem(VID_KEY, id); }
    return id;
  } catch (e) {
    return makeId();
  }
}

// ---- device / browser / OS (names only; the raw user-agent is never sent) ----
export function parseUserAgent(ua = navigator.userAgent || "", touchPoints = navigator.maxTouchPoints || 0) {
  const iPadOS = /Macintosh/.test(ua) && touchPoints > 1;
  let device = "Desktop";
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || iPadOS || (/Android/i.test(ua) && !/Mobile/i.test(ua))) device = "Tablet";
  else if (/Mobi|iPhone|iPod|Android/i.test(ua)) device = "Mobile";

  let os = "Other";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua) || iPadOS) os = "iOS";
  else if (/CrOS/i.test(ua)) os = "ChromeOS";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Linux|X11/i.test(ua)) os = "Linux";

  let inApp = "";
  if (/Instagram/i.test(ua)) inApp = "Instagram";
  else if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) inApp = "Facebook";

  let browser = "Other";
  if (inApp) browser = inApp + " in-app";
  else if (/Edg(e|A|iOS)?\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/SamsungBrowser/i.test(ua)) browser = "Samsung Internet";
  else if (/Firefox|FxiOS/i.test(ua)) browser = "Firefox";
  else if (/Chrome|CriOS/i.test(ua)) browser = "Chrome";
  else if (/Safari/i.test(ua)) browser = "Safari";
  return { device, browser, os, inApp };
}

// Referrer without query string / hash. Our own site is not a referrer (that is "Direct").
export function cleanReferrer(ref = document.referrer || "", host = location.host) {
  if (!ref) return "";
  try {
    const u = new URL(ref);
    if (u.host === host) return "";
    return `${u.protocol}//${u.host}${u.pathname}`.slice(0, 300);
  } catch (e) { return ""; }
}

export function readUtm(search = location.search) {
  const p = new URLSearchParams(search);
  const g = k => (p.get(k) || "").slice(0, 80);
  return { utmSource: g("utm_source"), utmMedium: g("utm_medium"), utmCampaign: g("utm_campaign") };
}

// Coarse location, only when a lookup service is configured and answers quickly. Cached for a day.
async function getGeo() {
  if (!GEO_URL) return null;
  try {
    const c = JSON.parse(localStorage.getItem(GEO_KEY) || "null");
    if (c && Date.now() - c.t < 864e5) return c.g;
  } catch (e) { /* ignore */ }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 1500);
  try {
    const j = await (await fetch(GEO_URL, { signal: ctl.signal })).json();
    const g = {
      city: String(j.city || "").slice(0, 60),
      region: String(j.region || j.regionName || j.region_name || "").slice(0, 60),
      country: String(j.country_name || j.country || "").slice(0, 60),
    };
    if (!g.city && !g.region && !g.country) return null;
    try { localStorage.setItem(GEO_KEY, JSON.stringify({ t: Date.now(), g })); } catch (e) { /* ignore */ }
    return g;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// One page view per page load / refresh / reopen. The guards only stop double calls inside a single load
// (React StrictMode, hot reload, duplicate initialisation).
let tracked = false;
export function trackPageView() {
  if (tracked || !ENDPOINT || window.__kfmTracked) return;
  tracked = true;
  window.__kfmTracked = true;
  const send = async () => {
    try {
      const geo = (await getGeo()) || {};
      const ua = parseUserAgent();
      const payload = {
        type: "pageview",
        visitorId: getVisitorId(),
        page: location.pathname || "/",
        referrer: cleanReferrer(),
        ...readUtm(),
        inApp: ua.inApp, device: ua.device, browser: ua.browser, os: ua.os,
        city: geo.city || "", region: geo.region || "", country: geo.country || "",
      };
      fetch(ENDPOINT, { method: "POST", mode: "no-cors", keepalive: true, headers: HEADERS, body: JSON.stringify(payload) }).catch(() => {});
    } catch (e) { /* analytics must never break the shop */ }
  };
  // Never compete with the page itself: start once the page has loaded
  if (document.readyState === "complete") setTimeout(send, 0);
  else window.addEventListener("load", () => setTimeout(send, 0), { once: true });
}

// ---- Admin API. The admin key is only ever sent in the POST body (never in a URL) and is never stored. ----
export async function adminCall(type, key, extra = {}) {
  if (!ENDPOINT) return { success: false, error: "no_endpoint" };
  const res = await fetch(ENDPOINT, { method: "POST", mode: "cors", headers: HEADERS, body: JSON.stringify({ type, key, ...extra }) });
  return res.json();
}
export const fetchStats = key => adminCall("analytics-stats", key);
