# Diagnostic Audit: Training Shop Playwright Suite

Date: 2026-10-26. Static review plus baseline runs with `--retries=0`. No project files were modified during the audit.

## A. Executive Summary

**Health: poor. The suite cannot be trusted as it stands.** On the baseline run without retries, 4 of 6 executable tests failed. One of the 2 that passed ("catalog is displayed") failed 3 times in 10 when repeated. CI is configured to never fail (`continue-on-error: true`).

**Main risks**
1. **Shared state across tests.** All tests share one page and context created in `beforeAll`. Tests depend on the order they run in and on earlier results. After any failure Playwright restarts the worker, and the next test starts on `about:blank`, so one failure causes several more.
2. **Fixed sleeps instead of waits.** The app has random 150–1050 ms delays. `waitForTimeout` plus one-time reads (`count()`, `textContent()`, `isVisible()`) that don't retry make failures and passes a matter of chance.
3. **Two ways the suite can report a pass that isn't one.** A `try/catch` swallows assertion errors, and the CI test step never fails. `retries: 2` hides instability.
4. **Coverage gaps.** About 7 of the 8 product requirements have no real check. Coupon is an empty `test.skip`.

**Immediate actions:** move to per-test isolation with a fixture, replace sleeps with web-first assertions, remove the `try/catch`, make CI fail on test failure, then add the missing scenarios.

## B. Baseline Results (observed)

| Metric | Result |
|---|---|
| Discovered tests | 7 (1 file, chromium only) |
| Passed | 2 (catalog, search) |
| Failed | 4 (add to basket, basket total, checkout, invalid email) |
| Skipped | 1 (`coupon discount`, `test.skip`) |
| Execution time | 1.0 min (≈65 s wall clock) with `--retries=0`, 1 worker |
| Environment status | OK: Playwright 1.64.1 (`^1.56.0` in `package.json`), TS 5.9.3, chromium installed, `tsc --noEmit` clean, webServer starts |
| Flakiness probe | `catalog is displayed` failed 3/10 (`Expected 3, Received 0`); `search works` passed 10/10 |

Commands used:

```sh
npx tsc --noEmit
npx playwright test --list
npx playwright test --retries=0
npx playwright test -g "catalog is displayed|search works" --repeat-each=10 --retries=0
```

**Why each test failed (all are test defects; none points to the app)**

| Test | Error | Cause |
|---|---|---|
| add product to basket | `#count` was `"0"`, expected `"1"` | The 300 ms sleep is shorter than the app's 150–850 ms add delay, and `textContent()` is read once without retrying |
| basket total is correct | 15 s timeout on `#cart-button` | The worker restarted after the previous failure, so the page is `about:blank`. The test never calls `open()` and relies on the previous test's state |
| checkout happy path | 15 s timeout | The cart is empty in the fresh context, so `#checkout` is disabled and the click waits forever |
| invalid email is rejected | 15 s timeout | Starts on `about:blank` with no navigation. The `try/catch` would otherwise have hidden this as a pass |

## C. Findings

| ID | Pri | Category | File:Line | Problem | Evidence | Recommended Fix | Est. |
|---|---|---|---|---|---|---|---|
| F1 | P0 | CI | `.github/workflows/tests.yml:13-14` | `continue-on-error: true` makes the test step always pass | Static | Remove it. Keep `if: always()` on uploads | 2 m |
| F2 | P0 | Isolation | `tests/shop.spec.ts:4-13` | One page and context shared across tests through `beforeAll` | Observed failure cascade | Use the built-in `{ page }` fixture plus a custom `shop` fixture. Each test sets up its own state | 15 m |
| F3 | P1 | False pass | `tests/shop.spec.ts:49-55` | `try/catch` swallows assertion failures. The test also has no navigation and no setup | Static, and the baseline timeout | Remove the `try/catch`. Navigate, add an item, open checkout, then assert the error | 5 m |
| F4 | P1 | Sync | `pages/shop.ts:5,9`, `tests/shop.spec.ts:44` | `waitForTimeout(500/300/400)` | Observed flake (3/10) and failure | Remove. Wait for the state you need instead, e.g. `#loading` hidden, `#count` value | 10 m |
| F5 | P1 | Sync | `tests/shop.spec.ts:17,23,45` | `expect(await x.count/textContent/isVisible())` does not retry | Observed `Received: 0` | `await expect(loc).toHaveCount(3)`, `toHaveText('1')`, `toBeVisible()` | 5 m |
| F6 | P1 | Dependency | `tests/shop.spec.ts:26-29, 37-46` | The total and checkout tests assume an item added by an earlier test | Observed | Add the item inside each test, or through a helper | incl. F2 |
| F7 | P1 | Config | `playwright.config.ts:7` | `retries: 2` hides flakiness and the brief requires zero retries | Static, and stale `-retry1/2` dirs | `retries: 0` | 1 m |
| F8 | P1 | Assertion | `tests/shop.spec.ts:45` | Checkout only checks that `#confirmation` is visible | Static | Also assert `#order-id` matches `/^ORD-\d+$/` and that the cart count returns to 0 | 3 m |
| F9 | P1 | Assertion | `tests/shop.spec.ts:34` | Search checks only the first card. It doesn't check that other products are filtered out or that matching ignores case | Static | Search for `mouse` and assert `toHaveCount(1)` plus the name | 3 m |
| F10 | P2 | Locators | `pages/shop.ts:8`, `tests/shop.spec.ts:33` | `article button`.first(), `input`.first() | Static | `getByRole('article',{name:'Wireless Mouse'}).getByRole('button',{name:'Add to cart'})`, `getByLabel('Search products')` | 10 m |
| F11 | P2 | POM | `pages/shop.ts:2` | `page: any`, no locators, too few methods. Tests use raw selectors directly | Static | Type it as `Page`. Add readonly locators and `addToCart(name)`, `openCart()`, `removeItem(name)`, `checkout({email,address,coupon})` | 20 m |
| F12 | P2 | Coverage | `tests/shop.spec.ts:58-60` | Empty `test.skip` for coupon | Observed skipped | Write real SAVE10 and invalid-coupon tests | 10 m |
| F13 | P2 | CI | `tests.yml:11,15-19` | Uses `npm install` instead of `npm ci`. Uploads the HTML report only, not `test-results`/traces. No Pages deploy, no job timeout | Static | `npm ci`, upload `test-results/`, add a Pages deploy job with `pages: write, id-token: write` | 20 m |
| F14 | P2 | Config | `playwright.config.ts:10` | No traces, and no `forbidOnly` | Static | `trace: 'retain-on-failure'`, `forbidOnly: !!process.env.CI` | 3 m |
| F15 | P2 | Config | `playwright.config.ts:5-6` | `workers: 1`, `fullyParallel: false`. Only necessary because of the shared state | Static | After F2, `fullyParallel: true`. Each context has its own localStorage, so this is safe | 2 m |
| F16 | P3 | TS | `tsconfig.json:6` | `strict: false` | Static | `strict: true`, after F11 | 5 m |
| F17 | P0 | Delivery | repo root | Not a git repo. The brief asks you to commit the baseline first | Observed (`git` absent) | `git init`, commit the baseline including `package-lock.json` | 3 m |

## D. Test Coverage Gaps (requirements from the README, so these are confirmed)

| Feature | Existing | Missing scenarios | Pri |
|---|---|---|---|
| Catalog (3 products and prices) | Count only, flaky | Names and prices | P1 |
| Search | Partial | Case-insensitive match, `No products found`, clearing the search restores all products | P1 |
| Add to cart | Broken | Adding the same item twice gives count 2 | P1 |
| Remove and recalculate | None | Removing one of two items updates count and total | P1 |
| Empty cart blocks checkout | None | `Your cart is empty` shown and Checkout disabled; removing the last item disables it | P1 |
| Persistence after reload | None | Add, reload, count and items kept. Wait for products to load first, because count reads 0 until then | P1 |
| Validation | Broken (false pass) | Invalid email; address shorter than 5 characters; address of 5+ characters that is too short once surrounding spaces are trimmed (boundary: `"  abcd  "` is rejected, `"abcde"` is accepted) | P1 |
| Coupons | Skipped | SAVE10 gives 10% off (e.g. $89 → `80.10`); unknown coupon gives `Invalid coupon` and no discount | P1 |
| Successful order | Weak | `ORD-…` id, confirmation shown, cart cleared (count 0) | P1 |

**Needs clarification or worth noting as possible product defects (inferred from code, not observed at runtime):**
- The coupon changes only "Order total". The cart `#total` stays undiscounted. Which value does "reduces the total" refer to?
- Coupon matching is exact: no trimming, and it is case-sensitive (`app/index.html:36`).
- The `#checkout` button is not `disabled` in the HTML. It only becomes disabled after products load (`app/index.html:13,26,44`), so an empty cart can reach Checkout during the loading window. This is a candidate product bug; confirm it before filing.
- After a successful order, `discount` resets but the coupon field and its "Coupon applied" text stay as they were (`app/index.html:42`).

## E. Improvement Plan

| # | Change | Why | Time | Depends on | Verify |
|---|---|---|---|---|---|
| 1 | `git init`, commit the baseline as-is | Required by the brief, and gives you a diff for REPORT.md | 3 m | — | `git log` |
| 2 | Config: `retries: 0`, `trace: 'retain-on-failure'`, `forbidOnly` | Exposes the real state of the suite and collects diagnostics | 5 m | 1 | `npx playwright test` |
| 3 | Extend the POM in `pages/shop.ts` with typed role/label locators and methods that wait for state (e.g. `open()` waits for `#loading` to be hidden; `addToCart` waits for the count to increment) | Removes sleeps and gives one place for interactions | 25 m | 2 | `tsc` |
| 4 | Fixture `tests/fixtures.ts` that provides `shop` per test; rewrite the 6 tests on it with web-first assertions; remove the `try/catch` | Fixes F2–F9 | 25 m | 3 | 6/6 pass, then `--repeat-each=10` |
| 5 | Add the coverage from section D, grouped into spec files (catalog/search, cart, checkout) | Worth 25 points | 40 m | 4 | `--repeat-each=5 --workers=4` all green |
| 6 | Turn on `fullyParallel` | Shorter runs, and proves the tests are independent | 2 m | 4 | Repeat runs stay green |
| 7 | CI: `npm ci`, remove `continue-on-error`, upload report and `test-results`, deploy to Pages, add `timeout-minutes` | Worth 20 points, and a failure now turns the run red | 20 m | 1 | Push a deliberately broken test and see red, then revert |
| 8 | 5 consecutive green runs with no retries (CI, or local plus CI), recording the SHA, time, counts and report links | Required evidence | 15 m | 5–7 | — |
| 9 | REPORT.md, including the product-defect section | Required deliverable | 20 m | 8 | — |

## F. Quick Wins (5–10 min each)
- Remove `continue-on-error` and set `retries: 0` (F1, F7).
- Replace the 3 non-retrying reads with `toHaveCount`/`toHaveText`/`toBeVisible` (F5).
- Remove the `try/catch` (F3).
- Add `trace: 'retain-on-failure'` and upload `test-results/` in CI.
- Type `Shop.page` as `Page` (F11, partial).

## G. Risks and Open Questions
- **CI speed:** random delays of up to ≈1 s per network call or add-to-cart action. With roughly 20 tests on 1 worker this is about 1–2 minutes, which is fine. Parallel runs locally are safe because each context has its own localStorage and the server keeps no state.
- **Two possible clean-ups not yet verified:** whether `Date.now()` order ids can collide under parallel runs (they are only displayed, so this is low risk), and the Checkout-before-load race.
- **Organizers:** whether the coupon should apply to the cart total or only the order total; whether coupon codes should ignore case and whitespace; whether the 5 runs must be on CI or can be local.
- Jam.dev and SpiraTest availability is unknown.
- `mentor/HINTS.md` was not read, as the README asks.
- **Not verified:** whether the workflow runs on GitHub (there is no remote).

## H. Suggested Next Action
Commit the baseline. Then do steps 2–4 together: set `retries: 0`, add a per-test `shop` fixture backed by a typed POM, and rewrite the 6 existing tests with web-first assertions. Every failure seen in the baseline traces back to this, and every later step depends on it.
