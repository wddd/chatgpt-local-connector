//! Read the connection intent owned and persisted by Core.
use arc_core::{load, root};

pub fn restore() -> Option<Vec<String>> {
    let path = root().join("desktop-session.json");
    if !path.exists() {
        return None;
    }
    match load(&path)
        .and_then(|value| serde_json::from_value(value).map_err(|error| error.to_string()))
    {
        Ok(ids) => Some(ids),
        Err(error) => {
            eprintln!("Could not restore desktop connections: {error}");
            None
        }
    }
}
