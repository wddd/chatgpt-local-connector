//! Explain notification gaps without inferring task completion or taking ownership.
use super::*;

pub(super) fn turn(b: &Binding) -> Value {
    let owner = ownership::read(&b.thread_id).unwrap_or(Value::Null);
    let mut reasons = Vec::new();
    if let Some(reason) = &b.scope_end {
        reasons.push(json!(reason));
    }
    if b.successor["turnId"].is_string() {
        reasons.push(json!(if b.successor["inherited"] == true {
            "superseded-turn-inherited"
        } else {
            "successor-not-inherited"
        }));
    }
    if owner["currentOwner"] == "desktop" {
        reasons.push(json!("ownership-moved-to-desktop"));
    }
    if b.observation["reconciliation"] == "pending-after-restart" {
        reasons.push(json!("pending-after-restart"));
    } else if !b.terminal && b.observation.is_null() {
        reasons.push(json!("pending-observation"));
    }
    if b.terminal && !b.deliveries.iter().any(|d| d.key == "terminal") {
        reasons.push(json!("no-terminal-delivery"));
    }
    if b.deliveries.is_empty() {
        reasons.push(json!(if b.terminal {
            "no-terminal-delivery"
        } else {
            "awaiting-observable-transition"
        }));
    } else if b
        .deliveries
        .iter()
        .any(|d| matches!(d.status.as_str(), "pending" | "sending"))
    {
        reasons.push(json!("delivery-pending"));
    } else {
        reasons.push(json!("delivery-recorded"));
    }
    for reason in b
        .deliveries
        .iter()
        .filter(|d| d.status == "pending")
        .filter_map(|d| d.timing.queue_reason.as_ref())
    {
        let reason = json!(reason);
        if !reasons.contains(&reason) {
            reasons.push(reason);
        }
    }
    let next = if owner["currentOwner"] == "desktop" {
        json!({"via":"query","op":"codex_owner","args":{"threadId":b.thread_id},"hint":"Inspect the current Desktop owner and handoff history. The notification scope remains bound across a proven resume."})
    } else {
        json!({"via":"query","op":"codex_read","args":{"threadId":b.thread_id,"statusOnly":true},"hint":"Read the current native turn. Unknown history remains pending; a new unrelated turn does not inherit this binding."})
    };
    json!({"reasons":reasons,"terminal":b.terminal,"scope":{"threadId":b.thread_id,"sourceId":b.source_id,"active":b.scope_end.is_none(),"endedBy":b.scope_end},
        "successor":b.successor,"observation":b.observation,
        "retry":{"status":b.retry["status"],"reason":b.retry["reason"],"notBefore":b.retry["notBefore"],"successorTurnId":b.retry["successorTurnId"]},"next":next})
}
