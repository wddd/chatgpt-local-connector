# Embedded control sources

> Status: Phase 1 implementation. The current SRC topology and panel model are retained.
> Reference: read-only webview spike, commit `e8a6aa2` (`REPORT.md` and synthetic importer fixtures).
> Platform: macOS only. Linux hosts are headless and do not need this. Windows is deferred.

## Goal

Let the user run the whole Loop inside ARC: talk to cloud conversations (claude.ai first, ChatGPT later), dispatch, watch agents and review, without switching to a browser.
Each control-source account gets an embedded, isolated web container showing the real site. ARC links each conversation to the tasks it dispatched.

This turns ARC from a mostly invisible Loop backend with a playful UI into a daily productivity surface. That has UI consequences, listed at the end.

## Validated route

| Concern | Route | Spike result |
| --- | --- | --- |
| Hosting | wry 0.57 `WebViewBuilder::build_as_child` on the ARC window. Do not use Tauri's child `WebviewBuilder` / `Window::add_child` (they need the Tauri `unstable` feature and inject Tauri IPC/init scripts). The spike used Tauri `WindowBuilder` (`unstable`) only for its own host window. | PASS |
| Isolation | One persistent `WKWebsiteDataStore` per account via `WebViewBuilderExtDarwin::with_data_store_identifier` (macOS 14+). Store UUID is random, generated once per ARC account ID, and persisted. | PASS: imported container signed in, control container on `/login` |
| Persistence | The data store keeps login across app restarts without re-import. | PASS |
| Login | Passkey sign-in (Google/Apple) cannot work in an embedded WKWebView. Import login state from a signed-in Chrome profile instead (see below). | PASS: 32 cookies imported |
| Display only | No user scripts, no DOM access, no IPC in remote views. Verify the native user-script count is 0. | PASS |
| Status | Derived from the URL only: `not-imported`, `signed-in`, `expired` (login path). | PASS |
| URL tracking | Poll the native `WKWebView.URL` every 250 ms. Catches SPA route changes without KVO or scripts. | PASS |
| Conversation refs | `https://claude.ai/chat/<uuid>` -> `{kind: chat, id}`; `https://claude.ai/cowork/cse_<id>` -> `{kind: cowork, id: cse_<id>, notifyTarget: session_<id>}` | PASS |
| Deep link | Navigate a container to a conversation URL. | PASS for chat. Cowork positive case untested (no owned Cowork conversation in the test account; `/new` redirect is normal not-found). |
| User agent | Default wry UA works, Cowork entry is visible. A Safari UA override (`Version/<Safari> Safari/605.1.15`, frozen WebKit token) is an optional setting only. | Not required |
| Cloudflare | Skip `cf_clearance`, `__cf_bm`, `_cfuvid` on import; the view re-solves if needed. | No challenge observed |

### Chrome login import

1. Copy `~/Library/Application Support/Google/Chrome/<profile>/Cookies` (+ `-wal`, `-shm`) to a private 0700 temp dir; verify the source did not change during copy; delete the copy after reading.
2. Select host keys `claude.ai`, `.claude.ai`, `.anthropic.com` only.
3. Decrypt `v10` values: key = PBKDF2-HMAC-SHA1(keychain generic password `Chrome Safe Storage`, salt `saltysalt`, 1003 iterations, 16 bytes); AES-128-CBC, IV = 16 spaces, PKCS7. DB meta version >= 24 prepends SHA-256(host_key) (32 bytes) to the plaintext; strip it.
4. Write each cookie to the container's `WKHTTPCookieStore` via objc2 `setCookie:completionHandler:` and wait for all completions before the first navigation.
5. The first keychain read shows a macOS prompt. The user must enter the login password and choose Always Allow. With a stable signing identity the grant persists. The importer must time out and report a blocker, never work around a denial.

Known loss: Foundation conflates SameSite None/unspecified; cookie priority and partition metadata are not migrated. Not a problem in practice so far.

### Memory

Rough RSS sums (shared pages double-counted): two loaded containers ~1.0-1.7 GiB including app, WebContent and Networking processes. Most cost is per-container WebContent. Keep only the visible account resident and suspend or unload hidden containers.

## Hard rules

- Remote views are display and user interaction only: no script injection, no DOM reading, no IPC bridge.
- Cookie values, decrypted plaintext, derived keys and the keychain password never appear in logs, ARC state, AX logs, op results or agent transcripts. Decryption happens only inside the ARC process.
- Import reads copies of browser files and never modifies the browser profile.
- AX-facing ops expose account/container IDs, status (`unsupported | not-imported | signed-in | expired | importing | signed-in-pending | import-blocked`), safe conversation refs, timestamps, binding provenance, linked task IDs, and Chrome profile directory/display name. Never cookies or page content.
- No host system settings changes.

## Conversation <-> task binding

- Cowork: deterministic. ARC's verified notify target `session_<id>` maps 1:1 to URL `/cowork/cse_<id>`.
- Chat: correlate a dispatch with the same account's recently active conversation URL, with an explicit `correlated` basis. Manual rebind and unbind correct the association.

## Open risks

- The container shares the Chrome login session. Signing out in Chrome likely invalidates ARC's copy. `__Host-sessionBinding` cookies suggest server-side session binding; rotation behavior under two concurrent clients is untested.
- Session lifetime and re-import frequency are unknown; observe in daily use.
- Cowork deep link needs a positive check with a conversation owned by the container's account.
- ChatGPT (chatgpt.com, auth.openai.com) is untested.

## Phase 1

### Ownership and compatibility

Keep the current UI model. SRC L2 is the source account, including its login state; conversations are SRC L3. The main-window panels are a separate implementation segment. Phase 1 provides one plain native window per account, with a direct wry child. The renderer uses `ui/srcConversations.ts`; no panel component owns native webview lifecycle.

The native implementation requires macOS 14 or later for identifier-based persistent WK data stores. Other platforms and non-Claude source providers report `unsupported`. Core owns the persisted registry and account scope; Desktop owns native windows and login import. There is no Tauri remote webview, remote IPC handler, initialization script, DOM read, history database scan, or page-content API. Construction verifies that the native user-script count is zero before any navigation.

A random store UUID is generated on the first open/import for each canonical ARC account ID and saved before creating its native view. Reopening reuses that store. Closing destroys the view; no hidden residency is retained. Re-import replaces the loaded view with a blank view of the same store and reuses its plain host window. Account merges never transfer a website session implicitly: historical stores remain keyed to their original IDs, and the canonical owner uses its own store. Store deletion and migration are deferred.

### Import and URL observation

`src_chrome_profiles` reads only profile directories and display names from Chrome Local State. Import accepts only a listed directory beneath the Chrome root. The importer uses a private database copy with WAL/SHM and before/after stamps, the spike's v10 decryption and version-24 host digest validation, and the same domain allowlist and Cloudflare exclusions. Partitioned and expired persistent cookies are skipped. No cookie values or keys enter ARC JSON state, receipts, logs or API results. WebKit retains its own persistent website store.

`src_login_import` validates the account and profile, starts a Desktop-owned background job, and returns immediately with `{accountId,status:"importing",next:{via:"query",op:"src_conversations",args:{accountId},hint}}`. Import jobs are scoped to the account; a concurrent import for the same account returns the existing in-flight state without starting another worker. Opening that account during import also returns the in-flight state. The first Keychain prompt requires typing the macOS login password and choosing Always Allow; the background wait is **180 seconds**. A still-pending OS request prevents another Keychain request; denial is never bypassed. The process disables core dumps before import. Every native cookie representation is validated before submitting any cookie writes. Navigation waits for all `WKHTTPCookieStore` completion callbacks, with a 30-second blocker timeout. Pending write barriers survive caller cancellation and window closure; another open cannot bypass them. Metadata queries and other account windows remain available during the background wait. A failed or timed-out import is not a signed-in result.

The native URL poll runs on a 250 ms cadence. Only canonical `/chat/<uuid>` and `/cowork/cse_<id>` URLs cross into Core. Query strings, fragments and unrelated paths are discarded. `expired` is set on `/login`, `/signin`, `/sign-in`, `/sign_in` or `/auth`. A finished claude.ai page whose URL remains stable for five seconds yields `signed-in`. This is a URL heuristic, not an authentication or content assertion. New views start `not-imported`. Import progress is reported separately through the same status field:

| Status | Meaning |
| --- | --- |
| `importing` | The background job is copying/decrypting cookies, waiting for Keychain, writing cookies, or starting navigation. Poll the existing account. |
| `signed-in-pending` | Cookies were installed and navigation started; no URL-based login result is available yet. |
| `not-imported` | No cookies were imported, or no import has started. Subsequent native URL evidence can still resolve the store state. |
| `import-blocked` | The job ended without completing. `reason` and `hint` identify the blocker and required human action. |
| `signed-in`, `expired` | The native URL observation resolved the login heuristic. |
| `unsupported` | This platform/provider cannot host the container. |

Blocked reasons include `keychain-timeout`, `keychain-denied`, `keychain-pending`, `keychain-unavailable`, `cookie-write-timeout`, `cookie-write-pending`, `chrome-profile-unavailable`, `window-closed`, `import-interrupted` and `import-failed`. Keychain hints direct the user to enter the macOS login password in the Chrome Safe Storage prompt and choose Always Allow. Failures expose only these safe codes and fixed hints, never native error payloads. An interrupted Desktop job becomes `import-blocked` on the next complete metadata sync. A completed empty import returns `not-imported`; a nonempty import returns `signed-in-pending` until URL observation resolves it. Retry requires a new explicit action after the blocker is handled.

Safari UA override is per account and defaults to false. `src_conversation_open` can save it; an already-open view must be closed before the changed preference takes effect. The optional compatibility string uses `Version/27.0.1 Safari/605.1.15` with the frozen WebKit token; it is not an assertion about the host Safari version. Default wry UA is the normal route. Popups and navigation outside the HTTPS claude.ai origin are denied.

### Registry and task bindings

The registry persists canonical account ID, conversation kind/ID/URL, first and last observation times, last active time, and provenance. Linked tasks persist separately and are projected as `taskRefs:[{agent,id,basis}]`. A conversation's `basis` describes its initial evidence (`observed` or `notify-target`); each task binding has its own `notify-target`, `correlated` or `manual` basis. First observations, status changes, bindings and window transitions save immediately; continuous timestamp updates are coalesced for at most 30 seconds. Live window state is never restored as open after Core restart.

Verified source-owned Cowork notification targets register `session_<24 alphanumeric characters>` as `/cowork/cse_<suffix>`, even without opening a local window. Dispatch uses its explicit verified target, or the exact same source/Codex task's still-open inherited notification binding. It never selects an arbitrary account-wide notification target. An unverified explicit target leaves the task unbound.

Chat dispatch snapshots the native window again, with a one-second metadata deadline. Missing Desktop, a failed snapshot or a closed window leaves the task unbound. Only the same account's current Chat URL qualifies, with a native observation no older than two seconds and focused, visible, non-minimized activity within **600 seconds**. The association is captured before execution, so a slow submission cannot follow a later navigation. A queued send is evaluated when it actually dispatches. Non-Claude sources and local authority do not gain inferred cloud conversation bindings.

`src_conversation_bind` allows manual rebind/unbind only to a registered conversation of the task's origin account. The next new dispatch/send evaluates automatic association again; a native resume retains the existing binding. `codex_read` and `agent_read` expose nullable `srcConversation:{accountId,kind,id,url,basis}`. No task is guessed across accounts.

### Operations and bridge

| Entry | Operation | Arguments |
| --- | --- | --- |
| query | `src_conversations` | `{accountId?}` |
| query | `src_chrome_profiles` | `{}` |
| act | `src_conversation_open` | `{accountId, conversationId? or url?, safariUserAgent?}` |
| act | `src_login_import` | `{accountId,profile}` |
| act | `src_conversation_bind` | `{accountId,agent,taskId,conversationId:string|null}` |

Omitting both navigation arguments opens `https://claude.ai/new`. Explicit URLs must be `/new` or valid Chat/Cowork URLs on the same HTTPS claude.ai origin, without credentials, nonstandard ports, query strings or fragments. External sources are restricted to their own account; local management may select any source account. Import returns progress metadata (`accountId`, `status`, nullable `reason`/`hint`) and a `next` polling call, never credentials. Mutations use the existing `read-back` retry contract: no receipt replay protection, no automatic retry, and no extra guarantee from `act.requestId`.

Local management mirrors these operations at `POST src-conversations/{query,open,import,bind}` and `GET src-conversations/profiles`. CLI names are `src.conversations.{query,profiles,open,import,bind}`. The internal Desktop metadata channel reports URL-derived state only. It is not exposed as a remote MCP operation.

`ui/scenarioSrcConversations.ts` supplies signed-in, expired, not-imported, unsupported, importing, signed-in-pending and import-blocked states, Chat/Cowork refs, linked tasks and manual binding transitions through the same API routes in browser fixtures. It does not simulate Keychain, native WebKit, or authentication. Panel buttons, L3 cards and task links are deferred to the UI segment; native login, isolation and lifecycle acceptance require a separately authorized main-checkout run.
