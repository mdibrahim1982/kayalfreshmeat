import { useState, useEffect, useCallback } from "react";
import { fetchStats } from "./analytics.js";
import "./admin.css";

const KEY_STORE = "kfm_admin_key";
const nf = n => Number(n || 0).toLocaleString("en-IN");
const readKey = () => { try { return sessionStorage.getItem(KEY_STORE) || ""; } catch (e) { return ""; } };
const saveKey = k => { try { k ? sessionStorage.setItem(KEY_STORE, k) : sessionStorage.removeItem(KEY_STORE); } catch (e) { /* ignore */ } };

const ERRORS = {
  unauthorized: "Wrong admin key.",
  not_configured: "Admin key is not set. Add ANALYTICS_ADMIN_KEY in Apps Script > Project Settings > Script properties.",
  no_endpoint: "VITE_ORDER_ENDPOINT is not configured for this build.",
};

export default function AdminAnalytics() {
  const [key, setKey] = useState(readKey);
  const [input, setInput] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async k => {
    setLoading(true); setError("");
    try {
      const r = await fetchStats(k);
      if (r && r.success) { setData(r); }
      else {
        setData(null);
        if (r && (r.error === "unauthorized" || r.error === "not_configured")) { saveKey(""); setKey(""); }
        setError(ERRORS[r && r.error] || "Could not load statistics.");
      }
    } catch (e) {
      setError("Could not reach the server. Check your connection and try again.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (key) load(key); }, [key, load]);
  useEffect(() => {
    const t = document.title;
    document.title = "Admin Analytics";
    return () => { document.title = t; };
  }, []);

  const submit = e => { e.preventDefault(); const k = input.trim(); if (!k) return; saveKey(k); setInput(""); setKey(k); };
  const logout = () => { saveKey(""); setKey(""); setData(null); };

  const cards = data && [
    ["Page views today", "இன்றைய பக்கப் பார்வைகள்", data.pageViewsToday],
    ["Unique visitors today", "இன்றைய தனித்த வருகையாளர்கள்", data.uniqueToday],
    ["Total page views", "மொத்த பக்கப் பார்வைகள்", data.pageViewsTotal],
    ["Total unique visitors", "மொத்த தனித்த வருகையாளர்கள்", data.uniqueTotal],
  ];

  return (
    <div className="adm">
      <div className="adm-head">
        <h1>📊 Admin Analytics</h1>
        <a href="#" className="adm-link">← Shop</a>
      </div>

      {!key && (
        <form className="adm-card adm-login" onSubmit={submit}>
          <label htmlFor="adm-key">Admin key</label>
          <input id="adm-key" type="password" value={input} onChange={e => setInput(e.target.value)} autoComplete="current-password" autoFocus />
          <button className="btn" type="submit">View statistics</button>
        </form>
      )}

      {error && <div className="adm-error" role="alert">{error}</div>}

      {key && (
        <>
          <div className="adm-bar">
            <span>{data ? `Date: ${data.date}` : "\u00a0"}</span>
            <span>
              <button className="btn ghost sm" onClick={() => load(key)} disabled={loading}>{loading ? "Loading…" : "↻ Refresh"}</button>{" "}
              <button className="btn ghost sm" onClick={logout}>Sign out</button>
            </span>
          </div>
          {cards ? (
            <div className="adm-grid">
              {cards.map(([en, ta, n]) => (
                <div className="adm-card adm-stat" key={en}>
                  <div className="adm-num">{nf(n)}</div>
                  <div className="adm-lab">{en}</div>
                  <small>{ta}</small>
                </div>
              ))}
            </div>
          ) : (!error && <div className="adm-card">Loading…</div>)}
          {data && <p className="adm-note">Updated {new Date(data.updatedAt).toLocaleTimeString("en-IN")} · Admin visits are not counted.</p>}
        </>
      )}
    </div>
  );
}
