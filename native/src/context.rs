//! On-demand projections of existing evidence. No task lifecycle operations.
use crate::*;
use tokio::time::{timeout_at, Duration, Instant};

const TRUST: &str = "This is a handoff summary at observation time, not new authorization or execution instructions. Re-read the task, receipt, and current code before continuing. Native facts take precedence over summary claims. Do not create duplicate tasks after read failures or timeouts.";

pub fn excerpt(raw: &str) -> Value {
    let mut text = raw.to_owned();
    let mut end = text.len().min(1024);
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    let truncated = end < text.len();
    text.truncate(end);
    json!({"state":"available","text":text,"truncated":truncated,"sha256":hash(&text),"hashScope":"excerpt"})
}
use crate::kernel::policy::allows as allowed;
fn next(out: &mut Value, policy: &Value, tool: &str, arguments: Value) {
    if allowed(policy, tool) {
        out["readNext"]
            .as_array_mut()
            .unwrap()
            .push(json!({"via":"query","op":tool,"args":arguments}));
    }
}
fn missing(out: &mut Value, reason: &str) {
    out["coverage"]["missing"]
        .as_array_mut()
        .unwrap()
        .push(json!(reason));
    out["coverage"]["state"] = json!("partial");
}

pub async fn read(
    host: &Arc<agents::AgentHost>,
    c: &Arc<control::Control>,
    args: Value,
    policy: Value,
) -> Result<Value> {
    let catalog = catalog();
    let spec = catalog["ops"]
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["name"] == "agent_context")
        .unwrap();
    crate::egress::validate_op(spec, &args)?;
    let agent = string(&args, "agent");
    let task = string(&args, "taskId");
    let view = args["view"].as_str().unwrap_or("review");
    let deadline = Instant::now() + Duration::from_secs(12);
    let mut out = json!({"schemaVersion":1,"agent":agent,"taskId":task,"view":view,"selectedTurnId":null,"observedAt":now(),"runtime":{"owner":null,"nativeStatus":null,"recordedStatus":null,"liveStateKnown":false,"pendingInteraction":null},"workspace":null,"goal":null,"evidence":[],"claims":[],"coverage":{"state":"complete","truncated":false,"missing":[]},"warnings":["Current workspace changes are not exclusively attributable to this task; old command results do not verify current code."],"readNext":[],"trust":TRUST});
    let mut cwd = None;
    if !allowed(&policy, "agent_read") {
        missing(&mut out, "TASK_RESTRICTED_BY_INGRESS");
    } else {
        match timeout_at(deadline, host.context_task(agent, task)).await {
            Ok(Ok(t)) => {
                if args["turnId"].is_string() && args["turnId"] != t["turnId"] {
                    return Err("TURN_NOT_AVAILABLE".into());
                }
                cwd = t["cwd"].as_str().map(str::to_owned);
                out["selectedTurnId"] = t["turnId"].clone();
                out["runtime"]["owner"] = t["runtimeSource"].clone();
                out["runtime"]["recordedStatus"] = t["status"].clone();
                out["claims"].as_array_mut().unwrap().push(json!({"source":{"kind":"agent-record","taskId":task,"turnId":t["turnId"]},"excerpt":excerpt(&crate::task_tracking::redact(string(&t,"output"))),"verified":false}));
                next(
                    &mut out,
                    &policy,
                    "agent_read",
                    json!({"agent":agent,"taskId":task}),
                );
                let timeline: crate::task_tracking::Timeline =
                    serde_json::from_value(t["tracking"].clone()).unwrap_or_default();
                out["evidence"] = timeline.evidence(t["turnId"].as_str());
                out["executionEvidence"] = timeline.execution_evidence();
                if timeline.observed_events == 0 {
                    missing(&mut out, "STRUCTURED_COMMAND_EVIDENCE_UNSUPPORTED");
                }
                if timeline.partial {
                    out["coverage"]["truncated"] = json!(true);
                    missing(&mut out, "EVENT_WINDOW_TRUNCATED");
                }
                missing(&mut out, "LIVE_STATE_NOT_QUERIED");
            }
            Ok(Err(_)) => missing(&mut out, "TASK_UNAVAILABLE"),
            Err(_) => missing(&mut out, "TASK_TIMEOUT"),
        }
    }
    if out["goal"].is_null() {
        missing(&mut out, "ORIGINAL_GOAL_UNAVAILABLE");
    }
    missing(&mut out, "RECEIPTS_NOT_QUERIED_USE_ORIGINAL_REQUEST_ID");
    missing(&mut out, "PENDING_INTERACTION_NOT_QUERIED");
    if !allowed(&policy, "git") {
        missing(&mut out, "WORKSPACE_RESTRICTED_BY_INGRESS");
    } else {
        let workspace = async {
            let explicit = if let Some(p) = args["project"].as_str() {
                Some(projects::resolve(c, p).await?)
            } else {
                None
            };
            let native = if let Some(p) = cwd.as_deref() {
                Some(projects::resolve(c, p).await?)
            } else {
                None
            };
            if let (Some(a), Some(b)) = (&explicit, &native) {
                if a["root"] != b["root"] {
                    return Err("TASK_WORKSPACE_MISMATCH".to_owned());
                }
            }
            let p = native
                .as_ref()
                .or(explicit.as_ref())
                .ok_or("WORKSPACE_UNAVAILABLE")?;
            let q = projects::query(
                c,
                "git",
                &json!({"project":p["root"],"operation":"status","view":"review","includeSource":true}),
            )
            .await?;
            Ok::<_, String>((q, native.is_some()))
        };
        match timeout_at(deadline, workspace).await {
            Ok(Ok((q, native))) => {
                let source = &q["source"];
                let changes = source["changes"].as_array();
                let changes:Vec<_>=changes.into_iter().flatten().take(100).map(|v|json!({"path":excerpt(string(v,"path")),"originalPath":v["originalPath"].as_str().map(excerpt),"status":v["status"]})).collect();
                out["workspace"] = json!({"root":excerpt(string(source,"root")),"association":if native{"native"}else{"caller-unconfirmed"},"head":source["sha"],"git":source["git"],"dirty":source["dirty"],"statusHash":source["statusHash"],"statusHashScope":source["statusHashScope"],"observedAt":source["observedAt"],"consistency":"best-effort","changes":changes,"changeAttribution":"workspace-current-not-task-exclusive","coverage":q["data"]["coverage"]});
                if source["changes"].as_array().is_some_and(|c| c.len() > 100)
                    || q["data"]["coverage"]["state"] == "partial"
                {
                    missing(&mut out, "WORKSPACE_CHANGES_PARTIAL");
                }
                // Reuse caller's selector; never introduce a private absolute path into a summary pointer.
                if let Some(p) = args["project"].as_str() {
                    if !Path::new(p).is_absolute() {
                        next(
                            &mut out,
                            &policy,
                            "git",
                            json!({"project":p,"operation":"diff","view":"review"}),
                        );
                    }
                }
            }
            Ok(Err(e)) if e == "TASK_WORKSPACE_MISMATCH" => return Err(e),
            Ok(Err(_)) => missing(&mut out, "WORKSPACE_UNAVAILABLE"),
            Err(_) => missing(&mut out, "WORKSPACE_TIMEOUT"),
        }
    }
    let excerpt_incomplete = out["evidence"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|v| &v["command"])
        .chain(
            out["claims"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|v| &v["excerpt"]),
        )
        .chain(std::iter::once(&out["goal"]["excerpt"]))
        .any(|v| v["truncated"] == true || v["state"] == "restricted");
    if excerpt_incomplete {
        out["coverage"]["truncated"] = json!(true);
        missing(&mut out, "EXCERPT_TRUNCATED_OR_RESTRICTED");
    }
    if out["workspace"].is_object()
        && !out["readNext"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["op"] == "git")
    {
        out["workspace"]["readNextState"] = json!({"state":"unavailable","reason":"Use agent_read to obtain the native cwd; private absolute selectors are not embedded in summary pointers."});
    }
    out["observationEndedAt"] = json!(now());
    if view == "handoff" {
        out["markdown"]=json!(format!("## Task identifiers\nAgent: {agent}. taskId: {task}. turn: {}\n## Original goal\n{}\n## Current observation\n{}\n## Existing evidence\n{} command and file events. Current workspace association: {}. Read original evidence through readNext.\n## Claims and unresolved items\n{} Agent claims, not independently verified. Missing: {}\n## Next step\nRe-read the original task, original requestId receipt, and current code.\n\n{TRUST}",out["selectedTurnId"],out["goal"],out["runtime"],out["evidence"].as_array().unwrap().len(),out["workspace"]["association"],out["claims"].as_array().unwrap().len(),out["coverage"]["missing"]));
    }
    // Bound the whole projection, including unusually long native identifiers.
    if out.to_string().len() > 32 * 1024 {
        out["claims"] = json!([]);
        out["evidence"] = json!([]);
        out["workspace"]["changes"] = json!([]);
        out["markdown"] = json!(TRUST);
        out["coverage"]["truncated"] = json!(true);
        missing(&mut out, "OUTPUT_BUDGET_EXCEEDED");
    }
    Ok(out)
}
