# Notes

## Decisions

### Amounts: BigInt fixed-point, strings at the edges
Every amount is a decimal string at the API and UI boundaries and `{ units: bigint, decimals }` inside (`src/lib/money.ts`), scaled by the asset's own `decimals`. Parsing enforces the API grammar (no leading zeros, no `.5`, `1.`, `1e-3`) and the decimals limit; add/sub/compare are integer operations; USD values are rounded half-up to cents **once, for display only**. Claim amounts are never rounded, and Max inserts the exact `available` string.
*Alternatives:* `parseFloat` is wrong, not just imprecise, for 18-decimal ETH (`12.345678901234591676` is not representable) and for ordinary decimal rounding. `decimal.js`/`big.js` would be correct and is what I'd use in a larger product; here the task needs four operations, and the integer representation maps 1:1 onto the API's "at most `decimals` places" rule, which keeps validation and the unit tests transparent with zero dependencies.

### Balance right after a claim: server numbers, plus a labelled local overlay
Two complaints pull in opposite directions: "my balance didn't change, so I claimed again" and "my balance dropped, then jumped back up". The headline numbers on the Balances screen are **always the server snapshot and are never edited locally**. In-flight claims live in a small store (`src/state/claims.tsx`, persisted in `localStorage` per token) and appear as a separate, labelled line under the asset ("− 0.5 ETH claim pending · 19:41") and in a banner. The claim form's Max and validation use *effective available* = snapshot `available` minus in-flight claims the snapshot does not include yet. A claim counts as reflected once a snapshot with `asOf ≥ claim.createdAt` arrives (the server removes the amount at creation, so any later snapshot includes it); the overlay is then dropped. If the claim fails, that line says so with the reason until the returned amount shows up in a snapshot.
*Why:* the only figure labelled "balance" comes from the server, so nothing ever jumps back; and the amount the user can type is already reduced, so a double claim is prevented by construction rather than by a banner they may not read. An unknown-outcome attempt counts as in flight, the conservative direction.
*Alternatives:* (A) optimistic local subtraction gives instant feedback but shows a number the server never produced and flip-flops when an older snapshot arrives or the claim fails — exactly complaint 2. (B) server truth plus a banner and a disabled Claim button never lies, but leaves the headline looking wrong for up to 15 s and blocks legitimate second claims; it shares most of its code with the chosen approach, which adds one pure function on top. Three approaches were compared in `ai-logs/prompts.md` (20:07 UTC) before choosing.

### Unknown result of a claim request (504, 5xx, network error, timeout)
One idempotency key is generated per confirmed attempt and persisted **before** the request is sent. If the answer is definitive (201/200, 400, 401, 409) the attempt is resolved. If it is unknown, the user sees "We couldn't confirm your claim. Nothing will be claimed twice." with a *Check / retry* action that resends the identical body with the same key; the API returns the original claim if it was created (`Idempotent-Replayed`) and creates it once otherwise. The attempt is resumed the same way after a reload. A new key is only ever minted for a new confirmation.
*Alternatives:* showing a generic error and letting the user retry with a fresh key is how double claims happen; scanning `/v1/activity` to detect whether the claim exists is racy and the API already offers idempotent replay.

### Smaller decisions
- **Token** is kept in `localStorage` and entered on first open; the header "Token" link changes it; any 401 clears it and the route guard returns to the token screen.
- **Total in USD** is the sum of *available* (what can be claimed now); pending is shown as a second line. Totals are summed exactly and rounded once, so they can differ by a cent from adding the rounded lines.
- **Freshness**: "Updated hh:mm:ss · n s ago" ticking each second; amber "Stale" after 60 s or when a refresh fails, keeping the last good data on screen. Auto-refresh every 15 s only while the tab is visible, plus a manual Refresh; no pull-to-refresh because react-native-web does not support it.
- **No data-fetching or state library**: three screens, one `useResource` hook and two contexts; `react-query` would be my choice at product scale.
- **Hosting**: GitHub Pages through a GitHub Actions workflow on every push to `main`, so no extra accounts and the deploy is reproducible; `baseUrl` is set accordingly and `404.html` mirrors `index.html` so deep links load the SPA.

## Working with AI
_To be written at the end._

## Not done / known issues
_To be written at the end._
