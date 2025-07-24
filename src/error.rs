use axum::{
    http::StatusCode,
    response::{Json, Response, IntoResponse},
};
use serde_json::json;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    
    #[error("HTTP client error: {0}")]
    HttpClient(#[from] reqwest::Error),
    
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("Validation error: {0}")]
    Validation(String),
    
    #[error("Not found: {0}")]
    NotFound(String),
    
    #[error("Unauthorized")]
    Unauthorized,
    
    #[error("Internal server error: {0}")]
    Internal(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            AppError::Database(ref e) => {
                tracing::error!("Database error: {:?}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Database error occurred")
            }
            AppError::Serialization(ref e) => {
                tracing::error!("Serialization error: {:?}", e);
                (StatusCode::BAD_REQUEST, "Invalid data format")
            }
            AppError::HttpClient(ref e) => {
                tracing::error!("HTTP client error: {:?}", e);
                (StatusCode::BAD_GATEWAY, "External service error")
            }
            AppError::Io(ref e) => {
                tracing::error!("IO error: {:?}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "File system error")
            }
            AppError::Validation(ref message) => {
                tracing::warn!("Validation error: {}", message);
                (StatusCode::BAD_REQUEST, message.as_str())
            }
            AppError::NotFound(ref message) => {
                tracing::info!("Not found: {}", message);
                (StatusCode::NOT_FOUND, message.as_str())
            }
            AppError::Unauthorized => {
                tracing::warn!("Unauthorized access attempt");
                (StatusCode::UNAUTHORIZED, "Unauthorized")
            }
            AppError::Internal(ref message) => {
                tracing::error!("Internal server error: {}", message);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
            }
        };

        let body = Json(json!({
            "error": error_message,
            "timestamp": chrono::Utc::now().to_rfc3339()
        }));

        (status, body).into_response()
    }
}

// Result type alias for convenience
pub type Result<T> = std::result::Result<T, AppError>;