//! Pure MCP output projection. Storage and execution live outside this module.
use crate::*;
/// Classify the returned operation, never errors embedded in history arrays or user text.
pub fn outcome_error(value: &Value) -> Option<Value> {
    let mut current = value;
    for _ in 0..8 {
        let state = string(current, "state");
        let failed = matches!(state, "failed" | "rejected" | "not-executed" | "cancelled" | "unconfirmed" | "rolled-back");
        let exit = current["exitCode"].as_i64().filter(|code| *code != 0);
        if failed || exit.is_some() || current["ok"] == false {
            let reason = current.get("error").filter(|v| !v.is_null())
                .or_else(|| current["result"].get("error").filter(|v| !v.is_null()));
            let mut error = match reason {
                Some(value) if value.is_object() => value.clone(),
                Some(value) if value.is_string() => json!({"message":value}),
                Some(value) => json!({"message":value.to_string()}),
                None => json!({"message":current["reason"].as_str().map(str::to_owned).unwrap_or_else(|| if let Some(code) = exit { format!("Command exited with code {code}") } else {format!("Operation outcome: {state}")})}),
            };
            if !error["code"].is_string() { error["code"] = json!(if state == "unconfirmed" { "OPERATION_UNCONFIRMED" } else { "OPERATION_FAILED" }); }
            error["outcome"] = json!(state);
            if let Some(code) = exit { error["exitCode"] = json!(code); }
            return Some(error);
        }
        let Some(next) = current.get("result").or_else(|| current.get("lastResult")) else { break; };
        current = next;
    }
    None
}

/// One public failure per operation; arrays remain historical data.
pub fn compact_failure(value: &mut Value) {
    let Some(mut error) = outcome_error(value).or_else(||value.get("error").filter(|v|v.is_object()).cloned()) else { return; };
    if value["next"].is_null() && error["next"].is_object() { value["next"] = error["next"].clone(); }
    error.as_object_mut().map(|e|e.remove("next"));
    if error["rpcError"]["message"].is_string() {
        error["message"] = error["rpcError"]["message"].clone();
        error["rpcError"].as_object_mut().map(|e|e.remove("message"));
    }
    fn strip(value: &mut Value, code: &Value, depth: usize) {
        if depth == 0 { return; }
        if value["error"]["code"] == *code { value.as_object_mut().map(|v|v.remove("error")); }
        for key in ["result", "lastResult"] { if let Some(v) = value.get_mut(key) { strip(v, code, depth-1); } }
    }
    for key in ["result", "lastResult"] { if let Some(v) = value.get_mut(key) { strip(v, &error["code"], 8); } }
    value["error"] = error;
}

pub fn tool(mut value: Value, mut error: bool) -> Value {
    if let Some(reason) = outcome_error(&value) { value["error"] = reason; error = true; }
    if !value.is_object() {
        value = json!({"value":value});
    }
    if error { compact_failure(&mut value); }
    value["arcVersion"] = json!(arc_version());
    let text = value.to_string();
    json!({"content":[{"type":"text","text":text}],"structuredContent":{"result":value},"isError":error})
}
/// Opted-in clients read structuredContent; images and other content stay intact.
pub(crate) fn minimal_text(response: &mut Value) {
    if !response["structuredContent"].is_object() {
        return;
    }
    let text = if response["isError"] == true {
        format!(
            "Error {}; see structuredContent.result.error.",
            string(&response["structuredContent"]["result"]["error"], "code")
        )
    } else {
        "See structuredContent.result.".into()
    };
    if let Some(content) = response["content"].as_array_mut() {
        content.retain(|b| b["type"] != "text");
        content.insert(0, json!({"type":"text","text":text}));
    }
}

pub fn failure(e: &str) -> Value {
    if let Ok(value) = serde_json::from_str::<Value>(e) {
        if matches!(
            value["code"].as_str(),
            Some(
                "PERMISSION_REQUIRED"
                    | "INVALID_ARGUMENTS"
                    | "UNKNOWN_OP"
                    | "OP_UNAVAILABLE"
                    | "WRONG_TOOL"
                    | "NOTIFICATION_TARGET_NOT_BOUND_TO_SOURCE"
                    | "DESKTOP_STEER_UNAVAILABLE"
                    | "ARCHIVE_ACTIVE_TURN"
                    | "ARCHIVE_WRITER_BUSY"
                    | "THREAD_WRITER_BUSY"
                    | "WRITER_RELEASE_REQUIRES_OWNER"
            )
        ) {
            return value;
        }
    }
    if e.contains("already has an active writer") {
        return json!({"code":"THREAD_WRITER_BUSY","message":"Codex rejected the operation because another native session owns this thread. ARC runtimeStatus=notLoaded only describes ARC observation, not global writer ownership.","nativeError":e,"retryable":false,"next":{"via":"query","op":"codex_read","requiredArgs":["threadId"],"statusOnly":true,"hint":"Read the original receipt and thread status. Continue in the owning ChatGPT/Codex session, or explicitly close that session before retrying this same thread. Do not delete writer locks, auto-retry, or create a replacement thread."}});
    }
    let rpc = e
        .strip_prefix("RPC_REJECTED:")
        .and_then(|s| serde_json::from_str::<Value>(s).ok());
    json!({"code":if rpc.is_some(){"NATIVE_RPC_ERROR"}else{if e == "REQUEST_ID_CONFLICT" { "REQUEST_ID_CONFLICT" } else { "CONTROL_ERROR" }},"message":e,"rpcError":rpc})
}

/// Public receipts never echo submitted arguments or internal execution records.
pub fn receipt(value: Value) -> Value {
    if !value["requestId"].is_string() || !value["state"].is_string() {
        return value;
    }
    let mut out = json!({});
    for key in [
        "requestId",
        "createdAt",
        "updatedAt",
        "dispatchMode",
        "queueId",
        "state",
        "operation",
        "threadId",
        "turnId",
        "taskId",
        "agent",
        "error",
        "notification",
        "notificationError",
        "executionOwner",
        "failureStage",
        "cleanup",
        "next",
    ] {
        if !value[key].is_null() {
            out[key] = value[key].clone();
        }
    }
    if value["origin"].is_object() {
        let mut origin = json!({});
        // Provenance is public; credential anchors and authentication material are not.
        for key in [
            "ingressId",
            "sourceId",
            "sourceLabel",
            "controlSource",
            "authType",
        ] {
            if let Some(text) = value["origin"][key].as_str() {
                origin[key] = json!(text);
            }
        }
        out["origin"] = origin;
    }
    out["stateScope"] = json!("operation");
    if let Some(updated) = value["updatedAt"].as_str().and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok()) {
        let age = chrono::Utc::now().signed_duration_since(updated).num_milliseconds().max(0);
        out["phaseAgeMs"] = json!(age);
        if !matches!(string(&value, "state"), "completed" | "failed" | "cancelled" | "rejected" | "not-executed") { out["progressStalled"] = json!(age >= 30000); }
    }
    let result = &value["result"];
    if value["task"]["dispatch"].is_object() {
        out["dispatch"] = value["task"]["dispatch"].clone();
    }
    for key in ["threadId", "turnId", "taskId"] {
        if out[key].is_null() && !result[key].is_null() {
            out[key] = result[key].clone();
        }
    }
    if out["threadId"].is_null() && result["thread"]["id"].is_string() {
        out["threadId"] = result["thread"]["id"].clone();
    }
    if out["turnId"].is_null() && result["turn"]["id"].is_string() {
        out["turnId"] = result["turn"]["id"].clone();
    }
    if value.get("result").is_some() {
        let operation = string(&value, "operation");
        let mut result = result.clone();
        if let Some(fields) = result.as_object_mut() {
            for key in ["threadId", "turnId", "taskId"] {
                if !out[key].is_null() {
                    fields.remove(key);
                }
            }
            for key in [
                "arguments",
                "params",
                "prompt",
                "input",
                "digest",
                "origin",
                "backendSession",
                "resolved",
                "task",
                "thread",
                "turn",
                "native",
            ] {
                fields.remove(key);
            }
            if matches!(operation, "create" | "send" | "interrupt")
                || operation.starts_with("agent_")
            {
                fields.retain(|key, _| {
                    [
                        "threadId",
                        "turnId",
                        "taskId",
                        "sessionId",
                        "desktopUrl",
                        "submitted",
                        "accepted",
                        "responseSent",
                        "status",
                        "output",
                        "outputTruncated",
                        "error",
                        "stopReason",
                        "dispatch",
                        "review",
                        "promptSubmitted",
                        "configurationError",
                        "configurationState",
                        "sessionConfirmation",
                        "turnEvidence",
                    ]
                    .contains(&key.as_str())
                });
            }
        }
        if result.as_object().is_none_or(|m| !m.is_empty()) {
            out["result"] = result;
        }
    }
    if !dispatch_receipt(&out) {
        out.as_object_mut().unwrap().remove("notification");
        out.as_object_mut().unwrap().remove("notificationError");
    }
    out
}

/// Strip ARC attribution only from owned metadata, never native or user payloads.
pub(crate) fn control_source(name: &str, value: &mut Value) {
    fn strip(value: &mut Value) {
        if let Some(fields) = value.as_object_mut() {
            fields.remove("origin");
        }
    }
    if (value["requestId"].is_string() && value["state"].is_string())
        || matches!(
            name,
            "codex_read" | "codex_tasks" | "agent_read" | "agent_tasks"
        )
    {
        strip(value);
    }
    let arrays: &[&str] = match name {
        "codex_read" => &["turns", "dispatches"],
        "codex_tasks" => &["tasks"],
        "agent_read" => &["dispatches"],
        "agent_tasks" => &["tasks"],
        _ => &[],
    };
    for key in arrays {
        for row in value
            .get_mut(*key)
            .and_then(Value::as_array_mut)
            .into_iter()
            .flatten()
        {
            strip(row);
        }
    }
}

pub(crate) fn dispatch_receipt(value: &Value) -> bool {
    matches!(
        string(value, "operation"),
        "create" | "send" | "agent_create" | "agent_send"
    )
}

/// The activity surfaces need configuration and source identity, never raw receipts.
pub(crate) fn dispatch_summary(value: &Value) -> Option<Value> {
    let known = |value: &Value| {
        value
            .as_str()
            .filter(|text| !text.is_empty() && *text != "unknown")
            .map(str::to_owned)
    };
    let mut summary = json!({});
    for field in ["model", "effort", "serviceTier"] {
        if let Some(text) = [
            &value["turnEvidence"][field],
            &value["effectiveConfiguration"][field],
            &value[field],
            &value["options"][field],
        ]
        .into_iter()
        .find_map(known)
        {
            summary[field] = json!(text);
        }
    }
    if summary["serviceTier"].is_null() {
        if let Some(tier) = known(&value["threadServiceTier"]) {
            summary["serviceTier"] = json!(tier);
        }
    }
    if summary["effort"].is_null() {
        if let Some(effort) = known(&value["options"]["thinkingLevel"])
            .or_else(|| known(&value["options"]["reasoning_effort"]))
        {
            summary["effort"] = json!(effort);
        }
    }
    let mut source = json!({});
    for (field, origin) in [
        ("id", "sourceId"),
        ("label", "sourceLabel"),
        ("kind", "controlSource"),
    ] {
        if let Some(text) = known(&value["origin"][origin]) {
            source[field] = json!(text);
        }
    }
    if !source.as_object().unwrap().is_empty() {
        summary["controlSource"] = source;
    }
    (!summary.as_object().unwrap().is_empty()).then_some(summary)
}

pub(crate) fn arc_version() -> &'static str {
    static VERSION: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    VERSION.get_or_init(|| protocol_hash(catalog()))
}

fn protocol_hash(catalog: &Value) -> String {
    let mut ops: Vec<_> = catalog["ops"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|op| {
            json!({"op":op["name"],"via":via(op),"description":op["description"],
            "inputSchema":op["inputSchema"],"signature":signature(op),"example":example(op)})
        })
        .collect();
    ops.sort_by(|a, b| string(a, "op").cmp(string(b, "op")));
    hash(
        json!({"tools":catalog["tools"],"instructions":catalog["instructions"],
        "guides":catalog["guides"],"ops":ops,"events":crate::claude_notify::subscriptions::guide()})
        .to_string(),
    )[..12]
        .to_owned()
}

pub(crate) fn via(spec: &Value) -> &'static str {
    if spec["annotations"]["readOnlyHint"] == true {
        "query"
    } else {
        "act"
    }
}

pub(crate) fn example(spec: &Value) -> Value {
    json!({"tool":via(spec),"arguments":{"op":spec["name"],"args":spec["example"]}})
}

pub(crate) fn invalid_arguments(op: &str, field: &str, message: &str) -> String {
    json!({"code":"INVALID_ARGUMENTS","op":op,"field":field,"message":message,
        "guide":{"tool":"query","arguments":{"op":"guide","args":if op.is_empty(){json!({})}else{json!({"op":op})}}}}).to_string()
}

pub(crate) fn validation_error(
    op: &str,
    schema: &Value,
    error: &jsonschema::ValidationError<'_>,
) -> String {
    use jsonschema::error::ValidationErrorKind as Kind;
    let mut field = error.instance_path.to_string();
    let message = match &error.kind {
        Kind::Required { property } => {
            field.push('/');
            field.push_str(property.as_str().unwrap_or(""));
            "Required field is missing.".into()
        }
        Kind::AdditionalProperties { unexpected } => {
            let name = &unexpected[0];
            let parent = error
                .schema_path
                .as_str()
                .strip_suffix("/additionalProperties")
                .unwrap_or("");
            let properties = schema.pointer(parent).unwrap_or(schema)["properties"].as_object();
            let suggestion = properties.and_then(|p| {
                if name == "order" && op == "codex_items" {
                    return Some("latest");
                }
                p.keys()
                    .min_by_key(|key| distance(name, key))
                    .filter(|key| distance(name, key) <= 3)
                    .map(String::as_str)
            });
            field.push('/');
            field.push_str(name);
            suggestion
                .map(|key| format!("Unknown field; did you mean {key}?"))
                .unwrap_or_else(|| "Unknown field; see guide for supported parameters.".into())
        }
        Kind::Type { .. } => error.masked().to_string(),
        Kind::Enum { options } => format!("Expected one of {options}."),
        Kind::Constant { expected_value } => format!("Expected {expected_value}."),
        Kind::Maximum { limit } => format!("Must be at most {limit}."),
        Kind::Minimum { limit } => format!("Must be at least {limit}."),
        Kind::ExclusiveMaximum { limit } => format!("Must be less than {limit}."),
        Kind::ExclusiveMinimum { limit } => format!("Must be greater than {limit}."),
        Kind::MinLength { limit } => format!("Must contain at least {limit} characters."),
        Kind::MaxLength { limit } => format!("Must contain at most {limit} characters."),
        Kind::MinItems { limit } => format!("Must contain at least {limit} items."),
        Kind::MaxItems { limit } => format!("Must contain at most {limit} items."),
        Kind::Format { format } => format!("Expected {format} format."),
        Kind::Pattern { .. } => "Value does not match the required format.".into(),
        Kind::AnyOf { context } | Kind::OneOfNotValid { context } => {
            // Report the closest branch's specific error, never the submitted JSON.
            if let Some(detail) = context
                .iter()
                .filter(|errors| !errors.is_empty())
                .min_by_key(|errors| errors.len())
                .and_then(|errors| errors.first())
            {
                return validation_error(op, schema, detail);
            }
            "Parameters do not match a supported form; see guide.".into()
        }
        Kind::Not { .. } | Kind::OneOfMultipleValid { .. } => {
            "Conflicting parameters; use one form from guide.".into()
        }
        _ => "Value does not satisfy this field's schema; see guide.".into(),
    };
    invalid_arguments(op, if field.is_empty() { "/" } else { &field }, &message)
}

pub(crate) fn validate_op(spec: &Value, args: &Value) -> Result<()> {
    crate::validator("op", string(spec, "name"), &spec["inputSchema"])?
        .validate(args)
        .map_err(|error| {
            if spec["name"] == "command" && error.instance_path.as_str().is_empty() {
                if args.get("cmd").is_some() {
                    for field in ["action", "params"] {
                        if args.get(field).is_some() {
                            return invalid_arguments(
                                "command",
                                &format!("/{field}"),
                                "Cannot combine with cmd; use cmd/cwd or action/params.",
                            );
                        }
                    }
                    if args.get("cwd").is_none() && args.get("project").is_none() {
                        return invalid_arguments(
                            "command",
                            "/cwd",
                            "Supply cwd or project with cmd.",
                        );
                    }
                }
            }
            validation_error(string(spec, "name"), &spec["inputSchema"], &error)
        })
}

/// Normalize accepted legacy aliases before defaults and receipt hashing.
pub(crate) fn normalize_args(name: &str, args: &mut Value) -> Result<()> {
    let alias = match name {
        "git" | "git_write" => Some(("action", "operation")),
        "read" => Some(("limit", "lineCount")),
        _ => None,
    };
    if let Some((alias, canonical)) = alias {
        if let Some(value) = args.get(alias).cloned() {
            if args.get(canonical).is_some_and(|other| *other != value) {
                return Err(invalid_arguments(
                    name,
                    &format!("/{alias}"),
                    &format!("Must equal {canonical} when both are supplied."),
                ));
            }
            args.as_object_mut().unwrap().remove(alias);
            args[canonical] = value;
        }
    }
    if name == "search" && args["limit"].as_u64().is_some_and(|limit| limit > 50) {
        args["limit"] = json!(50);
    }
    Ok(())
}

fn signature(op: &Value) -> String {
    let schema = &op["inputSchema"];
    let mut names: Vec<Value> = op["guideParameters"]
        .as_array()
        .cloned()
        .unwrap_or_else(|| {
            schema["properties"]
                .as_object()
                .into_iter()
                .flatten()
                .map(|(name, _)| json!(name))
                .collect()
        });
    for required in schema["required"].as_array().into_iter().flatten() {
        if !names.contains(required) {
            names.push(required.clone());
        }
    }
    let parameters: Vec<_> = names
        .iter()
        .map(|name| {
            let optional = if schema["required"]
                .as_array()
                .is_some_and(|r| r.contains(name))
            {
                ""
            } else {
                "?"
            };
            let property = &schema["properties"][name.as_str().unwrap()];
            // Long native method catalogs belong in the per-op guide, not every index.
            let choices = property["enum"].as_array().map(|values| {
                values
                    .iter()
                    .map(|v| {
                        v.as_str()
                            .map(str::to_owned)
                            .unwrap_or_else(|| v.to_string())
                    })
                    .collect::<Vec<_>>()
                    .join("|")
            });
            let bound = if let Some(choices) = choices.filter(|s| s.len() <= 80) {
                format!(":{choices}")
            } else if property["minLength"] == 1 {
                "(≥1 char)".into()
            } else if name == "timeoutMs"
                && matches!(
                    string(op, "name"),
                    "codex_wait" | "agent_wait" | "inbox_wait"
                )
            {
                property
                    .get("maximum")
                    .map(|max| format!("≤{max}"))
                    .unwrap_or_default()
            } else {
                String::new()
            };
            format!("{}{optional}{bound}", name.as_str().unwrap())
        })
        .collect();
    let variants = schema
        .get("oneOf")
        .or_else(|| schema.get("anyOf"))
        .and_then(Value::as_array)
        .map(|branches| {
            branches
                .iter()
                .filter_map(|b| b["required"].as_array())
                .map(|names| {
                    names
                        .iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join("+")
                })
                .collect::<Vec<_>>()
                .join(" | ")
        })
        .unwrap_or_default();
    format!(
        "{}({}){}",
        string(op, "name"),
        parameters.join(", "),
        if variants.is_empty() {
            String::new()
        } else {
            format!(" [{variants}]")
        }
    )
}

fn distance(a: &str, b: &str) -> usize {
    let b: Vec<_> = b.chars().collect();
    let mut row: Vec<_> = (0..=b.len()).collect();
    for (i, ca) in a.chars().enumerate() {
        let mut diagonal = row[0];
        row[0] = i + 1;
        for (j, cb) in b.iter().enumerate() {
            let old = row[j + 1];
            row[j + 1] = (row[j + 1] + 1)
                .min(row[j] + 1)
                .min(diagonal + usize::from(ca != *cb));
            diagonal = old;
        }
    }
    row[b.len()]
}

pub(crate) fn unknown_op(name: &str, ops: &[Value]) -> String {
    // Edit distance ranks current, enabled names without keeping old aliases.
    let mut candidates: Vec<_> = ops.iter().map(|op| string(op, "name")).collect();
    candidates.sort_by_key(|candidate| (distance(name, candidate), *candidate));
    candidates.truncate(3);
    json!({"code":"UNKNOWN_OP","op":name,"message":"Call query guide with view:full for the enabled op index, then query({op: \"guide\", args: {op: \"<name>\"}}) for its schema (also works with a cached guide schema).","candidates":candidates}).to_string()
}

pub(crate) fn guide(origin: &Value, args: &Value, locale: &str, ops: &[Value]) -> Value {
    let mut result = guide_content(origin, args, locale, ops);
    let digest = hash(result.to_string());
    if args["knownGuideHash"] == digest {
        return json!({"guideHash":digest,"unchanged":true});
    }
    result["guideHash"] = json!(digest);
    result
}

/// Explicit replay guarantees. An act envelope or an idempotentHint alone is not a receipt.
pub fn retry_contract(op: &Value) -> Value {
    let name = string(op, "name");
    if op["annotations"]["readOnlyHint"] == true {
        return json!({"mode":"read-only"});
    }
    if name == "receipt" {
        return json!({"mode":"original-receipt","key":"requestId","instruction":"Read the original requestId. Do not replay approval or rejection blindly."});
    }
    if matches!(
        name,
        "codex_create"
            | "codex_send"
            | "codex_review"
            | "codex_interrupt"
            | "codex_respond"
            | "codex_call"
            | "agent_create"
            | "agent_send"
            | "agent_review"
            | "agent_interrupt"
            | "agent_respond"
            | "command"
            | "fs"
            | "process"
            | "mcp"
            | "codex_thread"
            | "edit"
            | "write"
            | "git_write"
    ) {
        return json!({"mode":"receipt","key":"requestId","callerGenerated":false,"serverGeneratedWhenOmitted":true,
            "instruction":"requestId is optional. Retain the returned receipt requestId and reuse it with identical arguments. For retry safety before receiving a response, supply a UUID on the first attempt. After timeout, read the original receipt; if its generated ID was lost, inspect task/resource state instead of blindly replaying. unconfirmed is not permission to submit again."});
    }
    json!({"mode":"read-back","automaticRetry":false,
        "instruction":"No ARC receipt replay protection. Read current state or the upstream result before retrying a side effect. An outer act requestId does not add replay protection."})
}

fn guide_content(origin: &Value, args: &Value, _locale: &str, ops: &[Value]) -> Value {
    let ops = ops
        .iter()
        .map(|op| source_spec(op, origin))
        .collect::<Vec<_>>();
    if let Some(name) = args["op"].as_str() {
        let spec = catalog()["ops"]
            .as_array()
            .unwrap()
            .iter()
            .find(|op| op["name"] == name)
            .unwrap();
        let spec = source_spec(spec, origin);
        let spec = &spec;
        return json!({"op":name,"via":via(spec),"description":spec["description"],"inputSchema":spec["inputSchema"],"signature":signature(spec),"example":example(spec),"retry":retry_contract(spec)});
    }
    let topic = args["topic"].as_str().unwrap_or("loop");
    let full = args["view"] == "full";
    let source = match string(origin, "controlSource") {
        "claude" => "claude",
        "chatgpt" => "chatgpt",
        _ => "other",
    };
    let guides = &catalog()["guides"]["en"];
    let body = if topic == "loop" && !full {
        &guides["core"]
    } else if guides[topic].is_object() {
        &guides[topic][source]
    } else {
        &guides[topic]
    };
    let examples: Vec<_> = ops
        .iter()
        .filter(|op| full && topic == "loop" && string(op, "name") == "codex_create")
        .map(|op| {
            let mut call = example(op);
            if source == "claude" && matches!(string(op, "name"), "codex_create" | "codex_send") {
                call["arguments"]["args"]["notify"] =
                    json!({"channel":"claude-session","target":"<your cloud session ID or URL>"});
            }
            call
        })
        .collect();
    let index: Vec<_> = ops
        .iter()
        .filter(|op| {
            let name = string(op, "name");
            full || name == "guide" || match topic {
                "notify" => matches!(name, "notify_status" | "notify_control" | "notification_ack" | "inbox_wait" | "codex_create" | "codex_send" | "codex_read" | "agent_create" | "agent_send" | "agent_read"),
                "review" => matches!(name, "codex_review" | "agent_review" | "codex_read" | "agent_read" | "codex_wait" | "agent_wait" | "agent_events" | "codex_changes" | "codex_items" | "codex_send" | "agent_send" | "receipt" | "task_reviews"),
                "approvals" => matches!(name, "receipt" | "codex_pending" | "codex_interactions" | "codex_respond" | "agent_pending" | "agent_respond" | "codex_read" | "agent_read"),
                _ => matches!(name, "dispatch_policy" | "command" | "read" | "write" | "edit" | "fs" | "git" | "codex_create" | "codex_send" | "codex_read" | "codex_wait" | "receipt" | "agent_create" | "agent_send" | "agent_read" | "agent_wait"),
            }
        })
        .map(|op| {
            let mut entry = json!({"op":op["name"],"via":via(op),"signature":signature(op),"retry":{"mode":retry_contract(op)["mode"]}});
            if topic != "loop" {
                entry["description"] = json!(op["description"]
                    .as_str()
                    .unwrap_or("")
                    .split(". ")
                    .next()
                    .unwrap_or(""));
            }
            entry
        })
        .collect();
    let context = if topic == "loop" && crate::context_provider::configured() {
        guides["contextProvider"].as_str().unwrap_or("")
    } else {
        ""
    };
    let mut result = json!({"topic":topic,"controlSource":source,"content":format!("MUST means a requirement. SHOULD means the default unless a concrete task-specific reason justifies an exception. MAY means an option.\n\n{}\n{}{}",body.as_str().unwrap_or(""),if topic == "loop" && full {guides["common"].as_str().unwrap_or("")} else {""},context),"examples":examples,"ops":index});
    result["indexScope"] = json!(if full {
        "full"
    } else if topic == "loop" {
        "common"
    } else {
        "topic"
    });
    if !full {
        result["fullIndex"] =
            json!({"tool":"query","arguments":{"op":"guide","args":{"view":"full"}}});
    }
    if source == "chatgpt" && (full || topic == "notify") {
        result["events"] = crate::claude_notify::subscriptions::guide();
    }
    result
}

fn source_spec(op: &Value, origin: &Value) -> Value {
    let mut op = op.clone();
    let legacy = match string(&op, "name") {
        "git" | "git_write" => Some(("action", "operation")),
        "read" => Some(("limit", "lineCount")),
        _ => None,
    };
    if let Some((alias, canonical)) = legacy {
        op["inputSchema"]["properties"]
            .as_object_mut()
            .unwrap()
            .remove(alias);
        if matches!(string(&op, "name"), "git" | "git_write") {
            op["inputSchema"].as_object_mut().unwrap().remove("anyOf");
            op["inputSchema"]["required"]
                .as_array_mut()
                .unwrap()
                .push(json!(canonical));
        }
    }
    if matches!(
        string(&op, "name"),
        "codex_wait" | "agent_wait" | "inbox_wait"
    ) {
        let limit = crate::control_sources::preset(string(origin, "controlSource"))
            ["waitTimeoutMs"]
            .as_u64()
            .unwrap_or(1800000);
        op["inputSchema"]["properties"]["timeoutMs"]["description"] = json!(format!("Wait up to {limit}ms per call. On timeout follow next.args with the same IDs and expectedHash. Transport heartbeats do not extend the client deadline."));
        if let Some(description) = op["description"].as_str() {
            op["description"] = json!(
                description.replace("Claude waits are capped at 170000 milliseconds and return waitLimit when exceeded. ", "")
            );
        }
        if let Some(limit) = crate::control_sources::preset(string(origin, "controlSource"))
            ["waitTimeoutMs"]
            .as_u64()
        {
            op["inputSchema"]["properties"]["timeoutMs"]["maximum"] = json!(limit);
            if op["example"]["timeoutMs"]
                .as_u64()
                .is_some_and(|ms| ms > limit)
            {
                op["example"]["timeoutMs"] = json!(limit);
            }
        }
    }
    op
}

/// Only suggest reads or waits; a suggested next step never authorizes a write.
pub(crate) fn next(value: &mut Value, name: &str, args: &Value, push_available: bool) {
    if !value.is_object() {
        return;
    }
    let agent = name.starts_with("agent_") || string(value, "operation").starts_with("agent_");
    let task = value["taskId"].as_str().or_else(|| args["taskId"].as_str());
    let thread = value["threadId"]
        .as_str()
        .or_else(|| args["threadId"].as_str());
    let turn = value["turnId"].as_str().or_else(|| args["turnId"].as_str());
    let mut wait_args = if agent {
        json!({"agent":value["agent"].as_str().or_else(||args["agent"].as_str()),"taskId":task,"turnId":turn})
    } else {
        json!({"threadId":thread,"turnId":turn})
    };
    wait_args["until"] = json!("terminal");
    wait_args["timeoutMs"] = json!(30000);
    let wait_tool = if agent { "agent_wait" } else { "codex_wait" };
    let mut next = if value["state"] == "awaiting-approval" {
        json!({"hint":"Inspect the original request, then decide according to user intent.","via":"act","op":"receipt","args":{"requestId":value["requestId"],"action":"read"}})
    } else if value["state"] == "interaction-required" {
        if agent {
            json!({"hint":"Read the pending interaction, then use act agent_respond with the user's decision.","via":"query","op":"agent_pending","args":{"agent":wait_args["agent"],"taskId":task}})
        } else {
            json!({"hint":"Read the pending interaction, then use act codex_respond; if none is exposed, use Codex Desktop.","via":"query","op":"codex_pending","args":{}})
        }
    } else if matches!(name, "codex_wait" | "agent_wait") && value["state"] == "timeout" {
        let mut arguments = wait_args;
        if value["snapshotHash"].is_string() {
            arguments["expectedHash"] = value["snapshotHash"].clone();
        }
        if let Some(until) = args.get("until") {
            arguments["until"] = until.clone();
        }
        if let Some(timeout) = args.get("timeoutMs") {
            arguments["timeoutMs"] = timeout.clone();
        }
        json!({"hint":"Continue waiting with the same task and turn.","via":"query","op":wait_tool,"args":arguments})
    } else if matches!(value["state"].as_str(), Some("pending" | "reserved" | "thread-submitting" | "thread-created" | "turn-submitting" | "submitting" | "queued"))
        && value["requestId"].is_string()
    {
        json!({"hint":"Read this original receipt until submission resolves. A threadId alone does not mean a turn was submitted. If progressStalled is true, inspect CLI logs/doctor and the owning app; do not redispatch or generate a new requestId.","via":"act","op":"receipt","args":{"requestId":value["requestId"],"action":"read"},"retryAfterMs":1000})
    } else if (matches!(
        name,
        "codex_create" | "codex_send" | "agent_create" | "agent_send"
    ) || matches!(
        string(value, "operation"),
        "create" | "send" | "agent_create" | "agent_send"
    )) && turn.is_some()
        && value["state"] == "completed"
    {
        if push_available {
            json!({"hint":"You may end this turn and wait for an [ARC] notification; use guide for the review workflow."})
        } else {
            let minutes = crate::dispatch_policy::revisit_minutes(value);
            let hint = if minutes.is_some() {
                "No verified push; schedule a revisit using revisitAfterMinutes. Use brief waits only; do not redispatch."
            } else {
                "No verified push or duration estimate; schedule a revisit. Use brief waits only; do not redispatch."
            };
            let mut next = json!({"hint":hint,"via":"query","op":wait_tool,"args":wait_args});
            if let Some(minutes) = minutes {
                next["revisitAfterMinutes"] = json!(minutes);
            }
            next
        }
    } else if value["error"]["next"].is_object() {
        value["error"]["next"].clone()
    } else if value["state"] == "running" && (thread.is_some() || task.is_some()) {
        json!({"via":"query","op":wait_tool,"args":wait_args,"hint":"Wait on the same turn; do not submit another task."})
    } else if value["state"] == "unconfirmed" && (thread.is_some() || task.is_some()) {
        json!({"via":"query","op":if agent {"agent_read"} else {"codex_read"},"args":if agent {json!({"agent":wait_args["agent"],"taskId":task})} else {json!({"threadId":thread,"statusOnly":true})},"hint":"Runtime ownership or progress is unknown. Inspect the owning session and this original task. Do not redispatch; notLoaded does not prove no native writer exists."})
    } else if value["requestId"].is_string() && matches!(string(value,"state"),"failed"|"rejected"|"cancelled"|"not-executed"|"unconfirmed") {
        json!({"via":"act","op":"receipt","args":{"requestId":value["requestId"],"action":"read"},"hint":"Inspect the surfaced failure and original receipt. Resolve its cause before a new authorized attempt; an unconfirmed effect must be reconciled without replay."})
    } else {
        return;
    };
    if value["requestId"].is_string() {
        let digest = hash(next.to_string());
        if args["knownNextHash"] == digest {
            next = json!({"hash":digest,"unchanged":true});
        } else {
            next["hash"] = json!(digest);
        }
    }
    value["next"] = next;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writer_rejection_explains_owner_and_recovery() {
        // Regression: native active-writer rejection gave control sources no reason or safe next step.
        for native in [
            "RPC_REJECTED:{\"message\":\"thread already has an active writer\"}",
            "RPC_REJECTED:{\"code\":-32600,\"message\":\"thread 00000000-0000-4000-8000-000000000001 already has an active writer\"}",
            "THREAD_LOAD_FAILED: desktop=DESKTOP_REJECTED:\"no-client-found\"; app-server=RPC_REJECTED:{\"message\":\"thread 00000000-0000-4000-8000-000000000001 already has an active writer\"}",
        ] {
            let error = failure(native);
            assert_eq!(error["code"], "THREAD_WRITER_BUSY");
            assert_eq!(error["retryable"], false);
            assert_eq!(error["next"]["op"], "codex_read");
            assert_eq!(error["nativeError"], native);
        }
    }

    #[test]
    fn protocol_version_tracks_visible_contract_not_internal_catalog_metadata() {
        // Property: protocol version tracks visible contract not internal catalog metadata.
        let original = catalog().clone();
        let version = protocol_hash(&original);
        let mut changed = original.clone();
        changed["toolExposure"] = json!({"internal":"changed"});
        changed["domains"] = json!([]);
        assert_eq!(version, protocol_hash(&changed));
        changed["ops"].as_array_mut().unwrap().reverse();
        assert_eq!(version, protocol_hash(&changed));
        for field in ["description", "inputSchema", "guideParameters", "example"] {
            let mut changed = original.clone();
            changed["ops"][0][field] = match field {
                "guideParameters" => json!(["op"]),
                "inputSchema" => json!({"type":"object","properties":{"new":{"type":"string"}}}),
                _ => json!("changed"),
            };
            assert_ne!(version, protocol_hash(&changed), "{field}");
        }
        let mut changed = original;
        changed["guides"]["en"]["common"] = json!("changed guide text");
        assert_ne!(version, protocol_hash(&changed));
    }

    #[test]
    fn only_dispatch_receipts_expose_notification_delivery_details() {
        // Property: only dispatch receipts expose notification delivery details.
        for operation in [
            "create",
            "send",
            "agent_create",
            "agent_send",
            "codex_review",
            "interrupt",
            "codex_respond",
        ] {
            let out = receipt(
                json!({"requestId":"test","state":"completed","operation":operation,
                "notification":{"deliveries":[{"timing":{"queueMs":31000}}]},"notificationError":"detail"}),
            );
            assert_eq!(out.get("notification").is_some(), dispatch_receipt(&out));
            assert_eq!(
                out.get("notificationError").is_some(),
                dispatch_receipt(&out)
            );
        }
    }
}

/// Compact question content without replacing the original native request.
pub fn interaction_preview(request: &Value) -> Value {
    let params = request.get("params").unwrap_or(request);
    let questions = params["questions"].as_array();
    let mut rows: Vec<Value> = questions.into_iter().flatten().take(6).map(|q| {
        json!({"id":q["id"],"question":string(q,"question").chars().take(480).collect::<String>(),
            "options":q["options"].as_array().into_iter().flatten().take(8).map(|o| {
                json!({"label":o.as_str().unwrap_or_else(||string(o,"label")).chars().take(120).collect::<String>(),"description":string(o,"description").chars().take(160).collect::<String>()})
            }).collect::<Vec<_>>()})
    }).collect();
    if rows.is_empty() {
        let prompt = ["question", "prompt", "message", "summary"].iter().find_map(|key| params[*key].as_str().filter(|v| !v.is_empty()));
        if let Some(prompt) = prompt { rows.push(json!({"question":prompt.chars().take(480).collect::<String>(),"options":params["options"].as_array().into_iter().flatten().take(8).cloned().collect::<Vec<_>>()})); }
    }
    json!({"questions":rows,"summary":rows.iter().filter_map(|q|q["question"].as_str()).collect::<Vec<_>>().join("; "),"questionCount":questions.map(Vec::len).unwrap_or(rows.len()),"responseId":request.get("responseId").unwrap_or(&request["id"]),"turnId":params["turnId"],"backendSession":request["backendSession"]})
}

pub fn interaction_history(args: &Value) -> Result<Value> {
    let thread = string(args, "threadId");
    let mut timeline = crate::task_tracking::Timeline::default();
    crate::interaction_responses::project(&mut timeline, thread)?;
    let snapshot = timeline.response(thread, 0);
    let mut rows: Vec<_> = snapshot["entries"].as_array().into_iter().flatten().filter(|e| e["type"] == "interaction" && e["response"].is_object()).map(|e| {
        let mut row = interaction_preview(&e["interaction"]);
        row["id"] = e["id"].clone(); row["turnId"] = e["turnId"].clone();
        row["response"] = e["response"].clone(); row["status"] = json!("answered"); row
    }).collect();
    rows.reverse();
    let total = rows.len(); let offset = num(args,"offset",0); let end = offset.saturating_add(num(args,"limit",20).min(100)).min(total);
    Ok(json!({"threadId":thread,"interactions":rows.into_iter().skip(offset).take(end.saturating_sub(offset)).collect::<Vec<_>>(),"total":total,"nextOffset":if end < total {Some(end)} else {None}}))
}
