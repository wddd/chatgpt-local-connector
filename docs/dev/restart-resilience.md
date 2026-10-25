# Restart resilience

MUST means a requirement. SHOULD means the default. MAY means an option.

## Boundaries

Core owns the Codex app-server child and its stdio RPC pipes. Shutting down Core interrupts its active turns. Codex Desktop and external writers own separate lifecycles. The frozen `guide`, `query`, `act` and `notification` envelopes remain unchanged. Local replacement management and durable receipts carry the new behavior.

## P0: replacement continuations

The detached replacement worker reads `app.replace.snapshot` before shutdown. Core records a final cutoff snapshot before closing its app-server pipes. The worker adopts that snapshot after both original owners exit. Each entry identifies the thread and interrupted turn, effective model/effort/tier and turn settings, original dispatch and source, notification binding, pending interactions, and stable queue and dispatch request IDs. The existing private replacement journal survives process restarts. A missing final snapshot requires attention rather than speculative submission.

After authenticated health verifies the new Desktop and Core hashes, the worker submits one queued turn per eligible entry:

> The previous turn was interrupted by an ARC update. Check the current state of your work, then continue the original task.

An explicit continuation for the same thread replaces this generated message. Local continuation authorization comes from the exact durable request, not remote arguments. The existing queue preserves the original source, purpose and notification binding. The dispatch record and public control-source receipt link to the interrupted turn and original request. Replacement status includes the complete list and the queue's latest persisted outcome. Queue acceptance is not task completion.

Submission intent is persisted before sending. A `submitting` or `unconfirmed` entry MUST be reconciled through its original receipt. It MUST NOT be sent with a new request ID. The queue only permits the recorded interrupted predecessor; completed or newer turns cancel the automatic continuation. Existing uncertain writes are never replayed. Active or unconfirmed writes are reported for manual reconciliation.

Pending Codex interactions depend on callbacks in the terminated app-server. P0 cannot reconnect those callbacks. Normal replacement continues waiting for them. Immediate replacement records their pending state and reports `needs-attention` without sending another turn or inventing an answer. Interactions that arise during the countdown are checked again and captured at Core shutdown. Other agents and unknown ownership remain blockers in normal mode.

Normal replacement retains the five-minute bound for unsafe or unobservable work, three quiet observations and the ten-second countdown. Eligible Codex turns no longer count as blockers. This removes the busy-turn delay without weakening write or interaction checks. Older Core versions without the snapshot operation can upgrade when idle; busy instances fail before shutdown with an actionable snapshot error.

Cancelled, failed and rolled-back installations do not submit continuations. Interrupted entries remain available for reconciliation. A worker crash can leave recorded entries unsent or submission intent uncertain; P0 does not replay these automatically. The continuation prompt asks the agent to inspect current work because terminating a process cannot undo completed or externally uncertain side effects. This is a new turn, not migration of the running computation.

## P1: Desktop-only replacement

When the candidate Core build hash equals the running Core hash, replace only Desktop while Core retains its app-server and running tasks. This is design only. Define separate component identity and compatibility checks before implementation: Core bytes and embedded resources, Desktop bytes and resources, bundle signatures, entitlements, executable paths, and updater rollback ownership. Re-signing or repackaging can change binary hashes without changing source. A whole-bundle signature covers nested Core resources; replacing Desktop cannot silently invalidate that signature or remove a running Core executable. Health must identify both components independently. Rollback must preserve the live Core and its leases.

## Deferred: separate agent host

A thin host process could own app-server pipes and pending callbacks while Core reconnects through authenticated local IPC. This requires a durable request/result boundary, single-writer ownership, callback routing, resource limits, version negotiation and orphan cleanup. Keeping a child PID alive without those contracts does not make stdio reconnectable. Defer this larger lifecycle change until measured restart costs justify it.
