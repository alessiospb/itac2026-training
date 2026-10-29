# AI Usage

## Tool
Claude Code (Anthropic), run as an agent in the local project directory.

## Phases
1. **Diagnostic audit** (earlier Claude Code phase). Output: `AUDIT.md`, findings F1–F17, committed by the user as `7a2a58d`.
2. **Improvement / stabilization** (this phase). Implement the P0/P1 findings and the useful P2 findings, stabilize the suite, document the changes. The five-run campaign is explicitly out of scope.

## Main instructions
- Prompt for this phase: `C:\MyStudies\ITAC2026\final\prompt2-improve.md` (saved outside the repo). It asks for: a short plan, then implementation; no deleted or skipped tests, no weakened assertions, no extra retries or timeouts; do not modify `app/`; zero-retry verification; keep this file and `docs/competition-changes.md` up to date; no commits or pushes.
- Constraints from the coordinating session and the README: `app/` belongs to another team; async delays must stay; no API calls in place of UI checks; do not read `mentor/HINTS.md` (it was not read); implement the `coupon discount` TODO instead of removing it; record unconfirmed product issues as suspected, not as failing assertions.

## Significant AI-assisted changes
- Typed Page Object `pages/shop.ts` with role/label locators and state-waiting methods. No `waitForTimeout`.
- Per-test `shop` fixture (`tests/fixtures.ts`). The suite is split into `catalog`, `cart` and `checkout` specs. 7 → 19 tests.
- `playwright.config.ts`: `retries: 0`, traces on failure, `forbidOnly` on CI, `fullyParallel`, `workers: 2` (based on trace evidence, see C-09).
- CI: no `continue-on-error`, `npm ci`, typecheck step, report and test-results artifacts, job timeout.
- A scratch probe (outside the repo) that confirmed the checkout-before-load defect.

Details: `docs/competition-changes.md`.

## Verification performed (by the AI, locally, `--retries=0`)
- `npx tsc --noEmit`: clean.
- Full suite repeatedly: 19/19 on 2 workers in 8 consecutive runs. 6-worker runs failed in 3 of 12 attempts (host stall, see C-09). That led to the `workers: 2` decision.
- `--repeat-each=5` (2 workers): 95/95. `--repeat-each=3 --workers=1`: 57/57. `--repeat-each=10` (6 workers): 190/190.
- No checks were run on GitHub Actions (no remote).

## Human decisions / overrides
- The user created the git repository and committed the baseline (`b686df0`) and the audit (`7a2a58d`) during this phase. The AI made no commits.
- Open for humans: whether to add a failing regression test for the confirmed checkout-before-load defect, and the coupon clarifications. No human review of these changes has happened yet.
