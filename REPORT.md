# REPORT: Training Shop UI test automation

| | |
|---|---|
| Baseline | `b686df0` (legacy suite as received) |
| Audit | `7a2a58d` (`AUDIT.md`, findings F1–F17) |
| Tested commit | `d4a5f55` (stabilized suite) |
| Stack | Playwright 1.64.1, TypeScript 5.9.3, Chromium, Node.js 22 |
| Result | 5 consecutive full green runs, `--retries=0`, 19 passed / 0 failed / 0 skipped each |

Details of every change: `docs/competition-changes.md`. AI usage: `docs/ai-usage.md`. `app/` was not modified.

## 1. Initial state

On the baseline run without retries, **4 of 6 executable tests failed and 1 was skipped**. One of the 2 passing tests (`catalog is displayed`) failed 3 times in 10 on repeat. CI could not fail, because the test step had `continue-on-error: true`.

## 2. Problems and their causes

| Problem | Cause | Effect |
|---|---|---|
| CI was always green (F1) | `continue-on-error: true` on the test step | A broken suite looked healthy |
| Tests depended on each other (F2, F6) | One page and context shared through `beforeAll`. The total and checkout tests relied on items added by an earlier test | Order-dependent results. After any failure the worker restarted on `about:blank`, so one failure caused 3 more |
| False pass (F3) | `try/catch` around the invalid-email assertion, logging "Environment issue" | The validation test could never fail |
| Random failures (F4, F5) | `waitForTimeout(300–500)` against the app's random 150–1050 ms delays, plus one-shot reads (`count()`, `textContent()`, `isVisible()`) that never retry | Pass or fail depended on timing |
| Flakiness hidden (F7) | `retries: 2` | Unstable tests reported as passed |
| Weak checks (F8, F9) | Checkout checked only that the confirmation was visible. Search checked only the first card | Wrong behaviour could still pass |
| Brittle structure (F10, F11) | `page: any`, positional selectors (`article button`.first(), `input`.first()), raw selectors in tests | Hard to read, easy to break |
| Coverage gaps (F12) | `coupon discount` was an empty `test.skip`. About 7 of 8 product requirements had no real check | — |
| Weak diagnostics (F13, F14) | No traces, only the HTML report uploaded, `npm install` instead of `npm ci`, no job timeout | Failures in CI could not be investigated |

All baseline failures were test defects. None of them pointed to the product.

## 3. Changes

| Area | Change |
|---|---|
| Isolation | Per-test `shop` fixture (`tests/fixtures.ts`) built on Playwright's `page`: every test gets a fresh context and localStorage, and builds its own cart |
| Synchronization | No `waitForTimeout`. The page object waits for state: `open()`/`reload()` wait for "Loading products…" to disappear, `addToCart()` waits for the badge to reach old count + 1, checkout waits for the form. All assertions are web-first (`toHaveCount`, `toHaveText`, `toBeVisible`, `toBeDisabled`). The app delays are untouched |
| Structure | Typed page object `pages/shop.ts` with readonly role/label locators and intent methods. The single spec was split into `catalog`, `cart` and `checkout` |
| False pass | `try/catch` removed. The test now sets up a cart, opens checkout and asserts the exact error text |
| Config | `retries: 0`, `trace: 'retain-on-failure'`, `forbidOnly` on CI, `fullyParallel: true`, `workers: 2` |
| CI | `continue-on-error` removed, `npm ci` with cache, `tsc --noEmit` step, `--retries=0`, job timeout 15 min, uploads `playwright-report/` and `test-results/` (traces, screenshots) with `if: always()` |

**Why `workers: 2` and not more.** The timeout was not increased. With the local default of 6 workers, 3 of 12 full runs failed in the first parallel wave: "Loading products…" stayed visible for 15 s. The trace showed a host stall, not a test or app fault. A 4.7 KB local page took 7.7 s to receive, and Playwright's own trace events had ~35 s gaps. With 2 workers, 8 of 8 full runs were green. 2 is also Playwright's default on a 4-vCPU GitHub runner.

**One expected value changed.** `basket total is correct` expected `89`, which came from the previous test's cart. It now adds the keyboard and the mouse itself and expects `124` (89 + 35 from the README prices). All 7 original test titles are kept.

## 4. Coverage

7 tests → **19 tests, 0 skipped**. Each README requirement has at least one check of the result of the action.

| Requirement | Tests | What is asserted |
|---|---|---|
| Catalog: 3 products with prices | `catalog is displayed` | Exactly 3 cards; each name with its price |
| Search: case-insensitive, no-match message | `search works`, `search is case-insensitive`, `search without matches shows "No products found"`, `clearing the search restores the full catalog` | Exactly 1 result and the right product; 0 results plus the message; full catalog back after clearing |
| Add, repeat add allowed | `add product to basket`, `the same product can be added twice`, `basket total is correct` | Badge count, cart lines, total (`124`, `70`) |
| Remove one line, total recalculated | `removing an item removes one line and recalculates the total` | 2 → 1 line, the right line remains, badge `1`, total `124` → `35` |
| Empty cart blocks Checkout | `empty cart blocks checkout`, `removing the last item disables checkout again` | "Your cart is empty", 0 lines, Checkout disabled, also after removing the last item |
| Cart kept after reload | `cart is kept after page reload` | Badge, both lines in order and total `338` after reload |
| Valid email; address ≥ 5 after trim | `invalid email is rejected`, `address shorter than 5 characters is rejected`, `address is measured after trimming surrounding spaces`, `address of exactly 5 characters is accepted` | Exact error text, no confirmation, cart intact; boundary `"abcd"` / `"  abcd  "` rejected, `"abcde"` accepted |
| SAVE10 −10%; unknown coupon → error, no discount | `coupon discount`, `unknown coupon shows an error and gives no discount` | Status text; order total `89.00` → `80.10`; unknown code keeps `89.00` |
| Successful order: `ORD-…`, confirmation, cart cleared | `checkout happy path` | Id matches `^ORD-\d+$`, confirmation text, form hidden, badge `0`, cart empty |

**Priority and depth.**
- **Deepest coverage goes to checkout and validation.** That is where the money flow is and where the rules have edges, so boundaries are checked on both sides: 4 vs 5 characters, and spaces trimmed.
- **The cart gets state-change checks.** Every cart test checks the badge, the lines and the total together, because a wrong total is the most expensive silent failure.
- **Search and catalog get one check per rule.** Each rule there is simple.
- **What is deliberately not covered:**
  - coupon case and whitespace handling, which the README does not specify (see §6);
  - other browsers, since the brief targets Chromium;
  - visual layout.

## 5. Evidence: five consecutive runs

All runs are on commit `d4a5f557d47a7be3914ff8c49f264fdaa72c348f`, run locally on Windows 11 with Node.js 22. The runs were back to back with no code changes between them. Before run 1 the port was free, so each run started its own server.

Command (N = 1…5):

```sh
PLAYWRIGHT_HTML_OUTPUT_DIR=evidence/run-N/html-report \
PLAYWRIGHT_JSON_OUTPUT_FILE=evidence/run-N/results.json \
npx playwright test --retries=0 --reporter=list,html,json --output=evidence/run-N/test-results
```

| Run | Start (UTC+2) | End | Exit | Passed | Failed | Flaky | Skipped | Duration | Report |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| 1 | 2026-10-29 13:58:58 | 13:59:27 | 0 | 19 | 0 | 0 | 0 | 25.4 s | `evidence/run-1/` |
| 2 | 2026-10-29 13:59:28 | 13:59:57 | 0 | 19 | 0 | 0 | 0 | 24.6 s | `evidence/run-2/` |
| 3 | 2026-10-29 13:59:58 | 14:00:27 | 0 | 19 | 0 | 0 | 0 | 25.2 s | `evidence/run-3/` |
| 4 | 2026-10-29 14:00:28 | 14:00:58 | 0 | 19 | 0 | 0 | 0 | 25.8 s | `evidence/run-4/` |
| 5 | 2026-10-29 14:00:59 | 14:01:25 | 0 | 19 | 0 | 0 | 0 | 22.3 s | `evidence/run-5/` |

Each `evidence/run-N/` holds `html-report/index.html`, `results.json` (counts come from its `stats`), `console.log` and `test-results/`. The summary is in `evidence/runs.log`.

Earlier stability checks on the same test code, all with `--retries=0`:
- `--repeat-each=5`, 2 workers: 95/95;
- `--repeat-each=3 --workers=1`: 57/57;
- `--repeat-each=10`, 6 workers: 190/190.

## 6. Product defects and open questions

These are product issues, not test issues. They should be filed against `app/`, which belongs to another team.

1. **CONFIRMED defect: Checkout is enabled for an empty cart while products are loading.**
   - Steps:
     1. Start with a fresh profile, so the cart is empty.
     2. Open `/`.
     3. While "Loading products…" is visible, click `Cart (0)`.
     4. Click `Checkout`.
   - Expected (README): an empty cart blocks Checkout.
   - Actual: Checkout is enabled and the form opens. Reproduced 5/5 with a separate probe script.
   - Cause in code: `#checkout` has no initial `disabled`. Only `renderCart()` sets it, and that runs after `/api/products` responds.
   - Mitigation: the server rejects empty orders, so the user gets "Unable to place order".
   - Not added to the suite as a failing test. It would fail every run, and it is better tracked as a known defect.
2. **Needs clarification: which total the coupon reduces.** After SAVE10 only `Order total` changes (`80.10`). The cart `Total: $89` stays the same. The tests assert the order total only.
3. **Needs clarification: coupon matching is exact.** `save10` and `" SAVE10 "` both give "Invalid coupon". The README does not specify this, so it is not asserted.
4. **Noted, not verified:** after a successful order the coupon field and the "Coupon applied" text keep their old values, although the discount itself is reset.

## 7. Remaining risks

- **CI not executed.** There is no GitHub remote yet. The workflow has been checked by reading it only. It still needs to be run once on Actions, including a deliberately red run to prove it fails.
- **GitHub Pages publishing is not done.** It was deferred because an unconfigured Pages environment would turn the workflow red.
- **Different CI host.** The five runs are local (Windows, 12 cores). The GitHub runner (Linux, 4 vCPU) has not been measured. `workers: 2` was chosen to match it.
- **Parallel stall on overloaded hosts.** More than 2 workers on a busy machine reproduced the start-up stall described in §3.
- **Order id collisions.** Order ids use `Date.now()`, so two parallel orders in the same millisecond could share an id. The tests check only the format. Low risk.
- **`strict: false`** in `tsconfig.json` (F16) is not changed yet.
- **Jam.dev and SpiraTest** bug report and test cases are not created yet.
