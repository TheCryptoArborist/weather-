# TREE Hurricane Markets Testing Handoff

This package contains a frontend prototype, a lightweight backend data proxy, Netlify serverless functions, and a Sui Move contract prototype for TREE hurricane-season prediction markets.

## Environment

Do not commit `.env`. Use `.env.example` as the template.

Required for live weather data:

```powershell
copy .env.example .env
```

Then edit `WEATHER_USER_AGENT` to a real contact value before production-style testing.

## Backend + Frontend

Local Node test command:

```powershell
npm start
```

Then open:

```text
http://localhost:8787
```

Backend endpoints:
- `GET /api/health`
- `GET /api/weather/live`
- `GET /api/markets`

Netlify/serverless test command:

```powershell
npm install -g netlify-cli
npm run netlify:dev
```

The same frontend calls `/api/...`; on Netlify those routes are served by hidden serverless functions in `netlify/functions`.

Live data sources currently proxied:
- NHC current storms: `https://www.nhc.noaa.gov/CurrentStorms.json`
- NHC Atlantic outlook XML: `https://www.nhc.noaa.gov/gtwo.xml`
- NWS active alerts: `https://api.weather.gov/alerts/active?area=FL`
- NOAA CO-OPS latest Key West water level: `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?...`

Set a real User-Agent for production-style testing:

```powershell
$env:WEATHER_USER_AGENT="tree.example contact@example.com"
npm start
```

## Frontend

Open `index.html` directly in a browser for static fallback mode, or use `npm start` / `npm run netlify:dev` for live NOAA/NHC-backed mode.

Files:
- `index.html`
- `styles.css`
- `app.js`
- `server.js`
- `package.json`
- `netlify.toml`
- `netlify/functions/*`

What to test:
- Desktop layout around 1440x900.
- Mobile layout around 390x844.
- NFT access messaging is visible in the wallet/status area and trade panel.
- Live source status changes from static fallback to live sources when served through the backend.
- Resolution evidence displays source/status links from `/api/markets`.
- Market selection updates the detail panel.
- `All`, `Short term`, and `Season outlook` filters update the market list.
- Yes/No outcome selection updates the trade button and share estimate.
- Amount input and quick amount buttons update the trade summary.

## Contract

Contract package:

```powershell
cd contracts/tree_hurricane_markets
sui move build
```

Primary source file:
- `contracts/tree_hurricane_markets/sources/prediction_market.move`

What the contract currently supports:
- NFT-gated market access using the required NFTree collection type.
- Resolver-submitted market resolution with source evidence.
- Admin-created binary prediction markets.
- SUI-based Yes/No positions.
- Expiry-based admin resolution.
- Winner claims paid pro rata from the losing side.
- A configurable fee retained in the registry impact fund.
- Impact-fund withdrawal by admin.

NFT gate:
- Required collection type shown externally: `0xf6c6d439ea0da2f3e9ba79e4992a7a4c113215fbf54c442ac9020c315f953705::collection::NFT`
- The contract stores the Sui `std::type_name` form without the `0x` prefix: `f6c6d439ea0da2f3e9ba79e4992a7a4c113215fbf54c442ac9020c315f953705::collection::NFT`
- `buy_position<AccessNFT>` requires a borrowed NFT object of that exact type. A wallet must include one of those NFT objects in the transaction to open a position.

Important note: this is a prototype contract for testing architecture and flow. It has not been audited and should not be used with real funds without legal/compliance review and a security audit.
