import { test, expect } from './fixtures';

test.describe('Cart', () => {
  test('add product to basket', async ({ shop }) => {
    await shop.addToCart('Mechanical Keyboard');
    await expect(shop.cartCount).toHaveText('1');
    await shop.openCart();
    await expect(shop.cartItems).toHaveCount(1);
    await expect(shop.cartItems.first()).toContainText('Mechanical Keyboard');
  });

  test('basket total is correct', async ({ shop }) => {
    await shop.addToCart('Mechanical Keyboard');
    await shop.addToCart('Wireless Mouse');
    await shop.openCart();
    await expect(shop.cartTotal).toHaveText('124');
  });

  test('the same product can be added twice', async ({ shop }) => {
    await shop.addToCart('Wireless Mouse');
    await shop.addToCart('Wireless Mouse');
    await expect(shop.cartCount).toHaveText('2');
    await shop.openCart();
    await expect(shop.cartItems).toHaveCount(2);
    await expect(shop.cartTotal).toHaveText('70');
  });

  test('removing an item removes one line and recalculates the total', async ({ shop }) => {
    await shop.addToCart('Mechanical Keyboard');
    await shop.addToCart('Wireless Mouse');
    await shop.openCart();
    await expect(shop.cartTotal).toHaveText('124');

    await shop.removeItem('Mechanical Keyboard');

    await expect(shop.cartItems).toHaveCount(1);
    await expect(shop.cartItems.first()).toContainText('Wireless Mouse');
    await expect(shop.cartCount).toHaveText('1');
    await expect(shop.cartTotal).toHaveText('35');
  });

  test('empty cart blocks checkout', async ({ shop }) => {
    await shop.openCart();
    await expect(shop.cartEmptyMessage).toBeVisible();
    await expect(shop.cartItems).toHaveCount(0);
    await expect(shop.checkoutButton).toBeDisabled();
  });

  test('removing the last item disables checkout again', async ({ shop }) => {
    await shop.addToCart('Studio Monitor');
    await shop.openCart();
    await expect(shop.checkoutButton).toBeEnabled();

    await shop.removeItem('Studio Monitor');

    await expect(shop.cartEmptyMessage).toBeVisible();
    await expect(shop.cartCount).toHaveText('0');
    await expect(shop.cartTotal).toHaveText('0');
    await expect(shop.checkoutButton).toBeDisabled();
  });

  test('cart is kept after page reload', async ({ shop }) => {
    await shop.addToCart('Mechanical Keyboard');
    await shop.addToCart('Studio Monitor');

    // reload() waits for the catalog: the badge reads 0 until products are loaded.
    await shop.reload();

    await expect(shop.cartCount).toHaveText('2');
    await shop.openCart();
    await expect(shop.cartItems).toHaveCount(2);
    await expect(shop.cartItems.nth(0)).toContainText('Mechanical Keyboard');
    await expect(shop.cartItems.nth(1)).toContainText('Studio Monitor');
    await expect(shop.cartTotal).toHaveText('338');
  });
});
