# Working rules for this repo

## Commits
- One short line, conventional prefix: `feat: …`, `fix: …`, `chore: …`, `docs: …`, `test: …`. No body.
- Never add `Co-Authored-By` or any other trailer/attribution line.
- Commit at least every 30 minutes. Never squash, amend pushed commits or rewrite history: the commit history is part of the submission.

## Secrets
- The API token comes from the user at runtime only. Never write it into code, config, the repo, the build or `ai-logs/`.
- The API base URL lives only in `src/api/config.ts`.

## Money
- Amounts are decimal strings. Never use JS numbers or floats for money; use `src/lib/money.ts` (BigInt fixed-point).

## AI logging
- Before acting on each user message, append it verbatim with a UTC timestamp to `ai-logs/prompts.md`. After finishing, append a 1–3 line summary of what was done (files, commit). Never tidy or reword old entries.

## Before calling a step done
- `npx tsc --noEmit` and `npx expo lint` pass; `npm test` passes when `src/lib` changes.
- See `AGENTS.md` for Expo SDK specifics.
