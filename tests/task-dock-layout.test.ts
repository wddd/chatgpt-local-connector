import test from "node:test";
import assert from "node:assert/strict";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, type Locator } from "playwright";
import { fileURLToPath } from "node:url";
import copy from "../ui/locales/en.json" with { type: "json" };

test("pending input actions and routing stay inside short panels and narrow sheets while content scrolls", { timeout: 30000 }, async () => {
  // Regression: pending input clipped actions and previews; raw fixture snapshots exposed unnamed Radix form radios.
  // Compile only the DOM fixture in memory. No app, dev server or Core is started.
  const built = await build({ configFile: false, logLevel: "error", plugins: [react()],
    define: { __CONNECTOR_VERSION__: JSON.stringify("test"), "process.env.NODE_ENV": JSON.stringify("production") },
    build: { write: false, minify: false, assetsInlineLimit: Infinity,
      lib: { entry: fileURLToPath(new URL("./fixtures/task-dock-layout.tsx", import.meta.url)), name: "TaskDockFixture", formats: ["iife"] } } });
  const output = (Array.isArray(built) ? built : [built]).flatMap(result => "output" in result ? result.output : []);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    page.setDefaultTimeout(3000);
    await page.route("**/*", route => route.request().url() === "https://task-dock.invalid/"
      ? route.fulfill({ contentType: "text/html", body: '<main id="fixture"></main>' }) : route.abort());
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    let scenario = "";
    const inside = async (child: Locator, parent: Locator) => {
      const [a, b] = await Promise.all([child.boundingBox(), parent.boundingBox()]);
      assert.ok(a && b);
      assert.ok(a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height, JSON.stringify({ scenario, child: a, parent: b }));
    };
    for (const viewport of [{ width: 840, height: 578 }, { width: 840, height: 480 }, { width: 360, height: 600 }, { width: 320, height: 800 }, { width: 320, height: 578 }]) {
      for (const width of [420, 320]) for (const options of [2, 12, -12]) {
        scenario = JSON.stringify({ viewport, width, options });
        await page.setViewportSize(viewport);
        await page.goto("https://task-dock.invalid/");
        for (const item of output) {
          if (item.type === "chunk") await page.addScriptTag({ content: item.code });
          else if (item.fileName.endsWith(".css")) await page.addStyleTag({ content: String(item.source) });
        }
        assert.deepEqual(errors, []);
        const mount = (count: number) => page.evaluate(({ width, count }) => {
          (window as typeof window & { mountTaskDock: (width: number, options: number) => void }).mountTaskDock(width, count);
        }, { width, count });
        await mount(0);
        const panel = page.getByRole("dialog", { name: "Task layout fixture", exact: true, includeHidden: true });
        const timeline = page.getByLabel(copy["timeline.title"], { exact: true });
        await timeline.waitFor();
        const initial = await timeline.boundingBox();
        assert.ok(initial);
        await mount(options);
        const narrow = width === 320 || viewport.width <= 360;
        if (narrow) await page.getByRole("button", { name: new RegExp(`${copy["detail.openRequest"]}$`) }).click();
        const surface = narrow ? page.getByRole("dialog", { name: copy["detail.needsYou"], exact: true }) : panel;
        const dock = page.getByRole("region", { name: copy["detail.needsYou"], exact: true });
        const submit = dock.getByRole("button", { name: copy[options < 0 ? "detail.approve" : "detail.sendAnswer"], exact: true });
        const routing = dock.getByText(copy["routing.nextCheck"], { exact: true }).and(dock.locator('[aria-hidden="true"]'));
        await submit.waitFor();
        await routing.waitFor();
        await inside(dock, surface); await inside(submit, surface); await inside(routing, surface);
        const scrollTarget = options < 0 ? dock.getByText(/Preview line 1:/) : dock.getByRole("radio", { name: /Route 1\b/ });
        if (options > 0) {
          const snapshot = await dock.ariaSnapshot();
          assert.equal((snapshot.match(/^\s*- radio\b/gm) ?? []).length, options);
          assert.equal(await dock.getByRole("radio", { name: "", exact: true }).count(), 0);
        }
        if (options < 0 && (viewport.height === 800 || viewport.width === 840 && viewport.height === 578 && !narrow)) {
          const visiblePreview = await scrollTarget.evaluate(element => {
            let top = element.getBoundingClientRect().top, bottom = element.getBoundingClientRect().bottom;
            for (let node = element.parentElement; node; node = node.parentElement) {
              const bounds = node.getBoundingClientRect();
              top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom);
            }
            return bottom - top;
          });
          // Five 19.2px text lines plus the preview's vertical padding must fit before scrolling.
          assert.ok(visiblePreview >= 116, JSON.stringify({ scenario, visiblePreview }));
        }
        if (options > 0) await scrollTarget.click();
        assert.equal(await submit.isEnabled(), true);
        const before = await submit.boundingBox(), routingBefore = await routing.boundingBox();
        const scrolled = await scrollTarget.evaluate(element => {
          for (let node: HTMLElement | null = element as HTMLElement; node; node = node.parentElement) {
            if (node.clientHeight > 0 && node.scrollHeight > node.clientHeight) {
              const previous = node.scrollTop;
              node.scrollTop = node.scrollHeight - node.clientHeight;
              if (node.scrollTop !== previous) return true;
            }
          }
          return false;
        });
        assert.equal(scrolled, true);
        assert.deepEqual(await submit.boundingBox(), before);
        assert.deepEqual(await routing.boundingBox(), routingBefore);
        await inside(submit, surface); await inside(routing, surface);
        if (options < 0) await inside(dock.getByText("Review the complete proposed operation before allowing this one request.", { exact: true }), dock);
        const panelBounds = await panel.boundingBox(), dockBounds = await dock.boundingBox(), sheetBounds = await surface.boundingBox();
        assert.ok(panelBounds && dockBounds && sheetBounds);
        assert.ok(dockBounds.height <= panelBounds.height * .6, scenario);
        if (narrow) assert.ok(sheetBounds.height <= panelBounds.height * .6, scenario);
        if (!narrow) {
          const remaining = await timeline.boundingBox(), bounds = await panel.boundingBox(), input = await dock.boundingBox();
          assert.ok(remaining && bounds && input);
          assert.ok(remaining.height > 0 && remaining.height < initial.height);
          assert.ok(input.height <= bounds.height * .6);
        }
        const bounds = await surface.boundingBox();
        assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= viewport.height);
      }
    }
    await page.close();
  } finally { await browser.close(); }
});
