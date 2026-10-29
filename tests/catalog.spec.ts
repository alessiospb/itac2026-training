import { test, expect } from './fixtures';

test.describe('Catalog', () => {
  test('catalog is displayed', async ({ shop }) => {
    await expect(shop.products).toHaveCount(3);
    await expect(shop.product('Mechanical Keyboard')).toContainText('$89');
    await expect(shop.product('Wireless Mouse')).toContainText('$35');
    await expect(shop.product('Studio Monitor')).toContainText('$249');
  });
});

test.describe('Search', () => {
  test('search works', async ({ shop }) => {
    await shop.search('Mouse');
    await expect(shop.products).toHaveCount(1);
    await expect(shop.product('Wireless Mouse')).toBeVisible();
  });

  test('search is case-insensitive', async ({ shop }) => {
    await shop.search('mOuSe');
    await expect(shop.products).toHaveCount(1);
    await expect(shop.product('Wireless Mouse')).toBeVisible();
  });

  test('search without matches shows "No products found"', async ({ shop }) => {
    await shop.search('nonexistent product');
    await expect(shop.products).toHaveCount(0);
    await expect(shop.noProductsMessage).toBeVisible();
  });

  test('clearing the search restores the full catalog', async ({ shop }) => {
    await shop.search('zzz');
    await expect(shop.noProductsMessage).toBeVisible();
    await shop.search('');
    await expect(shop.products).toHaveCount(3);
    await expect(shop.noProductsMessage).toBeHidden();
  });
});
