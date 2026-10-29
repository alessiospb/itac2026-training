import { expect, type Locator, type Page } from '@playwright/test';

export type ProductName = 'Mechanical Keyboard' | 'Wireless Mouse' | 'Studio Monitor';

export interface CheckoutDetails {
  email: string;
  address: string;
}

/**
 * Page object for the single-page Training Shop.
 *
 * Synchronization notes (the app has deliberate random delays, which must stay):
 * - /api/products answers after 150-1050 ms. Until then the cart badge shows 0 even when
 *   localStorage holds items, and the Checkout button state is not yet computed.
 *   `open()` therefore waits for the "Loading products…" status to disappear.
 * - "Add to cart" updates the cart 150-850 ms after the click. `addToCart()` waits for the
 *   badge to reach the expected value instead of sleeping.
 */
export class Shop {
  readonly loading: Locator;
  readonly searchInput: Locator;
  readonly products: Locator;
  readonly noProductsMessage: Locator;
  readonly cartButton: Locator;
  readonly cartCount: Locator;

  readonly cart: Locator;
  readonly cartItems: Locator;
  readonly cartEmptyMessage: Locator;
  readonly cartTotal: Locator;
  readonly checkoutButton: Locator;

  readonly checkoutForm: Locator;
  readonly emailInput: Locator;
  readonly addressInput: Locator;
  readonly couponInput: Locator;
  readonly applyCouponButton: Locator;
  readonly couponStatus: Locator;
  readonly orderTotal: Locator;
  readonly formError: Locator;
  readonly placeOrderButton: Locator;

  readonly confirmation: Locator;
  readonly orderId: Locator;

  constructor(readonly page: Page) {
    this.loading = page.locator('#loading');
    this.searchInput = page.getByLabel('Search products');
    this.products = page.getByRole('region', { name: 'Catalog' }).getByRole('article');
    this.noProductsMessage = page.getByText('No products found');
    this.cartButton = page.getByRole('button', { name: /^Cart \(\d+\)$/ });
    this.cartCount = page.locator('#count');

    this.cart = page.getByRole('region', { name: 'Shopping cart' });
    this.cartItems = this.cart.getByRole('listitem');
    this.cartEmptyMessage = this.cart.getByText('Your cart is empty');
    this.cartTotal = this.cart.locator('#total');
    this.checkoutButton = this.cart.getByRole('button', { name: 'Checkout', exact: true });

    this.checkoutForm = page.locator('#checkout-form');
    this.emailInput = this.checkoutForm.getByLabel('Email');
    this.addressInput = this.checkoutForm.getByLabel('Shipping address');
    this.couponInput = this.checkoutForm.getByLabel('Coupon');
    this.applyCouponButton = this.checkoutForm.getByRole('button', { name: 'Apply coupon' });
    this.couponStatus = this.checkoutForm.locator('#coupon-status');
    this.orderTotal = this.checkoutForm.locator('#order-total');
    this.formError = this.checkoutForm.getByRole('alert');
    this.placeOrderButton = this.checkoutForm.getByRole('button', { name: 'Place order' });

    this.confirmation = page.locator('#confirmation');
    this.orderId = this.confirmation.locator('#order-id');
  }

  /** Navigates to the shop and waits until the catalog (and the restored cart) is rendered. */
  async open(): Promise<void> {
    await this.page.goto('/');
    await this.waitForCatalog();
  }

  async reload(): Promise<void> {
    await this.page.reload();
    await this.waitForCatalog();
  }

  private async waitForCatalog(): Promise<void> {
    await expect(this.loading).toBeHidden();
  }

  product(name: ProductName): Locator {
    return this.products.filter({ has: this.page.getByRole('heading', { name, exact: true }) });
  }

  async search(term: string): Promise<void> {
    await this.searchInput.fill(term);
  }

  /** Clicks "Add to cart" and waits for the delayed cart update to land. */
  async addToCart(name: ProductName): Promise<void> {
    const before = Number(await this.cartCount.textContent());
    await this.product(name).getByRole('button', { name: 'Add to cart' }).click();
    await expect(this.cartCount).toHaveText(String(before + 1));
  }

  async openCart(): Promise<void> {
    // The cart button toggles the section, so only click when it is closed.
    if (await this.cart.isHidden()) {
      await this.cartButton.click();
    }
    await expect(this.cart).toBeVisible();
  }

  /** Removes one cart line for the product (the first one when it was added several times). */
  async removeItem(name: ProductName): Promise<void> {
    await this.cart.getByRole('button', { name: `Remove ${name}` }).first().click();
  }

  async startCheckout(): Promise<void> {
    await this.openCart();
    await this.checkoutButton.click();
    await expect(this.checkoutForm).toBeVisible();
  }

  async fillCheckout({ email, address }: CheckoutDetails): Promise<void> {
    await this.emailInput.fill(email);
    await this.addressInput.fill(address);
  }

  async applyCoupon(code: string): Promise<void> {
    await this.couponInput.fill(code);
    await this.applyCouponButton.click();
  }

  async placeOrder(): Promise<void> {
    await this.placeOrderButton.click();
  }
}
