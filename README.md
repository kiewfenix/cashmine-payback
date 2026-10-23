# CashMine payback — practical task

**Live:** https://kiewfenix.github.io/cashmine-payback/ — opens on the token screen; paste your API token there. Designed for a ~390 px phone; on a desktop it renders in a centred phone-width column.

Built with Expo SDK 58 (React Native, TypeScript, expo-router), shipped as a static web build to GitHub Pages by the workflow in `.github/workflows/deploy.yml` on every push to `main`.

## Run locally

```bash
npm install
npx expo start --web                      # http://localhost:8081
npm test                                  # unit tests for the money logic (jest)
npx playwright install chromium           # once
CASHMINE_TOKEN=<your token> npm run test:e2e   # Playwright at 390 / 360 / 320 px; starts the dev server if needed
npx expo export --platform web            # static build in dist/
```

The token is only ever read from the environment (tests) or typed into the app (users); it is not in the code, the repo or the build. Route types are generated into the gitignored `.expo/` folder by `npx expo start`, so run that once on a fresh clone before `npx tsc --noEmit`.

## What works

- **Token screen** — asked for on first open, kept in the browser's `localStorage`, changeable from the header; a rejected token (401) brings you back here with an explanation.
- **Balances (home)** — each asset's available / pending / claiming, USD value per asset and in total (exact decimal math, rounded once for display), "Updated hh:mm:ss · n s ago" ticking, amber **Stale** after 60 s or when a refresh fails (last good data stays on screen with Retry), skeleton on first load, header Refresh, auto-refresh every 15 s while the tab is visible.
- **Claim** — pick an asset, type an amount or tap **Max** (inserts the exact available string), live validation against the API rules (grammar, decimals, minimum, available, positive payout), destination picker, fee and "You receive", then a confirmation step. Submission uses one `Idempotency-Key` per confirmation, persisted before sending; 429 is retried with the same key; an unknown outcome (504, 5xx, network, timeout) shows "We couldn't confirm your claim. Nothing will be claimed twice" with a same-key retry, and is resumed after a reload.
- **Claim status** — polls every 2 s until completed or failed, shows amount, fee, received amount, destination and failure reason.
- **After a claim** — the balances screen keeps the server's numbers and shows the claim as a separate line under the asset; the claim form's Max uses *available minus claims the snapshot does not include yet*. See `NOTES.md` for why.
- **Activity** — history of accruals, reversals and claims, newest first, 20 per page with "Load more" until the API's cursor runs out; signed amounts, status, exchange and time.
- **Tests** — 24 unit tests for parsing, validation, fee and totals; Playwright e2e for the token, balances, error/stale, activity and claim flows at three phone widths.

`NOTES.md` has the decisions, the AI moments and the known issues. `ai-logs/` has the prompts log and the full redacted session transcript.
