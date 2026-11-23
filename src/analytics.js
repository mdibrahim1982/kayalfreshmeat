// Lightweight website analytics (counts are kept in the Google Sheet by the Apps Script backend)
const ENDPOINT = import.meta.env.VITE_ORDER_ENDPOINT;
const VID_KEY = "kfm_visitor_id";
const VID_OK = /^[A-Za-z0-9_-]{8,64}$/;
const HEADERS = { "Content-Type": "text/plain;charset=utf-8" };

function makeId() {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* fall through */ }
  const a = new Uint8Array(16);
  try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256); }
  return Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
}

// Persistent Visitor ID. If storage is blocked, a temporary ID is used (that visit just counts as a new visitor).
export function getVisitorId() {
  try {
    let id = localStorage.getItem(VID_KEY);
    if (!id || !VID_OK.test(id)) { id = makeId(); localStorage.setItem(VID_KEY, id); }
    return id;
  } catch (e) {
    return makeId();
  }
}

// One page view per page load / refresh / reopen. The flag only guards against double calls within one load.
let tracked = false;
export function trackPageView() {
  if (tracked || !ENDPOINT) return;
  tracked = true;
  try {
    fetch(ENDPOINT, { method: "POST", mode: "no-cors", keepalive: true, headers: HEADERS, body: JSON.stringify({ type: "pageview", visitorId: getVisitorId() }) })
      .catch(() => {});
  } catch (e) { /* analytics must never break the shop */ }
}

// Admin dashboard numbers
export async function fetchStats(key) {
  if (!ENDPOINT) return { success: false, error: "no_endpoint" };
  const res = await fetch(ENDPOINT, { method: "POST", mode: "cors", headers: HEADERS, body: JSON.stringify({ type: "analytics-stats", key }) });
  return res.json();
}
