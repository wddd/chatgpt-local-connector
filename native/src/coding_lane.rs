//! Development workflow guard. The lane manager owns the marker and its message.
use crate::*;

pub fn require_main_checkout(candidate: Option<&Path>) -> Result<()> {
    let mut paths = vec![
        std::env::current_dir().map_err(|e| e.to_string())?,
        std::env::current_exe().map_err(|e| e.to_string())?,
    ];
    if let Some(candidate) = candidate {
        paths.push(candidate.to_owned());
    }
    for path in paths {
        let path = if path.is_absolute() {
            path
        } else {
            std::env::current_dir()
                .map_err(|e| e.to_string())?
                .join(path)
        };
        let path = path.canonicalize().unwrap_or(path);
        for directory in path.ancestors() {
            match std::fs::read_to_string(directory.join(".arc-coding-lane")) {
                Ok(message) => return Err(message.trim().to_owned()),
                Err(error)
                    if matches!(
                        error.kind(),
                        std::io::ErrorKind::NotFound | std::io::ErrorKind::NotADirectory
                    ) => {}
                Err(error) => return Err(error.to_string()),
            }
        }
    }
    Ok(())
}
