//! Local replacement receipts. No remote MCP surface or shell executor owns the worker.
use crate::*;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::{prepare, run_worker, worker};

fn directory() -> PathBuf {
    root().join("app-replacements")
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
    load(&job(string(&latest, "id"))?.join("status.json"))
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

/// Fail closed for new dispatch while a helper waits for existing turns to finish.
pub(crate) fn check_dispatch() -> Result<()> {
    let value = status()?;
    if matches!(
        string(&value, "state"),
        "awaiting-receipt"
            | "waiting-for-turns"
            | "stopping"
            | "installing"
            | "starting"
            | "rolling-back"
    ) {
        return Err("REPLACE_PENDING: finish the current turn; resume dispatch after app.replace.status is terminal".into());
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub async fn prepare(_body: Value) -> Result<Value> {
    Err("NOT_SUPPORTED: app replace requires macOS".into())
}

/// Project shutdown blockers from the same activity sources and task ownership
/// records used by the UI. Titles and dispatch origins do not establish ownership.
pub fn waiting(activity: &Value, status: &Value, tasks: &Value) -> Value {
    let mut turns = Vec::new();
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
        }
    }
    let writes = status["core"]["activeWrites"].as_u64();
    let interactions = status["core"]["pendingInteractions"].as_u64();
    json!({"idle":!unknown_activity && turns.is_empty() && writes == Some(0) && interactions == Some(0),
        "blockingTurns":turns,"activeWrites":writes,"pendingInteractions":interactions,
        "unknownActivity":unknown_activity,"ownershipError":tasks.get("error")})
}

#[cfg(test)]
mod tests {
    use super::*;
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
