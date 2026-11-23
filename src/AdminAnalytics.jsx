import { useState, useEffect, useCallback } from "react";
import { fetchStats, adminCall } from "./analytics.js";
import { toCsv, PLATFORMS, buildTaggedLink } from "./analyticsUtils.js";
import "./admin.css";

const RESET_TODAY = "RESET TODAY";
const RESET_ALL = "RESET ALL ANALYTICS";
const nf = n => Number(n || 0).toLocaleString("en-IN");

const ERRORS = {
  unauthorized: "Wrong admin key.",
  not_configured: "Admin key is not set. Add ANALYTICS_ADMIN_KEY in Apps Script > Project Settings > Script properties.",
  too_many_attempts: "Too many wrong attempts. Please wait 10 minutes and try again.",
  confirmation_required: "Confirmation text did not match.",
  no_endpoint: "VITE_ORDER_ENDPOINT is not configured for this build.",
};

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function AdminAnalytics() {
  // The admin key lives in memory only: it is never put in the URL, storage or the bundle.
  const [key, setKey] = useState("");
  const [input, setInput] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [modal, setModal] = useState(null); // "today" | "all"
  const [typed, setTyped] = useState("");
  const [platform, setPlatform] = useState("whatsapp");
  const [campaign, setCampaign] = useState("");
  const [custom, setCustom] = useState("");
  const [copied, setCopied] = useState(false);

  const fail = r => {
    const code = r && r.error;
    if (code === "unauthorized" || code === "not_configured" || code === "too_many_attempts") { setKey(""); setData(null); }
    setError(ERRORS[code] || "Something went wrong. Please try again.");
  };

  const load = useCallback(async k => {
    setLoading(true); setError("");
    try {
      const r = await fetchStats(k);
      if (r && r.success) setData(r); else fail(r);
    } catch (e) {
      setError("Could not reach the server. Check your connection and try again.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (key) load(key); }, [key, load]);
  useEffect(() => {
    const t = document.title; document.title = "Admin Analytics";
    return () => { document.title = t; };
  }, []);

  const submit = e => { e.preventDefault(); const k = input.trim(); if (k) { setInput(""); setKey(k); } };

  async function exportPart(part) {
    setBusy("export-" + part); setError(""); setNotice("");
    try {
      let offset = 0, header = null; const rows = [];
      for (;;) {
        const r = await adminCall("analytics-export", key, { part, offset, limit: 2000 });
        if (!r.success) { fail(r); setBusy(""); return; }
        header = r.header; rows.push(...r.rows); offset = r.next;
        if (r.done) break;
      }
      const stamp = (data && data.date) || new Date().toISOString().slice(0, 10);
      download(`kayal-analytics-${part}-${stamp}.csv`, toCsv(header, rows));
      setNotice(`Exported ${nf(rows.length)} ${part === "daily" ? "daily rows" : "activity rows"}.`);
    } catch (e) { setError("Export failed. Please try again."); }
    setBusy("");
  }

  async function doReset(kind) {
    setBusy("reset"); setError(""); setNotice("");
    try {
      const r = await adminCall(kind === "all" ? "analytics-reset-all" : "analytics-reset-today", key, { confirm: kind === "all" ? typed : RESET_TODAY });
      if (!r.success) { fail(r); }
      else { setNotice(kind === "all" ? "All analytics were reset." : "Today's counts were reset."); setModal(null); setTyped(""); await load(key); }
    } catch (e) { setError("Reset failed. Please try again."); }
    setBusy("");
  }

  const base = `${window.location.origin}${window.location.pathname}`;
  const link = buildTaggedLink(base, platform, campaign, custom);
  const copyLink = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (e) { /* ignore */ } };

  const cards = data && [
    ["Page views today", "இன்றைய பக்கப் பார்வைகள்", data.pageViewsToday],
    ["Unique visitors today", "இன்றைய தனித்த வருகையாளர்கள்", data.uniqueToday],
    ["Lifetime page views", "மொத்த பக்கப் பார்வைகள்", data.pageViewsTotal],
    ["Lifetime unique visitors", "மொத்த தனித்த வருகையாளர்கள்", data.uniqueTotal],
  ];
  const sources = data ? Object.entries(data.sourcesToday || {}).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="adm">
      <div className="adm-head">
        <h1>📊 Visitor Activity Monitor</h1>
        <a href="#" className="adm-link">← Shop</a>
      </div>

      {!key && (
        <form className="adm-card adm-login" onSubmit={submit}>
          <label htmlFor="adm-key">Admin key</label>
          <input id="adm-key" type="password" value={input} onChange={e => setInput(e.target.value)} autoComplete="off" autoFocus />
          <button className="btn" type="submit">View statistics</button>
          <small>The key is kept in memory only and must be entered again after a refresh.</small>
        </form>
      )}

      {error && <div className="adm-error" role="alert">{error}</div>}
      {notice && <div className="adm-ok" role="status">{notice}</div>}

      {key && (
        <>
          <div className="adm-bar">
            <span>{data ? `Today: ${data.date} (IST)` : "\u00a0"}</span>
            <span>
              <button className="btn ghost sm" onClick={() => load(key)} disabled={loading}>{loading ? "Loading…" : "↻ Refresh"}</button>{" "}
              <button className="btn ghost sm" onClick={() => { setKey(""); setData(null); setNotice(""); }}>Sign out</button>
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

          {data && (
            <>
              <h2 className="adm-h">Traffic sources today</h2>
              <div className="adm-card">
                {sources.length ? (
                  <div className="adm-chips">{sources.map(([s, n]) => <span className="adm-chip" key={s}>{s} <b>{nf(n)}</b></span>)}</div>
                ) : <small>No visits recorded today.</small>}
              </div>

              <h2 className="adm-h">Daily statistics <small>(latest {data.daily.length} of {nf(data.dailyCount)} days)</small></h2>
              <div className="adm-card adm-scroll">
                <table className="adm-table">
                  <thead><tr><th>Date</th><th>Page views</th><th>Unique</th><th>New</th></tr></thead>
                  <tbody>
                    {data.daily.map(d => <tr key={d.date}><td>{d.date}</td><td>{nf(d.views)}</td><td>{nf(d.unique)}</td><td>{nf(d.fresh)}</td></tr>)}
                    {!data.daily.length && <tr><td colSpan="4">No records yet.</td></tr>}
                  </tbody>
                </table>
              </div>

              <h2 className="adm-h">Recent visitor activity <small>(last {data.recent.length})</small></h2>
              <div className="adm-card adm-scroll">
                <table className="adm-table adm-wide">
                  <thead><tr><th>Date</th><th>Time</th><th>Visitor</th><th>Source</th><th>Device</th><th>Browser</th><th>OS</th><th>Location</th><th>Page</th></tr></thead>
                  <tbody>
                    {data.recent.map((r, i) => (
                      <tr key={i}>
                        <td>{r.date}</td><td>{r.time}</td><td>{r.visitor}</td>
                        <td title={r.referrer || ""}>{r.source}</td><td>{r.device}</td><td>{r.browser}</td><td>{r.os}</td>
                        <td>{[r.city, r.region, r.country].filter(Boolean).join(", ") || "—"}</td><td>{r.page}</td>
                      </tr>
                    ))}
                    {!data.recent.length && <tr><td colSpan="9">No activity yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h2 className="adm-h">Tagged campaign link</h2>
          <div className="adm-card adm-tag">
            <label htmlFor="adm-plat">Platform</label>
            <select id="adm-plat" value={platform} onChange={e => setPlatform(e.target.value)}>
              {PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            {platform === "other" && (<><label htmlFor="adm-src">Source name</label><input id="adm-src" value={custom} onChange={e => setCustom(e.target.value)} placeholder="e.g. newsletter" /></>)}
            <label htmlFor="adm-camp">Campaign / group tag</label>
            <input id="adm-camp" value={campaign} onChange={e => setCampaign(e.target.value)} placeholder="e.g. family-group-1" />
            <input className="adm-linkbox" readOnly value={link} onFocus={e => e.target.select()} aria-label="Tagged link" />
            <button className="btn ghost sm" onClick={copyLink}>{copied ? "✓ Copied" : "Copy link"}</button>
            <small>Visits through this link are labelled with the platform and tag. Only a uniquely tagged link (a different tag for each WhatsApp group, for example) can tell groups apart.</small>
          </div>

          <h2 className="adm-h">Export &amp; reset</h2>
          <div className="adm-card">
            <div className="adm-actions">
              <button className="btn ghost sm" disabled={!!busy} onClick={() => exportPart("activity")}>{busy === "export-activity" ? "Exporting…" : "⬇ Export activity log (CSV)"}</button>
              <button className="btn ghost sm" disabled={!!busy} onClick={() => exportPart("daily")}>{busy === "export-daily" ? "Exporting…" : "⬇ Export daily statistics (CSV)"}</button>
            </div>
            <div className="adm-actions">
              <button className="btn warn sm" disabled={!!busy} onClick={() => setModal("today")}>Reset today's counts</button>
              <button className="btn danger sm" disabled={!!busy} onClick={() => { setTyped(""); setModal("all"); }}>Reset all analytics</button>
            </div>
            <small>Export before resetting. Resetting today's counts keeps the history and the lifetime totals.</small>
          </div>
        </>
      )}

      {modal && (
        <div className="adm-modal" role="dialog" aria-modal="true" onClick={() => !busy && setModal(null)}>
          <div className="adm-dialog" onClick={e => e.stopPropagation()}>
            {modal === "today" ? (
              <>
                <h3>Reset today's counts?</h3>
                <p>Today's page views and unique visitors go back to 0. Earlier days, the activity log and the lifetime totals are kept.</p>
                <div className="adm-actions">
                  <button className="btn warn" disabled={!!busy} onClick={() => doReset("today")}>{busy === "reset" ? "Resetting…" : "Yes, reset today"}</button>
                  <button className="btn ghost" disabled={!!busy} onClick={() => setModal(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <h3>Reset ALL analytics?</h3>
                <p>This permanently deletes every daily record, the visitor list, the lifetime totals and the whole activity log. Orders and products are not affected. Export first if you need the data.</p>
                <label htmlFor="adm-confirm">Type <b>{RESET_ALL}</b> to confirm</label>
                <input id="adm-confirm" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" />
                <div className="adm-actions">
                  <button className="btn danger" disabled={!!busy || typed !== RESET_ALL} onClick={() => doReset("all")}>{busy === "reset" ? "Resetting…" : "Delete everything"}</button>
                  <button className="btn ghost" disabled={!!busy} onClick={() => setModal(null)}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
