use axum::{
    middleware,
    routing::{get, post, put, delete},
    Router,
};
use tokio::net::TcpListener;
use tower::ServiceBuilder;
use tower_http::{
    cors::CorsLayer,
    services::ServeDir,
    trace::TraceLayer,
};
use tracing::info;

mod models;
mod handlers;
mod middleware_funcs;
mod database;
mod error;

use handlers::*;
use sqlx::PgPool;
use object_store::{ObjectStore, aws::AmazonS3Builder};
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub object_store: Arc<dyn ObjectStore>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG")
                .unwrap_or_else(|_| "crm_rust=debug,tower_http=debug".into()),
        )
        .init();

    // Load environment variables
    dotenvy::dotenv().ok();

    // Connect to database
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://crm_user:crm_password@localhost:5432/crm".to_string());
    
    info!("Connecting to database: {}", database_url);
    let pool = sqlx::PgPool::connect(&database_url).await?;
    
    // TODO: Run database migrations if needed
    // sqlx::migrate!("./migrations").run(&pool).await?;

    // Initialize object storage (MinIO)
    let object_store = AmazonS3Builder::new()
        .with_endpoint(std::env::var("MINIO_ENDPOINT").unwrap_or_else(|_| "http://localhost:9000".to_string()))
        .with_access_key_id(std::env::var("MINIO_ACCESS_KEY").unwrap_or_else(|_| "minioadmin".to_string()))
        .with_secret_access_key(std::env::var("MINIO_SECRET_KEY").unwrap_or_else(|_| "minioadmin123".to_string()))
        .with_bucket_name(std::env::var("MINIO_BUCKET").unwrap_or_else(|_| "crm-uploads".to_string()))
        .with_allow_http(true) // Allow HTTP for local development
        .build()?;

    let state = AppState { 
        db: pool, 
        object_store: Arc::new(object_store) 
    };

    // Build our application with routes
    let app = Router::new()
        // Static files
        .nest_service("/", ServeDir::new("public"))
        
        // API routes
        .route("/api/contacts", get(get_contacts).post(create_contact))
        .route("/api/contacts/:id", get(get_contact).put(update_contact).delete(delete_contact))
        .route("/api/contacts/:id/contact", post(create_communication))
        .route("/api/contacts/:id/tags", get(get_contact_tags).post(add_contact_tag))
        .route("/api/contacts/:id/tags/:tag_id", delete(remove_contact_tag))
        .route("/api/contacts/bulk-delete", post(bulk_delete_contacts))
        .route("/api/contacts/bulk-contact", post(bulk_contact_communication))
        
        .route("/api/tags", get(get_tags).post(create_tag))
        .route("/api/tags/:id", put(update_tag).delete(delete_tag))
        
        .route("/api/activities", get(get_activities).post(create_activity))
        
        .route("/api/communications/:id", put(update_communication).delete(delete_communication))
        
        .route("/api/dashboard", get(get_dashboard))
        
        .route("/api/export", get(export_contacts))
        .route("/api/upload", post(upload_file))
        
        .route("/api/metadata", get(get_metadata))
        .route("/api/ai/search", post(ai_search_contacts))
        
        // AI/Lead Generation routes
        .route("/api/leadgen/config", get(get_leadgen_config).post(update_leadgen_config))
        .route("/api/leadgen/run", post(run_leadgen))
        .route("/api/leadgen/cancel", post(cancel_leadgen))
        .route("/api/leadgen/progress", get(get_leadgen_progress))
        .route("/api/leadgen/sessions", get(get_leadgen_sessions))
        
        // Web scraper routes
        .route("/api/scraper/config", get(get_scraper_config).post(update_scraper_config))
        .route("/api/scraper/customers/count", get(get_scraped_customers_count))
        .route("/api/scraper/run", post(run_scraper))
        .route("/api/scraper/progress", get(get_scraper_progress))
        
        .layer(
            ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(CorsLayer::permissive())
                .layer(middleware::from_fn(middleware_funcs::security_headers))
                .layer(middleware::from_fn(middleware_funcs::request_logging))
        )
        .with_state(state);

    // Start server
    let listener = TcpListener::bind("0.0.0.0:3000").await?;
    info!("Server running on http://0.0.0.0:3000");
    
    axum::serve(listener, app).await?;
    
    Ok(())
}