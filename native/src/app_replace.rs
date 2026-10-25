//! Local replacement receipts. No remote MCP surface or shell executor owns the worker.
use crate::kernel::file_cache::{self, load};
use crate::*;
mod backups;
mod resume;
mod unified;
pub use backups::{cleanup_candidate, legacy_backup_name};
pub use resume::{
    apply_snapshot, interaction_waiting, interaction_work, resumable_waiting, resume_request,
};
pub(crate) use resume::{capture_shutdown, continuation_entry, snapshot};
pub use unified::{history, project, update_request, update_status};

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::{notify, prepare, run_worker, worker};

/// Parse explicit local replacement flags without changing the frozen control-source surface.
pub fn replacement_arguments(path: &str, flags: &[&str], mut body: Value) -> Result<Value> {
    if !body.is_object() {
        return Err("INVALID_ARGUMENT: replacement stdin must be an object".into());
    }
    let mut seen = std::collections::HashSet::new();
    for flag in flags {
        if !seen.insert(*flag) || !["--now", "--check", "--stdin"].contains(flag) {
            return Err(
                "INVALID_ARGUMENT: app replace accepts --now, --check and --stdin once each".into(),
            );
        }
    }
    body["path"] = json!(path);
    if flags.contains(&"--now") {
        body["immediate"] = json!(true);
    }
    if flags.contains(&"--check") {
        body["check"] = json!(true);
    }
    Ok(body)
}

/// Continuations are explicit local instructions with one durable dispatch identity.
pub fn continuation_request(body: &Value, request_id: &str) -> Result<Option<Value>> {
    let Some(continuation) = body.get("continuation") else {
        return Ok(None);
    };
    let mut args = continuation.clone();
    if !args.is_object()
        || string(&args, "threadId").is_empty()
        || string(&args, "prompt").trim().is_empty()
    {
        return Err(
            "INVALID_ARGUMENT: continuation requires threadId and a nonempty prompt".into(),
        );
    }
    if args
        .as_object()
        .unwrap()
        .keys()
        .any(|key| !["threadId", "prompt", "model", "turn", "notify"].contains(&key.as_str()))
    {
        return Err(
            "INVALID_ARGUMENT: continuation accepts threadId, prompt, model, turn and notify"
                .into(),
        );
    }
    args["requestId"] = json!(request_id);
    args["sendMode"] = json!("queue");
    args["waitMs"] = json!(0);
    let spec = catalog()["ops"]
        .as_array()
        .unwrap()
        .iter()
        .find(|op| op["name"] == "codex_send")
        .unwrap();
    crate::egress::validate_op(spec, &args)?;
    Ok(Some(args))
}

#[cfg(target_os = "macos")]
async fn deliver_continuation(path: &Path, receipt: &mut Value) -> Result<()> {
    let Some(args) = receipt
        .get("continuation")
        .filter(|args| args.is_object())
        .cloned()
    else {
        return Ok(());
    };
    if receipt["continuationState"] != "waiting-for-recovery" {
        return Ok(());
    }
    // Persist intent before submission. A crash is reconciled by this ID, never by a new send.
    receipt["continuationState"] = json!("submitting");
    save_status(path, receipt)?;
    match crate::cli_acceptance::control("codex_send", args).await {
        Ok(result) => {
            receipt["continuationState"] = json!("receipt-returned");
            receipt["continuationReceipt"] = result;
        }
        Err(error) => {
            receipt["continuationState"] = json!("unconfirmed");
            receipt["continuationError"] = json!(error);
        }
    }
    receipt["next"] = json!("ARC recovered. Read continuationReceipt or the original continuation.requestId through cli control receipt. A dispatch receipt is not task completion. Never resend with a new ID after an uncertain result.");
    save_status(path, receipt)
}

fn directory() -> PathBuf {
    root().join("app-replacements")
}

// Only the exact local receipt's durable continuation can reuse dispatch origin.
// Remote control-source arguments cannot opt into this path.
pub(crate) fn continuation_context(operation: &str, args: &Value) -> Result<Option<Value>> {
    continuation_context_in(&directory(), operation, args)
}
fn continuation_context_in(dir: &Path, operation: &str, args: &Value) -> Result<Option<Value>> {
    let Ok(entries) = file_cache::entries(dir) else {
        return Ok(None);
    };
    for entry in entries.iter() {
        let path = entry.path.join("status.json");
        if !path.is_file() {
            continue;
        }
        let receipt = load(&path)?;
        for entry in receipt["interruptedTurns"].as_array().into_iter().flatten() {
            if operation == "codex_resume"
                && entry["operation"] == operation
                && entry["continuation"] == *args
                && entry["binding"].is_object()
                && matches!(
                    string(entry, "state"),
                    "submitting" | "receipt-returned" | "unconfirmed"
                )
            {
                return Ok(Some(entry["binding"].clone()));
            }
        }
        if operation == "codex_send"
            && receipt["continuation"] == *args
            && receipt["continuationBinding"].is_object()
            && matches!(
                string(&receipt, "continuationState"),
                "submitting" | "receipt-returned" | "unconfirmed"
            )
        {
            return Ok(Some(receipt["continuationBinding"].clone()));
        }
    }
    Ok(None)
}

pub(crate) fn continuation_request_matches(thread: &str, request: &str) -> Result<bool> {
    continuation_request_matches_in(&directory(), thread, request)
}
fn continuation_request_matches_in(dir: &Path, thread: &str, request: &str) -> Result<bool> {
    let Ok(entries) = file_cache::entries(dir) else {
        return Ok(false);
    };
    for entry in entries.iter() {
        let path = entry.path.join("status.json");
        if !path.is_file() {
            continue;
        }
        let receipt = load(&path)?;
        if receipt["continuation"]["threadId"] == thread
            && receipt["continuation"]["requestId"] == request
            && receipt["continuationBinding"].is_object()
        {
            return Ok(true);
        }
    }
    Ok(false)
}
fn job(id: &str) -> Result<PathBuf> {
    uuid::Uuid::parse_str(id).map_err(|_| "INVALID_ARGUMENT: replacement id must be a UUID")?;
    Ok(directory().join(id))
}
pub fn status() -> Result<Value> {
    let latest = directory().join("latest.json");
    if !latest.exists() {
        return Ok(json!({"state":"none"}));
    }
    let latest = load(&latest)?;
    let mut receipt = load(&job(string(&latest, "id"))?.join("status.json"))?;
    if let Some(next) =
        terminal_next(string(&receipt, "state")).filter(|_| receipt["continuationState"].is_null())
    {
        receipt["next"] = json!(next);
    }
    resume::status_details(&mut receipt)?;
    Ok(receipt)
}
pub fn terminal_next(state: &str) -> Option<&'static str> {
    match state {
        "succeeded" => Some("Replacement succeeded. Read interruptedTurns and continuation receipts for task recovery; resume acceptance is not task completion. Read cli app status to confirm the running build."),
        "cancelled" => Some("Replacement cancelled before installation. The previous app is unchanged. Read error and waiting, resolve the blocker, then retry cli app replace with the original candidate."),
        "rolled-back" => Some("Installation failed and the previous app was restored. Read error and logPath before retrying cli app replace."),
        "failed" => Some("Replacement failed. Read error, backupMoved and logPath. Preserve the recorded backup; do not start another replacement while recovery is required."),
        _ => None,
    }
}
pub fn acknowledge(id: &str) -> Result<Value> {
    let path = job(id)?;
    let receipt = load(&path.join("status.json"))?;
    if receipt["state"] != "awaiting-receipt" && !path.join("ack.json").exists() {
        return Err("REPLACE_NOT_PENDING: read app.replace.status before retrying".into());
    }
    save(&path.join("ack.json"), &json!({"receivedAt":now()}))?;
    Ok(json!({"id":id,"acknowledged":true}))
}
pub fn acknowledgment_id<'a>(operation: &str, value: &'a Value) -> Option<&'a str> {
    (operation == "app.replace" && value["replacementReceipt"] == true)
        .then(|| value["id"].as_str())
        .flatten()
}

pub fn same_package_owner(receipt: &Value, health: &Value, app: &Value) -> bool {
    receipt["oldPackage"]["coreBuild"]
        .as_str()
        .is_some_and(|build| health["build"] == build)
        && receipt["oldPackage"]["desktopBuild"]
            .as_str()
            .is_some_and(|build| app["build"] == build)
        && health["instance"].is_string()
        && health["pid"].as_u64().is_some_and(|pid| pid > 1)
        && app["pid"].as_u64().is_some_and(|pid| pid > 1)
}

/// Fail closed for new dispatch while a helper waits for existing turns to finish.
pub(crate) fn check_dispatch() -> Result<()> {
    let value = status()?;
    if active(&value) && value["when"] != "defer" {
        return Err("REPLACE_PENDING: finish the current turn; resume dispatch after app.replace.status is terminal".into());
    }
    Ok(())
}
pub fn active(value: &Value) -> bool {
    matches!(
        string(value, "state"),
        "preparing"
            | "awaiting-receipt"
            | "waiting-for-turns"
            | "countdown"
            | "verifying"
            | "stopping"
            | "installing"
            | "starting"
            | "rolling-back"
            | "resuming"
    )
}

/// Read the shutdown journal only while a replacement is recovering a new Core.
pub fn recovery_turns(
    receipt: &Value,
    session: &str,
) -> Option<std::collections::HashSet<(String, String)>> {
    if !active(receipt)
        || receipt["shutdownRequested"] != true
        || string(receipt, "coreInstance").is_empty()
        || receipt["coreInstance"] == session
    {
        return None;
    }
    Some(
        receipt["interruptedTurns"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|entry| entry["state"] != "finished-before-shutdown")
            .filter_map(|entry| {
                let thread = string(entry, "threadId");
                let turn = string(entry, "turnId");
                (!thread.is_empty() && !turn.is_empty()).then(|| (thread.into(), turn.into()))
            })
            .collect(),
    )
}

#[cfg(not(target_os = "macos"))]
pub async fn prepare(_body: Value) -> Result<Value> {
    Err("NOT_SUPPORTED: app replace requires macOS".into())
}

/// Project shutdown blockers from the same activity sources and task ownership
/// records used by the UI. Titles and dispatch origins do not establish ownership.
pub fn waiting(activity: &Value, status: &Value, tasks: &Value) -> Value {
    let mut turns = Vec::new();
    let mut unaffected = Vec::new();
    let active = activity["activeAgents"].as_array();
    let mut unknown_activity = active.is_none();
    for agent in active.into_iter().flatten() {
        let Some(agent) = agent.as_str() else {
            unknown_activity = true;
            continue;
        };
        let Some(sessions) = activity["agents"][agent]["sessions"]
            .as_array()
            .filter(|v| !v.is_empty())
        else {
            turns.push(json!({"agent":agent,"taskId":null,"turnId":null,"executionOwner":"unknown","reason":"activity-unavailable"}));
            continue;
        };
        for session in sessions {
            let task = string(session, "id");
            let records: Vec<_> = tasks["records"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|record| {
                    !task.is_empty()
                        && record["agent"].as_str().unwrap_or("codex") == agent
                        && (["taskId", "threadId"]
                            .iter()
                            .any(|key| record[*key] == task)
                            || record["task"]["threadId"] == task)
                })
                .collect();
            let latest = records
                .iter()
                .max_by_key(|record| string(record, "createdAt"));
            let owner = match (agent, string(session, "source")) {
                (_, "arc-task") => "connector", // A live AgentHost process owned by ARC.
                ("codex", "codex-thread" | "transcript") => {
                    match latest.map(|record| string(record, "executionOwner")) {
                        Some("connector") => "connector",
                        Some("desktop") => "desktop",
                        None if session["source"] == "transcript"
                            && tasks["records"].is_array() =>
                        {
                            "external"
                        }
                        _ => "unknown",
                    }
                }
                (_, "transcript") => "external", // Read-only transcript observation.
                _ => "unknown",
            };
            if matches!(owner, "desktop" | "external") {
                unaffected.push(json!({"kind":"turn","agent":agent,"taskId":session["id"],"title":session["title"],"owner":owner}));
                continue;
            }
            let turn = session["turnId"]
                .as_str()
                .filter(|id| !id.is_empty())
                .or_else(|| {
                    records
                        .iter()
                        .filter(|record| record["turnId"].as_str().is_some_and(|id| !id.is_empty()))
                        .max_by_key(|record| string(record, "createdAt"))
                        .and_then(|record| record["turnId"].as_str())
                });
            turns.push(
                json!({"agent":agent,"taskId":session["id"],"turnId":turn,"executionOwner":owner,
                "reason":if owner == "unknown" {"ownership-unknown"} else {"arc-owned-turn"}}),
            );
            if let Some(title) = session["title"].as_str() {
                turns.last_mut().unwrap()["title"] = json!(title);
            }
        }
    }
    let writes = status["core"]["activeWrites"].as_u64();
    let interactions = status["core"]["pendingInteractions"].as_u64();
    json!({"idle":!unknown_activity && turns.is_empty() && writes == Some(0) && interactions == Some(0),
        "unaffected":unaffected,"blockingTurns":turns,"activeWrites":writes,"pendingInteractions":interactions,
        "unknownActivity":unknown_activity,"ownershipError":tasks.get("error")})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resumable_turns_do_not_hide_unsafe_shutdown_blockers() {
        // Regression: parallel ARC-owned turns prevented normal replacement for the full idle deadline.
        let activity = json!({"activeAgents":["codex"],"agents":{"codex":{"sessions":[{"id":"task","turnId":"turn","source":"codex-thread"}]}}});
        let tasks =
            json!({"records":[{"threadId":"task","turnId":"turn","executionOwner":"connector"}]});
        let quiet = json!({"core":{"activeWrites":0,"pendingInteractions":0}});
        let snapshot = json!({"turns":[{"threadId":"task","turnId":"turn","state":"recorded"}]});
        let observed = waiting(&activity, &quiet, &tasks);
        assert_eq!(resumable_waiting(observed.clone(), &snapshot)["idle"], true);
        assert_eq!(
            resumable_waiting(observed.clone(), &json!({"turns":[]}))["idle"],
            false
        );
        let blocked =
            json!({"turns":[{"threadId":"task","turnId":"turn","state":"needs-attention"}]});
        assert_eq!(resumable_waiting(observed, &blocked)["idle"], false);
        for field in ["activeWrites", "pendingInteractions"] {
            let mut busy = quiet.clone();
            busy["core"][field] = json!(1);
            assert_eq!(
                resumable_waiting(waiting(&activity, &busy, &tasks), &snapshot)["idle"],
                false
            );
        }
        assert_eq!(
            resumable_waiting(
                waiting(&activity, &quiet, &json!({"records":[]})),
                &snapshot
            )["idle"],
            false
        );
    }

    #[test]
    fn automatic_replacement_resume_uses_native_identity_without_new_content() {
        // Regression: generated codex_send input created a separate notification scope instead of native interrupted continuation.
        let args = resume_request(
            "thread",
            "interrupted-turn",
            "11111111-1111-4111-8111-111111111111",
        );
        let spec = catalog()["ops"]
            .as_array()
            .unwrap()
            .iter()
            .find(|op| op["name"] == "codex_resume")
            .unwrap();
        crate::egress::validate_op(spec, &args).unwrap();
        assert_eq!(args["threadId"], "thread");
        assert_eq!(args["turnId"], "interrupted-turn");
        for field in ["prompt", "input", "notify", "model", "turn", "sendMode"] {
            assert!(args.get(field).is_none());
        }
        assert_eq!(
            args,
            resume_request(
                "thread",
                "interrupted-turn",
                "11111111-1111-4111-8111-111111111111"
            )
        );
    }

    #[test]
    fn final_snapshot_preserves_resume_id_and_reports_new_interactions() {
        // Regression: countdown changes could duplicate a continuation or resend a newly blocked interaction.
        let old = json!({"threadId":"task","turnId":"turn","state":"recorded","continuation":{"threadId":"task","requestId":"resume","turnId":"turn"}});
        let mut receipt = json!({"interruptedTurns":[old.clone()]});
        apply_snapshot(
            &mut receipt,
            json!({"turns":[{"threadId":"task","turnId":"turn","state":"recorded","continuation":{"requestId":"discard"}}]}),
        );
        assert_eq!(
            receipt["interruptedTurns"][0]["continuation"],
            old["continuation"]
        );
        apply_snapshot(
            &mut receipt,
            json!({"turns":[{"threadId":"task","turnId":"turn","state":"needs-attention","reason":"pending-interaction-cannot-reconnect","pendingInteractions":[{"id":"question"}]}]}),
        );
        assert_eq!(receipt["interruptedTurns"].as_array().unwrap().len(), 1);
        assert_eq!(receipt["interruptedTurns"][0]["state"], "needs-attention");
        assert_eq!(
            receipt["interruptedTurns"][0]["pendingInteractions"],
            json!([{"id":"question"}])
        );
        assert!(receipt["interruptedTurns"][0]["continuation"].is_null());
    }

    #[test]
    fn continuation_lookups_read_only_changed_replacement_receipts() {
        // Regression: continuation attribution reopened every historical replacement status on every lookup.
        struct Sandbox(PathBuf);
        impl Drop for Sandbox {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        let dir = Sandbox(std::env::temp_dir().join(format!("arc-continuation-cache-{}", id())));
        for n in 0..52 {
            save(
                &dir.0.join(n.to_string()).join("status.json"),
                &json!({"state":"succeeded"}),
            )
            .unwrap();
        }
        let args = json!({"threadId":"thread","requestId":"request"});
        assert!(continuation_context_in(&dir.0, "codex_send", &args)
            .unwrap()
            .is_none());
        let warm = file_cache::thread_io();
        for _ in 0..3 {
            assert!(!continuation_request_matches_in(&dir.0, "thread", "request").unwrap());
            assert!(continuation_context_in(&dir.0, "codex_send", &args)
                .unwrap()
                .is_none());
        }
        assert_eq!(file_cache::thread_io(), warm);
        save(&dir.0.join("0/status.json"), &json!({"continuation":args,"continuationBinding":{"sourceId":"source"},"continuationState":"submitting"})).unwrap();
        assert!(continuation_request_matches_in(&dir.0, "thread", "request").unwrap());
        assert_eq!(
            continuation_context_in(&dir.0, "codex_send", &args)
                .unwrap()
                .unwrap()["sourceId"],
            "source"
        );
        assert_eq!(file_cache::thread_io().file_opens - warm.file_opens, 1);
        assert_eq!(
            file_cache::thread_io().directory_reads,
            warm.directory_reads
        );
    }
    #[test]
    fn explicit_continuation_replaces_native_resume_and_finished_turns_are_not_submitted() {
        // Regression: a replacing-thread continuation could compete with the automatic batch continuation.
        let explicit = json!({"threadId":"one","requestId":"explicit","prompt":"user instruction"});
        let mut receipt =
            json!({"continuation":explicit,"continuationState":"waiting-for-recovery"});
        let snapshot = json!({"turns":[
            {"threadId":"one","turnId":"first","state":"recorded","continuation":{"requestId":"generated","turnId":"first"}},
            {"threadId":"two","turnId":"second","state":"recorded","continuation":{"requestId":"other"}}
        ]});
        apply_snapshot(&mut receipt, snapshot);
        assert_eq!(receipt["interruptedTurns"].as_array().unwrap().len(), 2);
        assert_eq!(
            receipt["interruptedTurns"][0]["continuation"]["requestId"],
            "explicit"
        );
        assert_eq!(
            receipt["interruptedTurns"][0]["state"],
            "explicit-continuation"
        );
        assert_eq!(receipt["interruptedTurns"][0]["operation"], "codex_send");
        assert_eq!(receipt["continuationState"], "waiting-for-recovery");
        apply_snapshot(&mut receipt, json!({"turns":[]}));
        assert!(receipt["interruptedTurns"]
            .as_array()
            .unwrap()
            .iter()
            .all(|entry| entry["state"] == "finished-before-shutdown"));
    }

    #[test]
    fn explicit_continuation_does_not_override_a_pending_interaction() {
        // Regression: an explicit replacing-thread message could bypass a final pending-interaction snapshot.
        let mut receipt = json!({"continuation":{"threadId":"thread","requestId":"explicit","prompt":"continue"},"continuationState":"waiting-for-recovery"});
        apply_snapshot(
            &mut receipt,
            json!({"turns":[{"threadId":"thread","turnId":"turn","state":"needs-attention","reason":"pending-interaction-cannot-reconnect"}]}),
        );
        assert_eq!(receipt["continuationState"], "needs-attention");
        assert_eq!(
            receipt["continuationError"],
            "pending-interaction-cannot-reconnect"
        );
        assert!(receipt["interruptedTurns"][0]["continuation"].is_null());
    }

    #[test]
    fn replacement_attribution_survives_public_receipt_projection() {
        // Contract: CLI/control-source receipts expose replacement lineage without internal arguments or bindings.
        let lineage = json!({"threadId":"thread","interruptedTurnId":"old","originalRequestId":"original","requestId":"resume"});
        let receipt = crate::egress::receipt(
            json!({"requestId":"resume","state":"completed","operation":"resume","replacementContinuation":lineage,"arguments":{"prompt":"private"},"binding":{"origin":"private"}}),
        );
        assert_eq!(receipt["replacementContinuation"], lineage);
        assert!(receipt.get("arguments").is_none());
        assert!(receipt.get("binding").is_none());
    }

    #[test]
    fn explicit_immediate_replacement_is_preserved_through_cli_and_management() {
        // Regression: an explicit local installation still waited for idle work and a fixed handoff delay.
        let body =
            replacement_arguments("/fixture/ARC.app", &["--check", "--now"], json!({})).unwrap();
        assert_eq!(body["immediate"], true);
        assert_eq!(body["check"], true);
        let (_, method, resolved) =
            crate::management::resolve("app.replace", &json!({"body":body})).unwrap();
        assert_eq!(method, "POST");
        assert_eq!(resolved["immediate"], true);
        assert!(replacement_arguments("/fixture/ARC.app", &["--force"], json!({})).is_err());
        assert!(replacement_arguments("/fixture/ARC.app", &["--now", "--now"], json!({})).is_err());
        assert!(
            replacement_arguments("/fixture/ARC.app", &[], json!({})).unwrap()["immediate"]
                .is_null()
        );
    }
    #[test]
    fn replacement_reconnects_only_to_the_same_original_package() {
        // Regression: a Desktop restart cancelled replacement even when the original signed package was unchanged.
        let receipt =
            json!({"oldPackage":{"coreBuild":"core-build","desktopBuild":"desktop-build"}});
        let health = json!({"build":"core-build","pid":42,"instance":"new-instance"});
        let app = json!({"build":"desktop-build","pid":43});
        assert!(same_package_owner(&receipt, &health, &app));
        assert!(!same_package_owner(
            &receipt,
            &json!({"build":"other","pid":42,"instance":"new-instance"}),
            &app
        ));
        assert!(!same_package_owner(
            &receipt,
            &health,
            &json!({"build":"other","pid":43})
        ));
        assert!(!same_package_owner(&receipt, &Value::Null, &app));
    }
    #[test]
    fn terminal_replacement_outcomes_explain_recovery_instead_of_waiting_for_a_receipt() {
        // Regression: cancelled replacements kept telling clients to end their turn instead of reporting the failed installation.
        for state in ["cancelled", "rolled-back", "failed", "succeeded"] {
            assert!(terminal_next(state).is_some());
        }
        for state in [
            "none",
            "awaiting-receipt",
            "waiting-for-turns",
            "installing",
        ] {
            assert!(terminal_next(state).is_none());
        }
    }
    #[test]
    fn reading_replacement_status_does_not_acknowledge_delivery() {
        // Regression: status polling acknowledged an unread replacement receipt and armed shutdown.
        let receipt = json!({"replacementReceipt":true,"id":"job"});
        assert_eq!(acknowledgment_id("app.replace", &receipt), Some("job"));
        assert_eq!(acknowledgment_id("app.replace.status", &receipt), None);
        assert_eq!(
            acknowledgment_id("app.replace", &json!({"validated":true})),
            None
        );
    }
    #[test]
    fn replacement_waits_for_turn_and_command_completion() {
        // Regression: self-replacement interrupted the connector-owned turn that requested installation.
        let quiet = json!({"core":{"activeWrites":0,"pendingInteractions":0}});
        let idle = |activity: &Value, status: &Value| {
            waiting(activity, status, &json!({"records":[]}))["idle"] == true
        };
        assert!(idle(&json!({"activeAgents":[]}), &quiet));
        assert!(!idle(&json!({"activeAgents":["codex"]}), &quiet));
        assert!(!idle(
            &json!({"activeAgents":[]}),
            &json!({"core":{"activeWrites":1,"pendingInteractions":0}})
        ));
        assert!(!idle(
            &json!({"activeAgents":[]}),
            &json!({"core":{"activeWrites":0,"pendingInteractions":1}})
        ));
        assert!(!idle(&Value::Null, &quiet));
        assert!(!idle(&json!({"activeAgents":[]}), &Value::Null));
    }

    #[test]
    fn desktop_and_external_turns_do_not_block_replacement() {
        // Regression: a manually started Codex Desktop turn caused REPLACE_TASKS_BUSY after five minutes.
        let activity = json!({"activeAgents":["codex","claude"],"agents":{
            "codex":{"sessions":[{"id":"desktop-task","source":"codex-thread","origin":null},{"id":"external-task","source":"transcript"}]},
            "claude":{"sessions":[{"id":"external-agent","source":"transcript"}]}}});
        let tasks = json!({"records":[{"threadId":"desktop-task","turnId":"desktop-turn","executionOwner":"desktop"}]});
        let result = waiting(
            &activity,
            &json!({"core":{"activeWrites":0,"pendingInteractions":0}}),
            &tasks,
        );
        assert_eq!(result["idle"], true);
        assert_eq!(result["blockingTurns"], json!([]));
        let unavailable = waiting(
            &activity,
            &json!({"core":{"activeWrites":0,"pendingInteractions":0}}),
            &json!({"error":"unavailable"}),
        );
        assert_eq!(unavailable["idle"], false);
        assert_eq!(unavailable["blockingTurns"][1]["taskId"], "external-task");
        assert_eq!(unavailable["blockingTurns"][1]["executionOwner"], "unknown");
    }

    #[test]
    fn replacement_reports_owned_and_unknown_turns() {
        // Regression: replacement status hid which ARC-owned or unclassified turns prevented shutdown.
        let activity = json!({"activeAgents":["codex","claude"],"agents":{
            "codex":{"sessions":[{"id":"owned-task","source":"codex-thread","origin":null,"turnId":"current-turn"},{"id":"unknown-task","source":"codex-thread","turnId":"unknown-turn"},{"id":"observed-owned-task","source":"transcript"}]},
            "claude":{"sessions":[{"id":"agent-task","source":"arc-task","turnId":"agent-turn"}]}}});
        let tasks = json!({"records":[{"threadId":"owned-task","turnId":"older-turn","executionOwner":"connector"},{"threadId":"observed-owned-task","turnId":"observed-owned-turn","executionOwner":"connector"}]});
        let result = waiting(
            &activity,
            &json!({"core":{"activeWrites":0,"pendingInteractions":0}}),
            &tasks,
        );
        assert_eq!(result["idle"], false);
        assert_eq!(
            result["blockingTurns"],
            json!([
                {"agent":"codex","taskId":"owned-task","turnId":"current-turn","executionOwner":"connector","reason":"arc-owned-turn"},
                {"agent":"codex","taskId":"unknown-task","turnId":"unknown-turn","executionOwner":"unknown","reason":"ownership-unknown"},
                {"agent":"codex","taskId":"observed-owned-task","turnId":"observed-owned-turn","executionOwner":"connector","reason":"arc-owned-turn"},
                {"agent":"claude","taskId":"agent-task","turnId":"agent-turn","executionOwner":"connector","reason":"arc-owned-turn"}
            ])
        );
        let unavailable = waiting(
            &activity,
            &json!({"core":{"activeWrites":0,"pendingInteractions":0}}),
            &json!({"error":"unavailable"}),
        );
        assert_eq!(unavailable["idle"], false);
        assert_eq!(unavailable["blockingTurns"][0]["executionOwner"], "unknown");
        assert_eq!(unavailable["ownershipError"], "unavailable");
    }
}

#[cfg(test)]
mod continuation_tests {
    use super::*;
    #[test]
    fn continuation_keeps_thread_identity_and_replay_key_without_steering() {
        // Regression: replacing ARC ended the calling turn without a durable continuation in the original thread.
        let request = "11111111-1111-4111-8111-111111111111";
        let body = json!({"continuation":{"threadId":"original-thread","prompt":"Continue"}});
        let args = continuation_request(&body, request).unwrap().unwrap();
        assert_eq!(args["threadId"], "original-thread");
        assert_eq!(args["requestId"], request);
        assert_eq!(args["sendMode"], "queue");
        assert_eq!(continuation_request(&body, request).unwrap(), Some(args));
        assert!(continuation_request(
            &json!({"continuation":{"threadId":"original-thread","prompt":" "}}),
            request
        )
        .is_err());
        assert!(continuation_request(&json!({}), request).unwrap().is_none());
    }
}

fn save_status(path: &Path, receipt: &Value) -> Result<()> {
    crate::coordination::observers::save_owner(
        &path.join("status.json"),
        receipt,
        crate::coordination::observers::Owner::Replacement,
    )
}
