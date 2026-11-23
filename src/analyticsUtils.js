// Small pure helpers for the admin dashboard (CSV export and tagged marketing links)

// Cells that start with = + - @ could be run as formulas when a CSV is opened in Excel / Sheets
const guard = v => (typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? "'" + v : v);
const cell = v => {
  const s = String(guard(v === null || v === undefined ? "" : v));
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
// UTF-8 BOM so Excel shows Tamil text correctly
export const toCsv = (header, rows) => "\ufeff" + [header, ...rows].map(r => r.map(cell).join(",")).join("\r\n") + "\r\n";

export const PLATFORMS = [
  { id: "whatsapp", label: "WhatsApp", source: "whatsapp", medium: "social" },
  { id: "facebook", label: "Facebook", source: "facebook", medium: "social" },
  { id: "instagram", label: "Instagram", source: "instagram", medium: "social" },
  { id: "google", label: "Google", source: "google", medium: "cpc" },
  { id: "other", label: "Other", source: "", medium: "referral" },
];

const slug = s => String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

// e.g. https://site/?utm_source=whatsapp&utm_medium=social&utm_campaign=family-group-1
export function buildTaggedLink(base, platformId, campaign, customSource = "") {
  const p = PLATFORMS.find(x => x.id === platformId) || PLATFORMS[4];
  const source = p.id === "other" ? slug(customSource) : p.source;
  const params = new URLSearchParams();
  if (source) params.set("utm_source", source);
  params.set("utm_medium", p.medium);
  const c = slug(campaign);
  if (c) params.set("utm_campaign", c);
  return `${base}?${params.toString()}`;
}
