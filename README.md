# KAYAL FRESH MEAT - Vite + React

## Run locally
Requires Node.js 18+ (https://nodejs.org).

    npm install
    npm run dev        # opens http://localhost:5173

Windows: double-click `start.bat`. Mac/Linux: run `./start.sh`.

## Build for hosting
    npm run build      # output in dist/ (upload to Netlify, GitHub Pages, Cloudflare Pages)

## Edit shop details
Top of `src/App.jsx`: `SHOP`, `PHONE`, `WA`, `PAYEE` and the `PRODUCTS` list (prices).

## Product photos
Illustrations are shown by default. To use real photos, add files named after the product id into `src/assets/products/`
(`beef`, `kottu`, `liver`, `brain`, `spleen`, `kudal`, `kidney`) as .jpg / .png / .webp. They are picked up automatically.

## WhatsApp / social link preview
1. Deploy the built site (`npm run build`, upload `dist/`).
2. Edit `.env` and set `VITE_SITE_URL` to the real address, e.g. `https://kayalfreshmeat.netlify.app`, then build again.
3. The preview image is `public/og-image.png`; the browser icon is `public/favicon.png`.
WhatsApp caches previews, so a link shared earlier may keep the old preview for a while.

## Automatic order capture (no customer action)
WhatsApp cannot be sent automatically from a web page, so each order is also saved silently the moment the customer
taps "அடுத்து: பணம் செலுத்த" (status: பணம் நிலுவை, then updated to பணம் செலுத்தப்பட்டது with the 10-digit paying mobile number). Setup (free):
1. Create a Google Sheet > Extensions > Apps Script, paste `order-capture/google-apps-script.gs`.
2. Deploy > New deployment > Web app (Execute as: Me, Access: Anyone) and copy the URL.
3. Put the URL in `.env` as `VITE_ORDER_ENDPOINT=...`, then rebuild.
Every order then appears as a new row in the sheet (and can email you if you enable the MailApp line).

## Visitor Activity Monitor (website analytics)
Counts page views and unique visitors and keeps an anonymous activity log. Data is stored in your Google Sheet by the
Apps Script backend. **No IP addresses, names or phone numbers are stored.**

**Sheets (created automatically)**
- `Website Analytics` - A:D daily summary (Date, Page Views, Unique Visitors, New Visitors); F:K one row per anonymous Visitor ID; M:N control block (lifetime page views, reset markers).
- `Website Analytics Log` - one row per page view: date, time (IST), visitor ID, source, UTM source/medium/campaign, referrer domain + URL, page, device, browser, OS, city, region, country, new visitor, first visit today.
- `Orders` and `Products` are never touched.

**Counting rules**
- Every page load / refresh / reopen = 1 page view. The admin page is never counted.
- Visitor ID is a random ID kept in the browser (`localStorage`). Same ID = 1 unique per calendar day (Asia/Kolkata) and 1 unique overall. Another browser/device or cleared storage = a new visitor.

**Setup**
1. Paste the updated `order-capture/google-apps-script.gs` into Apps Script.
2. Project Settings > Script properties > add `ANALYTICS_ADMIN_KEY` (a long secret). It lives only there - never in the code, the website bundle, a URL or browser storage.
3. Deploy > Manage deployments > Edit > New version > Deploy (same URL). Redeploy the website.

**Dashboard:** open `https://<your-site>/#admin`, enter the admin key (kept in memory only; re-enter after a refresh). Shows today's / lifetime page views and unique visitors, today's traffic sources, daily history, recent activity, a tagged-link builder, CSV export and the reset buttons.
- **Export** (activity log and daily statistics as CSV) - do this before resetting.
- **Reset today's counts** - today's views/unique go to 0; earlier days, the log and lifetime totals stay.
- **Reset all analytics** - deletes daily history, visitor list, lifetime totals and the log. Must type `RESET ALL ANALYTICS`; checked on the server.
All admin actions are verified on the server with the Script-property key (10 wrong tries block further attempts for 10 minutes).

**Traffic sources**
Order of detection: UTM tag (`utm_source`) > referrer > in-app browser (Instagram / Facebook apps) > Direct. Sources: WhatsApp, Google, Facebook, Instagram, Direct, Other.
WhatsApp, and many apps, open links **without** a referrer, so an untagged WhatsApp visit shows as *Direct*. Use tagged links (Dashboard > Tagged campaign link), e.g.
`https://<your-site>/?utm_source=whatsapp&utm_medium=social&utm_campaign=family-group-1`.
Only a uniquely tagged link (a different `utm_campaign` for each group) can tell groups apart; the exact group or sender cannot be identified otherwise.

**Location (optional, off by default)**
Without an IP address the server cannot know a visitor's place, so city / region / country stay blank unless you add
`VITE_GEO_LOOKUP_URL` to `.env`, e.g. `https://ipwho.is/` or `https://ipapi.co/json/`. The visitor's browser asks that service
(which sees the visitor's IP, as any website would) and only city / region / country are kept; the lookup is cached for a day. Free services have daily limits and give approximate, sometimes wrong, results.

## Delivery charge
A flat ₹15 delivery charge is added when the order is a single 250 gm item, or when the order value is ₹125 or less. It is shown in the cart bar, the order summary and the payment amount (QR), and it is included in the `Total` and `Items` columns of the Orders sheet and in the WhatsApp message. Change `DELIVERY_CHARGE` / `SMALL_ORDER_LIMIT` at the top of `src/App.jsx`.

## Orders & Products sheet maintenance
- Orders: `Customer Name` and `Created At` are filled for every order (headers are matched flexibly; a missing column is added). `Created At` is stamped by the server in IST when the order is first saved.
- Products: product rows are matched by name, spelling variants and English names (e.g. குடல் / கொடல் / Kudal). In the Apps Script editor you can run:
  - `checkProducts` - shows which Products row each website product is matched to, and any MISSING / duplicate rows (see View > Logs).
  - `rebuildOrderedThisWeek` - recalculates "Ordered This Week" and "Remaining" from this week's confirmed orders (created since last Sunday). It overwrites the current numbers, so run `checkProducts` first.
