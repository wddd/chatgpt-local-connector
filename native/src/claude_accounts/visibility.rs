//! Read only the requested cloud session with each isolated profile's existing login.
use super::*;

pub(crate) async fn candidates(target: &str) -> Result<Vec<Value>> {
    let mut jobs = tokio::task::JoinSet::new();
    for profile in profiles()? {
        let target = target.to_owned();
        jobs.spawn(async move {
            let mut profile = profile;
            let observed = tokio::time::timeout(
                Duration::from_secs(20),
                visible(string(&profile, "accountId"), &target),
            )
            .await;
            match observed {
                Ok(Ok(visible)) => {
                    profile["visibility"] = json!(if visible { "visible" } else { "not-visible" })
                }
                _ => profile["visibility"] = json!("unknown"),
            }
            profile
        });
    }
    let mut candidates = Vec::new();
    while let Some(result) = jobs.join_next().await {
        candidates
            .push(result.map_err(|_| "CLAUDE_SESSION_PROBE_FAILED: Retry account selection")?);
    }
    candidates.sort_by(|a, b| string(a, "accountId").cmp(string(b, "accountId")));
    Ok(candidates)
}

async fn visible(account_id: &str, target: &str) -> Result<bool> {
    // Let the official CLI refresh its own credentials; never log in or inspect expiry locally.
    account_identity(account_id).await?;
    let config = config_dir(account_id)?;
    let credentials = system::profile_credentials(&config).await?;
    let token = credentials["claudeAiOauth"]["accessToken"]
        .as_str()
        .ok_or("CLAUDE_CREDENTIAL_UNAVAILABLE")?;
    let mut settings = json!({"proxyMode":"system","proxyUrl":""});
    if let Ok(stored) = load(&root().join("app/preferences.json")) {
        for key in ["proxyMode", "proxyUrl"] {
            if let Some(value) = stored.get(key) {
                settings[key] = value.clone();
            }
        }
    }
    let network = crate::proxy::NetworkProxy::resolve(&settings).await?;
    let client = network
        .client(reqwest::Client::builder())
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "CLAUDE_SESSION_PROBE_FAILED")?;
    let endpoint = "https://api.anthropic.com".to_owned();
    #[cfg(feature = "test-fixture")]
    let endpoint = std::env::var("ARC_FIXTURE_CLAUDE_API").unwrap_or(endpoint);
    // Same GET and response envelope as Claude Code's cloud-session lookup. No message is sent.
    let response = client
        .get(format!("{endpoint}/v1/code/sessions/{target}"))
        .bearer_auth(token)
        .header("anthropic-version", "2023-06-01")
        .header("anthropic-client-platform", std::env::consts::OS)
        .header("User-Agent", "ARC")
        .send()
        .await
        .map_err(|_| "CLAUDE_SESSION_PROBE_FAILED")?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(false);
    }
    if response.status() != reqwest::StatusCode::OK {
        return Err("CLAUDE_SESSION_PROBE_FAILED".into());
    }
    let value: Value = response
        .json()
        .await
        .map_err(|_| "CLAUDE_SESSION_PROBE_FAILED")?;
    let session = value.get("response_shape").unwrap_or(&value["session"]);
    if session["id"].as_str() != Some(target) {
        return Err("CLAUDE_SESSION_PROBE_UNCONFIRMED".into());
    }
    Ok(true)
}
