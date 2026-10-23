// CLI billing and renewal strategy follows magpie-community's Grok plugin.
// See licenses/magpie-community-LICENSE.txt.
use super::*;
pub async fn credential() -> std::result::Result<Credential, Failure> {
    let directory = std::env::var_os("GROK_HOME")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .unwrap_or(home()?.join(".grok"));
    let path = directory.join("auth.json");
    // The CLI rewrites auth.json on renewal. Retry a torn JSON read without
    // taking its writer lock or treating an incomplete file as signed out.
    let mut result = file(&path);
    for _ in 0..5 {
        if !matches!(&result, Err(error) if error.code == "invalid-response") {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
        result = file(&path);
    }
    let v = result?;
    let entries = v
        .as_object()
        .ok_or_else(|| Failure::from("invalid-response"))?;
    let token = entries
        .values()
        .find_map(|q| q["key"].as_str().filter(|s| !s.is_empty()))
        .ok_or(Failure::from("credentials-missing"))?;
    Credential::new(token.into(), "grok-login")
}
pub async fn read(
    client: &reqwest::Client,
    c: &Credential,
) -> std::result::Result<Reading, Failure> {
    match read_once(client, c).await {
        Err(error) if error.code == "authentication-failed" => {
            let mut current = credential().await?;
            if current.secret == c.secret {
                // Only the native CLI renews its rotating login. No expiry
                // guesses or parallel refresh-token exchanges by ARC.
                let result = native_cli("grok", &["models"]).await?;
                current = credential().await?;
                if !result.status.success() && current.secret == c.secret {
                    return Err(Failure {
                        code: "authentication-failed",
                        message: Some("Grok Build could not renew its login. Run `grok login`, then refresh usage.".into()),
                        retry_at: None,
                    });
                }
            }
            read_once(client, &current).await
        }
        result => result,
    }
}
async fn read_once(
    client: &reqwest::Client,
    c: &Credential,
) -> std::result::Result<Reading, Failure> {
    let request = |url| {
        get(client
            .get(url)
            .bearer_auth(&c.secret)
            .header("accept", "application/json")
            .header("x-xai-token-auth", "xai-grok-cli"))
    };
    let (credits, settings) = tokio::join!(
        request("https://cli-chat-proxy.grok.com/v1/billing?format=credits"),
        request("https://cli-chat-proxy.grok.com/v1/settings"),
    );
    let mut v = credits?;
    if !v["config"].is_object() {
        return Err("invalid-response".into());
    }
    if let Ok(settings) = settings {
        v["subscriptionTier"] = settings["subscription_tier_display"]
            .as_str()
            .or_else(|| settings["subscription_tier"].as_str())
            .map(|s| json!(s))
            .unwrap_or(Value::Null);
    }
    let q = &v["config"];
    let end = date(&q["currentPeriod"]["end"]).or_else(|| date(&q["billingPeriodEnd"]));
    let label = match q["currentPeriod"]["type"].as_str() {
        Some("USAGE_PERIOD_TYPE_WEEKLY") => "weekly",
        Some("USAGE_PERIOD_TYPE_MONTHLY") => "monthly",
        _ => "current-period",
    };
    let percent = number(&q["creditUsagePercent"]);
    Reading::new(
        window("current-period", "grok", label, percent, end)
            .into_iter()
            .collect(),
        v,
    )
}
