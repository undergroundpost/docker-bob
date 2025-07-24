use axum::{
    extract::Request,
    http::{HeaderMap, HeaderValue},
    middleware::Next,
    response::Response,
};
use tracing::info;

pub async fn security_headers(request: Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    
    let headers = response.headers_mut();
    headers.insert("X-Content-Type-Options", HeaderValue::from_static("nosniff"));
    headers.insert("X-Frame-Options", HeaderValue::from_static("DENY"));
    headers.insert("X-XSS-Protection", HeaderValue::from_static("1; mode=block"));
    headers.insert("Referrer-Policy", HeaderValue::from_static("strict-origin-when-cross-origin"));
    
    response
}

pub async fn request_logging(request: Request, next: Next) -> Response {
    let method = request.method().clone();
    let uri = request.uri().clone();
    let start = std::time::Instant::now();
    
    let response = next.run(request).await;
    
    let duration = start.elapsed();
    let status = response.status();
    
    info!(
        method = %method,
        uri = %uri,
        status = %status.as_u16(),
        duration_ms = duration.as_millis(),
        "Request completed"
    );
    
    response
}