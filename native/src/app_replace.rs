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

/// A failed/missing activity read must never be interpreted as an idle executor.
pub fn idle(activity: &Value, status: &Value) -> bool {
    activity["activeAgents"]
        .as_array()
        .is_some_and(Vec::is_empty)
        && status["core"]["activeWrites"].as_u64() == Some(0)
        && status["core"]["pendingInteractions"].as_u64() == Some(0)
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
}
