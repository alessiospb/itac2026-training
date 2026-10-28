export class Shop {
  constructor(public page: any) {}
  async open() {
    await this.page.goto('/');
    await this.page.waitForTimeout(500);
  }
  async addFirstProduct() {
    await this.page.locator('article button').first().click();
    await this.page.waitForTimeout(300);
  }
  async cart() { await this.page.locator('#cart-button').click(); }
}
