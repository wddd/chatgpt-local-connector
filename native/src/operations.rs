//! Durable management receipts. An interrupted write is unconfirmed, never replayed automatically.
use crate::*;
fn path(id: &str) -> Result<PathBuf> {
    if id.is_empty()
        || id.len() > 128
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_".contains(&b))
    {
        return Err("invalid requestId".into());
    }
    Ok(root().join("operations").join(format!("{id}.json")))
}
pub fn read(id: &str, instance: &str) -> Result<Value> {
    let mut receipt = load(&path(id)?)?;
    if receipt["instance"] != instance && receipt["state"] == "running" {
        receipt["state"] = json!("unconfirmed");
        receipt["nextAction"] = json!(
            "Read the affected resource before submitting a new operation; do not replay blindly."
        );
    }
    Ok(receipt)
}
pub fn submit(body: Value, instance: String) -> Result<Value> {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    let request = string(&body, "requestId");
    let file = path(request)?;
    let operation = string(&body, "operation").to_owned();
    if operation.starts_with("operations.")
        || [
            "app.start",
            "ingress.token",
            "ingress.credentials",
            "ingress.oauth.register",
        ]
        .contains(&operation.as_str())
    {
        return Err("operation cannot be submitted".into());
    }
    let args = body.get("arguments").cloned().unwrap_or(json!({}));
    crate::management::resolve(&operation, &args)?;
    let fingerprint = hash(body.to_string());
    if file.exists() {
        let receipt = read(request, &instance)?;
        if receipt["fingerprint"] != fingerprint {
            return Err("REQUEST_ID_CONFLICT".into());
        }
        return Ok(receipt);
    }
    private_dir(file.parent().unwrap())?;
    let receipt = json!({"requestId":request,"operation":operation,"state":"running","startedAt":now(),"instance":instance,"fingerprint":fingerprint});
    save(&file, &receipt)?;
    let mut result = receipt.clone();
    tokio::spawn(async move {
        let outcome = crate::management::call(&operation, args).await;
        result["completedAt"] = json!(now());
        match outcome {
            Ok(value) => {
                result["effectConfirmed"] =
                    json!(value["accepted"] != true && value["restarting"] != true);
                result["state"] = json!("succeeded");
                result["nextAction"]=json!("Read the affected resource. Secret-bearing operation outputs are never persisted in receipts.");
            }
            Err(error) => {
                result["state"] = json!("failed");
                result["error"] = json!(error);
            }
        }
        if let Err(error) = save(&file, &result) {
            crate::logs::record(
                "ERROR",
                &format!("Cannot save operation receipt: {error}"),
                None,
            );
        }
    });
    Ok(receipt)
}
