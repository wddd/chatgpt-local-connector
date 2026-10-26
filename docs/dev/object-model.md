# Object model and management surfaces

This document defines what a user manages in ARC and where each object is managed.
It supersedes the UI placement in `remote-link.md` (Remote link workspace) and `accounts.md` (Accounts workspace, control source panel) where they conflict.
The add/change dialogs in `remote-link.md` (Add control source, Add connection, Change connection) remain valid.

## Model

Each user owns three first-class assets. Everything else the user manages derives from them.

| Asset | Code names | Meaning |
| --- | --- | --- |
| SRC | control source, `source` | A model-facing client account that sends work to ARC (e.g. one claude.ai account). |
| AGENT | agent, agent profile | A controlled executor on this computer (Codex, Claude Code, Pi/ACP agents). |
| TUNNEL | connection, `ingress` | The transport a SRC uses to reach this computer: dedicated tunnel, private relay, shared relay, or local. |

- ACCOUNT is the second level of SRC and AGENT, not a standalone asset. One identity MAY appear on both sides (a ChatGPT account as SRC and its Codex login as AGENT).
- Public relay devices extend TUNNEL. They stay experimental and are out of scope here.
- On the homepage, the topology lines between SRC, the hub and AGENT represent TUNNEL. TUNNEL has no node of its own.

## Placement rules

- SRC and AGENT are managed only from the homepage topology. They have no dock page.
- TUNNEL is infrastructure. It is managed only from its dock page.
- Each object has exactly one canonical inspect/edit surface. Other places link to it; they MUST NOT embed a second copy.
- Creating something new happens in a centered dialog (unchanged rule). Existing objects are inspected and edited in side panels or the TUNNEL page.
- The hub left half opens Add control source. The hub right half opens the Agent catalog dialog.

## Dock

The dock contains, in order: Tasks, Records, Connections (TUNNEL), Settings.
The Remote link, Accounts and Permissions pages are removed.
Deep links, Tauri `navigate` events and tray menu items that targeted removed pages MUST redirect: `remote` → Connections, `accounts` → homepage, `permissions` → Settings › Permissions.

## Homepage panels

SRC panels dock left; AGENT panels dock right. A side panel is a drill-down stack: L1 → L2 → L3 within one panel, with a back control, using the existing agent panel task-detail layering.

- Clicking an L1 node opens its L1 layer.
- Clicking an L2 node opens its L2 layer directly; back returns to its L1 layer.
- If an L1 platform has exactly one account, clicking L1 opens that account's L2 layer directly; back still returns to the L1 layer.
- Clicking an L3 task bubble opens the task detail layer (unchanged).
- Topology lines are not clickable.

### SRC L1 — platform

- Account list for the platform (alias, state, connection chip); a row opens the L2 layer.
- Platform notification capability: whether a verified push path exists for this platform.
- Add account: opens Add control source with the platform preselected.

### SRC L2 — source account

- Identity: alias (editable), email/org (sensitive), plan.
- Enabled switch, state, last seen.
- Connection: the TUNNEL name and kind; it links to that connection on the Connections page. Change connection opens the Change connection dialog. Disconnect stays here.
- OAuth grants for this source (moved from Permissions › connection details).
- Notification binding for this account (bind, test, last delivery).
- Dispatch activity (recent dispatches from this source).
- Identity link: when the same identity is also an AGENT account, a link opens that AGENT L2 layer.
- Account maintenance: merge and remove.
- The panel MUST NOT embed the connection edit form.

### AGENT L1 — agent platform

- Header: quota icon, name, version, open-app action, in-progress count.
- Platform behavior settings moved from Settings (for Codex: auto-open Codex tasks / Desktop dispatch).
- Dispatch policy summary, read-only: default model/effort and criteria text.
- Account list; a row opens the L2 layer. Add account opens the existing account login flow for this agent.
- Aggregate task list across accounts (current behavior when no account is selected).
- Gear: display settings (bubble density, quota display), unchanged.

### AGENT L2 — agent account

- Quota for this account. Quota for a shared identity is shown only here, not on SRC L2.
- Task list filtered to this account.
- Default-account switch, reauthenticate.
- Identity link to the SRC L2 layer when the identity is also a SRC.
- Account maintenance: alias edit, merge and remove.

### AGENT L3 — task detail

Unchanged.

### Agent catalog dialog (hub right)

Lists installed and not-installed agents with enable/disable, ordering and official setup links. It manages which agents exist, not their accounts or tasks.

## Connections page (TUNNEL)

- List: one row per connection with kind, address, health and the number of sources it carries. New connection opens Add connection.
- Detail: name, address copy, kind and provider, online state, start/stop, relay settings, edit (the only entry to the connection edit form), remove or leave.
- Sources carried: rows for each SRC; selecting one returns to the homepage and opens that SRC L2 layer.
- Add a source for this connection opens Add control source with the connection preselected (unchanged).
- Pending reauthorization notices remain on this page until claimed.

## Settings

- General, appearance, network: unchanged.
- Permissions: system permissions and environment checks from the former Permissions page. First-run guidance reuses this section.
- Global behavior: task approval mode, request routing delay, control-source notification switch.
- Extras: relay hosting and experimental features, unchanged.

## Removals

- Tool policy: remove the UI. Connections always grant full tool access. Remove the stored field and its enforcement if the change stays contained; otherwise pin it to full and keep the field only for compatibility.
- Duplicate surfaces: the Remote link copy of the source panel, the Permissions connection list and details dialog, the source panel edit mode that opened the connection form, and every connection-form entry except Connections › detail › Edit.
- Account quota MUST render through one component.

## Naming

- Rename `IngressPanel` to the SRC panel; it no longer wraps the connection form.
- UI copy uses "connection" for TUNNEL. `ingress` remains a protocol and storage identifier only.

## Phases

1. Information architecture: dock change, page removals and redirects, Permissions into Settings, tool policy removal, connection form single entry, OAuth grants to SRC, Codex behavior settings to AGENT L1.
2. Panel layering: SRC L1/L2 and AGENT L1/L2 drill-down, single-account shortcut, identity links, account maintenance in L2, read-only dispatch policy summary.

Each phase is accepted with UI fixtures. Missing states get new fixtures.
