use connector_core::{runtime, Result};

#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

async fn run() -> Result<()> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    match args
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .as_slice()
    {
        ["stdio"] => connector_core::transport::stdio().await,
        ["serve"] => runtime::serve().await,
        ["daemon"] => runtime::serve_mode(true).await,
        ["start"] => {
            println!("{}", connector_core::headless::start().await?);
            Ok(())
        }
        ["stop"] => {
            println!("{}", connector_core::headless::stop().await?);
            Ok(())
        }
        ["status"] => {
            println!("{}", connector_core::headless::status().await?);
            Ok(())
        }
        ["systemd", "install"] => {
            println!("{}", connector_core::headless::systemd()?);
            Ok(())
        }
        ["help" | "--help" | "-h"] => {
            println!("local-connector start | stop | status | daemon | systemd install | stdio | cli <command>\nConfigure MCP with cli ingress add --stdin; see cli help. daemon runs in the foreground; start detaches.");
            Ok(())
        }
        ["cli", rest @ ..] => {
            std::process::exit(
                connector_core::cli::run(rest.iter().map(|s| s.to_string()).collect()).await,
            );
        }
        ["--version"] => {
            println!("{}", env!("CARGO_PKG_VERSION"));
            Ok(())
        }
        _ => Err("Usage: local-connector [start | stop | status | daemon | systemd install | stdio | serve | cli <command> | --version]".into()),
    }
}
