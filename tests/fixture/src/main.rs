use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
#[tokio::main]
async fn main() {
    if std::env::args().nth(1).as_deref() == Some("stdio") {
        arc_core::transport::stdio().await.unwrap();
        return;
    }
    let service =
        arc_core::service::Service::fixture(std::env::var("ARC_FIXTURE_BINARY").unwrap().into())
            .unwrap();
    let _listener = arc_core::transport::listen(service.clone(), None)
        .await
        .unwrap();
    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    let mut out = tokio::io::stdout();
    while let Some(line) = lines.next_line().await.unwrap() {
        let request = serde_json::from_str(&line).unwrap();
        let response = arc_core::transport::mcp(&service, request).await.unwrap();
        if !response.is_null() {
            out.write_all(format!("{response}\n").as_bytes())
                .await
                .unwrap();
            out.flush().await.unwrap();
        }
    }
    service.control.close().await;
}
