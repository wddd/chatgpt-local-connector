//! Explicit migration of the interim queue. Policy/history prose is never an entry.
use super::*;
use store::tokens;

fn queue_rows(text: &str) -> Vec<(String, String)> {
    let mut section = "";
    let mut rows = Vec::new();
    for line in text.lines() {
        let heading = line.trim().trim_start_matches('#').trim();
        if heading.starts_with("AX frictions") {
            section = "friction";
            continue;
        }
        if heading.starts_with("Backlog ideas") {
            section = "idea";
            continue;
        }
        if heading.starts_with("Follow-ups") {
            section = "friction";
            continue;
        }
        if line.starts_with('#')
            || (!heading.is_empty() && !line.starts_with('-') && heading.ends_with(':'))
        {
            section = "";
        }
        if let Some(body) = line.strip_prefix("- ").filter(|_| !section.is_empty()) {
            rows.push((section.into(), body.trim().into()));
        }
    }
    rows
}
impl Store {
    pub(super) fn import_queue(&mut self, text: &str, time: i64) -> Result<Value> {
        let rows = queue_rows(text);
        if rows.len() > 1000 {
            return Err("COORDINATION_CAPACITY: too many queue entries".into());
        }
        let reports = rows.into_iter().map(|(kind, text)| {
            let stable = format!("import-{}", hash(json!([kind, tokens(&text)]).to_string()));
            json!({"id":stable,"requestId":stable,"kind":kind,"severity":if kind=="friction" {json!("workaround")} else {Value::Null},"symptom":text.chars().take(500).collect::<String>(),"expected":"Review this reported friction or desired outcome before implementation","reproductionHints":text.chars().take(1000).collect::<String>(),"queueReport":text})
        }).collect();
        self.import_reports(reports, time)
    }
}
