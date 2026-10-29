import { test as base } from '@playwright/test';
import { Shop } from '../pages/shop';

/**
 * Every test gets its own browser context (Playwright's built-in `page` fixture), so the
 * localStorage cart never leaks between tests. `shop` is already opened and loaded.
 */
export const test = base.extend<{ shop: Shop }>({
  shop: async ({ page }, use) => {
    const shop = new Shop(page);
    await shop.open();
    await use(shop);
  },
});

export { expect } from '@playwright/test';
