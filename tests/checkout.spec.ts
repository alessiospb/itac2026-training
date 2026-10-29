import { test, expect } from './fixtures';

const VALID = { email: 'qa@example.com', address: '10 Test Street' };

test.describe('Checkout', () => {
  test.beforeEach(async ({ shop }) => {
    await shop.addToCart('Mechanical Keyboard');
    await shop.startCheckout();
  });

  test('checkout happy path', async ({ shop }) => {
    await shop.fillCheckout(VALID);
    await shop.placeOrder();

    await expect(shop.confirmation).toBeVisible();
    await expect(shop.confirmation).toContainText('Thank you for your order');
    await expect(shop.orderId).toHaveText(/^ORD-\d+$/);
    await expect(shop.checkoutForm).toBeHidden();
    // A successful order clears the cart.
    await expect(shop.cartCount).toHaveText('0');
    await expect(shop.cartEmptyMessage).toBeVisible();
  });

  test.describe('Validation', () => {
    test('invalid email is rejected', async ({ shop }) => {
      await shop.fillCheckout({ ...VALID, email: 'invalid' });
      await shop.placeOrder();

      await expect(shop.formError).toHaveText('Enter a valid email');
      await expect(shop.confirmation).toBeHidden();
      await expect(shop.cartCount).toHaveText('1');
    });

    test('address shorter than 5 characters is rejected', async ({ shop }) => {
      await shop.fillCheckout({ ...VALID, address: 'abcd' });
      await shop.placeOrder();

      await expect(shop.formError).toHaveText('Enter a shipping address (at least 5 characters)');
      await expect(shop.confirmation).toBeHidden();
    });

    test('address is measured after trimming surrounding spaces', async ({ shop }) => {
      // 8 characters raw, but only 4 after trim().
      await shop.fillCheckout({ ...VALID, address: '  abcd  ' });
      await shop.placeOrder();

      await expect(shop.formError).toHaveText('Enter a shipping address (at least 5 characters)');
      await expect(shop.confirmation).toBeHidden();
    });

    test('address of exactly 5 characters is accepted', async ({ shop }) => {
      await shop.fillCheckout({ ...VALID, address: 'abcde' });
      await shop.placeOrder();

      await expect(shop.confirmation).toBeVisible();
      await expect(shop.orderId).toHaveText(/^ORD-\d+$/);
      await expect(shop.checkoutForm).toBeHidden();
    });
  });

  test.describe('Coupons', () => {
    test('coupon discount', async ({ shop }) => {
      await expect(shop.orderTotal).toHaveText('89.00');

      await shop.applyCoupon('SAVE10');

      await expect(shop.couponStatus).toHaveText('Coupon applied: 10% off');
      await expect(shop.orderTotal).toHaveText('80.10');
    });

    test('unknown coupon shows an error and gives no discount', async ({ shop }) => {
      await shop.applyCoupon('FAKE50');

      await expect(shop.couponStatus).toHaveText('Invalid coupon');
      await expect(shop.orderTotal).toHaveText('89.00');
    });
  });
});
