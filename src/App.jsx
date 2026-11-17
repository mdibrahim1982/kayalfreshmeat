import { useState } from "react";
import Art from "./Art.jsx";
import bannerImg from "./assets/banner.png";
import footerImg from "./assets/footer.png";

// Real photos: drop files named <id>.jpg / .png / .webp into src/assets/products/
const photos = import.meta.glob("./assets/products/*.{jpg,jpeg,png,webp}", { eager: true, import: "default" });
const photoFor = id => Object.entries(photos).find(([p]) => p.split("/").pop().split(".")[0] === id)?.[1];

const PHONE = "7601915355", WA = "917601915355";
const PHONE_SHOW = "7601 915355";
const PAYEE = { name: "FATHIMA FARZANA S.J", mobile: "9444492854" };
const SHOP = "காயல் ஃப்ரெஷ் மீட்";

const PRODUCTS = [
  { id: "beef", name: "பீஃப்", kind: "kg", price: 450, q250: 115 },
  { id: "thanikari", name: "தனி கறி", kind: "kg", price: 480 },
  { id: "kottu", name: "கொத்துக்கறி", kind: "kg", price: 480 },
  { id: "liver", name: "ஈரல்", kind: "kg", price: 450, q250: 115 },
  { id: "brain", name: "மூளை", kind: "unit", variants: [
    { id: "brain-s", label: "சிறியது", price: 120 },
    { id: "brain-l", label: "பெரியது", price: 150 } ] },
  { id: "spleen", name: "பல்குத்தி / மண்ணீரல்", kind: "unit", variants: [
    { id: "spleen-s", label: "சிறியது", price: 150 },
    { id: "spleen-l", label: "பெரியது", price: 200 } ] },
  { id: "kudal", name: "குடல்", kind: "kg", price: 200, min: 1 },
  { id: "kidney", name: "கிட்னி", kind: "unit", price: 120, per: "கால் கிலோ", unit: "கால் கிலோ" },
  { id: "tail", name: "வால்", kind: "unit", variants: [
    { id: "tail-s", label: "சிறியது", price: 180 },
    { id: "tail-l", label: "பெரியது", price: 350 } ] },
];

const LINES = PRODUCTS.flatMap(p => p.variants
  ? p.variants.map(v => ({ id: v.id, name: v.label ? `${p.name} – ${v.label}` : p.name, price: v.price, kind: "unit", unit: v.unit || "பீஸ்" }))
  : [{ id: p.id, name: p.name, price: p.price, kind: p.kind, unit: p.unit || "கிலோ", q250: p.q250, min: p.min }]);

const fmtQty = (l, q) => {
  if (l.kind !== "kg") return `${q} ${l.unit}`;
  const g = Math.round(q * 1000), kg = Math.floor(g / 1000), rem = g % 1000;
  if (!kg) return `${rem} கிராம்`;
  return `${kg} கிலோ${rem ? ` ${rem} கிராம்` : ""}`;
};
const nextSunday = () => { const d = new Date(), add = (7 - d.getDay()) % 7 || 7; d.setDate(d.getDate() + add); return d; };

function Qty({ line, q, set }) {
  const step = line.kind === "kg" ? 0.25 : 1;
  return (
    <div className="qty">
      <button aria-label="குறை" onClick={() => { const n = +(q - step).toFixed(2); set(line.id, n < (line.min || 0) ? 0 : Math.max(0, n)); }}>−</button>
      <span>{q ? fmtQty(line, q) : "0"}</span>
      <button aria-label="கூட்டு" onClick={() => set(line.id, q === 0 && line.min ? line.min : +(q + step).toFixed(2))}>+</button>
    </div>
  );
}

export default function App() {
  const [cart, setCart] = useState({});
  const [f, setF] = useState({ name: "", mobile: "", alt: "", address: "", landmark: "", area: "காயல்பட்டணம்", notes: "" });
  const [errs, setErrs] = useState({});
  const [sheet, setSheet] = useState(false);
  const [step, setStep] = useState(1);
  const [paid, setPaid] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  const setQ = (id, q) => setCart(c => ({ ...c, [id]: q }));
  const items = LINES.filter(l => cart[l.id] > 0).map(l => ({ ...l, q: cart[l.id], amt: l.q250 && cart[l.id] === 0.25 ? l.q250 : Math.round(l.price * cart[l.id]) }));
  const total = items.reduce((s, i) => s + i.amt, 0);
  const sunStr = nextSunday().toLocaleDateString("ta-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const isSunday = new Date().getDay() === 0;
  const up = k => e => setF({ ...f, [k]: e.target.value });

  const validate = () => {
    const e = {};
    if (!f.name.trim()) e.name = "பெயர் அவசியம்.";
    if (!/^[6-9]\d{9}$/.test(f.mobile.replace(/\s/g, ""))) e.mobile = "சரியான 10 இலக்க மொபைல் எண்ணை உள்ளிடவும்.";
    if (!f.address.trim()) e.address = "டெலிவரி முகவரி அவசியம்.";
    if (!f.area.trim()) e.area = "பகுதி / இடம் அவசியம்.";
    setErrs(e);
    return !Object.keys(e).length;
  };
  const open = () => { setStep(1); setPaid(false); setSheet(true); };
  const next = () => { if (validate()) setStep(2); };

  const msg = () => [
    `*புதிய முன்பதிவு – ${SHOP}*`,
    `டெலிவரி: ${sunStr} (காலை 9.30 – 11.15)`, "",
    "*பொருட்கள்*",
    ...items.map(i => `• ${i.name}: ${fmtQty(i, i.q)} – ₹${i.amt}`),
    `*மொத்தம்: ₹${total}*`, "",
    "*வாடிக்கையாளர் விவரம்*",
    `பெயர்: ${f.name}`, `மொபைல்: ${f.mobile}`,
    f.alt ? `மாற்று மொபைல்: ${f.alt}` : false,
    `முகவரி: ${f.address}`,
    f.landmark ? `அடையாளம்: ${f.landmark}` : false,
    `பகுதி: ${f.area}`,
    f.notes ? `குறிப்பு: ${f.notes}` : false, "",
    `பணம் செலுத்தப்பட்டது (ஜிபே / போன்பே) – ${PAYEE.name} (${PAYEE.mobile}). பணம் செலுத்திய ஸ்கிரீன்ஷாட்டை அனுப்புகிறேன்.`
  ].filter(x => x !== false).join("\n");

  const send = () => {
    window.open(`https://wa.me/${WA}?text=${encodeURIComponent(msg())}`, "_blank");
    setSheet(false); setDone(true); window.scrollTo({ top: 0 });
  };
  const copy = t => { try { navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (e) {} };

  if (done) return (
    <div className="wrap" style={{ textAlign: "center", paddingTop: 60 }}>
      <div style={{ fontSize: 56 }}>✅</div>
      <h2>நன்றி, {f.name}!</h2>
      <p>உங்கள் முன்பதிவு வாட்ஸ்அப்பில் தயாராக உள்ளது. செய்தியை அனுப்பி, பணம் செலுத்திய ஸ்கிரீன்ஷாட்டையும் பகிர்ந்து உறுதிசெய்யவும்.</p>
      <p><b>டெலிவரி:</b> {sunStr}, காலை 9.30 – 11.15</p>
      <div className="disc">வாடிக்கையாளரின் இடம் மற்றும் தூரத்தைப் பொறுத்து டெலிவரி நேரம் மாறுபடலாம்.</div>
      <div className="cta" style={{ justifyContent: "center" }}>
        <button className="btn" onClick={() => { setDone(false); setCart({}); }}>புதிய ஆர்டர்</button>
        <a className="btn wa" href={`https://wa.me/${WA}`} target="_blank" rel="noreferrer">வாட்ஸ்அப் திறக்க</a>
      </div>
    </div>
  );

  return (
    <>
      <img className="hero" src={bannerImg} alt="காயல் ஃப்ரெஷ் மீட் – ஆட்டு இறைச்சி போன்ற பதத்தில்" />
      <div className="wrap">
        <div className="banner">
          <div className="bk">📅 திங்கள் முதல் சனி வரை முன்பதிவு</div>
          <div className="bk">🛵 ஞாயிறு காலை 9.30 – 11.15 டெலிவரி</div>
          <div className="when">{isSunday ? "அடுத்த ஞாயிறுக்கு முன்பதிவு செய்யவும்: " : "உங்கள் ஆர்டர் டெலிவரி தேதி: "}<b>{sunStr}</b></div>
          <div className="cta">
            <a className="btn" href={`tel:+91${PHONE}`}>📞 அழைக்க {PHONE_SHOW}</a>
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
                      <div className="row"><span className="price">₹{p.price} / {p.per || "கிலோ"}</span></div>
                      {p.min && <div className="minnote">குறைந்தபட்சம் {p.min} கிலோ</div>}
                      <div className="row center"><Qty line={LINES.find(x => x.id === p.id)} q={cart[p.id] || 0} set={setQ} /></div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="disc">⚠️ <b>குறிப்பு:</b> வாடிக்கையாளரின் இடம் மற்றும் தூரத்தைப் பொறுத்து டெலிவரி நேரம் மாறுபடலாம்.</div>
      </div>

      <footer style={{ paddingBottom: items.length ? 96 : undefined }}>
        <img className="foot-img" src={footerImg} alt="தொடர்பு கொள்ள 7601 915355 – கல்யாண, கேட்டரிங் ஆடர்கள் மற்றும் இலவச டோர் டெலிவரி" />
        <div className="contact">
          <b>தொடர்புக்கு</b><br />
          {SHOP}<br />
          சிவன்கோவில் தெரு (ஆரியூசியா பள்ளி சமீபம்),<br />காயல்பட்டினம்.<br />
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
              <div><small>{SHOP}</small><b>{step === 1 ? "🛵 டெலிவரி விவரங்கள்" : "💳 பணம் செலுத்த"}</b></div>
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
                <details>
                  <summary>+ கூடுதல் விவரங்கள் (விருப்பம்)</summary>
                  <label>மாற்று மொபைல் எண்</label>
                  <input value={f.alt} onChange={up("alt")} inputMode="numeric" maxLength={10} />
                  <label>அடையாளம் / கூகுள் மேப் இணைப்பு</label>
                  <input value={f.landmark} onChange={up("landmark")} placeholder="பள்ளிவாசல், கடை அருகில்" />
                  <label>சிறப்பு குறிப்புகள்</label>
                  <input value={f.notes} onChange={up("notes")} placeholder="பீஸ் அளவு, சுத்தம் போன்றவை" />
                </details>
                <div className="disc">⚠️ வாடிக்கையாளரின் இடம் மற்றும் தூரத்தைப் பொறுத்து டெலிவரி நேரம் மாறுபடலாம்.</div>
                <button className="btn big" onClick={next}>அடுத்து: பணம் செலுத்த →</button>
              </>
            ) : (
              <>
                <div className="amt"><small>செலுத்த வேண்டிய தொகை</small>₹{total}</div>
                <p style={{ margin: "12px 0 4px" }}>ஆர்டர் செய்யும் முன், <b>₹{total}</b> தொகையை <b>ஜிபே / போன்பே</b> மூலம் கீழ்க்கண்ட எண்ணுக்கு செலுத்தவும்:</p>
                <div className="pay">
                  <div><span>பெயர்</span><b>{PAYEE.name}</b></div>
                  <div><span>மொபைல்</span><b>{PAYEE.mobile}</b> <button className="btn ghost sm" onClick={() => copy(PAYEE.mobile)}>{copied ? "நகலெடுக்கப்பட்டது" : "நகலெடு"}</button></div>
                </div>
                <div className="disc">பணம் செலுத்திய பின், வாட்ஸ்அப்பில் பகிர ஸ்கிரீன்ஷாட்டை தயாராக வைத்திருக்கவும்.</div>
                <label className="chk"><input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} /><span>₹{total} பணம் செலுத்திவிட்டேன்.</span></label>
                <div className="cta">
                  <button className="btn wa" disabled={!paid} onClick={send}>வாட்ஸ்அப்பில் ஆர்டர் செய்ய</button>
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
