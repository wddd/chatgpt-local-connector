use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;
use tokio::sync::{watch, Mutex};

pub struct UpdateState {
    install: Mutex<()>,
    status: std::sync::Mutex<Value>,
    downloaded: Mutex<Option<(tauri_plugin_updater::Update, Vec<u8>)>>,
    cancel: watch::Sender<bool>,
    downloading: AtomicBool,
    pub installing: AtomicBool,
    pub restarting: AtomicBool,
}
impl Default for UpdateState {
    fn default() -> Self {
        Self {
            install: Mutex::new(()),
            status: std::sync::Mutex::new(
                json!({"phase":"idle","revision":0,"update":null,"error":null,"errorStage":null,"downloaded":0,"total":null,"checkedAt":null}),
            ),
            downloaded: Mutex::new(None),
            cancel: watch::channel(false).0,
            downloading: AtomicBool::new(false),
            installing: AtomicBool::new(false),
            restarting: AtomicBool::new(false),
        }
    }
}
fn resume_path() -> std::path::PathBuf {
    arc_core::root().join("update-resume.json")
}
pub fn pending_resume() -> bool {
    arc_core::load(&resume_path()).is_ok_and(|value| value["version"] == env!("ARC_BUILD_VERSION"))
}
pub fn take_resume() -> Option<Vec<String>> {
    let path = resume_path();
    let Ok(value) = arc_core::load(&path) else {
        return None;
    };
    // A marker from a failed/interrupted install must not alter ordinary startup.
    let resume = (value["version"] == env!("ARC_BUILD_VERSION")).then(|| {
        value["ingresses"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|v| v.as_str().map(str::to_owned))
            .collect()
    });
    let _ = std::fs::remove_file(path);
    resume
}
async fn updater(app: &tauri::AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
    if app.config().identifier != "com.whzxc.agent-remote-control" {
        return Err("This app does not support automatic updates. Get the installer from the download page.".into());
    }
    let service = app
        .try_state::<std::sync::Arc<arc_core::runtime::Client>>()
        .ok_or("Core is not ready")?;
    let proxy = service.network_proxy().await?;
    app.updater_builder()
        .configure_client(move |builder| proxy.client(builder))
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())
}
async fn check(app: &tauri::AppHandle) -> Result<Option<tauri_plugin_updater::Update>, String> {
    match updater(app).await?.check().await {
        Ok(update) => Ok(update),
        Err(
            tauri_plugin_updater::Error::TargetNotFound(_)
            | tauri_plugin_updater::Error::TargetsNotFound(_),
        ) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}
fn update_result(update: &tauri_plugin_updater::Update, ready: bool) -> Value {
    json!({"available":true,"version":update.version,"notes":update.body,"date":update.date.map(|d|d.to_string()),"ready":ready})
}
fn current_result(app: &tauri::AppHandle) -> Result<Value, String> {
    let status = snapshot(app);
    if let Some(error) = status["error"].as_str() {
        return Err(error.into());
    }
    Ok(status
        .get("update")
        .filter(|v| v.is_object())
        .cloned()
        .unwrap_or(json!({"available":false})))
}
fn failed(app: &tauri::AppHandle, stage: &str, error: String) -> String {
    let mut status = json!({"phase":"idle","error":error,"errorStage":stage});
    if stage == "check" {
        status["checkedAt"] = json!(arc_core::now());
    }
    progress(app, status);
    error
}
fn allow_update() -> Result<(), String> {
    if arc_core::app_replace::active(&arc_core::app_replace::status()?) {
        return Err(
            "An app replacement is in progress. Wait for its outcome before updating.".into(),
        );
    }
    Ok(())
}

pub async fn check_update(app: tauri::AppHandle) -> Result<Value, String> {
    allow_update()?;
    let state = app.state::<UpdateState>();
    let observed = snapshot(&app)["revision"].clone();
    let _guard = state.install.lock().await;
    allow_update()?;
    // Join the operation that owned the lock instead of reporting a busy error
    // or checking again between an automatic check and its download.
    if snapshot(&app)["revision"] != observed {
        return current_result(&app);
    }
    progress(
        &app,
        json!({"phase":"checking","update":null,"error":null,"errorStage":null,"downloaded":0,"total":null}),
    );
    if let Some(service) = app.try_state::<std::sync::Arc<arc_core::runtime::Client>>() {
        let _ = service
            .request(
                "preferences",
                "PUT",
                json!({"values":{"update-last-check":chrono_now_millis()}}),
            )
            .await;
    }
    let update = check(&app)
        .await
        .map_err(|error| failed(&app, "check", error))?;
    progress(&app, json!({"checkedAt":arc_core::now()}));
    let mut cached = state.downloaded.lock().await;
    if cached.as_ref().map(|(u, _)| &u.version) != update.as_ref().map(|u| &u.version) {
        *cached = None;
    }
    if let Some((update, _)) = cached.as_ref() {
        let result = update_result(update, true);
        progress(&app, json!({"phase":"idle","update":result}));
        return Ok(result);
    }
    drop(cached);
    let Some(update) = update else {
        let result = json!({"available":false});
        progress(&app, json!({"phase":"idle","update":result}));
        return Ok(result);
    };
    let version = update.version.clone();
    let downloaded = download(&app, &version, Some(update))
        .await
        .map_err(|error| failed(&app, "download", error))?;
    complete_download(&app, downloaded).await
}
pub fn cancel_update(app: tauri::AppHandle) {
    let state = app.state::<UpdateState>();
    if state.downloading.load(Ordering::SeqCst) {
        state.cancel.send_replace(true);
    }
}
async fn download(
    app: &tauri::AppHandle,
    version: &str,
    known: Option<tauri_plugin_updater::Update>,
) -> Result<Option<(tauri_plugin_updater::Update, Vec<u8>)>, String> {
    let state = app.state::<UpdateState>();
    if let Some(cached) = state.downloaded.lock().await.take() {
        if cached.0.version == version {
            return Ok(Some(cached));
        }
    }
    let mut cancel = state.cancel.subscribe();
    state.cancel.send_replace(false);
    cancel.borrow_and_update();
    state.downloading.store(true, Ordering::SeqCst);
    let offer = known
        .as_ref()
        .map(|update| update_result(update, false))
        .unwrap_or_else(|| snapshot(app)["update"].clone());
    progress(
        app,
        json!({"phase":"downloading","update":offer,"error":null,"errorStage":null,"downloaded":0,"total":null}),
    );
    let result = tokio::select! {
        result = async {
            let Some(update) = (match known { Some(update) => Some(update), None => check(app).await? }) else {
                return Ok(None);
            };
            if update.version != version {
                progress(app, json!({"update":null}));
                return Err("The available version changed. Check for updates again.".to_owned());
            }
            let mut downloaded = 0usize;
            let bytes = update.download(|chunk, total| {
                downloaded += chunk;
                progress(app, json!({"downloaded":downloaded,"total":total,"phase":"downloading"}));
            }, || {}).await.map_err(|e|e.to_string())?;
            Ok(Some((update, bytes)))
        } => result,
        _ = cancel.changed() => Err("UPDATE_CANCELLED".into()),
    };
    state.downloading.store(false, Ordering::SeqCst);
    result
}
async fn complete_download(
    app: &tauri::AppHandle,
    downloaded: Option<(tauri_plugin_updater::Update, Vec<u8>)>,
) -> Result<Value, String> {
    let response = downloaded
        .as_ref()
        .map(|(u, _)| update_result(u, true))
        .unwrap_or(json!({"available":false}));
    *app.state::<UpdateState>().downloaded.lock().await = downloaded;
    progress(
        app,
        json!({"phase":"idle","update":response,"error":null,"errorStage":null}),
    );
    Ok(response)
}
pub async fn download_update(app: tauri::AppHandle, version: String) -> Result<Value, String> {
    allow_update()?;
    let state = app.state::<UpdateState>();
    let _guard = state.install.lock().await;
    allow_update()?;
    if state.installing.load(Ordering::SeqCst) {
        return Ok(json!({"available":true,"version":version,"restarting":true}));
    }
    let downloaded = download(&app, &version, None)
        .await
        .map_err(|error| failed(&app, "download", error))?;
    complete_download(&app, downloaded).await
}
pub async fn install_update(
    app: tauri::AppHandle,
    version: String,
    when: &str,
) -> Result<Value, String> {
    allow_update()?;
    let state = app.state::<UpdateState>();
    let _guard = state.install.lock().await;
    allow_update()?;
    if state.installing.load(Ordering::SeqCst) {
        return Ok(json!({"available":true,"version":version,"restarting":true}));
    }
    let Some((update, bytes)) = download(&app, &version, None)
        .await
        .map_err(|error| failed(&app, "download", error))?
    else {
        return complete_download(&app, None).await;
    };
    state.installing.store(true, Ordering::SeqCst);
    struct Reset<'a>(&'a UpdateState);
    impl Drop for Reset<'_> {
        fn drop(&mut self) {
            if !self.0.restarting.load(Ordering::SeqCst) {
                self.0.installing.store(false, Ordering::SeqCst);
            }
        }
    }
    let _reset = Reset(&state);
    progress(
        &app,
        json!({"phase":"installing","update":update_result(&update, true),"error":null,"errorStage":null}),
    );
    let retry_update = update_result(&update, false);
    #[cfg(not(target_os = "macos"))]
    let installation = async {
        let service = app
            .state::<std::sync::Arc<arc_core::runtime::Client>>()
            .inner()
            .clone();
        // Download and signature verification finish before any connection is stopped.
        let current = service.request("status", "GET", json!({})).await?;
        let running: Vec<String> = current["ingresses"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|i| i["running"] == true)
            .filter_map(|i| i["id"].as_str().map(str::to_owned))
            .collect();
        let connections = crate::session::restore().unwrap_or(running);
        arc_core::save(
            &resume_path(),
            &json!({"version":version,"ingresses":connections}),
        )?;
        // Drain auxiliary work even when the tunnel is already disconnected.
        let installed = async {
            service.shutdown().await?;
            update.install(bytes).map_err(|error| error.to_string())
        }
        .await;
        if let Err(error) = installed {
            let _ = std::fs::remove_file(resume_path());
            service.resume().await;
            let restored = async {
                for id in &connections {
                    service
                        .request(&format!("ingress/{id}/start"), "POST", json!({}))
                        .await?;
                }
                Ok::<_, String>(json!({}))
            }
            .await;
            return Err(match restored {
                Ok(_) => format!("Update failed: {error}. Retry or download manually."),
                Err(restore) => {
                    format!("Update failed: {error}. Connection recovery failed: {restore}")
                }
            });
        }
        // restart() never returns on a runtime worker. Let this command finish and
        // release its guards before the event loop completes the restart instead.
        state.restarting.store(true, Ordering::SeqCst);
        app.request_restart();
        Ok(json!({"available":true,"version":version,"restarting":true}))
    }
    .await;
    #[cfg(target_os = "macos")]
    let installation = async {
        // Updater::download verifies the release signature. Keep the acquisition
        // candidate for retry; the replacement worker owns staging and all swaps.
        let directory = arc_core::root().join("release-candidates").join(arc_core::id());
        arc_core::private_dir(&directory)?;
        let archive = directory.join("release.tar.gz");
        std::fs::write(&archive, bytes).map_err(|e| e.to_string())?;
        arc_core::output("/usr/bin/tar", &["-xzf", &archive.to_string_lossy(), "-C", &directory.to_string_lossy()]).await?;
        let candidates: Vec<_> = std::fs::read_dir(&directory).map_err(|e| e.to_string())?.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|v| v == "app") && p.is_dir()).collect();
        if candidates.len() != 1 { return Err("UPDATE_INVALID_PACKAGE: expected one application bundle".into()); }
        let service = app.state::<std::sync::Arc<arc_core::runtime::Client>>().inner().clone();
        let current = service.request("status", "GET", json!({})).await?;
        let running: Vec<_> = current["ingresses"].as_array().into_iter().flatten().filter(|v| v["running"] == true).filter_map(|v| v["id"].as_str().map(str::to_owned)).collect();
        arc_core::save(&resume_path(), &json!({"version":version,"ingresses":crate::session::restore().unwrap_or(running)}))?;
        let receipt = arc_core::app_replace::prepare(json!({"path":candidates[0],"releaseVerified":true,"releaseVersion":version,"notes":update.body,"when":when})).await?;
        // Receipt has reached its initiating Desktop before arming the helper.
        arc_core::app_replace::acknowledge(receipt["id"].as_str().ok_or("UPDATE_RECEIPT_MISSING")?)?;
        progress(&app, json!({"phase":"idle","update":null}));
        Ok(json!({"available":false,"replacementReceipt":receipt}))
    }.await;
    if let Err(error) = installation {
        progress(&app, json!({"update":retry_update}));
        return Err(failed(&app, "install", error));
    }
    installation
}

pub fn snapshot(app: &tauri::AppHandle) -> Value {
    app.state::<UpdateState>().status.lock().unwrap().clone()
}
fn progress(app: &tauri::AppHandle, patch: Value) {
    let state = app.state::<UpdateState>();
    let mut status = state.status.lock().unwrap();
    for (k, v) in patch.as_object().unwrap() {
        status[k] = v.clone();
    }
    status["revision"] = json!(status["revision"].as_u64().unwrap_or(0) + 1);
    status["observedAt"] = json!(arc_core::now());
    let _ = app.emit("update-progress", status.clone());
}

fn chrono_now_millis() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .to_string()
}
pub fn start(app: tauri::AppHandle) {
    // Old progress files cannot represent this process's update or byte cache.
    let _ = std::fs::remove_file(arc_core::root().join("update-status.json"));
    progress(&app, json!({"phase":"idle"}));
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        loop {
            let prefs = arc_core::preferences::read();
            let previous = prefs["update-last-check"]
                .as_str()
                .unwrap_or("0")
                .parse::<u128>()
                .unwrap_or(0);
            let current = chrono_now_millis().parse::<u128>().unwrap_or(0);
            if current.saturating_sub(previous) >= 3600000 && allow_update().is_ok() {
                if let Ok(offer) = check_update(app.clone()).await {
                    if prefs["update-timing"] == "automatic"
                        && offer["ready"] == true
                        && offer["version"] != prefs["update-skipped-version"]
                    {
                        if let Some(version) = offer["version"].as_str() {
                            let _ = install_update(app.clone(), version.into(), "settled").await;
                        }
                    }
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        }
    });
}
