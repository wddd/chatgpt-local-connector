use crate::*;
pub fn allows(policy: &Value, name: &str) -> bool {
    matches!(
        name,
        "guide" | "notification_ack" | "notify_status" | "inbox_wait"
    ) || policy == "all"
        || policy["allowlist"]
            .as_array()
            .is_some_and(|tools| tools.iter().any(|v| v == name))
}

pub fn default_policy() -> Value {
    json!("all")
}
