# Testing

Every case carries exactly one English tag comment inside its body or immediately before its declaration:

- `// Contract: <frozen surface or wire format>` protects guide/query/act, notification, CLI JSON envelopes, error codes or wire formats.
- `// Regression: <fixing commit or observed failure>` identifies the defect being prevented.
- `// Property: <invariant>` states an invariant of pure computation.

Assert public behavior through MCP, CLI, management operations, exported pure functions or accessible roles/names. Do not assert classes, DOM structure, styles, pixel constants, exact UI copy, internal state files or mock invocation counts. Rewrite or delete tests broken by intended changes; never align implementation snapshots. Delete tests that obstruct reasonable refactors and report the removal. Use `npm run accept:ui` for visual/layout acceptance.

## Enforcement

`npm run check:tests` runs first in `npm test`. TypeScript and Rust parsers locate cases and assertions, including parameterized cases declared in loops. ESLint is scoped to `tests/**`: Testing Library's DOM preset plus `no-container`, `no-debugging-utils` and `prefer-explicit-assert`; `no-node-access` is enabled. Use `within(document.body)` for each isolated happy-dom document; the import-time `screen` binding cannot follow replaced documents. DOM-global installation is harness plumbing; calls to `getComputedStyle` are prohibited.

The policy check rejects missing/duplicate tags, class selectors, computed-style reads, direct ARC state I/O, CJK assertion literals and mock invocation counts. It tracks local TS state-path aliases; Rust cases may use injected temporary directories through core APIs, but not the process ARC state root. Static checks cannot prove the truth of a regression label or infer every dynamic filesystem path. Do not hide forbidden assertions in helpers or generated code.

Only `tooling/test-policy-allowlist.json` grants exceptions, scoped to an exact file, case and rule with a reason; stale entries fail. `<harness>` means setup outside a case, never a wildcard for cases. The native fixture's sole bootstrap exception registers initial ingress/adapters and discovers the management endpoint. Fixture provider data lives outside ARC state; tests operate through public interfaces. Remove the exception when bootstrap no longer needs persisted discovery.

The control source owns `tests/contract/` and the allowlist. The checker rejects working-tree changes there unless an explicitly authorized dispatch sets `ARC_TEST_POLICY_OWNER=1`. CI should set `ARC_TEST_POLICY_BASE` to the PR base to check committed changes too. An implementation turn cannot grant itself this capability. Lint suppression comments are disabled.

## Monthly value audit

Run these manually, outside `npm test`. Review surviving mutants and high-churn cases for weak assertions or removable change detectors; a score alone does not justify more tests.

```sh
npm run mutation:ui -- --mutate ui/topology/parameters.ts
npm run mutation:ui -- --mutate ui/state/timelineModel.ts
npm run test:churn -- --since='90 days ago' --limit=20
```

[Stryker](https://stryker-mutator.io/docs/stryker-js/configuration/) runs the existing pure UI suites with one worker, incremental results and a command runner. The configured scope includes pure topology, activity and timeline modules; DOM rendering is excluded. A bounded wiring smoke run can target `ui/topology/parameters.ts:5:0-8:0`. Reports stay in ignored `output/mutation/`; sandboxes use the existing `target` cache volume. Remove the incremental file or pass `--force` when a fresh full run is needed.

For native core modules, install [cargo-mutants](https://mutants.rs/controlling.html) with `cargo install --locked cargo-mutants` when the disk budget permits, then select modules explicitly:

```sh
npm run mutation:native -- waiter
npm run mutation:native -- wait_transport control_sources
npm run mutation:native -- claude_notify dispatch_policy
```

The wrapper uses one worker and puts temporary copies and reports under the resolved `target/mutation-native` directory, respecting an existing external-volume symlink. It runs cache pruning afterward. Without cargo-mutants, skip the native smoke run and report that gap; do not install it automatically on a constrained machine. Mutation runs can be expensive even for one module.

Churn compares parsed assertions across non-merge Git commits. It counts edits to existing named cases, then counts the subset in `fix` commits that also changed product code. Rust test-only edits do not qualify as product changes. Test-only `test:` alignment commits add a strong deletion-candidate signal. Initial creation and formatting-only changes are excluded; unambiguous similar names retain history across renames; substantially renamed cases start a new identity. The default window is 90 days; use `--since=1970-01-01` for complete history and `--json` for machine-readable results. Reports are transient and are not committed.
