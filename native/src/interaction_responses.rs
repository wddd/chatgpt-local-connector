//! Durable answers sent through the native owner, independent of renderer caches.
use crate::kernel::file_cache::{self, load};
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
    for row in answers(&directory(thread))? {
        timeline.answered(&row["request"], &row["response"]);
    }
    Ok(())
}
fn answers(directory: &Path) -> Result<Vec<Value>> {
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut rows = file_cache::entries(directory)?
        .iter()
        .filter(|e| e.path.extension().is_some_and(|v| v == "json"))
        .map(|e| load(&e.path))
        .collect::<Result<Vec<_>>>()?;
    rows.sort_by(|a, b| {
        string(&a["response"], "resolvedAt").cmp(string(&b["response"], "resolvedAt"))
    });
    Ok(rows)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn timeline_polls_reuse_answers_and_pick_up_a_new_response() {
        // Regression: the one-second timeline poll enumerated and reread every persisted answer.
        struct Sandbox(PathBuf);
        impl Drop for Sandbox {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        let dir = Sandbox(std::env::temp_dir().join(format!("arc-answer-cache-{}", id())));
        for n in 0..100 {
            save(&dir.0.join(format!("{n}.json")), &json!({"request":{"id":n},"response":{"resolvedAt":"2026-01-01T00:00:00Z","result":n}})).unwrap();
        }
        assert_eq!(answers(&dir.0).unwrap().len(), 100);
        let warm = file_cache::thread_io();
        for _ in 0..3 {
            assert_eq!(answers(&dir.0).unwrap().len(), 100);
        }
        assert_eq!(file_cache::thread_io(), warm);
        save(&dir.0.join("new.json"), &json!({"request":{"id":"new"},"response":{"resolvedAt":"2026-01-02T00:00:00Z","result":"accepted"}})).unwrap();
        let rows = answers(&dir.0).unwrap();
        assert_eq!(rows.len(), 101);
        assert_eq!(rows.last().unwrap()["response"]["result"], "accepted");
        assert_eq!(file_cache::thread_io().file_opens - warm.file_opens, 1);
        assert_eq!(
            file_cache::thread_io().directory_reads,
            warm.directory_reads
        );
    }
}
