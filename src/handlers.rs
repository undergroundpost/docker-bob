use axum::{
    extract::{Path, Query, State, Multipart},
    response::{Json, Html},
    http::StatusCode,
};
use crate::{
    models::*,
    database::*,
    error::*,
    AppState,
};
use sqlx::PgPool;

// Contact handlers
pub async fn get_contacts(
    State(state): State<AppState>,
    Query(query): Query<ContactsQuery>,
) -> Result<Json<Vec<Contact>>> {
    let contacts = get_contacts_from_db(&state.db, &query).await?;
    Ok(Json(contacts))
}

pub async fn get_contact(
    State(state): State<AppState>,
    Path(id): Path<i32>,
) -> Result<Json<Contact>> {
    let contact = get_contact_by_id(&state.db, id)
        .await?
        .ok_or_else(|| AppError::NotFound("Contact not found".to_string()))?;
    Ok(Json(contact))
}

pub async fn create_contact(
    State(state): State<AppState>,
    Json(contact): Json<CreateContact>,
) -> Result<Json<Contact>> {
    let contact = create_contact_in_db(&state.db, &contact).await?;
    Ok(Json(contact))
}

pub async fn update_contact(
    State(state): State<AppState>,
    Path(id): Path<i32>,
    Json(contact): Json<UpdateContact>,
) -> Result<Json<Contact>> {
    let contact = update_contact_in_db(&state.db, id, &contact)
        .await?
        .ok_or_else(|| AppError::NotFound("Contact not found".to_string()))?;
    Ok(Json(contact))
}

pub async fn delete_contact(
    State(state): State<AppState>,
    Path(id): Path<i32>,
) -> Result<Json<serde_json::Value>> {
    let deleted = delete_contact_from_db(&state.db, id).await?;
    if !deleted {
        return Err(AppError::NotFound("Contact not found".to_string()));
    }
    Ok(Json(serde_json::json!({"success": true})))
}

pub async fn bulk_delete_contacts(
    State(state): State<AppState>,
    Json(request): Json<BulkDeleteRequest>,
) -> Result<Json<serde_json::Value>> {
    for id in request.contact_ids {
        delete_contact_from_db(&state.db, id).await?;
    }
    Ok(Json(serde_json::json!({"success": true})))
}

pub async fn bulk_contact_communication(
    State(state): State<AppState>,
    Json(request): Json<BulkCommunicationRequest>,
) -> Result<Json<serde_json::Value>> {
    let date = chrono::Utc::now().date_naive();
    
    for contact_id in request.contact_ids {
        let communication = CreateCommunication {
            contact_id,
            date,
            method: request.method.clone(),
            notes: request.notes.clone(),
        };
        create_communication_in_db(&state.db, &communication).await?;
    }
    
    Ok(Json(serde_json::json!({"success": true})))
}

// Tag handlers
pub async fn get_tags(
    State(state): State<AppState>,
) -> Result<Json<Vec<Tag>>> {
    let tags = get_tags_from_db(&state.db).await?;
    Ok(Json(tags))
}

pub async fn create_tag(
    State(state): State<AppState>,
    Json(tag): Json<CreateTag>,
) -> Result<Json<Tag>> {
    let tag = create_tag_in_db(&state.db, &tag).await?;
    Ok(Json(tag))
}

pub async fn update_tag(
    State(_state): State<AppState>,
    Path(_id): Path<i32>,
    Json(_tag): Json<UpdateTag>,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement tag update
    Ok(Json(serde_json::json!({"success": true})))
}

pub async fn delete_tag(
    State(_state): State<AppState>,
    Path(_id): Path<i32>,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement tag deletion
    Ok(Json(serde_json::json!({"success": true})))
}

// Contact tag relationship handlers
pub async fn get_contact_tags(
    State(_state): State<AppState>,
    Path(_id): Path<i32>,
) -> Result<Json<Vec<Tag>>> {
    // TODO: Implement get contact tags
    Ok(Json(vec![]))
}

pub async fn add_contact_tag(
    State(_state): State<AppState>,
    Path(_id): Path<i32>,
    Json(_tag): Json<AddContactTag>,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement add contact tag
    Ok(Json(serde_json::json!({"success": true})))
}

pub async fn remove_contact_tag(
    State(_state): State<AppState>,
    Path(_contact_id): Path<i32>,
    Path(_tag_id): Path<i32>,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement remove contact tag
    Ok(Json(serde_json::json!({"success": true})))
}

// Activity handlers
pub async fn get_activities(
    State(state): State<AppState>,
    Query(query): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Vec<Activity>>> {
    let limit = query.get("limit")
        .and_then(|s| s.parse().ok());
    let activities = get_activities_from_db(&state.db, limit).await?;
    Ok(Json(activities))
}

pub async fn create_activity(
    State(state): State<AppState>,
    Json(activity): Json<CreateActivity>,
) -> Result<Json<Activity>> {
    let activity = create_activity_in_db(&state.db, &activity).await?;
    Ok(Json(activity))
}

// Communication handlers
pub async fn create_communication(
    State(state): State<AppState>,
    Path(contact_id): Path<i32>,
    Json(mut communication): Json<CreateCommunication>,
) -> Result<Json<Communication>> {
    communication.contact_id = contact_id;
    let communication = create_communication_in_db(&state.db, &communication).await?;
    Ok(Json(communication))
}

pub async fn update_communication(
    State(_state): State<AppState>,
    Path(_id): Path<i32>,
    Json(_communication): Json<UpdateCommunication>,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement communication update
    Ok(Json(serde_json::json!({"success": true})))
}

pub async fn delete_communication(
    State(_state): State<AppState>,
    Path(_id): Path<i32>,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement communication deletion
    Ok(Json(serde_json::json!({"success": true})))
}

// Dashboard handler
pub async fn get_dashboard(
    State(state): State<AppState>,
) -> Result<Json<DashboardStats>> {
    let stats = get_dashboard_stats(&state.db).await?;
    Ok(Json(stats))
}

// File upload handler
pub async fn upload_file(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>> {
    use object_store::{ObjectStore, path::Path as ObjectPath};
    use uuid::Uuid;
    
    let mut uploaded_files = Vec::new();
    
    while let Some(field) = multipart.next_field().await.map_err(|e| {
        AppError::Validation(format!("Multipart error: {}", e))
    })? {
        let name = field.name().unwrap_or("unknown").to_string();
        let filename = match field.file_name() {
            Some(f) => f.to_string(),
            None => continue, // Skip fields without filenames
        };
        
        let data = field.bytes().await.map_err(|e| {
            AppError::Validation(format!("Field data error: {}", e))
        })?;
        
        // Store data size before moving
        let data_size = data.len();
        
        // Generate unique filename to avoid conflicts
        let file_id = Uuid::new_v4();
        let extension = std::path::Path::new(&filename)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("");
        
        let storage_key = if extension.is_empty() {
            format!("uploads/{}", file_id)
        } else {
            format!("uploads/{}.{}", file_id, extension)
        };
        
        // Upload to object storage (MinIO)
        let object_path = ObjectPath::from(storage_key.clone());
        state.object_store.put(&object_path, data.into()).await.map_err(|e| {
            AppError::Internal(format!("Failed to upload file: {}", e))
        })?;
        
        // Store file metadata in database
        let file_record: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO files (id, original_name, storage_key, content_type, size) VALUES ($1, $2, $3, $4, $5) RETURNING id"
        )
        .bind(file_id)
        .bind(&filename)
        .bind(&storage_key)
        .bind("application/octet-stream") // Default content type
        .bind(data_size as i64)
        .fetch_one(&state.db)
        .await?;
        
        uploaded_files.push(serde_json::json!({
            "id": file_record.0,
            "filename": filename,
            "size": data_size
        }));
        
        tracing::info!("Uploaded file: {} ({} bytes) -> {}", filename, data_size, storage_key);
    }
    
    Ok(Json(serde_json::json!({
        "success": true, 
        "files": uploaded_files,
        "message": format!("Successfully uploaded {} file(s)", uploaded_files.len())
    })))
}

// Export handler
pub async fn export_contacts(
    State(state): State<AppState>,
    Query(query): Query<ContactsQuery>,
) -> Result<String> {
    let contacts = get_contacts_from_db(&state.db, &query).await?;
    
    // Simple CSV export
    let mut csv = "name,company,email,phone,position,created_at\n".to_string();
    for contact in contacts {
        csv.push_str(&format!(
            "{},{},{},{},{},{}\n",
            contact.name,
            contact.company.unwrap_or_default(),
            contact.email.unwrap_or_default(),
            contact.phone.unwrap_or_default(),
            contact.position.unwrap_or_default(),
            contact.created_at.format("%Y-%m-%d")
        ));
    }
    
    Ok(csv)
}

// Metadata handler
pub async fn get_metadata(
    State(_state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement metadata retrieval
    Ok(Json(serde_json::json!({"version": "1.0.0", "migration": "rust"})))
}

// AI-powered contact search using embeddings
pub async fn ai_search_contacts(
    State(state): State<AppState>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>> {
    let query = request["query"].as_str()
        .ok_or_else(|| AppError::Validation("Query string required".to_string()))?;
    
    // Get OpenAI API key from environment
    let openai_api_key = std::env::var("OPENAI_API_KEY")
        .map_err(|_| AppError::Validation("OpenAI API key not configured".to_string()))?;
    
    // Generate embedding for the search query
    let client = reqwest::Client::new();
    let embedding_response = client
        .post("https://api.openai.com/v1/embeddings")
        .header("Authorization", format!("Bearer {}", openai_api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": "text-embedding-ada-002",
            "input": query
        }))
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("OpenAI embedding request failed: {}", e)))?;
    
    if !embedding_response.status().is_success() {
        let error_text = embedding_response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(AppError::Internal(format!("OpenAI embedding error: {}", error_text)));
    }
    
    let embedding_result: serde_json::Value = embedding_response.json().await
        .map_err(|e| AppError::Internal(format!("Failed to parse embedding response: {}", e)))?;
    
    let query_embedding = embedding_result["data"][0]["embedding"]
        .as_array()
        .ok_or_else(|| AppError::Internal("Invalid embedding response".to_string()))?
        .iter()
        .map(|v| v.as_f64().unwrap_or(0.0) as f32)
        .collect::<Vec<f32>>();
    
    // Search for similar contacts using cosine similarity
    let similar_contacts = sqlx::query_as::<_, crate::models::Contact>(
        "SELECT *, (embedding <=> $1::vector) as similarity 
         FROM contacts 
         WHERE embedding IS NOT NULL 
         ORDER BY similarity 
         LIMIT 10"
    )
    .bind(&query_embedding)
    .fetch_all(&state.db)
    .await?;
    
    // Log the search activity
    let create_activity = crate::models::CreateActivity {
        contact_id: None,
        r#type: "ai_search".to_string(),
        description: format!("AI semantic search: '{}'", query),
        metadata: Some(serde_json::json!({
            "query": query,
            "results_count": similar_contacts.len(),
            "model": "text-embedding-ada-002"
        })),
    };
    
    create_activity_in_db(&state.db, &create_activity).await?;
    
    Ok(Json(serde_json::json!({
        "success": true,
        "query": query,
        "results": similar_contacts,
        "count": similar_contacts.len()
    })))
}

// Lead generation handlers
pub async fn get_leadgen_config(
    State(state): State<AppState>,
) -> Result<Json<LeadgenConfig>> {
    let config = get_leadgen_config_from_db(&state.db).await?;
    
    // Remove sensitive API keys from response
    let safe_config = LeadgenConfig {
        openai_api_key: config.openai_api_key.map(|_| "***CONFIGURED***".to_string()),
        apollo_api_key: config.apollo_api_key.map(|_| "***CONFIGURED***".to_string()),
        ..config
    };
    
    Ok(Json(safe_config))
}

pub async fn update_leadgen_config(
    State(state): State<AppState>,
    Json(update_config): Json<UpdateLeadgenConfig>,
) -> Result<Json<serde_json::Value>> {
    // Get existing config
    let existing_config = get_leadgen_config_from_db(&state.db).await?;
    
    // Update the config
    sqlx::query(
        r#"
        UPDATE leadgen_config 
        SET openai_api_key = COALESCE($2, openai_api_key),
            openai_model = COALESCE($3, openai_model),
            openai_prompt = COALESCE($4, openai_prompt),
            apollo_api_key = COALESCE($5, apollo_api_key),
            max_companies = COALESCE($6, max_companies),
            max_employees_per_company = COALESCE($7, max_employees_per_company),
            request_delay = COALESCE($8, request_delay),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        "#
    )
    .bind(existing_config.id)
    .bind(&update_config.openai_api_key)
    .bind(&update_config.openai_model)
    .bind(&update_config.openai_prompt)
    .bind(&update_config.apollo_api_key)
    .bind(update_config.max_companies)
    .bind(update_config.max_employees_per_company)
    .bind(update_config.request_delay)
    .execute(&state.db)
    .await?;
    
    Ok(Json(serde_json::json!({"success": true, "message": "Configuration updated successfully"})))
}

pub async fn run_leadgen(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    // Get leadgen configuration from database
    let config = get_leadgen_config_from_db(&state.db).await?;
    
    let openai_api_key = config.openai_api_key.clone()
        .ok_or_else(|| AppError::Validation("OpenAI API key not configured".to_string()))?;
    let apollo_api_key = config.apollo_api_key.clone()
        .ok_or_else(|| AppError::Validation("Apollo API key not configured".to_string()))?;
    
    // Create new leadgen session
    let session = create_leadgen_session(&state.db).await?;
    
    // Start the multi-step leadgen process
    let session_id = session.id;
    let state_clone = state.clone();
    tokio::spawn(async move {
        if let Err(e) = run_leadgen_workflow(state_clone.clone(), session_id, config, openai_api_key, apollo_api_key).await {
            // Update session with error
            let _ = update_leadgen_session_error(&state_clone.db, session_id, &e.to_string()).await;
            tracing::error!("Leadgen workflow failed: {}", e);
        }
    });
    
    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Lead generation workflow started",
        "session_id": session.id
    })))
}

async fn run_leadgen_workflow(
    state: AppState, 
    session_id: i32,
    config: crate::models::LeadgenConfig,
    openai_api_key: String,
    apollo_api_key: String
) -> Result<()> {
    let client = reqwest::Client::new();
    
    // Update session progress
    update_leadgen_session_progress(&state.db, session_id, 10, "Starting OpenAI company generation...").await?;
    
    // Step 1: OpenAI Company Generation
    let companies = generate_companies_with_openai(&client, &openai_api_key, &config).await?;
    update_leadgen_session_progress(&state.db, session_id, 25, &format!("Generated {} companies", companies.len())).await?;
    
    // Step 2: Company Verification
    let verified_companies = verify_companies(&client, companies.clone()).await?;
    update_leadgen_session_progress(&state.db, session_id, 50, &format!("Verified {} companies", verified_companies.len())).await?;
    
    // Step 3: Blacklist Filtering
    let filtered_companies = filter_blacklisted_companies(&state.db, verified_companies.clone()).await?;
    update_leadgen_session_progress(&state.db, session_id, 65, &format!("Filtered to {} new companies", filtered_companies.len())).await?;
    
    // Step 4: Apollo Contact Enrichment
    let mut total_contacts = 0;
    for (index, company) in filtered_companies.iter().enumerate() {
        let contacts = enrich_company_with_apollo(&client, &apollo_api_key, company, &config).await?;
        
        // Import contacts to CRM
        for contact in contacts {
            create_contact_in_db(&state.db, &contact).await?;
            total_contacts += 1;
        }
        
        let progress = 65 + ((index + 1) * 30 / filtered_companies.len()) as i32;
        update_leadgen_session_progress(&state.db, session_id, progress, &format!("Processed {}/{} companies", index + 1, filtered_companies.len())).await?;
        
        // Respect rate limits
        tokio::time::sleep(std::time::Duration::from_secs_f64(config.request_delay)).await;
    }
    
    // Complete session
    complete_leadgen_session(&state.db, session_id, filtered_companies.len() as i32, total_contacts).await?;
    
    // Log completion activity
    let create_activity = crate::models::CreateActivity {
        contact_id: None,
        r#type: "lead_generation".to_string(),
        description: "Lead generation workflow completed".to_string(),
        metadata: Some(serde_json::json!({
            "session_id": session_id,
            "companies_generated": companies.len(),
            "companies_verified": verified_companies.len(),
            "companies_filtered": filtered_companies.len(),
            "contacts_imported": total_contacts
        })),
    };
    
    create_activity_in_db(&state.db, &create_activity).await?;
    
    Ok(())
}

// Step 1: OpenAI Company Generation
async fn generate_companies_with_openai(
    client: &reqwest::Client,
    api_key: &str,
    config: &crate::models::LeadgenConfig,
) -> Result<Vec<String>> {
    let prompt = config.openai_prompt.as_deref().unwrap_or(
        "Generate a JSON array of real company names in the technology industry. Focus on mid-size companies (100-5000 employees) that would be good prospects for business services. Return only the company names as a JSON array, no additional text."
    );
    
    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": config.openai_model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a business research assistant. Generate only valid company names that actually exist."
                },
                {
                    "role": "user",
                    "content": format!("{} Limit to {} companies.", prompt, config.max_companies)
                }
            ],
            "max_tokens": 1000,
            "temperature": 0.7
        }))
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("OpenAI request failed: {}", e)))?;
    
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(AppError::Internal(format!("OpenAI API error: {}", error_text)));
    }
    
    let ai_response: serde_json::Value = response.json().await
        .map_err(|e| AppError::Internal(format!("Failed to parse OpenAI response: {}", e)))?;
    
    let content = ai_response["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| AppError::Internal("No content in OpenAI response".to_string()))?;
    
    // Parse the JSON array of company names
    let companies: Vec<String> = serde_json::from_str(content)
        .or_else(|_| {
            // Fallback: extract company names from text if JSON parsing fails
            let lines: Vec<String> = content.lines()
                .filter_map(|line| {
                    let cleaned = line.trim().trim_matches('"').trim_matches(',');
                    if !cleaned.is_empty() && !cleaned.starts_with('{') && !cleaned.starts_with('[') {
                        Some(cleaned.to_string())
                    } else {
                        None
                    }
                })
                .take(config.max_companies as usize)
                .collect();
            Ok(lines)
        })
        .map_err(|e: serde_json::Error| AppError::Internal(format!("Failed to parse company names: {}", e)))?;
    
    Ok(companies)
}

// Step 2: Company Verification
async fn verify_companies(
    client: &reqwest::Client,
    companies: Vec<String>
) -> Result<Vec<String>> {
    let mut verified_companies = Vec::new();
    
    for company in companies {
        // Simple verification using a web search to check if company exists
        // In production, you might use a dedicated company verification service
        let search_query = format!("{} company", company);
        let search_url = format!("https://www.google.com/search?q={}", 
            urlencoding::encode(&search_query));
        
        // Make a simple request to check if we get a reasonable response
        // This is a basic verification - in production you'd use a proper API
        let response = client
            .get(&search_url)
            .header("User-Agent", "Mozilla/5.0 (compatible; CRM-Bot/1.0)")
            .send()
            .await;
        
        match response {
            Ok(resp) if resp.status().is_success() => {
                // Basic check: if we can access the search page, assume company might be real
                verified_companies.push(company);
            }
            _ => {
                // Skip companies that fail verification
                tracing::warn!("Failed to verify company: {}", company);
            }
        }
        
        // Add delay to respect rate limits
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
    
    Ok(verified_companies)
}

// Step 3: Blacklist Filtering
async fn filter_blacklisted_companies(
    pool: &PgPool,
    companies: Vec<String>
) -> Result<Vec<String>> {
    let mut filtered_companies = Vec::new();
    
    for company in companies {
        // Check against scraped_customers (blacklist from web scraping)
        let scraped_blacklisted: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM scraped_customers WHERE LOWER(name) = LOWER($1)"
        )
        .bind(&company)
        .fetch_one(pool)
        .await?;
        
        // Check against existing contacts in the CRM (company names)
        let existing_company_contacts: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM contacts WHERE LOWER(company) = LOWER($1)"
        )
        .bind(&company)
        .fetch_one(pool)
        .await?;
        
        // Also check if the company name appears as a contact name
        // (in case the company was added as a contact directly)
        let existing_name_contacts: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM contacts WHERE LOWER(name) = LOWER($1)"
        )
        .bind(&company)
        .fetch_one(pool)
        .await?;
        
        let is_blacklisted = scraped_blacklisted > 0 || existing_company_contacts > 0 || existing_name_contacts > 0;
        
        if !is_blacklisted {
            filtered_companies.push(company.clone());
            tracing::info!("Company passed blacklist filter: {}", company);
        } else {
            tracing::info!("Filtered out company (blacklisted/existing): {} - scraped: {}, company_contacts: {}, name_contacts: {}", 
                company, scraped_blacklisted, existing_company_contacts, existing_name_contacts);
        }
    }
    
    Ok(filtered_companies)
}

// Step 4: Apollo Contact Enrichment
async fn enrich_company_with_apollo(
    client: &reqwest::Client,
    api_key: &str,
    company: &str,
    config: &crate::models::LeadgenConfig,
) -> Result<Vec<crate::models::CreateContact>> {
    let mut contacts = Vec::new();
    
    // Search for company on Apollo
    let search_response = client
        .post("https://api.apollo.io/v1/mixed_people/search")
        .header("Content-Type", "application/json")
        .header("Cache-Control", "no-cache")
        .header("X-Api-Key", api_key)
        .json(&serde_json::json!({
            "q_organization_name": company,
            "page": 1,
            "per_page": config.max_employees_per_company,
            "person_titles": ["CEO", "CTO", "VP", "Director", "Manager", "Head of"]
        }))
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Apollo search failed: {}", e)))?;
    
    if !search_response.status().is_success() {
        let error_text = search_response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(AppError::Internal(format!("Apollo API error: {}", error_text)));
    }
    
    let apollo_response: serde_json::Value = search_response.json().await
        .map_err(|e| AppError::Internal(format!("Failed to parse Apollo response: {}", e)))?;
    
    let people = apollo_response["people"]
        .as_array()
        .ok_or_else(|| AppError::Internal("No people array in Apollo response".to_string()))?;
    
    for person in people.iter().take(config.max_employees_per_company as usize) {
        let name = person["name"].as_str().unwrap_or("").to_string();
        let title = person["title"].as_str().map(|s| s.to_string());
        let email = person["email"].as_str().map(|s| s.to_string());
        let linkedin = person["linkedin_url"].as_str().map(|s| s.to_string());
        
        if !name.is_empty() {
            let contact = crate::models::CreateContact {
                name,
                company: Some(company.to_string()),
                email,
                phone: None, // Apollo might not always provide phone
                linkedin,
                website: None,
                position: title,
                last_contact_date: None,
                next_contact_date: None,
                contact_frequency: Some(30), // Default 30-day follow-up
                notes: Some(format!("Generated via Apollo API leadgen on {}", 
                    chrono::Utc::now().format("%Y-%m-%d"))),
                custom_fields: Some(serde_json::json!({
                    "source_session": "apollo_leadgen",
                    "apollo_person_id": person["id"]
                })),
                source: Some("leadgen".to_string()),
            };
            
            contacts.push(contact);
        }
    }
    
    Ok(contacts)
}

pub async fn cancel_leadgen(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    // Cancel the most recent running session
    let cancelled = sqlx::query(
        "UPDATE leadgen_sessions SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP WHERE status = 'running'"
    )
    .execute(&state.db)
    .await?;
    
    if cancelled.rows_affected() > 0 {
        Ok(Json(serde_json::json!({"success": true, "message": "Lead generation cancelled"})))
    } else {
        Ok(Json(serde_json::json!({"success": false, "message": "No active lead generation to cancel"})))
    }
}

pub async fn get_leadgen_progress(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    // Get the most recent session
    let session = sqlx::query_as::<_, LeadgenSession>(
        "SELECT * FROM leadgen_sessions ORDER BY created_at DESC LIMIT 1"
    )
    .fetch_optional(&state.db)
    .await?;
    
    match session {
        Some(session) => Ok(Json(serde_json::json!({
            "progress": session.progress,
            "status": session.status,
            "message": session.message,
            "session_id": session.id
        }))),
        None => Ok(Json(serde_json::json!({
            "progress": 0, 
            "status": "idle",
            "message": "No lead generation sessions found"
        })))
    }
}

pub async fn get_leadgen_sessions(
    State(state): State<AppState>,
) -> Result<Json<Vec<LeadgenSession>>> {
    let sessions = sqlx::query_as::<_, LeadgenSession>(
        "SELECT * FROM leadgen_sessions ORDER BY created_at DESC LIMIT 20"
    )
    .fetch_all(&state.db)
    .await?;
    
    Ok(Json(sessions))
}

// Web scraper handlers (placeholders)
pub async fn get_scraper_config(
    State(_state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement scraper config retrieval
    Ok(Json(serde_json::json!({"placeholder": true})))
}

pub async fn update_scraper_config(
    State(_state): State<AppState>,
    Json(_config): Json<UpdateScraperConfig>,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement scraper config update
    Ok(Json(serde_json::json!({"success": true})))
}

pub async fn get_scraped_customers_count(
    State(_state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement scraped customers count
    Ok(Json(serde_json::json!({"count": 0})))
}

pub async fn run_scraper(
    State(_state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement web scraper
    Ok(Json(serde_json::json!({"success": true, "message": "Scraper placeholder"})))
}

pub async fn get_scraper_progress(
    State(_state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement scraper progress tracking
    Ok(Json(serde_json::json!({"progress": 0, "status": "idle"})))
}