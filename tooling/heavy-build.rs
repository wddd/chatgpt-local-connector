// Development tooling only. Kernel locks survive stale lock files and release on exit.
use std::{fs::OpenOptions, process::Command};

fn run() -> Result<i32, Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(&args[0])?;
    // Windows file locks also exclude readers, so keep the holder label separately.
    let owner = format!("{}.owner", args[0]);
    match lock.try_lock() {
        Ok(()) => {}
        Err(std::fs::TryLockError::WouldBlock) => {
            let holder = std::fs::read_to_string(&owner)
                .unwrap_or_else(|_| "another ARC build (owner starting)".into());
            eprintln!("Waiting for heavy build held by: {}", holder.trim());
            lock.lock()?;
        }
        Err(std::fs::TryLockError::Error(error)) => return Err(error.into()),
    }
    let temporary = format!("{owner}.{}", std::process::id());
    std::fs::write(
        &temporary,
        format!("{} [PID {}]\n", args[1], std::process::id()),
    )?;
    std::fs::rename(temporary, owner)?;
    eprintln!("Heavy build acquired: {}", args[1]);
    let status = Command::new(&args[2])
        .args(&args[3..])
        .env("ARC_HEAVY_BUILD_HELD", "1")
        .status()?;
    eprintln!("Heavy build finished: {}", args[1]);
    Ok(status.code().unwrap_or(1))
}

fn main() {
    match run() {
        Ok(code) => std::process::exit(code),
        Err(error) => {
            eprintln!("Heavy build queue failed: {error}");
            std::process::exit(1);
        }
    }
}
