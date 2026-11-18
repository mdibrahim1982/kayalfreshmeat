import { useState, useEffect } from "react";
import Art from "./Art.jsx";
import bannerImg from "./assets/banner.png";
import footerImg from "./assets/footer.png";
import QRCode from "qrcode";
import qrImg from "./assets/gpay-qr.png";
import gpayIcon from "./assets/gpay-icon.png";

// Real photos: drop files named <id>.jpg / .png / .webp into src/assets/products/
const photos = import.meta.glob("./assets/products/*.{jpg,jpeg,png,webp}", { eager: true, import: "default" });
const photoFor = id => Object.entries(photos).find(([p]) => p.split("/").pop().split(".")[0] === id)?.[1];

// Optional: Google Apps Script URL that silently saves every order (see README)
const ORDER_ENDPOINT = import.meta.env.VITE_ORDER_ENDPOINT;
const PHONE = "7601915355", WA = "917601915355";
const PHONE_SHOW = "7601 915355";
const PAYEE = { name: "FATHIMA FARZANA S.J", mobile: "9444492854" };
// Dynamic UPI QR: same payee as the old static QR, but the order amount is filled in automatically
const UPI_ID = "fathma.ibrahm-1@okicici", UPI_AID = "uGICAgIDNwczzAQ";
const upiLink = (amount, orderId) =>
  `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent("Fathima Farzana s.j")}&aid=${UPI_AID}&am=${Number(amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent("Order " + orderId)}`;
const SHOP = "காயல் ஃப்ரெஷ் மீட்";

const PRODUCTS = [
  { id: "beef", name: "பீஃப்", kind: "kg", price: 450, q250: 115 },
  { id: "thanikari", name: "தனி கறி", kind: "kg", price: 500 },
  { id: "kottu", name: "கொத்துக்கறி", kind: "kg", price: 480 },
  { id: "liver", name: "ஈரல்", kind: "kg", price: 450, q250: 115 },
  { id: "brain", name: "மூளை", kind: "unit", variants: [
    { id: "brain-s", label: "சிறியது", price: 120 },
    { id: "brain-l", label: "பெரியது", price: 150 } ] },
  { id: "spleen", name: "பல்குத்தி / மண்ணீரல்", kind: "unit", variants: [
    { id: "spleen-s", label: "சிறியது", price: 120 },
    { id: "spleen-l", label: "பெரியது", price: 150 } ] },
  { id: "kudal", name: "குடல்", kind: "kg", price: 200, min: 1, step: 1 },
  { id: "kidney", name: "கிட்னி", kind: "kg", price: 480, showPrice: 120, per: "250 கிராம்" },
  { id: "tail", name: "வால்", kind: "unit", variants: [
    { id: "tail-s", label: "சிறியது", price: 180 },
    { id: "tail-l", label: "பெரியது", price: 350 } ] },
];

const LINES = PRODUCTS.flatMap(p => p.variants
  ? p.variants.map(v => ({ id: v.id, name: v.label ? `${p.name} – ${v.label}` : p.name, price: v.price, kind: "unit", unit: v.unit || "பீஸ்" }))
  : [{ id: p.id, name: p.name, price: p.price, kind: p.kind, unit: p.unit || "கிலோ", q250: p.q250, min: p.min, step: p.step }]);

const fmtQty = (l, q) => {
  if (l.kind !== "kg") return `${q} ${l.unit}`;
  const g = Math.round(q * 1000), kg = Math.floor(g / 1000), rem = g % 1000;
  if (!kg) return `${rem} கிராம்`;
  return `${kg} கிலோ${rem ? ` ${rem} கிராம்` : ""}`;
};
const nextSunday = (base = new Date()) => { const d = new Date(base), add = (7 - d.getDay()) % 7 || 7; d.setDate(d.getDate() + add); return d; };

const PhonePeIcon = () => (
  <svg className="appicon" viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="24" fill="#5f259f" />
    <path d="M17 12h15v4H22v5h8v4h-8v11h-5z" fill="#fff" />
  </svg>
);
const GPayIcon = () => <img className="appicon" src={gpayIcon} alt="" />;

function Qty({ line, q, set }) {
  const step = line.step || (line.kind === "kg" ? 0.25 : 1);
  return (
    <div className="qty">
      <button aria-label="குறை" onClick={() => { const n = +(q - step).toFixed(2); set(line.id, n < (line.min || 0) ? 0 : Math.max(0, n)); }}>−</button>
      <span>{q ? fmtQty(line, q) : "0"}</span>
      <button aria-label="கூட்டு" onClick={() => set(line.id, q === 0 && line.min ? line.min : +(q + step).toFixed(2))}>+</button>
    </div>
  );
}

const SAVE_KEY = "kfm-order-v1";
const loadSaved = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; } };

export default function App() {
  const saved = useState(loadSaved)[0];
  const [cart, setCart] = useState(saved.cart || {});
  const [f, setF] = useState(saved.f || { name: "", mobile: "", alt: "", address: "", landmark: "", area: "காயல்பட்டணம்", notes: "" });
  const [errs, setErrs] = useState({});
  const [sheet, setSheet] = useState(!!saved.sheet);
  const [step, setStep] = useState(saved.step || 1);
  const [paid, setPaid] = useState(false);
  const [orderId, setOrderId] = useState(saved.orderId || "");
  const [payMobile, setPayMobile] = useState(saved.payMobile || "");
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const t = setInterval(tick, 60000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, []);

  // Keep the order safe if the customer switches to GPay / PhonePe and comes back
  useEffect(() => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ cart, f, sheet, step, orderId, payMobile })); } catch (e) {}
  }, [cart, f, sheet, step, orderId, payMobile]);

  const setQ = (id, q) => setCart(c => ({ ...c, [id]: q }));
  const items = LINES.filter(l => cart[l.id] > 0).map(l => ({ ...l, q: cart[l.id], amt: l.q250 && cart[l.id] === 0.25 ? l.q250 : Math.round(l.price * cart[l.id]) }));
  const total = items.reduce((s, i) => s + i.amt, 0);
  const [qrUrl, setQrUrl] = useState("");
  useEffect(() => {
    if (!sheet || step !== 2 || !total) return;
    let live = true;
    QRCode.toDataURL(upiLink(total, orderId), { width: 480, margin: 2, errorCorrectionLevel: "M" })
      .then(u => { if (live) setQrUrl(u); })
      .catch(() => { if (live) setQrUrl(""); });
    return () => { live = false; };
  }, [sheet, step, total, orderId]);
  const sunStr = nextSunday(now).toLocaleDateString("ta-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const up = k => e => setF({ ...f, [k]: e.target.value });

  const validate = () => {
    const e = {};
    if (!f.name.trim()) e.name = "பெயர் அவசியம்.";
    if (!/^[6-9]\d{9}$/.test(f.mobile.replace(/\s/g, ""))) e.mobile = "சரியான 10 இலக்க மொபைல் எண்ணை உள்ளிடவும்.";
    if (!f.address.trim()) e.address = "டெலிவரி முகவரி அவசியம்.";
    if (!f.area.trim()) e.area = "பகுதி / இடம் அவசியம்.";
    if (!f.landmark.trim()) e.landmark = "அடையாளம் அல்லது கூகுள் மேப் இணைப்பு அவசியம்.";
    setErrs(e);
    return !Object.keys(e).length;
  };
  const open = () => { setStep(1); setPaid(false); setPayMobile(""); setOrderId(String(Date.now()).slice(-6)); setSheet(true); };

  // Silently saves the order the moment the customer moves on (no customer action needed)
  const postOrder = (status) => {
    if (!ORDER_ENDPOINT) return;
    try {
      fetch(ORDER_ENDPOINT, {
        method: "POST", mode: "no-cors", keepalive: true, headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          orderId, status, payMobile, time: new Date().toISOString(), delivery: sunStr, name: f.name, mobile: f.mobile, alt: f.alt,
          address: f.address, area: f.area, landmark: f.landmark, notes: f.notes, total,
          items: items.map(i => `${i.name}: ${fmtQty(i, i.q)} – ₹${i.amt}`).join("\n"),
        }),
      });
    } catch (e) { /* ignore */ }
  };
  const next = () => { if (validate()) { postOrder("பணம் நிலுவை"); setStep(2); } };

  const msg = () => [
    `*புதிய முன்பதிவு – ${SHOP}*`,
    `ஆர்டர் எண்: #${orderId}`,
    `டெலிவரி: ${sunStr} (காலை 9.30 – 11.30)`, "",
    "*பொருட்கள்*",
    ...items.map(i => `• ${i.name}: ${fmtQty(i, i.q)} – ₹${i.amt}`),
    `*மொத்தம்: ₹${total}*`, "",
    "*வாடிக்கையாளர் விவரம்*",
    `பெயர்: ${f.name}`, `மொபைல்: ${f.mobile}`,
    f.alt ? `மாற்று மொபைல்: ${f.alt}` : false,
    `முகவரி: ${f.address}`,
    `அடையாளம்: ${f.landmark}`,
    `பகுதி: ${f.area}`,
    f.notes ? `குறிப்பு: ${f.notes}` : false, "",
    `*பணம் செலுத்தப்பட்டது* ✅ (ஜிபே / போன்பே)`,
    `தொகை: ₹${total}`,
    `பணம் செலுத்திய மொபைல் எண்: ${payMobile}`
  ].filter(x => x !== false).join("\n");

  const payOk = /^[6-9]\d{9}$/.test(payMobile.trim());
  // Only possible after the payment is marked done AND a valid 10-digit paying mobile number is entered
  const sendOrder = () => {
    if (!paid || !payOk) return;
    postOrder("பணம் செலுத்தப்பட்டது");
    window.open(`https://wa.me/${WA}?text=${encodeURIComponent(msg())}`, "_blank");
    setSheet(false); setDone(true); window.scrollTo({ top: 0 });
  };
  const copy = t => { try { navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (e) {} };

  if (done) return (
    <div className="wrap" style={{ textAlign: "center", paddingTop: 60 }}>
      <div style={{ fontSize: 56 }}>✅</div>
      <h2>நன்றி, {f.name}!</h2>
      <p>உங்கள் முன்பதிவு வாட்ஸ்அப்பில் தயாராக உள்ளது. செய்தியை அனுப்பி, பணம் செலுத்திய ஸ்கிரீன்ஷாட்டையும் பகிர்ந்து உறுதிசெய்யவும்.</p>
      <p><b>டெலிவரி:</b> {sunStr}, காலை 9.30 – 11.30</p>
      <div className="cta" style={{ justifyContent: "center" }}>
        <button className="btn" onClick={() => { setDone(false); setCart({}); }}>புதிய ஆர்டர்</button>
        <a className="btn wa" href={`https://wa.me/${WA}`} target="_blank" rel="noreferrer">வாட்ஸ்அப் திறக்க</a>
      </div>
    </div>
  );

  return (
    <>
      <div className="wrap herowrap"><div className="herobox"><img src={bannerImg} alt="காயல் ஃப்ரெஷ் மீட் – ஆட்டு இறைச்சி போன்ற பதத்தில்" /></div></div>
      <div className="wrap">
        <div className="banner">
          <div className="bk">📅 திங்கள் முதல் சனி வரை முன்பதிவு · 🛵 ஞாயிறு காலை 9.30 – 11.30 டெலிவரி</div>
          <div className="when">அடுத்த டெலிவரி தேதி: <b>{sunStr}</b></div>
          <div className="cta">
            <a className="btn" href={`tel:+91${PHONE}`}>📞 {PHONE_SHOW}</a>
            <a className="btn wa" href={`https://wa.me/${WA}`} target="_blank" rel="noreferrer">💬 வாட்ஸ்அப்</a>
          </div>
        </div>

        <h2>எங்கள் பொருட்கள்</h2>
        <div className="grid">
          {PRODUCTS.map(p => {
            const photo = photoFor(p.id);
            return (
              <div className="item" key={p.id}>
                <div className="pic">{photo ? <img src={photo} alt={p.name} loading="lazy" /> : <Art id={p.id} />}</div>
                <div className="body">
                  <h3>{p.name}</h3>
                  {p.sub && <small>{p.sub}</small>}
                  {p.variants ? p.variants.map(v => (
                    <div className="var" key={v.id}>
                      <div className="row"><span>{v.label}</span><span className="price">₹{v.price}</span></div>
                      <div className="row center"><Qty line={LINES.find(x => x.id === v.id)} q={cart[v.id] || 0} set={setQ} /></div>
                    </div>
                  )) : (
                    <>
                      <div className="row"><span className="price">₹{p.showPrice ?? p.price} / {p.per || "கிலோ"}</span></div>
                      <div className="row center"><Qty line={LINES.find(x => x.id === p.id)} q={cart[p.id] || 0} set={setQ} /></div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="disc">📷 <b>குறிப்பு:</b> பொருட்களின் படங்கள் குறிப்புக்காக மட்டுமே. அவை உண்மையான பொருட்கள் அல்ல.</div>
      </div>

      <footer style={{ paddingBottom: items.length ? 96 : undefined }}>
        <img className="foot-img" src={footerImg} alt="தொடர்பு கொள்ள 7601 915355 – கல்யாண, கேட்டரிங் ஆடர்கள் மற்றும் இலவச டோர் டெலிவரி" />
        <div className="contact">
          <b>தொடர்புக்கு</b><br />
          {SHOP}<br />
          சிவன்கோவில் தெரு (அரூஸிய்யா பள்ளி சமீபம்),<br />காயல்பட்டினம்.<br />
          📞 <a href={`tel:+91${PHONE}`}>{PHONE_SHOW}</a> · <a href={`https://wa.me/${WA}`} target="_blank" rel="noreferrer">வாட்ஸ்அப்</a>
        </div>
      </footer>

      {items.length > 0 && !sheet && (
        <div className="cartbar">
          <div><b>{items.length} பொருட்கள்</b><br /><span>மொத்தம் ₹{total}</span></div>
          <button className="btn yel" onClick={open}>ஆர்டர் செய்ய →</button>
        </div>
      )}

      {sheet && (
        <div className="modal" onClick={() => setSheet(false)}>
          <div className="panel" onClick={e => e.stopPropagation()}>
            <div className="phead">
              <div><small>{SHOP}</small><b>{step === 1 ? "🛵 டெலிவரி விவரங்கள்" : "💳 பணம் செலுத்தி ஆர்டர் செய்ய"}</b></div>
              <button className="x" aria-label="மூடு" onClick={() => setSheet(false)}>✕</button>
            </div>
            <div className="steps"><span className="dot on">1</span><i className={step === 2 ? "on" : ""} /><span className={"dot" + (step === 2 ? " on" : "")}>2</span></div>

            {step === 1 ? (
              <>
                <div className="sum">
                  {items.map(i => (
                    <div className="l" key={i.id}><span>{i.name} × {fmtQty(i, i.q)}</span><span>₹{i.amt}</span></div>
                  ))}
                  <div className="l t"><span>மொத்தம்</span><span>₹{total}</span></div>
                </div>
                <label>பெயர் *</label>
                <input value={f.name} onChange={up("name")} placeholder="உங்கள் பெயர்" autoComplete="name" />
                {errs.name && <div className="err">{errs.name}</div>}
                <label>மொபைல் (வாட்ஸ்அப்) *</label>
                <input value={f.mobile} onChange={up("mobile")} inputMode="numeric" maxLength={10} placeholder="10 இலக்க எண்" autoComplete="tel" />
                {errs.mobile && <div className="err">{errs.mobile}</div>}
                <label>வீட்டு எண் / தெரு *</label>
                <input value={f.address} onChange={up("address")} placeholder="வீட்டு எண், தெருவின் பெயர்" />
                {errs.address && <div className="err">{errs.address}</div>}
                <label>பகுதி / இடம் *</label>
                <input value={f.area} onChange={up("area")} placeholder="பகுதி / இடம்" />
                {errs.area && <div className="err">{errs.area}</div>}
                <label>அடையாளம் / கூகுள் மேப் இணைப்பு *</label>
                <input value={f.landmark} onChange={up("landmark")} placeholder="பள்ளிவாசல், கடை அருகில் அல்லது கூகுள் மேப் இணைப்பு" />
                {errs.landmark && <div className="err">{errs.landmark}</div>}
                <details>
                  <summary>+ கூடுதல் விவரங்கள் (விருப்பம்)</summary>
                  <label>மாற்று மொபைல் எண்</label>
                  <input value={f.alt} onChange={up("alt")} inputMode="numeric" maxLength={10} />
                  <label>சிறப்பு குறிப்புகள்</label>
                  <input value={f.notes} onChange={up("notes")} placeholder="பீஸ் அளவு, சுத்தம் போன்றவை" />
                </details>
                <button className="btn big" onClick={next}>அடுத்து: பணம் செலுத்த →</button>
              </>
            ) : (
              <>
                <div className="amt"><small>செலுத்த வேண்டிய தொகை · ஆர்டர் #{orderId}</small>₹{total}</div>
                <div className="qrbox">
                  <img className="qr" src={qrUrl || qrImg} alt="பணம் செலுத்த க்யூஆர் கோடு" />
                  <small>இந்த க்யூஆர் கோடை ஸ்கேன் செய்தால் ₹{total} தொகை தானாக வரும். ஜிபே, போன்பே இரண்டிலும் ஸ்கேன் செய்யலாம்.</small>
                  <a className="btn ghost sm" href={qrUrl || qrImg} download="kayal-fresh-meat-qr.png">⬇ க்யூஆர் படத்தை சேமிக்க</a>
                </div>
                <div className="pay">
                  <div><span>பெயர்</span><b>{PAYEE.name}</b></div>
                  <div><span>மொபைல்</span><b>{PAYEE.mobile}</b> <button className="btn ghost sm" onClick={() => copy(PAYEE.mobile)}>{copied ? "நகலெடுக்கப்பட்டது" : "நகலெடு"}</button></div>
                </div>
                <div className="disc">⚠️ பணம் செலுத்திய பின் <b>இந்தப் பக்கத்திற்கு திரும்பி வந்து</b>, கீழே பணம் செலுத்த பயன்படுத்திய 10 இலக்க மொபைல் எண்ணை உள்ளிட்டு ஆர்டரை வாட்ஸ்அப்பில் அனுப்பவும். பணம் செலுத்தும் வரை ஆர்டரை அனுப்ப முடியாது. நீங்கள் உள்ளிடும் எண், பணம் செலுத்திய ஜிபே / போன்பே எண்ணாக இருக்க வேண்டும்; அதை வைத்தே உங்கள் பணம் சரிபார்க்கப்படும்.</div>
                <label>பணம் செலுத்திய மொபைல் எண் (ஜிபே / போன்பே) – 10 இலக்கம் *</label>
                <input value={payMobile} onChange={e => setPayMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" maxLength={10} placeholder="எ.கா. 9876543210" />
                <small className="hint">பணம் செலுத்த நீங்கள் பயன்படுத்திய ஜிபே / போன்பே மொபைல் எண்ணை உள்ளிடவும்.</small>
                {payMobile && !payOk && <div className="err">சரியான 10 இலக்க மொபைல் எண்ணை உள்ளிடவும்.</div>}
                <label className="chk"><input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} /><span>₹{total} பணம் செலுத்திவிட்டேன்.</span></label>
                <div className="cta">
                  <button className="btn wa" disabled={!paid || !payOk} onClick={sendOrder}>📲 வாட்ஸ்அப்பில் ஆர்டரை அனுப்ப</button>
                  <button className="btn ghost" onClick={() => setStep(1)}>← பின்செல்</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
