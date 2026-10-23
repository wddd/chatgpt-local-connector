# Acceptance

[Development](development.md) · [CLI contracts](../reference/cli.md)

## Local replacement

Use the [local app replacement protocol](../reference/app-replacement.md) for an authorized installed-build upgrade. Run the candidate Core's `cli app replace <bundle> --check` first, then `cli app replace <bundle>` as the dispatching turn's final command. Do not call `app quit` before it. Reconnect from the control source and read `app replace --status`, `app status`, and `status`; compare Desktop/Core build hashes and then perform the requested connection or provider acceptance. A staged receipt or successful package check alone is not installed-app acceptance. Build-only or no-restart tasks must stop before the mutating replacement command.

For offline CLI regressions against a freshly built Core, run `npm run check:tests`, then `ARC_TEST_BINARY="/absolute/path/to/arc" node --test tests/app-replace.test.ts`. These tests use temporary state and do not launch or stop Desktop. The Rust `app_replace` regression covers the active-turn, active-command, pending-interaction, and unknown-observation drain decisions.

## UI scenarios

```sh
npm ci
npx playwright install chromium
npm run accept:ui
```

The script starts an isolated Vite page and captures widths 640 and 1280 at height 800. Stop the existing development service first if it owns port 5187. Scenario mode never connects to real Core. The script rejects all actual management API requests. For WebKit comparison:

```sh
npx playwright install webkit
npm run accept:ui -- --webkit
```

Artifacts live in `output/acceptance/ui/<timestamp>-<browser>/`:

- index.html compares current, previous, and pixel-diff images for all scenarios.
- report.json records missing baselines, changed pixels/ratios, and render errors.
- `<scenario>-<width>.png` / `.json` contain screenshots and live derived state.
- `*-before.png` / `*-diff.png` contain the prior baseline and pixel differences.

The first run creates a baseline. Later runs compare with the latest directory for the same browser. Changes require visual review and are not automatically defects. Render errors, unexpected real API requests, or missing scenario nodes cause nonzero exit. Git ignores baselines and reports.

Scenarios in tooling/acceptance/scenarios/*.json include idle, single-task, parallel-seven, approval, long-multilingual, narrow-tentacles, left-panel, right-panel, light, and dark. Left and right panels are captured separately under the product's single-panel rule. The `p3-*` scenarios cover source setup (including empty, local, and fixed-connection entry), standalone and stacked connection methods/configuration/ready, Welcome, and owned/joined Connection detail in both themes. Fixtures use `sourceSetup`, `connectionSetup`, `remoteLink`, and `relayProgress` to select real renderer states without contacting Core. Copy scenario JSON to change Agents, phases, text, themes, language, and panels without unit tests.

For manual inspection, run npm run dev:ui and open `http://127.0.0.1:5187/?scenario=<scenario>`. Only Vite development loads scenarios. Release builds exclude fixture modules. Fixed time and reduced animation support layout comparison. These screenshots do not prove real Agent or native-window behavior.

## Notification reachability and guides

```sh
node tooling/acceptance/notifications.mjs
```

Acceptance uses temporary state, the MCP fixture, simulated native Agent processes, and a fake local Claude CLI. Every dispatch MUST use purpose:"self-test". It covers new targets, successful sends without acknowledgement, one-time acknowledgement/replay, restart persistence, handshake timeout, delivery failure/recovery, and wait branches for four dispatch receipts. Historical duration uses synthetic records. Timeout checks change only temporary-state deadlines. It checks source-specific schemas, guide indexes, and default dispatch_policy filtering. Output defaults to output/acceptance/notifications/ and accepts an output-directory argument. No real accounts or notification targets are used. Actual cloud receipt and acknowledgement need separate evidence.

## Dispatch decision view

```sh
node tooling/acceptance/dispatch-policy.mjs
```

This isolated MCP scenario checks decision/full views, criteria hash reuse and invalidation, grouped duration medians and outcomes, self-test exclusion, defaults and restrictions, shared quota references, stale timestamps, and inventory filtering. It seeds synthetic history and native responses without dispatching real work. Output defaults to output/acceptance/dispatch-policy/. An optional argument selects another output directory.

## Installed App snapshots

```sh
arc cli app start
arc cli app snapshot --out ./output/acceptance/manual
printf '%s' '{"width":1280,"height":800,"panel":{"kind":"agent","id":"codex"}}' | arc cli app snapshot --out ./output/acceptance/agent --stdin
```

Without a shim, use the bundled CLI's absolute path. macOS cli install-shim idempotently creates ~/.local/bin/arc and stops rather than overwriting another file. Inspect pathHint for noninteractive-shell PATH. Its zsh command may be copied when needed. Shell configuration is never changed automatically. The check starts `$SHELL -c` with a minimal system PATH to avoid inherited interactive additions. It does not prove a customized SSH environment.

macOS snapshots use WKWebView without Screen Recording permission. Output includes snapshot.png and view-model.json with absolute paths in the result. Omitted --out uses the target state directory's acceptance/<unique-id>/. Windows/Linux desktops can export rendered state but return NOT_SUPPORTED for PNG. Headless Linux has no WebView. layoutSettled is always boolean. Check png.ok and layoutSettled rather than assuming command success proves a complete image.

panel.kind is agent, source, or none. The first two require node id. Window size and panel selection persist in the App. State and screenshots are captured sequentially, so active tasks may change between them.

## Cross-device acceptance

The target needs a macOS App with acceptance commands, working Codex login, and noninteractive SSH access through the selected alias. The script first finds arc in PATH, then checks standard App locations.

```sh
node tooling/acceptance/remote.mjs --host <host>
node tooling/acceptance/remote.mjs --host <host> --project /path/to/project --out ./output/acceptance/remote-manual
```

The script starts App-managed Core through app start, reads doctor, dispatches a local-cli read-only self-test that replies only ARC_ACCEPTANCE_OK, waits for creation and terminal receipts, checks records/origin/activity, and captures the App. It starts no independent headless daemon. Target-side cli wait performs bounded waiting without host-side SSH polling loops. Per-request approval:bypass does not change global target settings.

Default output is output/acceptance/remote/<timestamp>/. Each step's CLI JSON, report.json, view-model.json, and snapshot.png share that directory. Failed assertions are defects. Missing CLI capability, connection failures, or tasks too fast to capture activity are evidenceGaps. Exit 0 means complete evidence, 1 means defects, and 2 means evidence gaps only.

Assertions match rendered tasks to the dispatch by threadId/taskId, confirm local-cli origin and layoutSettled:true, and require PNG luminance variance above 1 after compositing on white. Explicit mismatches are defects. Missing data or undecodable PNGs are evidence gaps. Task failure still triggers a screenshot attempt. Tasks and original target screenshots remain available through report IDs and paths.

## Control source and waiting

```sh
arc cli control guide
arc cli control guide codex_create
printf '%s' '{"prompt":"Do not call tools. Reply ARC_ACCEPTANCE_OK.","mode":"read-only","purpose":"self-test","notify":null}' | arc cli control codex_create --stdin
printf '%s' '{"threadId":"<thread-id>","turnId":"<turn-id>","until":"terminal"}' | arc cli wait --control --op codex_wait --stdin --until '/conditionMet==true' --timeout 60
arc cli wait --op status --until '/core/desktop/state=="ready"' --timeout 20
```

Multiple --until conditions are ANDed. JSON Pointer supports ==, !=, and exists. String comparison values need JSON double quotes. On timeout, read error.lastResult. Waiting never cancels or redispatches tasks. Read full parameters through cli schema and cli control guide <op>.
