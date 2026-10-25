//! Capture the App-owned WebView, independent of screen recording/TCC.
use serde_json::{json, Value};
use std::{path::PathBuf, sync::Mutex, time::Duration};
use tauri::Manager;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
use macos::capture_png;

type Reply = tokio::sync::oneshot::Sender<Result<Value, String>>;
#[derive(Default)]
pub struct State {
    serial: tokio::sync::Mutex<()>,
    pending: Mutex<Option<(String, Reply)>>,
}
struct Pending<'a>(&'a State);
impl Drop for Pending<'_> {
    fn drop(&mut self) {
        if let Ok(mut pending) = self.0.pending.lock() {
            pending.take();
        }
    }
}
#[tauri::command]
pub fn snapshot_ready(
    window: tauri::WebviewWindow,
    id: String,
    model: Value,
    error: Option<String>,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("invalid window".into());
    }
    let state = window.app_handle().state::<State>();
    let mut pending = state.pending.lock().map_err(|e| e.to_string())?;
    if pending
        .as_ref()
        .is_some_and(|(expected, _)| expected == &id)
    {
        let (_, sender) = pending.take().unwrap();
        let _ = sender.send(match error {
            Some(e) => Err(e),
            None => Ok(model),
        });
    }
    Ok(())
}
pub async fn capture(app: &tauri::AppHandle, body: &Value) -> Result<Value, String> {
    arc_core::management::resolve("app.snapshot", &json!({"body":body}))?;
    let state = app.state::<State>();
    let _serial = state.serial.lock().await;
    let id = arc_core::id();
    let out = body["out"]
        .as_str()
        .map(PathBuf::from)
        .unwrap_or_else(|| arc_core::root().join("acceptance").join(&id));
    if !out.is_absolute() {
        return Err("INVALID_ARGUMENT: out must be an absolute directory".into());
    }
    if body["modelOnly"] != true {
        arc_core::private_dir(&out)?;
    }
    let (sender, receiver) = tokio::sync::oneshot::channel();
    *state.pending.lock().map_err(|e| e.to_string())? = Some((id.clone(), sender));
    let _pending = Pending(&state);
    let handle = app.clone();
    let request = body.clone();
    let (sent, received) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        if sent.is_closed() {
            return;
        }
        let result = (|| {
            let window = crate::windows::ensure(&handle)?;
            if request.get("width").is_some() || request.get("height").is_some() {
                window
                    .set_min_size(Some(tauri::LogicalSize::new(320.0, 320.0)))
                    .map_err(|e| e.to_string())?;
                let size = window
                    .inner_size()
                    .map_err(|e| e.to_string())?
                    .to_logical::<f64>(window.scale_factor().map_err(|e| e.to_string())?);
                window
                    .set_size(tauri::LogicalSize::new(
                        request["width"].as_f64().unwrap_or(size.width),
                        request["height"].as_f64().unwrap_or(size.height),
                    ))
                    .map_err(|e| e.to_string())?;
            }
            crate::windows::show(
                &handle,
                Some((
                    "acceptance:snapshot".into(),
                    json!({"id":id,"panel":request["panel"],"taskPanel":request["taskPanel"],"taskBubble":request["taskBubble"]}),
                )),
            )
        })();
        let _ = sent.send(result);
    })
    .map_err(|e| e.to_string())?;
    let model = async {
        tokio::time::timeout(Duration::from_secs(5), received)
            .await
            .map_err(|_| "SNAPSHOT_TIMEOUT: main thread")?
            .map_err(|_| "snapshot cancelled")??;
        tokio::time::timeout(Duration::from_secs(20), receiver)
            .await
            .map_err(|_| "SNAPSHOT_TIMEOUT: UI did not acknowledge rendered state")?
            .map_err(|_| "snapshot cancelled")?
    }
    .await;
    let model = model?;
    let instance = json!({"desktopPid":std::process::id(),"bundleId":app.config().identifier,"appName":app.config().product_name,"version":env!("ARC_BUILD_VERSION")});
    if body["modelOnly"] == true {
        return Ok(json!({"model":model,"instance":instance}));
    }
    let model_path = out.join("view-model.json");
    arc_core::save(&model_path, &model)?;
    let png = capture_png(app).await;
    let png = match png {
        Ok(bytes) => {
            let path = out.join("snapshot.png");
            std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
            json!({"ok":true,"path":path})
        }
        Err(error) => {
            json!({"ok":false,"code":if cfg!(target_os="macos") {"SNAPSHOT_FAILED"} else {"NOT_SUPPORTED"},"message":error})
        }
    };
    Ok(json!({"directory":out,"viewModel":model_path,"png":png,"instance":instance}))
}
#[cfg(not(target_os = "macos"))]
async fn capture_png(_: &tauri::AppHandle) -> Result<Vec<u8>, String> {
    Err("WebView PNG capture is supported on macOS only".into())
}
