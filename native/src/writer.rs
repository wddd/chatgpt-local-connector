//! Read-only native writer diagnosis. Never removes locks or closes native sessions.
use crate::*;
pub fn probe_path(path: &Path) -> Value {
    let file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return json!({"state":"unheld","evidence":"lock-absent"}),
        Err(e) => return json!({"state":"unknown","reason":e.to_string()}),
    };
    match file.try_lock() {
        Ok(()) => { let _ = file.unlock(); json!({"state":"unheld","evidence":"native-writer-file-lock"}) }
        Err(std::fs::TryLockError::WouldBlock) => json!({"state":"held","evidence":"native-writer-file-lock"}),
        Err(e) => json!({"state":"unknown","reason":e.to_string()}),
    }
}
pub(crate) fn lock_path(thread: &str) -> Result<PathBuf> {
    uuid::Uuid::parse_str(thread).map_err(|_| "INVALID_THREAD_ID")?;
    let home = std::env::var_os("CODEX_HOME").map(PathBuf::from).or_else(||dirs::home_dir().map(|h|h.join(".codex"))).ok_or("CODEX_HOME_UNAVAILABLE")?;
    Ok(home.join("thread-writer-locks").join(format!("{thread}.lock")))
}
pub(crate) fn probe(thread: &str) -> Value {
    lock_path(thread).map(|p|probe_path(&p)).unwrap_or(json!({"state":"unknown","reason":"lock-location-unavailable"}))
}
pub(crate) fn busy(thread: &str, ownership: Value) -> Value {
    json!({"code":"THREAD_WRITER_BUSY","message":"The native thread writer is held by another owner. No turn was submitted. Inspect codex_owner; finish or archive this exact thread in its owning session before retrying.","retryable":false,"ownership":ownership,"next":{"via":"query","op":"codex_owner","args":{"threadId":thread}}})
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn held_writer_is_detected_without_waiting_or_modifying_it() {
        // Regression: external writers were discovered only after a 41-second Desktop load attempt.
        let path=std::env::temp_dir().join(format!("arc-lock-probe-{}",id()));
        let writer=std::fs::File::create(&path).unwrap();writer.lock().unwrap();
        assert_eq!(probe_path(&path)["state"],"held");
        writer.unlock().unwrap();assert_eq!(probe_path(&path)["state"],"unheld");
        drop(writer);std::fs::remove_file(path).unwrap();
    }
}
