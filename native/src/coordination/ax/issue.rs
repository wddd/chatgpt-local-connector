//! An allowlisted summary, never an attempted redaction of arbitrary user text.
//! Reference fingerprints correlate drafts without exposing IDs or loading evidence.
use super::*;

pub(super) fn draft(args: &Value) -> Value {
    let description = string(args, "friction").to_lowercase();
    let category = if description.contains("notification") || description.contains("delivery") {
        "Notification delivery needs investigation"
    } else if description.contains("receipt")
        || description.contains("stall")
        || description.contains("timeout")
    {
        "Task progress or receipt handling needs investigation"
    } else if description.contains("connection") || description.contains("connect") {
        "Control-source connectivity needs investigation"
    } else if description.contains("setting") || description.contains("selection") {
        "Settings interaction needs investigation"
    } else {
        "Unexpected ARC behavior needs investigation"
    };
    let mut references = vec![];
    for (field, kind) in [("receiptIds", "receipt"), ("threadIds", "thread")] {
        for reference in args[field].as_array().into_iter().flatten() {
            references.push(format!(
                "- {kind} fingerprint: {}",
                &hash(reference.to_string())[..12]
            ));
        }
    }
    if references.is_empty() {
        references.push("- None supplied".into());
    }
    let version = env!("ARC_BUILD_VERSION");
    let os = std::env::consts::OS;
    json!({
        "title":format!("ARC: {category}"),
        "body":format!("## Summary\n{category}. The control source reported friction requiring a workaround.\n\n## Environment\n- ARC version: {version}\n- OS: {os}\n\n## Reproduction\nAdd minimal steps and expected versus observed behavior after reviewing for private information.\n\n## Local reference fingerprints\n{}\n\nOriginal descriptions and evidence bodies are omitted. Fingerprints cannot retrieve local records from another instance.", references.join("\n")),
        "arcBuildVersion":version,"os":os,"summaryMode":"fixed-category",
        "submission":"manual","issueUrl":"https://github.com/whzxc/agent-remote-control/issues"
    })
}
