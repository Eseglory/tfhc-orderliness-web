const { test } = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const { webkit, chromium } = require('playwright');
const path = require('node:path');

for (const [name, engine] of Object.entries({ webkit, chromium })) {
  test(`${name}: opening cached history renders messages at the scrolled viewport`, async () => {
    const built = await esbuild.build({
      stdin: {
        contents: `
          import React, { useRef, useEffect } from 'react';
          import { createRoot } from 'react-dom/client';
          import { VirtualChatList } from './apps/web/src/components/chat/VirtualChatList';
          function App() {
            const ref = useRef(null);
            useEffect(() => {
              requestAnimationFrame(() => ref.current.scrollTo({ top: ref.current.scrollHeight }));
            }, []);
            return <div ref={ref} style={{ height: 650, overflow: 'auto' }}>
              <VirtualChatList items={Array.from({length: 100}, (_, i) => ({id: String(i)}))} scrollRef={ref}>
                {m => <div data-row={m.id} style={{ height: 40 + (Number(m.id) % 4) * 30 }}>Message {m.id}</div>}
              </VirtualChatList>
            </div>;
          }
          createRoot(document.getElementById('root')).render(<App />);
        `,
        resolveDir: path.resolve(__dirname, '../..'), loader: 'tsx',
      },
      bundle: true, write: false,
    });
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.setContent('<div id="root"></div>');
      await page.addScriptTag({ content: built.outputFiles[0].text });
      await page.waitForFunction(() => {
        const scroll = document.querySelector('#root > div');
        const bounds = scroll.getBoundingClientRect();
        return scroll.scrollTop > 0 && [...document.querySelectorAll('[data-row]')].some(row => {
          const rect = row.getBoundingClientRect();
          return rect.bottom > bounds.top && rect.top < bounds.bottom;
        });
      }, null, { timeout: 5000 });
      assert.ok(await page.locator('[data-row]').count() < 60);
      // Scrolling back through history must also update the mounted window.
      await page.locator('#root > div').evaluate(el => { el.scrollTop = 0; });
      await page.waitForFunction(() => {
        const first = document.querySelector('[data-row="0"]');
        return first && first.getBoundingClientRect().top >= 0;
      }, null, { timeout: 5000 });
    } finally {
      await browser.close();
    }
  });
}
