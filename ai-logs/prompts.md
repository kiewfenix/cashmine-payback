# Prompts log

Every message sent to the AI during the task, verbatim, oldest first. Tokens are replaced with `[REDACTED]`. Times are UTC; the first three entries were backfilled at 19:36 and their times are approximate.

Model: Claude Opus 5.5 for the first prompt, Claude Fable 5.1 from the second prompt on.

---

## 2026-10-23 ~19:17 UTC

> Alright, check the access by token to my git account, do you have it?
> [REDACTED]

**Done:** called the GitHub API with the token: it authenticates as `kiewfenix`, has nearly every scope and no expiry. Recommended revoking it after use and logging in with `gh auth login` instead. Token not saved anywhere.

## 2026-10-23 ~19:19 UTC

> Alright, i need to do a serious test task now, and firsst where we start - we need to create a blank public repo, it can be empty
> Here is the basic info about what we need to set up before we start
>
> So, do the basic app setup and check if api is available now with test data. then we will proceed to the task
>
> [3 screenshots attached: the CashMine invitation email, the confirmation email with the web-build change, and sections 1–2 of the task email, which include the API token]

**Done:** created the public repo `kiewfenix/cashmine-payback` through the GitHub API; scaffolded the app with `npx create-expo-app@latest` (Expo SDK 58, TypeScript, expo-router) and ran `reset-project`; set `web.output` to `single` and `baseUrl` to `/cashmine-payback`; added a GitHub Actions workflow that exports the web build and deploys it to GitHub Pages; fetched the API docs and verified `GET /v1/balances` and `GET /v1/activity` with the token; pushed 3 commits and confirmed the first deploy was green. Also tried to rewrite the authorship of the 3 scaffold commits with `git filter-branch` + force push, which Claude Code's safety check blocked; kept the history and set the repo's git identity for future commits instead.

## 2026-10-23 ~19:31 UTC

> Alright, now here are all the requirements, as you can see - it says that we need to store all the promts of the task in a separate file to let them see how I thing and how it do things. So le'ts do this in another way. Analyse the task and requirements fully and then give me the step by step promts in the table li the order thay specified. Like the firsst one should be like to create a promts tracking file, then the second to inititialize the app, then topic by topic implementation promts. Also, there are questions in there - review them all and give be best answers. Overall - before we start writing the promts to the file - answer everything for me so i will just use it and save to some md file - but never push this file to github.
>
> Also before you start - never put co-authored to commits, also commit message should be short like feat: ..., fix: ..., chore: ... - add this rules to claude md
>
> [4 screenshots attached: sections 1–8 of the task email]

**Done:** added `CLAUDE.md` with the commit rules (short conventional messages, no `Co-Authored-By`, no history rewriting), secret handling, money handling and the prompt-logging rule. Wrote a private plan file outside the repo with the task analysis, the three decisions with alternatives, the architecture and a step-by-step prompt sequence with time boxes.

## 2026-10-23 19:36 UTC

> Create ai-logs/README.md (what the folder is: prompts log + full session export added at the end, tokens redacted) and ai-logs/prompts.md as a running log. From now on, before you act on any message I send, append it verbatim to ai-logs/prompts.md with a UTC timestamp, and when you finish, append a 1–3 line summary of what you did (files, commit). Backfill prompts.md with every prompt I already sent in this session, in order, with the tokens replaced by [REDACTED]. Commit as `chore: add ai-logs prompt tracking` and push.

**Done:** created `ai-logs/README.md` and this file with the backfill. Committed `CLAUDE.md` separately as `chore: add claude working rules`, then `chore: add ai-logs prompt tracking`, and pushed.

## 2026-10-23 19:41 UTC

> Build the app foundation, no feature screens yet.
> - src/api/config.ts exports API_BASE_URL = "https://task-api.cashmine.io" — the only place the base URL exists.
> - src/api/client.ts: apiFetch<T>(path, { method, body, token, idempotencyKey, timeoutMs = 15000 }) on fetch + AbortController. Map non-2xx bodies ({ error: { code, message, field, retryAfterMs } }) to a typed ApiError (status, code, message, field, retryAfterMs); throw NetworkError on fetch failure and TimeoutError on abort. For GET only: on 429 wait retryAfterMs (fallback Retry-After header) and retry once. Never auto-retry POST here; the claim flow decides.
> - src/api/types.ts: types exactly per https://task-api.cashmine.io/docs (all amounts are strings). src/api/endpoints.ts: getBalances, getActivity({cursor, limit}), getClaimOptions(asset), createClaim(body, idempotencyKey) returning { claim, replayed }, getClaim(id).
> - src/state/token.tsx: TokenProvider + useToken(); token in localStorage (guard when window is undefined), setToken/clearToken; a helper so any 401 clears the token and routes to /token.
> - src/app/token.tsx: text field (secureTextEntry off, autoCapitalize none), Save, one sentence explaining the token stays in this browser. src/app/_layout.tsx: Stack with providers, a centered column max 430px wide (full width on phones), header right button "Token" → /token. src/app/index.tsx: placeholder that redirects to /token when there is no token.
> Strict TypeScript, no any. Run npx tsc --noEmit and npx expo lint, start npx expo start --web and confirm the token screen renders. Commit `feat: api client and token screen` and push.

**Done:** added `src/api/{config,types,client,endpoints,useApi}.ts`, `src/state/token.tsx` (localStorage, `withAuth` clears the token on 401), `src/ui/{theme,Button}`, `src/app/_layout.tsx` (providers, 430px frame, `Stack.Protected` guard, header "Token" link), `src/app/token.tsx`, and a placeholder `src/app/index.tsx` that calls `/v1/balances` as a smoke test. `expo lint` set up ESLint on first run. tsc, lint and `expo export` clean. Commit `feat: api client and token screen`, pushed.

## 2026-10-23 19:49 UTC

> Implement src/lib/money.ts with exact decimal arithmetic using BigInt fixed-point. No floats anywhere, no dependencies. Amounts are strings at the boundaries and { units: bigint, decimals } inside.
> - parseAmount(input, decimals): trims, accepts a comma as decimal separator by converting to a dot, then enforces the API grammar: digits with an optional dot and more digits, no leading zeros ("0.5", "12" ok; ".5", "1.", "05", "1e-3", "", "-1" rejected), at most `decimals` fraction digits. Returns { ok: true, units } or { ok: false, reason: 'empty' | 'format' | 'too_many_decimals' }.
> - formatUnits(units, decimals, { maxFractionDigits? }): canonical string, trailing zeros trimmed, never exponent form, truncation (not rounding) when maxFractionDigits is given.
> - add, sub, compare on same-decimals units; isZero.
> - mulToUsdCents(units, decimals, usdPrice: string): bigint cents rounded half-up. formatUsd(cents): "$1,234.56" (negative as "-$…").
> - computeReceive(amountUnits, feeUnits) and validateClaimAmount({ input, decimals, minAmount, available, fee }) returning { ok: true, units } or { ok: false, code: 'empty' | 'format' | 'too_many_decimals' | 'below_min' | 'above_available' | 'not_positive_after_fee' }.
> - sumUsdCents(items: { amount, decimals, usdPrice }[]).
> Then set up jest: npx expo install jest-expo jest @types/jest, "test": "jest", "jest": { "preset": "jest-expo" }. Write src/lib/__tests__/money.test.ts covering: the grammar cases above, decimals limit (6 for USDT, 18 for ETH), 18-decimal ETH values floats can't represent (e.g. "12.345678901234591676" minus "0.000000000000000001"), validation at the boundaries (== min, == available, one unit below min, one unit above available), fee/receive, USD rounding half-up and totals, comma input. Run npm test until green. Commit `feat: exact money math with tests` and push.

**Done:** `src/lib/money.ts` (BigInt fixed-point: parseAmount with the API grammar + comma support, toUnits for signed server amounts, formatUnits with truncating display precision, compare/isZero, mulToUsdCents and sumUsdCents rounding half-up once, formatUsd, computeReceive, validateClaimAmount). jest-expo installed; `src/lib/__tests__/money.test.ts` has 24 tests, all green. One expectation I wrote was wrong (expected an untrimmed trailing zero after truncation) and was corrected. tsc and lint clean. Commit `feat: exact money math with tests`, pushed.

## 2026-10-23 19:53 UTC

> Build the Balances home screen in src/app/index.tsx (keep the redirect to /token when there is no token).
> - src/hooks/useResource.ts: generic hook returning { data, error, loading, refreshing, refetch } with an optional pollMs that pauses when document.hidden, and cancels on unmount. Keep the last good data when a refetch fails.
> - Load GET /v1/balances. Headline: total available in USD (sumUsdCents). Second line: pending total in USD. Then a card per asset with available (claimable), pending, claiming, USD value of available, and a Claim button (disabled when available is 0) linking to /claim/[asset]. Format crypto with up to 8 fraction digits, trailing zeros trimmed.
> - Freshness line "Updated 19:20:26 · 12 s ago" from asOf, ticking every second; amber "stale" when older than 60 s or when the last refresh failed, while still showing the last good data with the error above it.
> - States: initial loading skeleton; error with a Retry button and a friendly message per error type (ApiError message, NetworkError "Can't reach CashMine", TimeoutError); 401 → token screen; header Refresh button; auto refresh every 15 s. No pull-to-refresh (react-native-web doesn't support it).
> Design for a 390px phone. Check it in the browser. npx tsc --noEmit, npx expo lint. Commit `feat: balances screen` and push.
