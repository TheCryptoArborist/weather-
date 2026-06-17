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

## Auto-create Sui markets

The package now includes an operator-side market creation helper. It reads the same backend-generated `/api/markets` templates, prepares the on-chain market questions/categories/source URLs/expiry timestamps, and creates any market that has not already been recorded in the local creation manifest.

Dry-run the current plan first:

```powershell
npm run markets:plan
```

Create the planned markets from the active Sui CLI wallet:

```powershell
npm run markets:create
```

Requirements:

- Run this only from the admin wallet that owns the configured `AdminCap`.
- Keep the generated `data/auto-created-markets.json` manifest. It prevents duplicate auto-created markets for the same template window.
- This is intentionally an operator script, not public frontend code. The browser should never hold the admin capability or create markets directly.
- Netlify can display market templates and live data, but on-chain market creation should run from a trusted machine or scheduled operator process with the Sui CLI installed and the admin wallet active.

Relevant environment variables:

```text
SUI_PACKAGE_ID
SUI_REGISTRY_ID
SUI_ADMIN_CAP_ID
SUI_CLOCK_ID
MARKET_CREATE_GAS_BUDGET
MARKET_AUTOCREATE_MANIFEST
```

## Weather API integration

This package uses official public weather data APIs rather than a private weather vendor. The upstream sources are fetched by the local Node backend and the Netlify serverless functions, then normalized behind the app's own endpoints:

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

NWS requests should include an identifiable `WEATHER_USER_AGENT`. For Netlify, set that value as a site environment variable. For local testing, copy `.env.example` to `.env` and replace the placeholder contact value.

Keep market construction, source selection, caching, resolver evidence URLs, and evidence-hash preparation on the backend side. The frontend should continue to consume only `/api/markets` and display source evidence returned by that endpoint.

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

## Mainnet deployment

The current developer smoke-test deployment is documented in:

```text
MAINNET_DEPLOYMENT.md
```

Live Sui mainnet IDs:

```text
Package:
0xbdb34ef1f0ede6535473fa2078447da608e0c9f24e284aff350bf546168b92c7

Registry:
0xccfc95482df353eae478ab5d3cf3e28ccb3e1d74c029a36ed53f8f935450d262

AdminCap:
0x7f7b99e28804438802f76bfdbd714dbae5c92166b6fc02b9314327ac3bbdfecb

ResolverCap:
0xb872f897196a800f7927546926764e81f5d251cda5cb45a7cf93b8ded7741021

UpgradeCap:
0x7a51c25fc804e33812879902f57390a111d03b2601acbed601a5d05635fc8804
```

Mainnet smoke-test status:

```text
Market creation: passed
NFT-gated YES buy: passed
NFT-gated NO buy: passed
Resolve market: passed
Winning claim: passed
Losing claim rejection: passed
Admin impact-fund withdrawal: passed
Non-admin impact-fund withdrawal rejection: pending separate CLI-managed wallet
```

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

1. Run `sui move build`. Completed on developer machine.
2. Publish from a fresh admin wallet. Completed on Sui mainnet.
3. Save the package ID, shared `Registry`, `AdminCap`, and `ResolverCap`. Completed in `MAINNET_DEPLOYMENT.md`.
4. Create one short-term market with a small expiry. Completed.
5. Buy YES and NO positions from wallets holding the required NFT. Completed.
6. Resolve after expiry with the NOAA/NHC evidence URL and an evidence hash. Completed.
7. Claim from the winning position. Completed.
8. Confirm losing positions cannot claim. Completed.
9. Confirm wallets without the NFT cannot buy. Pending separate wallet test.
10. Confirm impact fund withdrawal only works for admin. Admin path completed; non-admin rejection pending separate wallet test.
