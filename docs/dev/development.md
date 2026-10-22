# Development

[Architecture](architecture.md) · [UI](ui.md) · [Release](release.md) · [Acceptance](acceptance.md)

## Local development

Use Node.js 24.12+ and Rust. Install dependencies with npm ci.

```sh
npm run dev
```

The development desktop uses an isolated agent-remote-control-dev state directory. ARC_STATE_DIR explicitly overrides it. Vite and the development desktop share the same directory and Core owner.

```sh
npm run dev:ui
```

Standalone Dev Web connects to the existing installed-state Core by default. It shares installed data and directly operates the installed backend. Start the installed App first. Without an owner it reports backend unavailable rather than starting another Core.

Dev Web uses isolated data only with an explicit ARC_STATE_DIR. For the macOS development backend started by npm run dev:

```sh
ARC_STATE_DIR="$HOME/.local/state/agent-remote-control-dev" npm run dev:ui
```

Custom isolated previews MUST give Core and Dev Web the same ARC_STATE_DIR. npm run dev still defaults to the development directory and passes it to Vite. Do not point development Desktop or another Core at active production state.

## Existing checks

```sh
npm run check
npm run check:format
npm test
npm run build
npm run desktop:check
```

check validates React/TypeScript. check:format validates Rust formatting. test runs existing Rust unit tests and MCP fixture contract tests with isolated temporary state. build compiles the frontend, Core, and applicable screen helper. desktop:check checks the desktop crate. Acceptance scenarios and scripts may be added. Do not add unit tests pending further discussion. Migrate existing tests without expanding coverage. See [Acceptance](acceptance.md) for scenarios, cross-device checks, and artifact inspection.

After direct Cargo builds or tests:

```sh
npm run cache:prune
```

The workspace shares root Cargo.lock and target. The compilation-cache budget is 30 GiB. Pruning removes inactive profile groups while retaining running/protected artifacts and unique data. Preview with npm run cache:prune -- --dry-run. The budget is not a total-size cap for target.

## Desktop artifacts

```sh
npm run desktop:build
npm run check:package
```

Build recompiles the frontend and creates native packages without installing or replacing the local App. macOS artifacts live under target/aarch64-apple-darwin/release/bundle. Windows uses x64 NSIS. check:package validates versions, native signatures, and icon assets, rejecting legacy Node/npm runtime resources. See [Release](release.md) for signing and publication.

Packages contain Desktop, standalone Core, static frontend, icons, and licenses. Tunnel Client is prepared on demand from official sources. External Agents use native installations. The Claude ACP adapter is prepared separately after explicit enablement. Build scripts remap Rust source paths to avoid embedding maintainer paths.

Version precedence is ARC_BUILD_VERSION, nearest reachable v-tag, then 0.0.0. package.json, Cargo, and Tauri use 0.0.0 as an internal placeholder. Formal artifacts inject versions into existing feature commits without version-bump commits.

## Native icons and branding

assets/brand owns brand source artwork. npm run brand -- primary generates uniform-stroke round-ended arcs. alternate generates the tapered alternative. All platform icons derive from these sources.

macOS uses an Icon Composer document, actool Assets.car, and a static ICNS fallback. CFBundleIconName and CFBundleIconFile share one extensionless name. DEVELOPER_DIR may select full Xcode. Standard Xcode installation is also supported. Development icons derive from the same layered source rather than a separate design.

## Subscription quota development

Core owns quota reads, refresh scheduling, and reading caches. React shares QuotaBubble, QuotaRing, and hover details. Desktop receives subscriptions:changed. Browsers receive snapshots through authenticated /api/subscriptions/events forwarded by Vite. Disconnected streams follow the current owner again. Polling is a fallback only.

[Subscriptions](../reference/subscriptions.md) owns source, cache, and cadence rules. Verify native login, desktop events, and browser streams separately. Do not collect local usage logs, token statistics, or pricing data.

## Documentation maintenance

README and end-user onboarding/guides retain English primary files with complete Chinese counterparts. docs/reference and docs/dev are English only. Model-facing guides, catalog text, hints, errors, and generated notification text are English only. Original user input and upstream evidence retain their language. Use [terminology](terminology.md).

cli guide embeds docs/reference/cli.md. Path changes require a Core rebuild. Documentation describes current behavior, limitations, and procedures without acceptance records or personal environments. Check internal links, CLI output, and localized counterparts after edits. Commits use a single-line English Conventional Commit subject without rewriting history.
