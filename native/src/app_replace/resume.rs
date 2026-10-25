//! Replacement journals and triggers the existing interrupted-turn resume contract.
use super::*;

/// Native interrupted-turn recovery carries identity only, never new user input.
pub fn resume_request(thread: &str, turn: &str, request: &str) -> Value {
    json!({"threadId":thread,"turnId":turn,"requestId":request,"waitMs":0})
}

pub(crate) async fn snapshot(control: &crate::control::Control) -> Result<Value> {
    let health = control.health().await;
    let records = control.task_records().await?;
    // Copy only cutoff metadata, not timelines or transcript contents. Release the
    // event lock before ownership probes, which may themselves publish events.
    let (observations, pending) = {
        let events = control.events.lock().await;
        (
            events
                .timelines
                .iter()
                .map(|(thread, timeline)| {
                    (
                        thread.clone(),
                        timeline.turn.clone(),
                        timeline.status.clone(),
                        timeline.observation_lost,
                    )
                })
                .collect::<Vec<_>>(),
            events.pending.values().cloned().collect::<Vec<_>>(),
        )
    };
    let mut turns = Vec::new();
    for (thread, turn, state, observation_lost) in observations {
        let interactions: Vec<_> = pending
            .iter()
            .filter(|p| p["params"]["threadId"] == thread)
            .cloned()
            .collect();
        if turn.is_empty()
            || (!matches!(state.as_str(), "running" | "inProgress")
                && interactions.is_empty()
                && !observation_lost)
        {
            continue;
        }
        if !control.effective_background(&thread).await? {
            continue;
        }
        let binding = crate::claude_notify::replacement_turn_binding(&thread, Some(&turn))?;
        let mut entry = json!({"threadId":thread,"turnId":turn,"executionOwner":"connector",
            "binding":binding,"dispatch":binding["dispatch"],"configuration":{"model":binding["model"],"turn":binding["turn"]},"pendingInteractions":interactions,
            "state":"recorded","operation":"codex_resume","observedAt":now()});
        let reason = if !interactions.is_empty() {
            Some("pending-interaction-cannot-reconnect")
        } else if health["activeWrites"] != 0 {
            Some("write-in-flight")
        } else if records
            .iter()
            .any(|r| r["threadId"] == thread && r["state"] == "unconfirmed")
        {
            Some("uncertain-write")
        } else if observation_lost {
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
            entry["continuation"] = resume_request(&thread, &turn, &id());
        }
        turns.push(entry);
    }
    Ok(
        json!({"backendSession":control.session,"turns":turns,"activeWrites":health["activeWrites"],
        "pendingInteractions":pending.len(),"observedAt":now()}),
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

pub fn apply_snapshot(receipt: &mut Value, snapshot: Value) {
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
        }
        if entry["threadId"] == receipt["continuation"]["threadId"] {
            // Explicit new instructions retain the existing codex_send contract.
            // They replace automatic resume, rather than adding a second turn.
            if entry["state"] == "recorded" {
                entry["state"] = json!("explicit-continuation");
                entry["operation"] = json!("codex_send");
                entry["continuation"] = receipt["continuation"].clone();
            } else {
                receipt["continuationState"] = json!("needs-attention");
                receipt["continuationError"] = entry["reason"].clone();
            }
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
        if entry["operation"] != "codex_resume" {
            continue;
        }
        let request = string(&entry["continuation"], "requestId");
        if uuid::Uuid::parse_str(request).is_err() {
            continue;
        }
        let store = crate::kernel::receipts::ReceiptStore::new("");
        if store.path(request)?.exists() {
            // The ordinary receipt reader marks reservations from a lost Core
            // unconfirmed. Offline status is read-only and never resubmits them.
            let session = load(&root().join("app/native.json")).unwrap_or(Value::Null);
            entry["resumeReceipt"] =
                crate::egress::receipt(store.read(request, string(&session, "instance"))?);
        }
    }
    receipt["resumedCount"] = json!(resumed_count(receipt));
    Ok(())
}

pub(super) fn resumed_count(receipt: &Value) -> usize {
    receipt["interruptedTurns"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|entry| {
            let result = entry.get("resumeReceipt").unwrap_or(&entry["receipt"]);
            result["state"] == "completed"
                && result["turnId"].as_str().is_some_and(|v| !v.is_empty())
        })
        .count()
}

/// Only exact observed turns with a complete continuation cease blocking normal replacement.
pub fn resumable_waiting(mut waiting: Value, snapshot: &Value) -> Value {
    let mut resumes = Vec::new();
    if let Some(blockers) = waiting["blockingTurns"].as_array_mut() {
        blockers.retain_mut(|blocker| {
            let entry = snapshot["turns"]
                .as_array()
                .into_iter()
                .flatten()
                .find(|entry| {
                    blocker["agent"] == "codex"
                        && blocker["executionOwner"] == "connector"
                        && entry["threadId"] == blocker["taskId"]
                        && entry["turnId"] == blocker["turnId"]
                });
            if let Some(entry) = entry {
                if entry["state"] == "recorded" {
                    resumes.push(blocker.clone());
                    return false;
                }
                blocker["question"] = entry["pendingInteractions"]
                    .as_array()
                    .and_then(|v| v.first())
                    .cloned()
                    .unwrap_or(Value::Null);
                blocker["reason"] = entry["reason"].clone();
            }
            true
        });
    }
    waiting["willResume"] = json!(resumes);
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
    let Ok(entries) = file_cache::entries(&directory()) else {
        return Ok(None);
    };
    for file in entries.iter() {
        let path = file.path.join("status.json");
        if !path.is_file() {
            continue;
        }
        let receipt = load(&path)?;
        for entry in receipt["interruptedTurns"].as_array().into_iter().flatten() {
            if entry["threadId"] == thread
                && entry["binding"].is_object()
                && entry["operation"] == "codex_resume"
                && entry["continuation"]["requestId"] == request
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
        let result = crate::cli_acceptance::control("codex_resume", args).await;
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
