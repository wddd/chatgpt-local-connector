//! Host-owned target-to-profile routing shared by manual and scheduled notifications.
use super::*;
use std::collections::BTreeMap;

static ROUTES: Mutex<()> = Mutex::const_new(());

pub(crate) fn list() -> Result<BTreeMap<String, String>> {
    let path = directory().join("routes.json");
    if !path.exists() {
        return Ok(BTreeMap::new());
    }
    serde_json::from_value(load(&path)?)
        .map_err(|_| "CLAUDE_ROUTES_INVALID: Repair the local Claude notification routes".into())
}

pub(crate) fn account(target: &str) -> Result<String> {
    Ok(list()?
        .get(target)
        .cloned()
        .unwrap_or_else(|| "default".into()))
}

pub(crate) async fn bind(target: &str, account_id: &str, replace: bool) -> Result<Value> {
    let target = crate::claude_notify::session_id(target)?;
    config_dir(account_id)?;
    let _guard = ROUTES.lock().await;
    let mut routes = list()?;
    if !replace && routes.get(&target).is_some_and(|id| id != account_id) {
        return Err("CLAUDE_ACCOUNT_ROUTE_CONFLICT: This target is assigned to another profile. Inspect claude.accounts.routes and use claude.accounts.route to explicitly change its account before sending".into());
    }
    routes.insert(target.clone(), account_id.into());
    save(&directory().join("routes.json"), &json!(routes))?;
    Ok(json!({"target":target,"accountId":account_id}))
}
