//! Optional device-owned MCP stdio context provider. One process per call.
use crate::*;
use serde::Deserialize;
use std::{collections::HashMap, process::Stdio, time::Duration};
use tokio::io::{AsyncWriteExt, BufReader};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Config {
    command: String,
    #[serde(default)]
    args: Vec<String>,
    #[serde(default)]
    env: HashMap<String, String>,
    cwd: Option<PathBuf>,
}

fn config() -> Result<Option<Config>> {
    let path = root().join("context-provider.json");
    if !path.exists() {
        return Ok(None);
    }
    let config: Option<Config> = serde_json::from_value(load(&path)?)
        .map_err(|e| format!("INVALID_CONTEXT_PROVIDER: {e}"))?;
    if config.as_ref().is_some_and(|c| c.command.trim().is_empty()) {
        return Err("INVALID_CONTEXT_PROVIDER: command must be nonempty".into());
    }
    Ok(config)
}

pub(crate) fn configured() -> bool {
    config().is_ok_and(|c| c.is_some())
}

async fn write(input: &mut tokio::process::ChildStdin, message: Value) -> Result<()> {
    input
        .write_all(format!("{message}\n").as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    input.flush().await.map_err(|e| e.to_string())
}

async fn response(
    output: &mut BufReader<tokio::process::ChildStdout>,
    input: &mut tokio::process::ChildStdin,
    id: u64,
) -> Result<Value> {
    loop {
        let frame = crate::line(output, 4 * 1024 * 1024).await?;
        if frame.is_empty() {
            return Err("CONTEXT_PROVIDER_CLOSED".into());
        }
        let message: Value = serde_json::from_slice(&frame).map_err(|e| e.to_string())?;
        if message.get("method").is_some() {
            if let Some(id) = message.get("id") {
                let reply = if message["method"] == "ping" {
                    json!({"jsonrpc":"2.0","id":id,"result":{}})
                } else {
                    json!({"jsonrpc":"2.0","id":id,"error":{"code":-32601,"message":"Client capability not supported"}})
                };
                write(input, reply).await?;
            }
            continue;
        }
        if message["id"] == id {
            if let Some(error) = message.get("error") {
                return Err(format!("CONTEXT_PROVIDER_RPC_ERROR: {error}"));
            }
            return message
                .get("result")
                .cloned()
                .ok_or("CONTEXT_PROVIDER_INVALID_RESPONSE".into());
        }
    }
}

pub(crate) async fn call(name: &str, args: Value, timeout: Duration) -> Result<Value> {
    let config = config()?.ok_or("CONTEXT_PROVIDER_NOT_CONFIGURED")?;
    let mut command = crate::command(&config.command);
    command.args(&config.args).envs(&config.env);
    if let Some(cwd) = &config.cwd {
        command.current_dir(cwd);
    }
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("CONTEXT_PROVIDER_START_FAILED: {e}"))?;
    let result = tokio::time::timeout(timeout, async {
        let mut input = child.stdin.take().ok_or("CONTEXT_PROVIDER_MISSING_STDIN")?;
        let mut output = BufReader::new(child.stdout.take().ok_or("CONTEXT_PROVIDER_MISSING_STDOUT")?);
        write(&mut input, json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{
            "protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"arc-context-provider","version":env!("ARC_BUILD_VERSION")}
        }})).await?;
        let initialized = response(&mut output, &mut input, 1).await?;
        if !matches!(initialized["protocolVersion"].as_str(), Some("2024-11-05" | "2025-03-26" | "2025-06-18" | "2025-11-25")) {
            return Err("CONTEXT_PROVIDER_UNSUPPORTED_PROTOCOL".into());
        }
        write(&mut input, json!({"jsonrpc":"2.0","method":"notifications/initialized"})).await?;
        write(&mut input, json!({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":name,"arguments":args}})).await?;
        let result = response(&mut output, &mut input, 2).await?;
        if result["isError"] == true {
            return Err(format!("CONTEXT_PROVIDER_TOOL_ERROR: {}", result["content"]));
        }
        if let Some(value) = result.get("structuredContent") {
            return Ok(value.clone());
        }
        let text = result["content"].as_array().into_iter().flatten()
            .filter(|item| item["type"] == "text")
            .map(|item| string(item, "text")).collect::<Vec<_>>().join("\n");
        serde_json::from_str(&text).map_err(|e| format!("CONTEXT_PROVIDER_INVALID_RESULT: {e}"))
    }).await.unwrap_or_else(|_| Err(format!("CONTEXT_PROVIDER_TIMEOUT: {}ms; read current provider state before retrying a write", timeout.as_millis())));
    // Also reap a timed-out or failed process; kill_on_drop covers caller cancellation.
    let _ = child.kill().await;
    result
}

pub(crate) fn annotate(target: &mut Value, metadata: &Value) {
    for (key, value) in metadata.as_object().into_iter().flatten() {
        target[key] = value.clone();
    }
}

fn display(value: &Value) -> String {
    match value {
        Value::Null => "not specified".into(),
        Value::String(text) => text.clone(),
        _ => value.to_string(),
    }
}

pub(crate) async fn prepare(args: &Value, cwd: &str, prompt: &str) -> (String, Value) {
    if args["context"] == false {
        return (String::new(), json!({}));
    }
    let result = async {
        if config()?.is_none() {
            return Ok(None);
        }
        let origin = crate::kernel::origin::current_origin();
        let caller = origin["controlSource"].as_str().unwrap_or("local");
        let result = call("resolve", json!({"project":cwd,"intent":prompt.chars().take(2000).collect::<String>(),"caller":caller}), Duration::from_secs(3)).await?;
        let entries = result["entries"].as_array().ok_or("CONTEXT_PROVIDER_INVALID_ENTRIES")?;
        let mut ids = Vec::new();
        let mut prefix = String::new();
        for entry in entries {
            let id = entry["id"].as_str().filter(|id| !id.is_empty()).ok_or("CONTEXT_PROVIDER_INVALID_ENTRY_ID")?;
            ids.push(id.to_owned());
            prefix.push_str(&format!("\n### {}\nVerified: {}\nAvoid: {}\n{}\n", display(&entry["title"]), display(&entry["verified"]), display(&entry["avoid"]), display(&entry["body"])));
        }
        if !entries.is_empty() {
            prefix = format!("--- BEGIN CONTEXT PROVIDER REFERENCE ---\nStandard practices for the user's environment, supplied by the context provider. If these references conflict with current observed facts, follow the current facts and point out the conflict in your result.\n{prefix}--- END CONTEXT PROVIDER REFERENCE ---\n\n");
        }
        Ok::<_, String>(Some((prefix, json!({"contextEntryIds":ids}))))
    }.await;
    match result {
        Ok(Some(value)) => value,
        Ok(None) => (String::new(), json!({})),
        Err(error) => (
            String::new(),
            json!({"contextEntryIds":[],"warnings":[format!("Context provider skipped: {error}")]}),
        ),
    }
}

pub(crate) async fn inject(args: &Value, cwd: &str, input: &mut Value, receipt: &mut Value) {
    let prompt = input
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| item["text"].as_str())
        .collect::<Vec<_>>()
        .join("\n");
    let (prefix, metadata) = prepare(args, cwd, &prompt).await;
    if !prefix.is_empty() {
        input
            .as_array_mut()
            .unwrap()
            .insert(0, json!({"type":"text","text":prefix,"text_elements":[]}));
    }
    annotate(receipt, &metadata);
    annotate(&mut receipt["task"]["dispatch"], &metadata);
}
