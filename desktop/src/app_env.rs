//! Window-only acceptance sizing. The renderer owns appearance and language overrides.
use std::sync::Mutex;
use tauri::Manager;

#[derive(Default)]
pub struct State(Mutex<Option<f64>>);

#[tauri::command]
pub fn apply_env_window(window: tauri::WebviewWindow, width: Option<u32>) -> Result<(), String> {
    if window.label() != "main" || width.is_some_and(|v| !(320..=3840).contains(&v)) {
        return Err("INVALID_APP_ENV: main window width must be 320..3840 logical pixels".into());
    }
    let app = window.app_handle();
    let state = app.state::<State>();
    let mut original = state.0.lock().map_err(|e| e.to_string())?;
    // The window-state plugin can save a temporary width on exit. Keep the baseline
    // outside preferences until clear/expiry has restored it, including after a crash.
    let baseline = arc_core::root().join("app-env-window.json");
    if original.is_none() && baseline.exists() {
        *original = Some(
            arc_core::load(&baseline)?["width"]
                .as_f64()
                .filter(|v| v.is_finite() && *v > 0.0)
                .ok_or("INVALID_APP_ENV: invalid window baseline")?,
        );
    }
    let size = window
        .inner_size()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(window.scale_factor().map_err(|e| e.to_string())?);
    if let Some(width) = width {
        if original.is_none() {
            arc_core::save(&baseline, &serde_json::json!({"width":size.width}))?;
            *original = Some(size.width);
        }
        window
            .set_min_size(Some(tauri::LogicalSize::new(320.0, 320.0)))
            .map_err(|e| e.to_string())?;
        window
            .set_size(tauri::LogicalSize::new(width as f64, size.height))
            .map_err(|e| e.to_string())?;
    } else if let Some(width) = *original {
        let config = app
            .config()
            .app
            .windows
            .iter()
            .find(|w| w.label == "main")
            .ok_or("main window configuration missing")?;
        window
            .set_min_size(Some(tauri::LogicalSize::new(
                config.min_width.unwrap_or(320.0),
                config.min_height.unwrap_or(320.0),
            )))
            .map_err(|e| e.to_string())?;
        window
            .set_size(tauri::LogicalSize::new(width, size.height))
            .map_err(|e| e.to_string())?;
        if baseline.exists() {
            std::fs::remove_file(baseline).map_err(|e| e.to_string())?;
        }
        *original = None;
    }
    Ok(())
}
