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
taps "அடுத்து: ஆர்டரை அனுப்ப". Setup (free):
1. Create a Google Sheet > Extensions > Apps Script, paste `order-capture/google-apps-script.gs`.
2. Deploy > New deployment > Web app (Execute as: Me, Access: Anyone) and copy the URL.
3. Put the URL in `.env` as `VITE_ORDER_ENDPOINT=...`, then rebuild.
Every order then appears as a new row in the sheet (and can email you if you enable the MailApp line).
