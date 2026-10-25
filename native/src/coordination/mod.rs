//! Bounded, metadata-only coordination feed. Observers and AX persist their owner
//! record first, release owner locks, then call emit with the same transition ID.
pub mod ax;
pub(crate) mod bulletin;
pub(crate) mod git_watch;
mod journal;
pub(crate) mod lifecycle;
pub(crate) mod messages;
pub(crate) mod observers;
pub(crate) mod recovery;
mod types;
use crate::*;
use journal::{Journal, Query, Reader};
use std::sync::{LazyLock, Mutex};
pub use types::*;

// Lock order: read and release source authorization, then JOURNAL. Owner/notification
// stores, network, Git and task-owner discovery never run under JOURNAL.
static JOURNAL: LazyLock<Mutex<Option<Journal>>> = LazyLock::new(|| Mutex::new(None));
fn with_journal<T>(f: impl FnOnce(&mut Journal) -> Result<T>) -> Result<T> {
    let mut journal = JOURNAL
        .lock()
        .map_err(|_| "COORDINATION_STORAGE: journal lock unavailable")?;
    if journal.is_none() {
        *journal = Some(Journal::open(
            root().join("coordination/events"),
            chrono::Utc::now().timestamp_millis(),
        )?);
    }
    let result = f(journal.as_mut().unwrap());
    if result.as_ref().is_err_and(|e| {
        e.starts_with("COORDINATION_STORAGE") || e.starts_with("COORDINATION_CORRUPT")
    }) {
        // A failed append may leave a partial tail. Never append past it in memory.
        *journal = None;
    }
    result
}
/// Internal emit API, deliberately absent from MCP and management. Returns
/// {eventId,sequence,duplicate} only after a synced append. Retain pending owner
/// descriptors on error and reconcile with this same ID/payload. Dedupe is bounded
/// by feed retention; producers must checkpoint successful older projections.
pub fn emit(input: EventInput) -> Result<Value> {
    let observation = input.clone();
    let result =
        with_journal(|journal| journal.emit(input, chrono::Utc::now().timestamp_millis()))?;
    // Projection failure leaves the owner transition retryable; AX coalesces retries.
    ax::from_event(&observation)?;
    bulletin::from_event(&observation)?;
    Ok(result)
}
fn reader(origin: &Value, source: &Value) -> Result<Reader> {
    if source["state"] == "revoked"
        || source["connectionRemoved"] == true
        || source["id"] != origin["sourceId"]
    {
        return Err("SOURCE_REVOKED: restore this control source in local ARC management".into());
    }
    let principal = Principal::from_origin(origin)?
        .ok_or("SOURCE_REQUIRED: events requires authenticated source or local authority")?;
    if principal == Principal::LocalAuthority {
        if !crate::sources::is_local(source) {
            return Err("SOURCE_REQUIRED: local authority evidence missing".into());
        }
    } else if source["ingressId"] != origin["ingressId"] {
        return Err("SOURCE_REVOKED: connection changed; reconnect this control source".into());
    }
    // Account reconciliation does not change metadata visibility. Credential/connection
    // changes do, while lastSeen, labels and connected/disconnected telemetry do not.
    Ok(Reader {
        principal,
        revision: hash(
            json!([1, source["id"], source["ingressId"], source["credential"]]).to_string(),
        ),
    })
}
pub(crate) fn query(args: &Value) -> Result<Value> {
    let result = (|| {
        let origin = crate::kernel::origin::current_origin();
        let source = crate::sources::coordination_source(&origin)?;
        let reader = reader(&origin, &source)?;
        let query: Query = serde_json::from_value(args.clone())
            .map_err(|_| "INVALID_ARGUMENT: read guide for events")?;
        with_journal(|journal| journal.query(&reader, query, chrono::Utc::now().timestamp_millis()))
            .map(project_coverage)
    })();
    // Keep error details metadata-only and preserve actionable next across transports.
    Ok(result.unwrap_or_else(|message| failure(message, args)))
}
fn failure(message: String, args: &Value) -> Value {
    let code = message.split(':').next().unwrap_or("COORDINATION_STORAGE");
    let next = if code == "COORDINATION_RATE_LIMIT" {
        json!({"via":"query","op":"events","args":args,"hint":"Wait one second, then retry with your saved cursor and filters"})
    } else if matches!(
        code,
        "INVALID_ARGUMENT" | "RESOURCE_UNKNOWN" | "RESOURCE_AMBIGUOUS"
    ) {
        json!({"via":"query","op":"guide","args":{"op":"events"},"hint":"Use the current events schema and a canonical resource key"})
    } else {
        json!({"op":null,"hint":"Use local ARC management to restore source authorization or journal disk capacity; preserve coordination/events for recovery"})
    };
    json!({"state":"failed","error":{"code":code,"message":message},"next":next})
}

#[cfg(test)]
mod tests;

fn project_coverage(mut result: Value) -> Value {
    result["coverage"]["observers"] = observers::coverage();
    result
}
