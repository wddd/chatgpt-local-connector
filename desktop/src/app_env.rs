//! Window-only acceptance sizing. The renderer owns appearance and language overrides.
use std::sync::Mutex;
use tauri::Manager;

#[derive(Default)]
pub struct State(Mutex<Option<(f64, f64)>>);

#[tauri::command]
pub fn apply_env_window(
    window: tauri::WebviewWindow,
    width: Option<u32>,
    height: Option<u32>,
) -> Result<(), String> {
    if window.label() != "main"
        || [width, height]
            .into_iter()
            .flatten()
            .any(|v| !(320..=3840).contains(&v))
    {
        return Err(
            "INVALID_APP_ENV: main window dimensions must be 320..3840 logical pixels".into(),
        );
    }
    let app = window.app_handle();
    let state = app.state::<State>();
    let mut original = state.0.lock().map_err(|e| e.to_string())?;
    // The window-state plugin can save a temporary size on exit. Keep the baseline
    // outside preferences until clear/expiry has restored it, including after a crash.
    let baseline = arc_core::root().join("app-env-window.json");
    let size = window
        .inner_size()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(window.scale_factor().map_err(|e| e.to_string())?);
    if original.is_none() && baseline.exists() {
        let saved = arc_core::load(&baseline)?;
        let width = saved["width"]
            .as_f64()
            .filter(|v| v.is_finite() && *v > 0.0)
            .ok_or("INVALID_APP_ENV: invalid window baseline")?;
        // Recover a width-only baseline left by an earlier running instance.
        let height = saved["height"]
            .as_f64()
            .filter(|v| v.is_finite() && *v > 0.0)
            .unwrap_or(size.height);
        *original = Some((width, height));
    }
    if width.is_some() || height.is_some() {
        if original.is_none() {
            arc_core::save(
                &baseline,
                &serde_json::json!({"width":size.width,"height":size.height}),
            )?;
            *original = Some((size.width, size.height));
        }
        window
            .set_min_size(Some(tauri::LogicalSize::new(320.0, 320.0)))
            .map_err(|e| e.to_string())?;
        window
            .set_size(tauri::LogicalSize::new(
                width.map_or(size.width, f64::from),
                height.map_or(size.height, f64::from),
            ))
            .map_err(|e| e.to_string())?;
    } else if let Some((width, height)) = *original {
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
            .set_size(tauri::LogicalSize::new(width, height))
            .map_err(|e| e.to_string())?;
        if baseline.exists() {
            std::fs::remove_file(baseline).map_err(|e| e.to_string())?;
        }
        *original = None;
    }
    Ok(())
}
