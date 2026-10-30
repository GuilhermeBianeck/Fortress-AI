import { test, expect, type Page } from '@playwright/test';

const read = (page: Page) => page.evaluate(() => JSON.parse(
    (window as Window & { render_game_to_text: () => string }).render_game_to_text()));

async function combat(page: Page) {
    await page.goto('/');
    await page.getByRole('button', { name: /BATTLE/ }).click();
    await page.getByRole('button', { name: /READY FOR BATTLE/ }).click();
    await page.getByRole('button', { name: 'Done building, ready for battle' }).click();
    await expect(page.locator('.battle-fire')).toBeEnabled({ timeout: 15000 });
}

test('interrupted charges cancel safely and Enter releases one shot', async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await combat(page);
    const fire = page.locator('.battle-fire');
    const box = (await fire.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(fire).toHaveAttribute('aria-pressed', 'true');
    await fire.evaluate(node => node.releasePointerCapture(1));
    await page.mouse.up();
    await expect(fire).toHaveAttribute('aria-pressed', 'false');
    expect((await read(page)).aim.pending).toBe(false);

    await fire.focus();
    await page.keyboard.down('Enter');
    await expect(fire).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Enemy fortress', exact: true }).focus();
    await page.keyboard.up('Enter');
    expect((await read(page)).aim.charging).toBe(false);
    expect((await read(page)).aim.pending).toBe(false);

    await fire.focus();
    await page.keyboard.down('Enter');
    await page.waitForTimeout(700);
    await page.screenshot({ path: `output/playwright/charge-${info.project.name}.png` });
    const power = (await read(page)).aim.power;
    expect(power).toBeGreaterThan(15);
    expect(power).toBeLessThan(60);
    await page.keyboard.up('Enter');
    await expect.poll(async () => (await read(page)).aim.pending).toBe(true);
    await expect(fire).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(async () => (await read(page)).shot !== null).toBe(true);
    expect(errors).toEqual([]);
});

test('pointer owns its charge and full power fires only once', async ({ page }) => {
    let submissions = 0;
    page.on('websocket', socket => socket.on('framesent', frame => {
        if (String(frame.payload).startsWith('42["fire_projectile",')) submissions++;
    }));
    await combat(page);
    const fire = page.locator('.battle-fire');
    const box = (await fire.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.keyboard.press('Space');
    expect((await read(page)).aim.pending).toBe(false);
    expect((await read(page)).aim.charging).toBe(true);
    await expect.poll(async () => (await read(page)).aim.pending, { timeout: 5000 }).toBe(true);
    expect((await read(page)).aim.power).toBe(100);
    await page.mouse.up();
    await expect(fire).toHaveAttribute('aria-pressed', 'false');
    expect((await read(page)).aim.charging).toBe(false);
    expect(submissions).toBe(1);
});

test('assistive activation starts and releases charge without a pointer', async ({ page }) => {
    await combat(page);
    const fire = page.locator('.battle-fire');
    await fire.evaluate(node => (node as HTMLButtonElement).click());
    await expect(fire).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(300);
    await fire.evaluate(node => (node as HTMLButtonElement).click());
    await expect.poll(async () => (await read(page)).aim.pending).toBe(true);
    await expect(fire).toHaveAttribute('aria-pressed', 'false');
});
