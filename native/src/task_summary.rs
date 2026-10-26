//! Bounded outcomes with an explicit field allowlist; no inbox or other task data.
use crate::*;

pub(crate) fn requested(name: &str, args: &Value) -> bool {
    args["view"] == "summary"
        && matches!(
            name,
            "codex_read" | "codex_wait" | "agent_read" | "agent_wait"
        )
}

pub(crate) async fn evidence(
    control: &control::Control,
    name: &str,
    args: &Value,
    value: &mut Value,
) {
    if name == "codex_wait" && value["turnId"].is_string() {
        let pinned = json!({"threadId":args["threadId"],"turnId":value["turnId"]});
        match crate::review::turn_page(control, &pinned).await {
            Ok(page) => {
                let turn = &page["data"][0];
                value["files"] = crate::review::native_files(
                    turn["items"].as_array().map(Vec::as_slice).unwrap_or(&[]),
                );
                if matches!(
                    value["state"].as_str(),
                    Some("completed" | "failed" | "cancelled")
                ) {
                    value["finalResponse"] = turn["items"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .rev()
                        .find(|i| i["type"] == "agentMessage" && i["phase"] != "commentary")
                        .map(|i| i["text"].clone())
                        .unwrap_or(Value::Null);
                }
            }
            Err(_) => value["files"] = Value::Null,
        }
    }
    if value["state"].is_null() && value["status"].is_string() {
        value["state"] = value["status"].clone();
        value["recordedStatus"] = value["status"].clone();
    }
}

pub(crate) fn project(name: &str, args: &Value, value: &Value) -> Value {
    let mut out = json!({});
    for key in [
        "agent",
        "taskId",
        "threadId",
        "turnId",
        "state",
        "stateScope",
        "recordedStatus",
        "runtimeStatus",
        "reason",
        "conditionMet",
        "snapshotHash",
        "changed",
        "elapsedMs",
        "observedAt",
        "waitLimit",
        "error",
        "next",
        "finalResponseUnchanged",
    ] {
        if let Some(v) = value.get(key) {
            out[key] = v.clone();
        }
    }
    for key in ["agent", "taskId", "threadId", "turnId"] {
        if out[key].is_null() && args[key].is_string() {
            out[key] = args[key].clone();
        }
    }
    if !out["threadId"].is_string() && !out["taskId"].is_string() {
        return out;
    }
    let text = value["finalResponse"]
        .as_str()
        .or_else(|| value["finalResponse"]["text"].as_str());
    out["finalResponse"] = text
        .map(|s| json!(s.chars().take(800).collect::<String>()))
        .unwrap_or(Value::Null);
    out["finalResponseTruncated"] = json!(
        text.is_some_and(|s| s.chars().count() > 800)
            || value["finalResponse"]["truncated"] == true
            || value["outputTruncated"] == true
    );
    let files = value["files"].as_array();
    out["files"] = files
        .map(|f| json!(f.iter().take(50).collect::<Vec<_>>()))
        .unwrap_or(Value::Null);
    out["filesTruncated"] = json!(files.is_some_and(|f| f.len() > 50));
    out["diffstat"] = files
        .map(|files| {
            json!({"files":files.len(),
        "added":files.iter().filter_map(|f|f["added"].as_u64()).sum::<u64>(),
        "removed":files.iter().filter_map(|f|f["removed"].as_u64()).sum::<u64>(),
        "unknown":files.iter().filter(|f|f["added"].is_null() || f["removed"].is_null()).count()})
        })
        .unwrap_or(Value::Null);
    out["changeEvidence"] = json!(if files.is_some() {
        "native-file-changes"
    } else {
        "unavailable: no attributed native file-change evidence"
    });
    out["completeEvidence"] = if name.starts_with("codex_") {
        let mut pinned = json!({"threadId":out["threadId"],"view":"review"});
        if out["turnId"].is_string() {
            pinned["turnId"] = out["turnId"].clone();
        }
        json!({"via":"query","op":"codex_read","args":pinned})
    } else {
        json!({"via":"query","op":"agent_read","args":{"agent":out["agent"],"taskId":out["taskId"]}})
    };
    if matches!(
        out["next"]["op"].as_str(),
        Some("codex_wait" | "agent_wait" | "codex_read" | "agent_read")
    ) {
        out["next"]["args"]["view"] = json!("summary");
        if out["next"]["op"] == "codex_read" && out["turnId"].is_string() {
            out["next"]["args"]["turnId"] = out["turnId"].clone();
        }
    }
    if out["next"].is_null() {
        out["next"] = out["completeEvidence"].clone();
    }
    out
}
