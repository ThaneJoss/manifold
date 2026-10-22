import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#componentCount')).toHaveText('1');
});

async function expectNoHorizontalOverflow(page) {
  const sizes = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(sizes.content).toBeLessThanOrEqual(sizes.viewport);
}

async function addVelocityField(page) {
  const canvas = page.locator('#scene');
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const y = bounds.y + bounds.height * 0.65;
  await page.mouse.move(bounds.x + bounds.width * 0.46, y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.65, y, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('#fieldCount')).toHaveText('1');
  await expect(page.locator('#removeField')).toBeVisible();
}

test('workspace and settings stay within the viewport', async ({ page }, testInfo) => {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('#scene')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await testInfo.attach('initial-layout', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  for (const [trigger, panel, close] of [
    ['#shapeResolution', '#surfacePanel', '#closeSurfacePanel'],
    ['#brushTool', '#brushPanel', '#closeBrushPanel'],
    ['#arrowTool', '#fieldPanel', '#closeFieldPanel'],
  ]) {
    await page.locator(trigger).click();
    await expect(page.locator(panel)).toBeVisible();
    await expect(page.locator(trigger)).toHaveAttribute('aria-expanded', 'true');
    const bounds = await page.locator(panel).boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width);
    await expectNoHorizontalOverflow(page);
    await page.locator(close).click();
    await expect(page.locator(panel)).toBeHidden();
  }

  await page.setViewportSize({ width: 320, height: 740 });
  await expectNoHorizontalOverflow(page);
  const flowToggle = page.getByRole('checkbox', { name: '场线', exact: true });
  await expect(flowToggle).toBeVisible();
  await flowToggle.uncheck();
  await expect(flowToggle).not.toBeChecked();
  await flowToggle.check();
  await expect(flowToggle).toBeChecked();
});

test('dragged fields survive keyboard resampling and can be removed', async ({ page }) => {
  await addVelocityField(page);
  await page.locator('#closeFieldPanel').click();
  await page.locator('#shapeResolution').click();
  const resolution = page.getByRole('slider', { name: '圆盘边界采样' });
  await expect(resolution).toHaveValue('120');
  await resolution.focus();
  await resolution.press('ArrowRight');
  await expect(resolution).toHaveValue('150');
  // The inspector reports the simulation's actual point count, not the pending slider value.
  await expect(page.locator('#shapeResolution')).toHaveText('150 点');
  await expect(page.locator('#fieldCount')).toHaveText('1');
  await expect(page.locator('#componentCount')).toHaveText('1');
  await expect(page.locator('#metricTwo')).toHaveText('100.0%');
  await page.locator('#closeSurfacePanel').click();
  await page.locator('#arrowTool').click();
  await page.getByRole('button', { name: '移除此速度场' }).click();
  await expect(page.locator('#fieldCount')).toHaveText('0');
  await expect(page.locator('#removeField')).toBeHidden();
});

test('model dialog closes with Escape or its action and restores focus', async ({ page }) => {
  const opener = page.getByRole('button', { name: '模型说明' });
  const dialog = page.getByRole('dialog', { name: '形状，如何随场演化？' });
  await opener.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  await opener.click();
  await dialog.getByRole('button', { name: '开始探索' }).click();
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('reduced motion pauses on load and after resetting a running simulation', async ({ page }) => {
  const play = page.locator('#playButton');
  await expect(play).toHaveAccessibleName('继续演化');
  await expect(page.locator('#simulationStatus')).toHaveText('已暂停');
  await expect(page.locator('#timeDisplay')).toHaveText('0.0');
  await play.click();
  await expect(play).toHaveAccessibleName('暂停演化');
  await expect.poll(async () => Number(await page.locator('#timeDisplay').textContent())).toBeGreaterThan(0);
  await page.locator('#resetButton').click();
  await expect(play).toHaveAccessibleName('继续演化');
  await expect(page.locator('#simulationStatus')).toHaveText('已暂停');
  await expect(page.locator('#timeDisplay')).toHaveText('0.0');
});

test('main controls, settings and model dialog meet automated WCAG checks', async ({ page }) => {
  const scan = async () => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  };
  await scan();
  for (const [open, close] of [
    ['#shapeResolution', '#closeSurfacePanel'],
    ['#brushTool', '#closeBrushPanel'],
    ['#arrowTool', '#closeFieldPanel'],
  ]) {
    await page.locator(open).click();
    await scan();
    await page.locator(close).click();
  }
  await page.locator('#aboutButton').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await scan();
});
