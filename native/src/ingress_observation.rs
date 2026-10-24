//! HTTP ingress metadata. Never retain URLs, headers, arguments, or response content.
use crate::*;
use http_body_util::BodyExt;
use hyper::body::{Body, Bytes, Frame, SizeHint};
use std::{
    convert::Infallible,
    pin::Pin,
    sync::Mutex as StdMutex,
    task::{Context, Poll},
    time::Instant,
};

#[derive(Default)]
pub(crate) struct Counters(StdMutex<Value>);
impl Counters {
    fn add(&self, fields: &[(&str, u64)]) {
        let mut totals = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if !totals.is_object() {
            *totals = json!({"received":0,"completed":0,"responseDropped":0,"handlerCancelled":0,
                "httpErrors":0,"bodyTimeouts":0,"connectionErrors":0,"headerTimeouts":0,"capacityRejected":0,"durationMs":0,"responseBytes":0});
        }
        for (key, count) in fields {
            totals[*key] = json!(totals[*key].as_u64().unwrap_or(0).saturating_add(*count));
        }
    }
    pub(crate) fn snapshot(&self) -> Value {
        self.add(&[]);
        let mut totals = self.0.lock().unwrap_or_else(|e| e.into_inner()).clone();
        totals["inFlight"] = json!(totals["received"].as_u64().unwrap_or(0).saturating_sub(
            ["completed", "responseDropped", "handlerCancelled"]
                .iter()
                .map(|key| totals[*key].as_u64().unwrap_or(0))
                .sum()
        ));
        totals["scope"] = json!("ingress-instance");
        totals
    }
}

fn record(mut row: Value, event: &str) {
    row["time"] = json!(now());
    row["level"] = json!(if matches!(
        event,
        "response_dropped" | "handler_cancelled" | "connection_error" | "capacity_rejected"
    ) {
        "WARN"
    } else {
        "INFO"
    });
    row["event"] = json!(event);
    row["msg"] = json!(format!("Ingress {event}"));
    if let Err(error) = crate::logs::append(row) {
        eprintln!("Cannot persist ingress observation: {error}");
    }
}

pub(crate) fn connection(
    ingress: &crate::ingress::Ingress,
    connection: &str,
    event: &str,
    code: &str,
) {
    ingress.requests.add(&[
        ("connectionErrors", u64::from(event == "connection_error")),
        ("headerTimeouts", u64::from(code == "HEADER_TIMEOUT")),
        ("capacityRejected", u64::from(event == "capacity_rejected")),
    ]);
    record(
        json!({"ingressId":ingress.id,"connectionId":connection,"code":code}),
        event,
    );
}
pub(crate) fn tunnel(ingress: &str, event: &str, mut details: Value) {
    details["ingressId"] = json!(ingress);
    record(details, event);
}

#[derive(Clone)]
pub(crate) struct Trace(Arc<StdMutex<Value>>);
impl Trace {
    pub(crate) fn result(&self, result: &Result<Value>) {
        let mut row = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if let Ok(response) = result {
            let result = &response["result"]["structuredContent"]["result"];
            if let Some(request) = result["requestId"]
                .as_str()
                .filter(|s| uuid::Uuid::parse_str(s).is_ok())
            {
                row["requestId"] = json!(request);
            }
            // Error codes are catalog/dispatcher identifiers, never free-form error messages.
            let code = result["error"]["code"].as_str();
            if let Some(code) = code.filter(|s| {
                s.len() <= 80
                    && s.bytes()
                        .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'_')
            }) {
                row["errorCode"] = json!(code);
            }
        } else {
            row["errorCode"] = json!("MCP_TRANSPORT_ERROR");
        }
    }
}

pub(crate) struct Request {
    trace: Trace,
    counters: Arc<Counters>,
    started: Instant,
    finished: bool,
}
impl Request {
    pub(crate) fn new(
        ingress: &crate::ingress::Ingress,
        connection: &str,
        request: &hyper::Request<hyper::body::Incoming>,
    ) -> Self {
        let route = match request.uri().path() {
            "/mcp" => "mcp",
            p if p.starts_with("/.well-known/") => "discovery",
            p if p.starts_with("/oauth/") => "oauth",
            _ => "other",
        };
        let method = match *request.method() {
            hyper::Method::GET => "GET",
            hyper::Method::POST => "POST",
            hyper::Method::DELETE => "DELETE",
            hyper::Method::OPTIONS => "OPTIONS",
            _ => "other",
        };
        let ray = request
            .headers()
            .get("cf-ray")
            .and_then(|v| v.to_str().ok())
            .filter(|s| {
                let mut parts = s.split('-');
                parts
                    .next()
                    .is_some_and(|p| p.len() == 16 && p.bytes().all(|b| b.is_ascii_hexdigit()))
                    && parts.next().is_none_or(|p| {
                        !p.is_empty()
                            && p.len() <= 8
                            && p.bytes().all(|b| b.is_ascii_alphanumeric())
                    })
                    && parts.next().is_none()
            });
        let row = json!({"ingressId":ingress.id,"connectionId":connection,"traceId":id(),
            "route":route,"method":method,"cfRay":ray});
        ingress.requests.add(&[("received", 1)]);
        record(row.clone(), "request_received");
        Self {
            trace: Trace(Arc::new(StdMutex::new(row))),
            counters: ingress.requests.clone(),
            started: Instant::now(),
            finished: false,
        }
    }
    pub(crate) fn dispatch(&self, request: &Value) {
        let mut row = self.trace.0.lock().unwrap_or_else(|e| e.into_inner());
        let tool = string(&request["params"], "name");
        let envelope = &request["params"]["arguments"];
        let op = if tool == "guide" {
            "guide"
        } else {
            string(envelope, "op")
        };
        if request["method"] == "tools/call"
            && catalog()["ops"]
                .as_array()
                .unwrap()
                .iter()
                .any(|s| s["name"] == op)
        {
            row["op"] = json!(op);
            if let Some(request) = envelope
                .get("requestId")
                .unwrap_or(&envelope["args"]["requestId"])
                .as_str()
                .filter(|s| uuid::Uuid::parse_str(s).is_ok())
            {
                row["requestId"] = json!(request);
            }
        }
        row["dispatchAfterMs"] = json!(self.started.elapsed().as_millis() as u64);
        record(row.clone(), "request_dispatch");
    }
    pub(crate) fn trace(&self) -> Trace {
        self.trace.clone()
    }
    pub(crate) fn respond(
        self,
        response: hyper::Response<crate::wait_transport::Body>,
    ) -> hyper::Response<crate::wait_transport::Body> {
        {
            let mut row = self.trace.0.lock().unwrap_or_else(|e| e.into_inner());
            row["httpStatus"] = json!(response.status().as_u16());
            row["headersAfterMs"] = json!(self.started.elapsed().as_millis() as u64);
            record(row.clone(), "response_headers");
        }
        self.counters.add(&[
            (
                "httpErrors",
                u64::from(
                    response.status().is_client_error() || response.status().is_server_error(),
                ),
            ),
            ("bodyTimeouts", u64::from(response.status().as_u16() == 408)),
        ]);
        response.map(|body| {
            ObservedBody {
                body,
                request: self,
                bytes: 0,
            }
            .boxed()
        })
    }
    fn finish(&mut self, event: &str, bytes: u64) {
        if self.finished {
            return;
        }
        self.finished = true;
        let duration = self.started.elapsed().as_millis() as u64;
        self.counters.add(&[
            (
                match event {
                    "response_finished" => "completed",
                    "response_dropped" => "responseDropped",
                    _ => "handlerCancelled",
                },
                1,
            ),
            ("durationMs", duration),
            ("responseBytes", bytes),
        ]);
        let mut row = self
            .trace
            .0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        row["durationMs"] = json!(duration);
        row["responseBytes"] = json!(bytes);
        record(row, event);
    }
}
impl Drop for Request {
    fn drop(&mut self) {
        self.finish("handler_cancelled", 0);
    }
}
struct ObservedBody {
    body: crate::wait_transport::Body,
    request: Request,
    bytes: u64,
}
impl Body for ObservedBody {
    type Data = Bytes;
    type Error = Infallible;
    fn poll_frame(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<std::result::Result<Frame<Bytes>, Infallible>>> {
        let this = self.get_mut();
        let frame = Pin::new(&mut this.body).poll_frame(cx);
        if let Poll::Ready(Some(Ok(ref frame))) = frame {
            this.bytes += frame.data_ref().map_or(0, |data| data.len() as u64);
        }
        if matches!(frame, Poll::Ready(None)) || this.body.is_end_stream() {
            this.request.finish("response_finished", this.bytes);
        }
        frame
    }
    fn is_end_stream(&self) -> bool {
        self.body.is_end_stream()
    }
    fn size_hint(&self) -> SizeHint {
        self.body.size_hint()
    }
}
impl Drop for ObservedBody {
    fn drop(&mut self) {
        self.request.finish(
            if self.body.is_end_stream() {
                "response_finished"
            } else {
                "response_dropped"
            },
            self.bytes,
        );
    }
}
