use crate::i18n::t;
use std::time::Duration;
use tauri::Manager;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

pub fn install(app: &tauri::App) -> tauri::Result<()> {
    let status = MenuItem::with_id(app, "status", status_text("unknown"), false, None::<&str>)?;
    let actions = [
        ("overview", "trayOpen"),
        ("logs", "trayLogs"),
        ("connections", "source.connections"),
        ("settings", "traySettings"),
        ("quit", "trayQuit"),
    ];
    let menu = Menu::new(app)?;
    menu.append(&status)?;
    let mut items = Vec::new();
    for (id, key) in actions {
        let item = MenuItem::with_id(app, id, t(key), true, None::<&str>)?;
        menu.append(&item)?;
        items.push((item, key));
    }
    #[cfg(target_os = "macos")]
    {
        let application_menu = Menu::default(app.handle())?;
        if let Some(tauri::menu::MenuItemKind::Submenu(submenu)) = application_menu.items()?.first()
        {
            let settings = MenuItem::with_id(
                app,
                "app-settings",
                t("traySettings"),
                true,
                Some("CmdOrCtrl+,"),
            )?;
            let updates = MenuItem::with_id(
                app,
                "app-check-updates",
                t("checkForUpdates"),
                true,
                None::<&str>,
            )?;
            submenu.insert_items(&[&settings, &updates], 1)?;
            items.push((settings, "traySettings"));
            items.push((updates, "checkForUpdates"));
        }
        app.set_menu(application_menu)?;
        app.on_menu_event(|app, event| {
            let action = match event.id.as_ref() {
                "app-settings" => Some(("navigate".into(), serde_json::json!("settings"))),
                "app-check-updates" => Some(("updates:check".into(), serde_json::Value::Null)),
                _ => None,
            };
            if let Some(action) = action {
                if let Err(error) = crate::windows::show(app, Some(action)) {
                    eprintln!("Application menu: {error}");
                }
            }
        });
    }
    #[cfg(target_os = "macos")]
    let icon = tauri::include_image!("icons/menubar-18Template@2x.png");
    #[cfg(not(target_os = "macos"))]
    let icon = tauri::include_image!("icons/tray-logo.png");
    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip("Agent Remote Control")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                crate::show_main_window(tray.app_handle());
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            "overview" | "tasks" | "accounts" | "remote" | "permissions" | "connections"
            | "logs" | "settings" => {
                if let Err(error) = crate::windows::show(
                    app,
                    Some((
                        "navigate".into(),
                        serde_json::json!(match event.id.as_ref() {
                            "tasks" | "accounts" => "overview",
                            "remote" => "connections",
                            "permissions" => "settings",
                            page => page,
                        }),
                    )),
                ) {
                    eprintln!("Tray navigation: {error}");
                }
            }
            _ => {}
        })
        .build(app)?;

    // Keep the native menu current even while the main WebView is hidden.
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        let mut notified = std::collections::HashSet::new();
        loop {
            let result = tokio::time::timeout(
                Duration::from_secs(4),
                crate::request(&handle, "status", "GET", serde_json::json!({})),
            )
            .await;
            if let Ok(Ok(value)) = &result {
                let focused = handle
                    .get_webview_window("main")
                    .is_some_and(|w| w.is_focused().unwrap_or(false));
                let mut current = std::collections::HashSet::new();
                if let Some(entries) = value["ingresses"].as_array() {
                    for entry in entries {
                        if let Some(pending) = entry["oauth"]["pending"].as_array() {
                            for request in pending.iter().filter(|r| r["status"] == "pending") {
                                let id = request["id"].as_str().unwrap_or("").to_owned();
                                current.insert(id.clone());
                                if !focused && !notified.contains(&id) {
                                    let product = arc_core::control_sources::preset(
                                        request["product"].as_str().unwrap_or("custom"),
                                    );
                                    let body = t("connect.notification")
                                        .replace(
                                            "{name}",
                                            product["displayName"].as_str().unwrap_or("MCP client"),
                                        )
                                        .replace(
                                            "{code}",
                                            request["pairingCode"].as_str().unwrap_or(""),
                                        );
                                    if crate::permissions::notify_oauth(&handle, body, id.clone())
                                        .await
                                        .is_ok()
                                    {
                                        notified.insert(id);
                                    }
                                }
                            }
                        }
                    }
                }
                notified.retain(|id| current.contains(id));
            }
            let key = match result {
                Ok(Ok(value)) => match value["ingressSummary"]["running"].as_u64() {
                    Some(1..) => "trayConnected",
                    Some(0) => "trayDisconnected",
                    None => "unknown",
                },
                _ => "unknown",
            };
            let _ = status.set_text(status_text(key));
            for (item, key) in &items {
                let _ = item.set_text(t(key));
            }
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    });
    Ok(())
}

fn status_text(key: &str) -> String {
    format!("{}: {}", t("trayConnectionStatus"), t(key))
}
