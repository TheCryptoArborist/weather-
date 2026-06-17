# TREE Hurricane Markets - Mainnet Deployment Notes

Status: developer smoke test passed on Sui mainnet with tiny amounts.

Important: this is not an audited public-production release. Keep usage limited to developer testing until contract audit, resolver operations, and compliance review are complete.

## Live Sui Mainnet Objects

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

Admin / test wallet:
0x485953e2eadf4aa02af950cf8e914fbd2b67523385e73c36118341459d8d45c4
```

## Required NFT Gate

```text
Required NFT type:
0xf6c6d439ea0da2f3e9ba79e4992a7a4c113215fbf54c442ac9020c315f953705::collection::NFT

NFT object used in smoke test:
0xd004b6085b247f51223ccccfa9a293496f1b0fe86ddfd3258632e7cc4df24ce0
```

## Mainnet Smoke Test

Test market:

```text
Market ID:
0xa4e195dce3b6974eba05ea671a0133cab8abc45b67f9439294a2bde297e1efa1

Expiry:
1781669495091

Evidence URL:
https://www.nhc.noaa.gov/CurrentStorms.json

Evidence hash / marker:
manual-mainnet-test-001
```

Verified:

- Sui mainnet publish succeeded.
- Registry was created and shared.
- AdminCap, ResolverCap, and UpgradeCap were created.
- Market creation worked.
- Required NFT gate allowed a wallet holding the configured TREE NFT type to buy.
- YES position purchase succeeded.
- NO position purchase succeeded.
- Market resolution succeeded.
- Winning YES claim succeeded.
- Losing NO claim failed with `E_WRONG_OUTCOME` / code `7`, as expected.
- Admin impact-fund withdrawal succeeded with a 1 MIST test withdrawal.

Smoke-test positions:

```text
YES position:
0xd22e75f1cb2a241dc4885ec064fa627624eb880930025c2b5e9f4a03a423aa91

NO position:
0xbb1931cebc7fc49b9d1ddc15696efcb5168d51564d5ab6947dc5cf760753e195

Winning payout coin:
0x4adc417ed7708092c29779388beeec308a008a3b679c97f4079110ea25ccb593

Impact-fund withdrawal test coin:
0x975ae727f45803eff5af369991dcd53641924bc9264ac50e083e9154c1099441
```

Pending before public release:

- Non-admin impact-fund withdrawal rejection test from a separate CLI-managed wallet.
- Wallet-connected frontend trading flow.
- Resolver operations policy and evidence-hash procedure.
- Contract audit / external review.
- Legal and compliance review.
- Final Netlify production deploy verification.
