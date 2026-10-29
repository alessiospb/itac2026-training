# Competition Change Log

Baseline: commit `b686df0` (unmodified project). Audit: `7a2a58d` (`AUDIT.md`, findings F1–F17).
All changes below are in commit `d4a5f55` on `main`. `app/` was not modified.

## Changes

| ID | Category | Problem | Root Cause | Files Changed | Fix | Verification |
|---|---|---|---|---|---|---|
| C-01 (F1) | CI | The test step could never fail | `continue-on-error: true` | `.github/workflows/tests.yml` | Removed. Tests run with `--retries=0` | Static only. No GitHub remote, so not run on Actions |
| C-02 (F2, F6) | Isolation | One shared page and context in `beforeAll`. Tests depended on earlier tests (cart contents, current page). One failure cascaded to the next three | Shared mutable state | `tests/fixtures.ts` (new), all specs | Per-test `shop` fixture built on the built-in `page`, which gives a fresh context and localStorage. Each test creates its own cart | 19/19 full suite. 95/95 `--repeat-each=5`. 57/57 `--repeat-each=3 --workers=1`. 190/190 `--repeat-each=10` (6 workers) |
| C-03 (F3) | False pass | `try/catch` swallowed the assertion. The test had no navigation or setup | Error hiding | `tests/checkout.spec.ts` | Removed. The test adds an item, opens checkout, submits an invalid email, and asserts the exact error text, that confirmation is hidden, and that the cart is intact | Passes in all runs above |
| C-04 (F4) | Sync | `waitForTimeout(500/300/400)` raced against the app's random delays (150–1050 ms) | Fixed sleeps | `pages/shop.ts`, specs | `open()`/`reload()` wait for `#loading` to be hidden. `addToCart()` waits for the badge to reach the old count + 1. Checkout waits for `#order-id`. The app delays are untouched | Same as C-02. `catalog is displayed` went from 3/10 failing to 0 failures |
| C-05 (F5) | Sync | `expect(await x.count()/textContent()/isVisible())` did not retry | One-shot reads | specs | Web-first `toHaveCount`/`toHaveText`/`toBeVisible` | Same as C-02 |
| C-06 (F7, F14) | Config | `retries: 2` hid flakiness. No traces, no `forbidOnly` | Config | `playwright.config.ts` | `retries: 0`, `trace: 'retain-on-failure'`, `forbidOnly: !!process.env.CI` | A trace was produced and used to diagnose C-09 |
| C-07 (F8, F9) | Assertions | Checkout only checked visibility. Search only checked the first card | Weak oracles | `tests/checkout.spec.ts`, `tests/catalog.spec.ts` | Checkout: `ORD-\d+` id, confirmation text, form hidden, cart count 0, "Your cart is empty". Search: exactly 1 result, the right product | Passing |
| C-08 (F10, F11) | POM / locators | `page: any`, positional `article button`.first(), `input`.first(), raw selectors in tests | No abstraction | `pages/shop.ts` | Typed `Page`, readonly locators (role/label first: `getByLabel('Search products')`, region `Shopping cart`, `Remove <name>` buttons, product by heading), plus intent methods | `tsc --noEmit` clean. Locators checked against `app/index.html` markup and by passing runs |
| C-09 (F15) | Parallelism | After isolation, `fullyParallel` is safe. With the local default of 6 workers, 2 of 6 full runs (and 1 of 6 in a later batch) failed in the first wave: `#loading` stayed visible for 15 s | Host resource stall during parallel Chromium start-up. Trace: `index.html` (4.7 KB, local) server wait 31 ms but **receive 7747 ms**, `/api/products` never answered, and gaps of ~35 s between Playwright's own trace events. Not a test-logic or app-logic failure | `playwright.config.ts` | `fullyParallel: true`, `workers: 2` (with a comment). No timeout increase | `--workers=2`: 8/8 full runs green, then 95/95 `--repeat-each=5`. 6 workers: 3 of 12 full runs red in the same way |
| C-10 (F12) | Coverage | `coupon discount` was an empty `test.skip` | TODO | `tests/checkout.spec.ts` | Implemented (SAVE10 → status "Coupon applied: 10% off", order total 89.00 → 80.10). Added an unknown-coupon test (status "Invalid coupon", total stays 89.00). Test title kept | Passing |
| C-11 | Coverage | README requirements had no checks | Gaps (AUDIT §D) | `tests/catalog.spec.ts`, `tests/cart.spec.ts`, `tests/checkout.spec.ts` | Added: names and prices; case-insensitive search; "No products found"; clearing the search; adding twice; removal with recalculation; empty cart blocks checkout; removing the last item disables checkout; persistence after reload; address < 5; address trimmed (`"  abcd  "`); boundary `"abcde"` accepted | Passing. 7 → 19 tests, 0 skipped |
| C-12 (F13, partial) | CI | `npm install`, report-only upload, no job timeout | Config | `.github/workflows/tests.yml` | `npm ci` with npm cache, `tsc --noEmit` step, `timeout-minutes: 15`, uploads both `playwright-report/` and `test-results/` (traces, screenshots) with `if: always()` | Static only |

The original `tests/shop.spec.ts` was split into `catalog.spec.ts`, `cart.spec.ts` and `checkout.spec.ts`. All 7 original test titles are kept: `catalog is displayed`, `search works`, `add product to basket`, `basket total is correct`, `checkout happy path`, `invalid email is rejected`, `coupon discount`.
`basket total is correct` now adds the keyboard and the mouse and expects `124`. The original `89` depended on the previous test's cart. Both values follow from the README prices.

## Not done / deferred

- F13 (rest): GitHub Pages deploy job. Deferred. With no remote, it could not be verified, and an unconfigured Pages environment would turn the workflow red.
- F16 (`strict: true`): P3, deferred.
- F17: the baseline was committed by the user (`b686df0`), outside this phase.

## Suspected / confirmed application defects (for SpiraTest / Jam.dev)

1. **CONFIRMED: Checkout is enabled for an empty cart while products are loading.**
   - Steps: fresh profile (empty cart) → open `/` → immediately click `Cart (0)` while "Loading products…" is visible → click `Checkout`.
   - Expected (README: "Пустая корзина блокирует Checkout", i.e. an empty cart blocks Checkout): Checkout is disabled.
   - Actual: Checkout is enabled and the checkout form opens. Reproduced 5/5 with a scratch Playwright probe (not part of the suite). Cause in code: `#checkout` has no initial `disabled`. Only `renderCart()` sets it, and that runs after `/api/products` resolves (`app/index.html`).
   - Mitigation in the app: the server rejects empty orders (`items.length > 0`), so the user sees "Unable to place order".
   - No failing regression test was added to the suite. Whether to add one is a team decision: it would fail every run and block the five-run campaign. Recommended: add it and track it, or file it and mark it as a known defect.
2. **Needs clarification: what the coupon discounts.** After SAVE10, cart `Total: $89` stays the same and only `Order total` changes to `80.10` (observed). The tests assert the order total only.
3. **Needs clarification: coupon matching is exact.** `save10` and `" SAVE10 "` both give "Invalid coupon" (observed). The README does not specify this, so it is not asserted.
4. Inferred, not verified: after a successful order the coupon field and the "Coupon applied" text stay as they were (`discount` is reset).

## Environment limitations and risks

- Host: Windows 11, 12 cores, with other heavy node processes running. With 6 workers the first parallel wave can stall (C-09). The CI runner is different (Linux, 4 vCPU) and was not verified.
- No GitHub remote. The CI workflow was not executed.
- Order ids use `Date.now()`. Two parallel orders in the same millisecond could share an id. The tests only check the format, so this is low risk.
- The five-run campaign was **not** run in this phase.
