# Embedded control sources

> Status: technical route validated by spike (2026-10-26). Product/UI design not started.
> Evidence: `~/Developer/research/arc-src-webview-spike` (commit `e8a6aa2`, `REPORT.md`, `evidence/`).
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
- AX-facing ops expose only: account/container ID, status (`not-imported | signed-in | expired`), and the nullable current conversation ref. Never cookies or page content.
- No host system settings changes.

## Conversation <-> task binding

- Cowork: deterministic. ARC's verified notify target `session_<id>` maps 1:1 to URL `/cowork/cse_<id>`.
- Chat: the model does not know its own conversation UUID. Proposed: correlate a dispatch with the account's active conversation URL at dispatch time, plus manual rebind. To be designed.

## Open risks

- The container shares the Chrome login session. Signing out in Chrome likely invalidates ARC's copy. `__Host-sessionBinding` cookies suggest server-side session binding; rotation behavior under two concurrent clients is untested.
- Session lifetime and re-import frequency are unknown; observe in daily use.
- Cowork deep link needs a positive check with a conversation owned by the container's account.
- ChatGPT (chatgpt.com, auth.openai.com) is untested.

## Product implications (design inputs, undecided)

ARC's current homepage favours fun over space: the centre ring takes the most valuable area but carries no function; the three-level tentacle topology spends space on aesthetics; the tree keeps idle sources and agents on screen permanently.
Once conversations live inside ARC, the UI must optimise for daily productivity. This likely supersedes the topology-centred placement rules in `object-model.md`. The redesign is pending discussion with the user. Preserving the current playful UI (for example as a tagged version or an optional view) is also undecided.
