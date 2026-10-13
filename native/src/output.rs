//! Standard output for command-line and headless entrypoints.
use std::io::Write;

fn check(result: std::io::Result<()>) -> crate::Result<()> {
    match result {
        Ok(()) => Ok(()),
        // The consumer has finished reading, including for long-running streams.
        Err(error) if error.kind() == std::io::ErrorKind::BrokenPipe => std::process::exit(0),
        Err(error) => Err(format!("无法写入标准输出：{error}")),
    }
}

pub fn line(value: impl std::fmt::Display) -> crate::Result<()> {
    let mut output = std::io::stdout().lock();
    check(writeln!(output, "{value}"))?;
    check(output.flush())
}

pub(crate) async fn async_line(
    output: &mut tokio::io::Stdout,
    value: impl std::fmt::Display,
) -> crate::Result<()> {
    use tokio::io::AsyncWriteExt;
    check(output.write_all(format!("{value}\n").as_bytes()).await)?;
    check(output.flush().await)
}
