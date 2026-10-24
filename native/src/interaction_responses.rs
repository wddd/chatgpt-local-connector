//! Durable answers sent through the native owner, independent of renderer caches.
use crate::*;
fn directory(thread: &str) -> PathBuf {
    root().join("interaction-responses").join(hash(thread))
}
pub(crate) fn record(request: &Value, args: &Value) -> Result<()> {
    let thread = string(&request["params"], "threadId");
    if thread.is_empty() {
        return Err("INTERACTION_THREAD_MISSING".into());
    }
    let value = json!({"request":request,"response":{"result":args["result"],"error":args["error"],"skipped":args["skipped"] == true,"origin":crate::kernel::origin::current_origin(),"resolvedAt":now()}});
    save(&directory(thread).join(format!("{}.json",hash(json!([request["backendSession"], request["params"]["turnId"], request["id"]]).to_string()))), &value)
        .map_err(|e| format!("SUBMISSION_UNCONFIRMED: response acknowledged but answer persistence failed: {e}; read the original receipt"))
}
pub(crate) fn project(timeline: &mut crate::task_tracking::Timeline, thread: &str) -> Result<()> {
    let directory = directory(thread);
    if !directory.exists() {
        return Ok(());
    }
    let mut rows = std::fs::read_dir(directory)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|v| v == "json"))
        .map(|e| load(&e.path()))
        .collect::<Result<Vec<_>>>()?;
    rows.sort_by(|a, b| {
        string(&a["response"], "resolvedAt").cmp(string(&b["response"], "resolvedAt"))
    });
    for row in rows {
        timeline.answered(&row["request"], &row["response"]);
    }
    Ok(())
}
