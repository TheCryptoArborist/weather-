# TREE Hurricane Markets - Mainnet Testing Package

This folder contains the cleaned launch-testing package:

- Polished frontend app
- Local Node backend
- Netlify serverless functions
- Sui Move prediction-market contract
- Official live weather data from NOAA/NHC/NWS/CO-OPS
- NFT-gated trading requirement

## Important launch note

This is ready for developer testing on Sui mainnet, not audited public production. Use small test amounts until the Move package, resolver flow, and legal/compliance posture are reviewed.

## Local app test

Install Node.js 18+.

```powershell
copy .env.example .env
npm start
```

Open:

```text
http://localhost:8787
```

Endpoints:

```text
GET /api/health
GET /api/weather/live
GET /api/markets
```

## Netlify test

```powershell
npm install -g netlify-cli
copy .env.example .env
npm run netlify:dev
```

On Netlify, set this environment variable:

```text
WEATHER_USER_AGENT
```

Use a real contact value. NOAA/NWS APIs expect an identifiable user agent.

## Live data sources

The backend/serverless functions read:

- NHC CurrentStorms JSON
- NHC Atlantic Tropical Weather Outlook XML
- NWS active alerts for FL, TX, LA, MS, AL
- NOAA CO-OPS latest water levels for Key West, Grand Isle, and Galveston

The browser does not contain the market derivation logic. It only calls `/api/markets`.

## Weather API integration

This package uses official public weather data APIs rather than a private weather vendor.
The upstream sources are fetched by the local Node backend and the Netlify serverless
functions, then normalized behind the app's own endpoints:

```text
GET /api/weather/live
GET /api/markets
```

Primary upstream API sources:

```text
NWS API documentation:
https://www.weather.gov/documentation/services-web-api

NHC CurrentStorms JSON:
https://www.nhc.noaa.gov/CurrentStorms.json

NHC Atlantic Tropical Weather Outlook XML:
https://www.nhc.noaa.gov/gtwo.xml

NOAA CO-OPS Data Retrieval API:
https://api.tidesandcurrents.noaa.gov/api/prod/
```

NWS requests should include an identifiable `WEATHER_USER_AGENT`. For Netlify,
set that value as a site environment variable. For local testing, copy
`.env.example` to `.env` and replace the placeholder contact value.

Keep market construction, source selection, caching, resolver evidence URLs, and
evidence-hash preparation on the backend side. The frontend should continue to
consume only `/api/markets` and display source evidence returned by that endpoint.

## Sui contract

Build:

```powershell
cd contracts/tree_hurricane_markets
sui move build
```

Publish to mainnet testing wallet:

```powershell
sui client switch --env mainnet
sui client publish --gas-budget 100000000
```

Primary module:

```text
tree_hurricane_markets::prediction_market
```

The contract uses SUI for test market positions.

## NFT gate

Configured collection type:

```text
f6c6d439ea0da2f3e9ba79e4992a7a4c113215fbf54c442ac9020c315f953705::collection::NFT
```

Users must pass a borrowed NFT object of that type into `buy_position<AccessNFT>`.

## Main entry functions

- `create_market`
- `buy_position<AccessNFT>`
- `resolve_market`
- `claim_to_sender`
- `withdraw_impact_fund`
- `set_required_nft_type`

## Recommended testing checklist

1. Run `sui move build`.
2. Publish from a fresh admin wallet.
3. Save the package ID, shared `Registry`, `AdminCap`, and `ResolverCap`.
4. Create one short-term market with a small expiry.
5. Buy YES and NO positions from wallets holding the required NFT.
6. Resolve after expiry with the NOAA/NHC evidence URL and an evidence hash.
7. Claim from the winning position.
8. Confirm losing positions cannot claim.
9. Confirm wallets without the NFT cannot buy.
10. Confirm impact fund withdrawal only works for admin.
