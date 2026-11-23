import { useState, useEffect, useRef } from "react";
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
// Delivery charge: ₹15 when the order is a single 250 gm item, or when the order value is ₹125 or less
const DELIVERY_CHARGE = 15, SMALL_ORDER_LIMIT = 125;
const PHONE = "7601915355", WA = "917601915355";
const PHONE_SHOW = "7601 915355";
const PAYEE = { name: "FATHIMA FARZANA S.J", mobile: "9444492854" };
// Dynamic UPI QR: same payee as the old static QR, but the order amount is filled in automatically
const UPI_ID = "fathma.ibrahm-1@okicici", UPI_AID = "uGICAgIDNwczzAQ";
const upiLink = (amount, orderId) =>
  `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent("Fathima Farzana s.j")}&aid=${UPI_AID}&am=${Number(amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent("Order " + orderId)}`;
const SHOP = "காயல் ஃப்ரெஷ் மீட்";
const COD_STATUS = "கேஷ் ஆன் டெலிவரி"; // not "pending", so stock is counted for COD orders
const FIELD_ORDER = ["name", "mobile", "address", "area", "landmark"];

const PRODUCTS = [
  { id: "beef", name: "பீஃப்", kind: "kg", price: 450, q250: 115 },
  { id: "thanikari", name: "தனி கறி", kind: "kg", price: 500 },
  { id: "kottu", name: "கொத்துக்கறி", kind: "kg", price: 500 },
  { id: "liver", name: "ஈரல்", kind: "kg", price: 450, q250: 115 },
  { id: "brain", name: "மூளை", kind: "unit", variants: [
    { id: "brain-s", label: "சிறியது", price: 120 },
    { id: "brain-l", label: "பெரியது", price: 150 } ] },
  { id: "spleen", name: "பல்குத்தி / மண்ணீரல்", kind: "unit", variants: [
    { id: "spleen-s", label: "சிறியது", price: 100 },
    { id: "spleen-l", label: "பெரியது", price: 120 } ] },
  { id: "kudal", name: "குடல்", kind: "kg", price: 200, min: 0.5, step: 0.25 },
  { id: "kidney", name: "கிட்னி", kind: "kg", price: 480, showPrice: 120, per: "250 கிராம்" },
  { id: "tail", name: "வால்", kind: "unit", variants: [
    { id: "tail-s", label: "சிறியது", price: 200 },
    { id: "tail-l", label: "பெரியது", price: 300 } ] },
];

const LINES = PRODUCTS.flatMap(p => p.variants
  ? p.variants.map(v => ({ id: v.id, pid: p.id, name: v.label ? `${p.name} – ${v.label}` : p.name, price: v.price, kind: "unit", unit: v.unit || "பீஸ்" }))
  : [{ id: p.id, pid: p.id, name: p.name, price: p.price, kind: p.kind, unit: p.unit || "கிலோ", q250: p.q250, min: p.min, step: p.step }]);

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

function Qty({ line, q, set, disabled = false }) {
  const step = line.step || (line.kind === "kg" ? 0.25 : 1);

  return (
    <div className="qty">
      <button
        aria-label="குறை"
        disabled={disabled}
        onClick={() => {
          const n = +(q - step).toFixed(2);
          set(line.id, n < (line.min || 0) ? 0 : Math.max(0, n));
        }}
      >−</button>

      <span>{q ? fmtQty(line, q) : "0"}</span>

      <button
        aria-label="கூட்டு"
        disabled={disabled}
        onClick={() =>
          set(line.id, q === 0 && line.min ? line.min : +(q + step).toFixed(2))
        }
      >+</button>
    </div>
  );
}

const SAVE_KEY = "kfm-order-v1";
const loadSaved = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; } };

export default function App() {
  const saved = useState(loadSaved)[0];
  const [cart, setCart] = useState({}); // cart is never restored: a refresh starts empty
  const [f, setF] = useState(saved.f || { name: "", mobile: "", alt: "", address: "", landmark: "", area: "காயல்பட்டணம்", notes: "" });
  const [errs, setErrs] = useState({});
  const [sheet, setSheet] = useState(false);
  const [step, setStep] = useState(1);
  const [paid, setPaid] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [payMobile, setPayMobile] = useState("");
  const [payMode, setPayMode] = useState(saved.payMode === "cod" ? "cod" : "online"); // "online" (GPay/PhonePe QR) or "cod"
  const fieldRefs = useRef({});
  const [done, setDone] = useState(false);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const t = setInterval(tick, 60000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, []);

  // Remember only the customer's delivery details and payment mode for next time (never the cart)
  useEffect(() => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ f, payMode })); } catch (e) {}
  }, [f, payMode]);

  const setQ = (id, q) => setCart(c => ({ ...c, [id]: q }));
  const items = LINES.filter(l => cart[l.id] > 0).map(l => ({ ...l, q: cart[l.id], amt: l.q250 && cart[l.id] === 0.25 ? l.q250 : Math.round(l.price * cart[l.id]) }));
  const subtotal = items.reduce((s, i) => s + i.amt, 0);
  const singleQuarterKg = items.length === 1 && items[0].kind === "kg" && items[0].q === 0.25;
  const deliveryCharge = subtotal > 0 && (singleQuarterKg || subtotal <= SMALL_ORDER_LIMIT) ? DELIVERY_CHARGE : 0;
  const total = subtotal + deliveryCharge; // payable amount (QR, WhatsApp message and Orders sheet all use this)
  useEffect(() => { if (sheet && items.length === 0) setSheet(false); }, [sheet, items.length]);

  // Floating arrow (bottom right): appears once the first product has scrolled out of view
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const first = document.querySelector("#products .item");
      setShowTop(!!first && first.getBoundingClientRect().top < -40);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [done]);
  const goFirstProduct = () => {
    const first = document.querySelector("#products .item");
    if (first) first.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const [qrUrl, setQrUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [weeklyAvailability, setWeeklyAvailability] = useState({});

useEffect(() => {
  if (!ORDER_ENDPOINT) return;

  const callbackName = "kfmAvailability_" + Date.now();
  const script = document.createElement("script");

  window[callbackName] = data => {
    if (data && data.success && Array.isArray(data.products)) {
      const stock = {};

      data.products.forEach(p => {
        stock[p.name] = {
          limit: p.limit,
          remaining: p.remaining
        };
      });

      setWeeklyAvailability(stock);

      // Remove sold-out products from any saved cart.
      setCart(current => {
        const updated = { ...current };

        PRODUCTS.forEach(p => {
          const item = stock[p.name];

          if (item && item.limit !== null && item.remaining <= 0) {
            if (p.variants) {
              p.variants.forEach(v => updated[v.id] = 0);
            } else {
              updated[p.id] = 0;
            }
          }
        });

        return updated;
      });
    }
  };

  script.src =
    ORDER_ENDPOINT +
    "?callback=" + callbackName +
    "&t=" + Date.now();

  script.async = true;
  document.body.appendChild(script);

  return () => {
    delete window[callbackName];
    script.remove();
  };
}, []);
  // Always show the popup from the top when it opens or the step changes
  const panelRef = useRef(null);
  useEffect(() => {
    if (!sheet) return;
    const top = () => { if (panelRef.current) panelRef.current.scrollTop = 0; };
    top();
    const t = setTimeout(top, 60);
    return () => clearTimeout(t);
  }, [sheet, step, loading]);
  useEffect(() => {
    if (!sheet || step !== 2 || !total) return;
    let live = true;
    QRCode.toDataURL(upiLink(total, orderId), { width: 480, margin: 2, errorCorrectionLevel: "M" })
      .then(u => { if (live) setQrUrl(u); })
      .catch(() => { if (live) setQrUrl(""); });
    return () => { live = false; };
  }, [sheet, step, total, orderId]);
  const sunStr = nextSunday(now).toLocaleDateString("ta-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const up = k => e => {
    setF({ ...f, [k]: e.target.value });
    if (errs[k]) setErrs(x => { const n = { ...x }; delete n[k]; return n; });
  };
  // Props that mark an input as invalid (red highlight) and let validate() scroll to it
  const fld = k => ({ ref: el => { fieldRefs.current[k] = el; }, className: errs[k] ? "invalid" : "", "aria-invalid": !!errs[k] });

  const validate = () => {
    const e = {};
    if (!f.name.trim()) e.name = "பெயர் அவசியம்.";
    if (!/^[6-9]\d{9}$/.test(f.mobile.replace(/\s/g, ""))) e.mobile = "சரியான 10 இலக்க மொபைல் எண்ணை உள்ளிடவும்.";
    if (!f.address.trim()) e.address = "டெலிவரி முகவரி அவசியம்.";
    if (!f.area.trim()) e.area = "பகுதி / இடம் அவசியம்.";
    if (!f.landmark.trim()) e.landmark = "அடையாளம் அல்லது கூகுள் மேப் இணைப்பு அவசியம்.";
    setErrs(e);
    const first = FIELD_ORDER.find(k => e[k]);
    if (first) setTimeout(() => {
      const el = fieldRefs.current[first];
      if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); el.focus({ preventScroll: true }); }
    }, 0);
    return !Object.keys(e).length;
  };
  
const stockError = () => {
  const requested = {};

  items.forEach(i => {
    const parent = PRODUCTS.find(p =>
      p.variants
        ? p.variants.some(v => v.id === i.id)
        : p.id === i.id
    );

    const name = parent ? parent.name : i.name;
    requested[name] = (requested[name] || 0) + i.q;
  });

  for (const [name, quantity] of Object.entries(requested)) {
    const stock = weeklyAvailability[name];

    if (
      stock &&
      stock.limit !== null &&
      quantity > stock.remaining
    ) {
      return `${name}: இந்த வாரம் மீதமுள்ள அளவு ${stock.remaining}. நீங்கள் தேர்ந்தெடுத்த அளவு ${quantity}. அளவைக் குறைத்து மீண்டும் முயற்சிக்கவும்.`;
    }
  }
  return "";
};

const open = () => {
  const err = stockError();
  setOrderError(err);
  if (err) return;

  setStep(1);
  setPaid(false);
  setPayMobile("");
  setOrderId(String(Date.now()).slice(-6));
  setSheet(true);
};


  // Silently saves the order the moment the customer moves on (no customer action needed)
  // Silently saves the order with structured product quantities.
  
const postOrder = async (status) => {
  if (!ORDER_ENDPOINT) {
    throw new Error("Order server is not configured.");
  }

  const response = await fetch(ORDER_ENDPOINT, {
    method: "POST",
    mode: "cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      orderId,
      status,
      payMobile: payMode === "cod" ? "" : payMobile,
      payMode,
      time: new Date().toISOString(),
      delivery: sunStr,
      name: f.name,
      mobile: f.mobile,
      alt: f.alt,
      address: f.address,
      area: f.area,
      landmark: f.landmark,
      notes: f.notes,
      total,
      deliveryCharge,

      items: [
        ...items.map(i => `${i.name}: ${fmtQty(i, i.q)} – ₹${i.amt}`),
        ...(deliveryCharge ? [`டெலிவரி கட்டணம்: ₹${deliveryCharge}`] : []),
      ].join("\n"),

      itemDetails: items.map(i => {
        const parent = PRODUCTS.find(p =>
          p.variants
            ? p.variants.some(v => v.id === i.id)
            : p.id === i.id
        );

        return {
          id: parent ? parent.id : i.id,
          name: parent ? parent.name : i.name,
          quantity: i.q,
          unit: i.kind === "kg" ? "kg" : "piece"
        };
      })
    })
  });

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || "Order could not be saved.");
  }

  return result;
};


  // Shows a loading state until the order is saved and the payment QR is ready
  
const next = async () => {
  if (loading || !validate()) return;

  const stockErr = stockError();
  if (stockErr) { setOrderError(stockErr); return; }

  setLoading(true);
  setOrderError("");

  try {
    // No order is saved here: a row is created in the sheet only when the customer presses "ஆர்டர் செய்ய"
    setQrUrl(
      await QRCode.toDataURL(
        upiLink(total, orderId),
        { width: 480, margin: 2, errorCorrectionLevel: "M" }
      )
    );

    setStep(2);
  } catch (e) {
    console.error("Order submission failed:", e);
    setOrderError(e.message || "ஆர்டரைச் சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.");
  } finally {
    setLoading(false);
  }
};


  const msg = () => [
    `*புதிய முன்பதிவு – ${SHOP}*`,
    `ஆர்டர் எண்: #${orderId}`,
    `டெலிவரி: ${sunStr} (காலை 9.30 – 11.30)`, "",
    "*பொருட்கள்*",
    ...items.map(i => `• ${i.name}: ${fmtQty(i, i.q)} – ₹${i.amt}`),
    deliveryCharge ? `• டெலிவரி கட்டணம்: ₹${deliveryCharge}` : false,
    `*மொத்தம்: ₹${total}*`, "",
    "*வாடிக்கையாளர் விவரம்*",
    `பெயர்: ${f.name}`, `மொபைல்: ${f.mobile}`,
    f.alt ? `மாற்று மொபைல்: ${f.alt}` : false,
    `முகவரி: ${f.address}`,
    `அடையாளம்: ${f.landmark}`,
    `பகுதி: ${f.area}`,
    f.notes ? `குறிப்பு: ${f.notes}` : false, "",
    ...(payMode === "cod"
      ? [`*பணம் செலுத்தும் முறை: கேஷ் ஆன் டெலிவரி* 💵`, `டெலிவரியின் போது செலுத்த வேண்டிய தொகை: ₹${total}`]
      : [`*பணம் செலுத்தப்பட்டது* ✅ (ஜிபே / போன்பே)`, `தொகை: ₹${total}`, `பணம் செலுத்திய மொபைல் எண்: ${payMobile}`])
  ].filter(x => x !== false).join("\n");

  const payOk = /^[6-9]\d{9}$/.test(payMobile.trim());
  // Only possible after the payment is marked done AND a valid 10-digit paying mobile number is entered
 
const sendOrder = async () => {
  if (!paid || !payOk || loading) return;

  setLoading(true);
  setOrderError("");

  try {
    await postOrder("பணம் செலுத்தப்பட்டது");

    window.open(
      `https://wa.me/${WA}?text=${encodeURIComponent(msg())}`,
      "_blank"
    );

    setSheet(false);
    setDone(true);
    window.scrollTo({ top: 0 });
  } catch (e) {
    console.error("Payment update failed:", e);
    setOrderError(e.message || "ஆர்டர் புதுப்பிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.");
  } finally {
    setLoading(false);
  }
};

  // Cash on delivery: no payment step - save the order and open WhatsApp straight away
  const placeCod = async () => {
    if (loading || !validate()) return;
    const stockErr = stockError();
    if (stockErr) { setOrderError(stockErr); return; }

    setLoading(true);
    setOrderError("");
    try {
      await postOrder(COD_STATUS);
      window.open(`https://wa.me/${WA}?text=${encodeURIComponent(msg())}`, "_blank");
      setSheet(false);
      setDone(true);
      window.scrollTo({ top: 0 });
    } catch (e) {
      console.error("COD order failed:", e);
      setOrderError(e.message || "ஆர்டரைச் சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.");
    } finally {
      setLoading(false);
    }
  };

  if (done) return (
    <div className="wrap" style={{ textAlign: "center", paddingTop: 60 }}>
      <div style={{ fontSize: 56 }}>✅</div>
      <h2>நன்றி, {f.name}!</h2>
      <p>உங்கள் முன்பதிவு வாட்ஸ்அப்பில் தயாராக உள்ளது. {payMode === "cod" ? "செய்தியை அனுப்பி ஆர்டரை உறுதிசெய்யவும்." : "செய்தியை அனுப்பி, பணம் செலுத்திய ஸ்கிரீன்ஷாட்டையும் பகிர்ந்து உறுதிசெய்யவும்."}</p>
      <p><b>டெலிவரி:</b> {sunStr}, காலை 9.30 – 11.30</p>
      <div className="cta" style={{ justifyContent: "center" }}>
        <button className="btn" onClick={() => { setDone(false); setCart({}); }}>புதிய ஆர்டர்</button>
        <a className="btn wa" href={`https://wa.me/${WA}`} target="_blank" rel="noreferrer">வாட்ஸ்அப் திறக்க</a>
      </div>
    </div>
  );

  const clearCart = () => { if (window.confirm("தேர்ந்தெடுத்த எல்லா பொருட்களையும் நீக்கவா?")) setCart({}); };

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

       <div className="grid" id="products">
         {PRODUCTS.map(p => {
  const photo = photoFor(p.id);
  const stock = weeklyAvailability[p.name];
  const soldOut = stock && stock.limit !== null && stock.remaining <= 0;

  return (
    <div className={`item ${soldOut ? "sold-out" : ""}`} key={p.id}>
      <div className="pic">
        {photo ? <img src={photo} alt={p.name} loading="lazy" /> : <Art id={p.id} />}
        {soldOut && (
          <div className="soldout-label">
            SOLD OUT FOR THIS WEEK
          </div>
        )}
      </div>

      <div className="body">
        <h3>{p.name}</h3>
        {p.sub && <small>{p.sub}</small>}

        {p.variants ? p.variants.map(v => (
          <div className="var" key={v.id}>
            <div className="row">
              <span>{v.label}</span>
              <span className="price">₹{v.price}</span>
            </div>
            <div className="row center">
              <Qty
                line={LINES.find(x => x.id === v.id)}
                q={cart[v.id] || 0}
                set={setQ}
                disabled={soldOut}
              />
            </div>
          </div>
        )) : (
          <>
            <div className="row">
              <span className="price">₹{p.showPrice ?? p.price} / {p.per || "கிலோ"}</span>
            </div>
            <div className="row center">
              <Qty
                line={LINES.find(x => x.id === p.id)}
                q={cart[p.id] || 0}
                set={setQ}
                disabled={soldOut}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
})}
        </div>
        <div className="disc">🛵 <b>டெலிவரி கட்டணம்:</b> ₹125 அல்லது அதற்கு குறைவான ஆர்டர் மதிப்பிற்கு, ₹15 டெலிவரி சார்ஜ் சேர்க்கப்படும்.</div>
        <div className="disc">📷 <b>குறிப்பு:</b> பொருட்களின் படங்கள் குறிப்புக்காக மட்டுமே. அவை உண்மையான பொருட்கள் அல்ல.</div>
      </div>

      <footer id="contact" style={{ paddingBottom: items.length ? 96 : undefined }}>
        <img className="foot-img" src={footerImg} alt="தொடர்பு கொள்ள 7601 915355 – கல்யாண, கேட்டரிங் ஆடர்கள் மற்றும் இலவச டோர் டெலிவரி" />
        <div className="contact">
          <b>தொடர்புக்கு</b><br />
          {SHOP}<br />
          சிவன்கோவில் தெரு (அரூஸிய்யா பள்ளி சமீபம்),<br />காயல்பட்டினம்.<br />
          📞 <a href={`tel:+91${PHONE}`}>{PHONE_SHOW}</a> · <a href={`https://wa.me/${WA}`} target="_blank" rel="noreferrer">வாட்ஸ்அப்</a>
        </div>
      </footer>

      {showTop && !sheet && (
        <button className={`totop ${items.length > 0 ? "withcart" : ""}`} onClick={goFirstProduct} aria-label="முதல் பொருளுக்குச் செல்ல" title="முதல் பொருளுக்குச் செல்ல">🛍️</button>
      )}

      {items.length > 0 && !sheet && (
        <div className="cartbar">
          {orderError && <div className="err">{orderError}</div>}
          <div><b>{items.length} பொருட்கள்</b><br /><span>மொத்தம் ₹{total}</span>{deliveryCharge > 0 && <small> (டெலிவரி ₹{deliveryCharge} உட்பட)</small>}</div>
          <div className="cb-btns">
            <button className="btn ghost-w" onClick={clearCart}>🗑 அழிக்க</button>
            <button className="btn yel" onClick={open}>ஆர்டர் செய்ய →</button>
          </div>
        </div>
      )}

      {sheet && (
        <div className="modal" onClick={() => setSheet(false)}>
          <div className="panel" ref={panelRef} onClick={e => e.stopPropagation()}>
            {loading && (
              <div className="loadov" role="status" aria-live="polite">
                <div className="loadcard"><span className="spin lg" /><p>{payMode === "cod" ? "ஆர்டர் சேமிக்கப்படுகிறது…" : "பணம் செலுத்தும் பக்கம் தயாராகிறது…"}<br />சற்று காத்திருக்கவும்</p></div>
              </div>
            )}
            <div className="phead">
              <div><small>{SHOP}</small><b>{step === 1 ? "🛵 டெலிவரி விவரங்கள்" : "💳 பணம் செலுத்தி ஆர்டர் செய்ய"}</b></div>
              <button className="x" aria-label="மூடு" onClick={() => setSheet(false)}>✕</button>
            </div>
            <div className="steps"><span className="dot on">1</span><i className={step === 2 ? "on" : ""} /><span className={"dot" + (step === 2 ? " on" : "")}>2</span></div>

            {step === 1 ? (
              <>
                <div className="sum">
                  {items.map(i => (
                    <div className="ci" key={i.id}>
                      <div className="ci-row">
                        <div className="ci-pic">{photoFor(i.pid) ? <img src={photoFor(i.pid)} alt={i.name} /> : <Art id={i.pid} />}</div>
                        <div className="ci-body">
                          <div className="l"><span>{i.name}</span><span>₹{i.amt}</span></div>
                          <div className="ci-act">
                            <Qty line={i} q={i.q} set={setQ} />
                            <button className="del" aria-label="நீக்கு" onClick={() => setQ(i.id, 0)}>🗑 நீக்கு</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {deliveryCharge > 0 && <div className="l"><span>டெலிவரி கட்டணம்</span><span>₹{deliveryCharge}</span></div>}
                  <div className="l t"><span>மொத்தம்</span><span>₹{total}</span></div>
                </div>
                <label>பெயர் *</label>
                <input {...fld("name")} value={f.name} onChange={up("name")} placeholder="உங்கள் பெயர்" autoComplete="name" />
                {errs.name && <div className="err">{errs.name}</div>}
                <label>மொபைல் (வாட்ஸ்அப்) *</label>
                <input {...fld("mobile")} value={f.mobile} onChange={up("mobile")} inputMode="numeric" maxLength={10} placeholder="10 இலக்க எண்" autoComplete="tel" />
                {errs.mobile && <div className="err">{errs.mobile}</div>}
                <label>வீட்டு எண் / தெரு *</label>
                <input {...fld("address")} value={f.address} onChange={up("address")} placeholder="வீட்டு எண், தெருவின் பெயர்" />
                {errs.address && <div className="err">{errs.address}</div>}
                <label>பகுதி / இடம் *</label>
                <input {...fld("area")} value={f.area} onChange={up("area")} placeholder="பகுதி / இடம்" />
                {errs.area && <div className="err">{errs.area}</div>}
                <label>அடையாளம் / கூகுள் மேப் இணைப்பு *</label>
                <input {...fld("landmark")} value={f.landmark} onChange={up("landmark")} placeholder="பள்ளிவாசல், கடை அருகில் அல்லது கூகுள் மேப் இணைப்பு" />
                {errs.landmark && <div className="err">{errs.landmark}</div>}
                {orderError && <div className="err">{orderError}</div>}
                <details>
                  <summary>+ கூடுதல் விவரங்கள் (விருப்பம்)</summary>
                  <label>மாற்று மொபைல் எண்</label>
                  <input value={f.alt} onChange={up("alt")} inputMode="numeric" maxLength={10} />
                  <label>சிறப்பு குறிப்புகள்</label>
                  <input value={f.notes} onChange={up("notes")} placeholder="பீஸ் அளவு, சுத்தம் போன்றவை" />
                </details>
                <label>பணம் செலுத்தும் முறை *</label>
                <div className="pmeth" role="radiogroup" aria-label="பணம் செலுத்தும் முறை">
                  <label className={payMode === "online" ? "on" : ""}>
                    <input type="radio" name="paymode" value="online" checked={payMode === "online"} onChange={() => setPayMode("online")} />
                    <span>📲 ஜிபே / போன்பே</span>
                  </label>
                  <label className={payMode === "cod" ? "on" : ""}>
                    <input type="radio" name="paymode" value="cod" checked={payMode === "cod"} onChange={() => setPayMode("cod")} />
                    <span>💵 கேஷ் ஆன் டெலிவரி</span>
                  </label>
                </div>
                {payMode === "cod" && <div className="codnote">டெலிவரியின் போது ₹{total} பணமாகக் கொடுக்கவும்.</div>}
                <button className="btn big" disabled={loading} onClick={payMode === "cod" ? placeCod : next}>{loading ? <><span className="spin" /> ஏற்றுகிறது…</> : payMode === "cod" ? "ஆர்டர் செய்ய" : "அடுத்து: பணம் செலுத்த →"}</button>
              </>
            ) : (
              <>
                <div className="amt" style={{ justifyContent: "center" }}><span>₹{total}</span></div>
                <div className="qrbox">
                  <div className="qrapps"><span className="app"><GPayIcon /><b>ஜிபே</b></span><span className="app"><PhonePeIcon /><b>போன்பே</b></span></div>
                  <img className="qr" src={qrUrl || qrImg} alt="பணம் செலுத்த க்யூஆர் கோடு" />
                </div>
                <div className="pay">
                  <div><span>பெயர்</span><b>{PAYEE.name}</b></div>
                  <div><span>மொபைல்</span><b>{PAYEE.mobile}</b></div>
                </div>
                <label>பணம் செலுத்திய மொபைல் எண் (ஜிபே / போன்பே) – 10 இலக்கம் *</label>
                <input className={payMobile && !payOk ? "invalid" : ""} value={payMobile} onChange={e => setPayMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" maxLength={10} placeholder="எ.கா. 9876543210" />
                {payMobile && !payOk && <div className="err">சரியான 10 இலக்க மொபைல் எண்ணை உள்ளிடவும்.</div>}
                {orderError && <div className="err">{orderError}</div>}
                <label className="chk"><input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} /><span>₹{total} பணம் செலுத்திவிட்டேன்.</span></label>
                <div className="cta">
                  <button className="btn wa" disabled={!paid || !payOk} onClick={sendOrder}>📲 ஆர்டர் செய்ய</button>
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
