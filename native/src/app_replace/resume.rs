//! Replacement continuations reuse existing dispatch, queue and notification contracts.
use super::*;

const PROMPT: &str = "The previous turn was interrupted by an ARC update. Check the current state of your work, then continue the original task.";

pub(crate) async fn snapshot(control: &crate::control::Control) -> Result<Value> {
    let health = control.health().await;
    let records = control.task_records().await?;
    let events = control.events.lock().await;
    let mut turns = Vec::new();
    for (thread, timeline) in &events.timelines {
        if !control.background(thread)?
            || !matches!(timeline.status.as_str(), "running" | "inProgress")
        {
            continue;
        }
        let pending: Vec<_> = events
            .pending
            .values()
            .filter(|p| p["params"]["threadId"] == *thread)
            .cloned()
            .collect();
        let binding = crate::claude_notify::replacement_turn_binding(thread, Some(&timeline.turn))?;
        let mut entry = json!({"threadId":thread,"turnId":timeline.turn,"executionOwner":"connector",
            "binding":binding,"dispatch":binding["dispatch"],"configuration":{"model":binding["model"],"turn":binding["turn"]},"pendingInteractions":pending,
            "state":"recorded","dispatchRequestId":id(),"observedAt":now()});
        let reason = if !pending.is_empty() {
            Some("pending-interaction-cannot-reconnect")
        } else if health["activeWrites"] != 0 {
            Some("write-in-flight")
        } else if records
            .iter()
            .any(|r| r["threadId"] == *thread && r["state"] == "unconfirmed")
        {
            Some("uncertain-write")
        } else if timeline.observation_lost {
            Some("observation-lost")
        } else if !binding.is_object() {
            Some("dispatch-binding-missing")
        } else {
            None
        };
        if let Some(reason) = reason {
            entry["state"] = json!("needs-attention");
            entry["reason"] = json!(reason);
        } else {
            let mut args = json!({"threadId":thread,"prompt":PROMPT,"requestId":id(),"sendMode":"queue","waitMs":0});
            if binding["model"].is_string() {
                args["model"] = binding["model"].clone();
            }
            if binding["turn"].is_object() {
                args["turn"] = binding["turn"].clone();
            }
            // Preserve the effective dispatch selection even when an older binding lacks retry settings.
            for field in ["model", "effort", "serviceTier"] {
                let value = binding["dispatch"]["effectiveConfiguration"]
                    .get(field)
                    .or_else(|| binding["dispatch"].get(field));
                if let Some(value) = value.filter(|v| v.is_string() && *v != "unknown") {
                    if field == "model" {
                        args["model"] = value.clone();
                    } else {
                        if !args["turn"].is_object() {
                            args["turn"] = json!({});
                        }
                        args["turn"][field] = value.clone();
                    }
                }
            }
            entry["configuration"] = json!({"model":args["model"],"turn":args["turn"]});
            entry["continuation"] = args;
        }
        turns.push(entry);
    }
    Ok(
        json!({"backendSession":control.session,"turns":turns,"activeWrites":health["activeWrites"],
        "pendingInteractions":events.pending.len(),"observedAt":now()}),
    )
}

// Core writes a final cutoff snapshot before closing its pipes. The worker remains
// the sole status.json writer and adopts this snapshot only after both owners exit.
pub(crate) async fn capture_shutdown(control: &crate::control::Control) -> Result<()> {
    let receipt = status()?;
    if receipt["state"] == "stopping"
        && receipt["shutdownRequested"] == true
        && receipt["coreInstance"] == control.session
    {
        let snapshot = snapshot(control).await?;
        save(
            &job(string(&receipt, "id"))?.join("shutdown-snapshot.json"),
            &snapshot,
        )?;
    }
    Ok(())
}

pub(super) fn apply_snapshot(receipt: &mut Value, snapshot: Value) {
    let previous = receipt["interruptedTurns"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let mut entries = snapshot["turns"].as_array().cloned().unwrap_or_default();
    for entry in &mut entries {
        if let Some(old) = previous
            .iter()
            .find(|old| old["threadId"] == entry["threadId"] && old["turnId"] == entry["turnId"])
        {
            if entry["state"] == "recorded" && old["continuation"].is_object() {
                entry["continuation"] = old["continuation"].clone();
            }
            entry["dispatchRequestId"] = old["dispatchRequestId"].clone();
        }
        if entry["threadId"] == receipt["continuation"]["threadId"] {
            if entry["state"] == "recorded" {
                for (key, value) in receipt["continuation"]
                    .as_object()
                    .cloned()
                    .unwrap_or_default()
                {
                    entry["continuation"][key] = value;
                }
            }
            receipt["continuationState"] = json!("covered-by-interrupted-turn");
        }
    }
    for mut old in previous {
        if !entries
            .iter()
            .any(|entry| entry["threadId"] == old["threadId"] && entry["turnId"] == old["turnId"])
        {
            old["state"] = json!("finished-before-shutdown");
            entries.push(old);
        }
    }
    receipt["interruptedTurns"] = json!(entries);
    receipt["interruptionSnapshot"] = snapshot;
}

pub(super) fn status_details(receipt: &mut Value) -> Result<()> {
    for entry in receipt["interruptedTurns"]
        .as_array_mut()
        .into_iter()
        .flatten()
    {
        let request = string(&entry["continuation"], "requestId");
        if uuid::Uuid::parse_str(request).is_err() {
            continue;
        }
        let path = root().join("send-queue").join(format!("{request}.json"));
        if path.exists() {
            let row = load(&path)?;
            entry["queue"] = json!({"state":row["state"],"turnId":row["turnId"],"reason":row["reason"],"error":row["error"],"dispatchRequestId":row["dispatchRequestId"]});
        }
    }
    Ok(())
}

/// Only exact observed turns with a complete continuation cease blocking normal replacement.
pub fn resumable_waiting(mut waiting: Value, snapshot: &Value) -> Value {
    if let Some(blockers) = waiting["blockingTurns"].as_array_mut() {
        blockers.retain(|blocker| {
            !snapshot["turns"]
                .as_array()
                .into_iter()
                .flatten()
                .any(|entry| {
                    blocker["agent"] == "codex"
                        && blocker["executionOwner"] == "connector"
                        && entry["threadId"] == blocker["taskId"]
                        && entry["turnId"] == blocker["turnId"]
                        && entry["state"] == "recorded"
                })
        });
    }
    waiting["continuableTurns"] = snapshot["turns"].clone();
    waiting["idle"] = json!(
        waiting["unknownActivity"] == false
            && waiting["blockingTurns"]
                .as_array()
                .is_some_and(|v| v.is_empty())
            && waiting["activeWrites"] == 0
            && waiting["pendingInteractions"] == 0
    );
    waiting
}

// Read only durable local intent. Remote callers cannot supply replacement attribution.
pub(crate) fn continuation_entry(thread: &str, request: &str) -> Result<Option<Value>> {
    let Ok(entries) = std::fs::read_dir(directory()) else {
        return Ok(None);
    };
    for file in entries.flatten() {
        let path = file.path().join("status.json");
        if !path.is_file() {
            continue;
        }
        let receipt = load(&path)?;
        for entry in receipt["interruptedTurns"].as_array().into_iter().flatten() {
            if entry["threadId"] == thread
                && entry["binding"].is_object()
                && (entry["continuation"]["requestId"] == request
                    || entry["dispatchRequestId"] == request)
                && matches!(
                    string(entry, "state"),
                    "submitting" | "receipt-returned" | "unconfirmed"
                )
            {
                return Ok(Some(entry.clone()));
            }
        }
    }
    Ok(None)
}

/// A restart continuation cannot attach itself to newer work or repeat completed work.
pub fn continuation_outcome(original: &Value, current: &Value) -> Option<&'static str> {
    if original != &current["id"] {
        Some("thread-advanced")
    } else if current["status"] == "completed" {
        Some("turn-completed-before-shutdown")
    } else {
        None
    }
}

#[cfg(target_os = "macos")]
pub(super) async fn deliver(path: &Path, receipt: &mut Value) -> Result<()> {
    let count = receipt["interruptedTurns"].as_array().map_or(0, Vec::len);
    for index in 0..count {
        if receipt["interruptedTurns"][index]["state"] != "recorded" {
            continue;
        }
        let args = receipt["interruptedTurns"][index]["continuation"].clone();
        receipt["interruptedTurns"][index]["state"] = json!("submitting");
        save(&path.join("status.json"), receipt)?;
        let result = crate::cli_acceptance::control("codex_send", args).await;
        let entry = &mut receipt["interruptedTurns"][index];
        match result {
            Ok(result) => {
                entry["state"] = json!("receipt-returned");
                entry["receipt"] = result;
            }
            Err(error) => {
                entry["state"] = json!("unconfirmed");
                entry["error"] = json!(error);
            }
        }
        save(&path.join("status.json"), receipt)?;
    }
    Ok(())
}
