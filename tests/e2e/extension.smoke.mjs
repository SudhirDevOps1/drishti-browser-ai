import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'apps', 'chrome-extension', 'dist');

async function main() {
  // 1. Validate built MV3 manifest and assets exist
  const manifestPath = path.join(distDir, 'manifest.json');
  assert.ok(fs.existsSync(manifestPath), `Missing built manifest at ${manifestPath}. Run pnpm -r run build first.`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.manifest_version, 3, 'Expected MV3 manifest_version');
  assert.ok(manifest.name.includes('Drishti'), `Unexpected extension name: ${manifest.name}`);

  for (const iconPath of Object.values(manifest.icons || {})) {
    const absIcon = path.join(distDir, String(iconPath));
    assert.ok(fs.existsSync(absIcon), `Missing manifest icon: ${absIcon}`);
  }

  // 2. Launch full Chromium with the built extension loaded (headless-shell does not load MV3 extensions)
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drishti-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${distDir}`,
      `--load-extension=${distDir}`,
      '--no-sandbox',
    ],
  });

  try {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    }
    const extId = new URL(serviceWorker.url()).host;
    assert.ok(extId, 'Failed to resolve loaded extension ID');

    const pagesToVerify = [
      { route: 'src/popup/popup.html', expectedText: 'Drishti' },
      { route: 'src/sidepanel/sidepanel.html', expectedText: 'Drishti' },
      { route: 'src/options/options.html', expectedText: 'Drishti' },
    ];

    for (const target of pagesToVerify) {
      const page = await context.newPage();
      const pageErrors = [];
      const consoleErrors = [];

      page.on('pageerror', (err) => pageErrors.push(err.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      await page.goto(`chrome-extension://${extId}/${target.route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);

      const bodyText = await page.locator('body').innerText();
      assert.ok(
        bodyText.includes(target.expectedText),
        `Expected "${target.expectedText}" in ${target.route}, got: ${bodyText.slice(0, 200)}`
      );

      // Interactive UI smoke checks on Sidepanel
      if (target.route.includes('sidepanel.html')) {
        // 1. Voice controls (EN/HI toggle + Voice button)
        const voiceBtn = page.getByRole('button', { name: /Voice/i });
        assert.ok(await voiceBtn.isVisible(), 'Expected Voice button to be visible');
        const langBtn = page.getByRole('button', { name: /^(EN|HI)$/ });
        assert.ok(await langBtn.isVisible(), 'Expected EN/HI language toggle to be visible');
        await langBtn.click();
        assert.equal((await langBtn.innerText()).trim(), 'HI', 'Expected language toggle to switch to HI');

        // 2. Custom Saved Macro create -> apply -> delete
        await page.getByRole('button', { name: /Add Macro/i }).click();
        await page.getByPlaceholder(/Macro label/i).fill('Playwright Macro');
        await page.getByPlaceholder(/Macro instruction prompt/i).fill('Verify DOM buttons');
        await page.getByRole('button', { name: /Save Macro/i }).click();

        const macroChip = page.getByRole('button', { name: /Playwright Macro/i });
        assert.ok(await macroChip.isVisible(), 'Expected saved custom macro chip to appear');
        await macroChip.click();
        const promptValue = await page.locator('textarea').first().inputValue();
        assert.equal(promptValue, 'Verify DOM buttons', 'Expected clicking macro chip to populate prompt');
        await page.getByTitle('Delete Macro').first().click();

        // 3. Console & Network Error Drawer toggle
        await page.getByRole('button', { name: /Console & Network Errors/i }).click();
        assert.ok(
          await page.getByRole('button', { name: 'network', exact: true }).isVisible(),
          'Expected Network filter tab inside Dev Error Drawer'
        );

        // 4. Cursor speed cycle button
        const speedBtn = page.getByRole('button', { name: /Cursor:\s*natural/i });
        assert.ok(await speedBtn.isVisible(), 'Expected Cursor speed toggle button');
        await speedBtn.click();
        assert.ok(
          await page.getByRole('button', { name: /Cursor:\s*demo/i }).isVisible(),
          'Expected Cursor speed to cycle to demo'
        );
      }

      if (target.route.includes('options.html')) {
        assert.ok(
          await page.getByRole('button', { name: /Enable Voice Mic/i }).isVisible(),
          'Expected Enable Voice Mic button in Options header'
        );
      }

      assert.deepEqual(pageErrors, [], `Uncaught page errors on ${target.route}: ${pageErrors.join('; ')}`);
      assert.deepEqual(consoleErrors, [], `Console errors on ${target.route}: ${consoleErrors.join('; ')}`);

      await page.close();
      console.log(`[E2E OK] ${target.route} rendered & passed interactive checks with 0 errors`);
    }

    // 4. Verify live HTTP page interaction with extension loaded
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><head><title>Drishti Test Fixture</title></head><body><h1>Drishti E2E Page</h1><button id="btn">Test Click</button></body></html>');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const testPage = await context.newPage();
    try {
      await testPage.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
      await testPage.waitForTimeout(400);
      const heading = await testPage.locator('h1').innerText();
      assert.equal(heading, 'Drishti E2E Page');
      console.log('[E2E OK] Live HTTP fixture page verified with extension active');
    } finally {
      await testPage.close();
      server.close();
    }
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[E2E FAILED]', err);
  process.exit(1);
});
