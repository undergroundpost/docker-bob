use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use chrono::{DateTime, Utc, NaiveDate};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Contact {
    pub id: i32,
    pub name: String,
    pub company: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub linkedin: Option<String>,
    pub website: Option<String>,
    pub position: Option<String>,
    pub last_contact_date: Option<NaiveDate>,
    pub next_contact_date: Option<NaiveDate>,
    pub contact_frequency: Option<i32>,
    pub notes: Option<String>,
    pub custom_fields: Option<serde_json::Value>,
    pub source: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub embedding: Option<Vec<f32>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateContact {
    pub name: String,
    pub company: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub linkedin: Option<String>,
    pub website: Option<String>,
    pub position: Option<String>,
    pub last_contact_date: Option<NaiveDate>,
    pub next_contact_date: Option<NaiveDate>,
    pub contact_frequency: Option<i32>,
    pub notes: Option<String>,
    pub custom_fields: Option<serde_json::Value>,
    pub source: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateContact {
    pub name: Option<String>,
    pub company: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub linkedin: Option<String>,
    pub website: Option<String>,
    pub position: Option<String>,
    pub last_contact_date: Option<NaiveDate>,
    pub next_contact_date: Option<NaiveDate>,
    pub contact_frequency: Option<i32>,
    pub notes: Option<String>,
    pub custom_fields: Option<serde_json::Value>,
    pub source: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Tag {
    pub id: i32,
    pub name: String,
    pub color: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateTag {
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateTag {
    pub name: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ContactTag {
    pub id: i32,
    pub contact_id: i32,
    pub tag_id: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddContactTag {
    pub tag_id: i32,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Activity {
    pub id: i32,
    pub contact_id: Option<i32>,
    pub r#type: String,
    pub description: String,
    pub metadata: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateActivity {
    pub contact_id: Option<i32>,
    pub r#type: String,
    pub description: String,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Communication {
    pub id: i32,
    pub contact_id: i32,
    pub date: NaiveDate,
    pub method: String,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateCommunication {
    pub contact_id: i32,
    pub date: NaiveDate,
    pub method: String,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateCommunication {
    pub date: Option<NaiveDate>,
    pub method: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct LeadgenConfig {
    pub id: i32,
    pub openai_api_key: Option<String>,
    pub openai_model: String,
    pub openai_prompt: Option<String>,
    pub apollo_api_key: Option<String>,
    pub max_companies: i32,
    pub max_employees_per_company: i32,
    pub request_delay: f64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateLeadgenConfig {
    pub openai_api_key: Option<String>,
    pub openai_model: Option<String>,
    pub openai_prompt: Option<String>,
    pub apollo_api_key: Option<String>,
    pub max_companies: Option<i32>,
    pub max_employees_per_company: Option<i32>,
    pub request_delay: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct LeadgenSession {
    pub id: i32,
    pub status: String,
    pub progress: i32,
    pub message: Option<String>,
    pub companies_generated: i32,
    pub contacts_generated: i32,
    pub error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ScraperConfig {
    pub id: i32,
    pub login_url: String,
    pub customers_url: Option<String>,
    pub username: String,
    pub password: String,
    pub headless: bool,
    pub timeout: i32,
    pub max_customers: Option<i32>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateScraperConfig {
    pub login_url: Option<String>,
    pub customers_url: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub headless: Option<bool>,
    pub timeout: Option<i32>,
    pub max_customers: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ScrapedCustomer {
    pub id: i32,
    pub name: String,
    pub source: String,
    pub scraped_at: DateTime<Utc>,
    pub scrape_session_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Metadata {
    pub id: i32,
    pub key: String,
    pub value: Option<String>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DashboardStats {
    #[serde(rename = "totalContacts")]
    pub total_contacts: i64,
    #[serde(rename = "monthlyNewContacts")]
    pub contacts_this_month: i64,
    #[serde(rename = "overdueContacts")]
    pub contacts_need_follow_up: i64,
    #[serde(rename = "upcomingContacts")]
    pub upcoming_contacts: i64,
    #[serde(rename = "weeklyComms")]
    pub weekly_communications: i64,
    #[serde(rename = "apolloLeads")]
    pub apollo_leads: i64,
    #[serde(rename = "recentActivities")]
    pub recent_activities: Vec<Activity>,
    #[serde(rename = "topSources")]
    pub top_sources: Vec<SourceCount>,
    #[serde(rename = "contactFrequencyBreakdown")]
    pub contact_frequency_breakdown: Vec<FrequencyCount>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct SourceCount {
    pub source: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct FrequencyCount {
    pub frequency: i32,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ContactsQuery {
    pub search: Option<String>,
    pub company: Option<String>,
    pub source: Option<String>,
    pub tag: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BulkDeleteRequest {
    pub contact_ids: Vec<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BulkCommunicationRequest {
    pub contact_ids: Vec<i32>,
    pub method: String,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct File {
    pub id: Uuid,
    pub original_name: String,
    pub storage_key: String,
    pub content_type: String,
    pub size: i64,
    pub created_at: DateTime<Utc>,
}