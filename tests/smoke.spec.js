const { expect, test } = require('@playwright/test');

test('home loads and contact snake replaces contact video', async ({ page }) => {
  await page.goto('/index.html?skipIntro=1');
  await page.waitForFunction(() => document.body.classList.contains('home-ready'));

  await page.locator('.nav-link[data-href="contact.html"]').dispatchEvent('click');

  await expect(page.locator('.contact-card')).toBeVisible();
  await expect(page.locator('.snake-canvas')).toBeVisible();
  await expect(page.locator('[data-snake-score]')).toHaveText(/GROWTH: 0/);
  await expect(page.locator('.contact-controls-title')).toHaveText('Play Vine Snake');
  await expect(page.locator('#spa-content video')).toHaveCount(0);
});
