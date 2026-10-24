use std::sync::{Arc, atomic::{AtomicUsize, Ordering}};
struct SnapshotDesktop(AtomicUsize);
impl arc_core::transport::DesktopAccess for SnapshotDesktop {
    fn check_write(&self) -> arc_core::Result<()> {Ok(())}
    fn request(&self, request: arc_core::transport::DesktopRequest) -> std::pin::Pin<Box<dyn std::future::Future<Output=arc_core::Result<serde_json::Value>>+Send>> {
        let ready=self.0.fetch_add(1,Ordering::SeqCst)>0;
        Box::pin(async move {match request {
            arc_core::transport::DesktopRequest::Route(route,method,body) if route=="app/snapshot" && method=="POST" && body["modelOnly"]==true => Ok(serde_json::json!({"model":{"scenario":{"ready":ready},"taskDetail":if body["taskPanel"].is_object() {serde_json::json!({"agent":body["taskPanel"]["agent"],"id":body["taskPanel"]["id"],"purpose":"self-test","following":true,"atLatest":true,"expanded":true,"state":"running","timeline":{"status":"running","entries":[{"text":"x".repeat(150000)}]},"queue":[],"disclosures":[]})} else {serde_json::Value::Null}}})),
            _ => Err("FIXTURE_DESKTOP_UNSUPPORTED".into())
        }})
    }
}
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
#[tokio::main]
async fn main() {
    if std::env::args().nth(1).as_deref() == Some("cli") {
        std::process::exit(arc_core::cli::run(std::env::args().skip(2).collect()).await);
    }
    if std::env::args().nth(1).as_deref() == Some("stdio") {
        arc_core::transport::stdio().await.unwrap();
        return;
    }
    let service =
        arc_core::service::Service::fixture(std::env::var("ARC_FIXTURE_BINARY").unwrap().into())
            .unwrap();
    let _listener = arc_core::transport::listen(service.clone(), std::env::var_os("ARC_FIXTURE_SNAPSHOT").map(|_|Arc::new(SnapshotDesktop(AtomicUsize::new(0))) as Arc<dyn arc_core::transport::DesktopAccess>))
        .await
        .unwrap();
    if std::env::args().nth(1).as_deref() == Some("http") {
        println!("{}", serde_json::json!({"port":service.port.load(std::sync::atomic::Ordering::SeqCst),"token":service.token}));
        let _ = BufReader::new(tokio::io::stdin()).lines().next_line().await;
        service.control.close().await;
        return;
    }
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
