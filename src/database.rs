use crate::{models::*, error::*};
use sqlx::PgPool;
use chrono::{DateTime, Utc, NaiveDate};

// Contact database operations
pub async fn get_contacts_from_db(
    pool: &PgPool,
    query: &ContactsQuery,
) -> Result<Vec<Contact>> {
    let mut sql = "SELECT * FROM contacts WHERE 1=1".to_string();
    let mut params = Vec::new();
    let mut param_count = 0;

    if let Some(search) = &query.search {
        param_count += 1;
        sql.push_str(&format!(" AND (name ILIKE ${} OR company ILIKE ${} OR email ILIKE ${})", param_count, param_count, param_count));
        params.push(format!("%{}%", search));
    }

    if let Some(company) = &query.company {
        param_count += 1;
        sql.push_str(&format!(" AND company ILIKE ${}", param_count));
        params.push(format!("%{}%", company));
    }

    if let Some(source) = &query.source {
        param_count += 1;
        sql.push_str(&format!(" AND source = ${}", param_count));
        params.push(source.clone());
    }

    if let Some(tag) = &query.tag {
        sql.push_str(" AND id IN (SELECT contact_id FROM contact_tags ct JOIN tags t ON ct.tag_id = t.id WHERE t.name = $");
        param_count += 1;
        sql.push_str(&param_count.to_string());
        sql.push(')');
        params.push(tag.clone());
    }

    sql.push_str(" ORDER BY created_at DESC");

    if let Some(limit) = query.limit {
        param_count += 1;
        sql.push_str(&format!(" LIMIT ${}", param_count));
        params.push(limit.to_string());
    }

    if let Some(offset) = query.offset {
        param_count += 1;
        sql.push_str(&format!(" OFFSET ${}", param_count));
        params.push(offset.to_string());
    }

    let mut query_builder = sqlx::query_as::<_, Contact>(&sql);
    for param in params {
        query_builder = query_builder.bind(param);
    }

    let contacts = query_builder.fetch_all(pool).await?;
    Ok(contacts)
}

pub async fn get_contact_by_id(pool: &PgPool, id: i32) -> Result<Option<Contact>> {
    let contact = sqlx::query_as::<_, Contact>(
        "SELECT * FROM contacts WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(contact)
}

pub async fn create_contact_in_db(pool: &PgPool, contact: &CreateContact) -> Result<Contact> {
    let row = sqlx::query_as::<_, Contact>(
        r#"
        INSERT INTO contacts (name, company, email, phone, linkedin, website, position, 
                            last_contact_date, next_contact_date, contact_frequency, notes, 
                            custom_fields, source)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
        "#
    )
    .bind(&contact.name)
    .bind(&contact.company)
    .bind(&contact.email)
    .bind(&contact.phone)
    .bind(&contact.linkedin)
    .bind(&contact.website)
    .bind(&contact.position)
    .bind(&contact.last_contact_date)
    .bind(&contact.next_contact_date)
    .bind(&contact.contact_frequency)
    .bind(&contact.notes)
    .bind(&contact.custom_fields)
    .bind(&contact.source)
    .fetch_one(pool)
    .await?;

    Ok(row)
}

pub async fn update_contact_in_db(
    pool: &PgPool,
    id: i32,
    contact: &UpdateContact,
) -> Result<Option<Contact>> {
    // For now, use a simpler approach by fetching first, then updating
    let existing = match get_contact_by_id(pool, id).await? {
        Some(c) => c,
        None => return Ok(None),
    };

    let updated = sqlx::query_as::<_, Contact>(
        r#"
        UPDATE contacts SET 
            name = COALESCE($2, name),
            company = COALESCE($3, company),
            email = COALESCE($4, email),
            phone = COALESCE($5, phone),
            linkedin = COALESCE($6, linkedin),
            website = COALESCE($7, website),
            position = COALESCE($8, position),
            last_contact_date = COALESCE($9, last_contact_date),
            next_contact_date = COALESCE($10, next_contact_date),
            contact_frequency = COALESCE($11, contact_frequency),
            notes = COALESCE($12, notes),
            custom_fields = COALESCE($13, custom_fields),
            source = COALESCE($14, source),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
        "#
    )
    .bind(id)
    .bind(&contact.name)
    .bind(&contact.company)
    .bind(&contact.email)
    .bind(&contact.phone)
    .bind(&contact.linkedin)
    .bind(&contact.website)
    .bind(&contact.position)
    .bind(&contact.last_contact_date)
    .bind(&contact.next_contact_date)
    .bind(&contact.contact_frequency)
    .bind(&contact.notes)
    .bind(&contact.custom_fields)
    .bind(&contact.source)
    .fetch_optional(pool)
    .await?;

    Ok(updated)
}

pub async fn delete_contact_from_db(pool: &PgPool, id: i32) -> Result<bool> {
    let result = sqlx::query("DELETE FROM contacts WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;

    Ok(result.rows_affected() > 0)
}

// Tag database operations
pub async fn get_tags_from_db(pool: &PgPool) -> Result<Vec<Tag>> {
    let tags = sqlx::query_as::<_, Tag>("SELECT * FROM tags ORDER BY name")
        .fetch_all(pool)
        .await?;

    Ok(tags)
}

pub async fn create_tag_in_db(pool: &PgPool, tag: &CreateTag) -> Result<Tag> {
    let color = tag.color.as_deref().unwrap_or("#3b82f6");
    
    let row = sqlx::query_as::<_, Tag>(
        "INSERT INTO tags (name, color) VALUES ($1, $2) RETURNING *"
    )
    .bind(&tag.name)
    .bind(color)
    .fetch_one(pool)
    .await?;

    Ok(row)
}

// Activity database operations
pub async fn get_activities_from_db(pool: &PgPool, limit: Option<i64>) -> Result<Vec<Activity>> {
    let limit = limit.unwrap_or(50);
    
    let activities = sqlx::query_as::<_, Activity>(
        "SELECT * FROM activities ORDER BY created_at DESC LIMIT $1"
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(activities)
}

pub async fn create_activity_in_db(pool: &PgPool, activity: &CreateActivity) -> Result<Activity> {
    let row = sqlx::query_as::<_, Activity>(
        "INSERT INTO activities (contact_id, type, description, metadata) VALUES ($1, $2, $3, $4) RETURNING *"
    )
    .bind(&activity.contact_id)
    .bind(&activity.r#type)
    .bind(&activity.description)
    .bind(&activity.metadata)
    .fetch_one(pool)
    .await?;

    Ok(row)
}

// Communication database operations
pub async fn create_communication_in_db(
    pool: &PgPool,
    communication: &CreateCommunication,
) -> Result<Communication> {
    let row = sqlx::query_as::<_, Communication>(
        "INSERT INTO communications (contact_id, date, method, notes) VALUES ($1, $2, $3, $4) RETURNING *"
    )
    .bind(communication.contact_id)
    .bind(communication.date)
    .bind(&communication.method)
    .bind(&communication.notes)
    .fetch_one(pool)
    .await?;

    Ok(row)
}

// Dashboard statistics
pub async fn get_dashboard_stats(pool: &PgPool) -> Result<DashboardStats> {
    // Get total contacts
    let total_contacts: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM contacts")
        .fetch_one(pool)
        .await?;

    // Get contacts this month
    let contacts_this_month: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM contacts WHERE created_at >= date_trunc('month', CURRENT_DATE)"
    )
    .fetch_one(pool)
    .await?;

    // Get contacts needing follow-up (overdue)
    let contacts_need_follow_up: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM contacts WHERE next_contact_date < CURRENT_DATE"
    )
    .fetch_one(pool)
    .await?;

    // Get upcoming contacts (next 7 days)
    let upcoming_contacts: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM contacts WHERE next_contact_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'"
    )
    .fetch_one(pool)
    .await?;

    // Get weekly communications (last 7 days)
    let weekly_communications: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM communications WHERE date >= CURRENT_DATE - INTERVAL '7 days'"
    )
    .fetch_one(pool)
    .await?;

    // Get apollo leads (contacts from apollo source)
    let apollo_leads: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM contacts WHERE source = 'apollo' OR source = 'leadgen'"
    )
    .fetch_one(pool)
    .await?;

    // Get recent activities
    let recent_activities = get_activities_from_db(pool, Some(10)).await?;

    // Get top sources
    let top_sources: Vec<SourceCount> = sqlx::query_as(
        "SELECT source, COUNT(*) as count FROM contacts WHERE source IS NOT NULL GROUP BY source ORDER BY count DESC LIMIT 5"
    )
    .fetch_all(pool)
    .await?;

    // Get contact frequency breakdown
    let contact_frequency_breakdown: Vec<FrequencyCount> = sqlx::query_as(
        "SELECT contact_frequency as frequency, COUNT(*) as count FROM contacts WHERE contact_frequency IS NOT NULL GROUP BY contact_frequency ORDER BY frequency"
    )
    .fetch_all(pool)
    .await?;

    Ok(DashboardStats {
        total_contacts,
        contacts_this_month,
        contacts_need_follow_up,
        upcoming_contacts,
        weekly_communications,
        apollo_leads,
        recent_activities,
        top_sources,
        contact_frequency_breakdown,
    })
}

// Leadgen configuration operations
pub async fn get_leadgen_config_from_db(pool: &PgPool) -> Result<crate::models::LeadgenConfig> {
    let config = sqlx::query_as::<_, crate::models::LeadgenConfig>(
        "SELECT * FROM leadgen_config ORDER BY id DESC LIMIT 1"
    )
    .fetch_optional(pool)
    .await?;
    
    match config {
        Some(config) => Ok(config),
        None => {
            // Create default config if none exists
            let default_config = sqlx::query_as::<_, crate::models::LeadgenConfig>(
                r#"
                INSERT INTO leadgen_config (openai_model, max_companies, max_employees_per_company, request_delay)
                VALUES ('gpt-4', 50, 25, 1.2)
                RETURNING *
                "#
            )
            .fetch_one(pool)
            .await?;
            Ok(default_config)
        }
    }
}

// Leadgen session operations
pub async fn create_leadgen_session(pool: &PgPool) -> Result<crate::models::LeadgenSession> {
    let session = sqlx::query_as::<_, crate::models::LeadgenSession>(
        "INSERT INTO leadgen_sessions (status, progress, message) VALUES ('running', 0, 'Initializing...') RETURNING *"
    )
    .fetch_one(pool)
    .await?;
    
    Ok(session)
}

pub async fn update_leadgen_session_progress(
    pool: &PgPool, 
    session_id: i32, 
    progress: i32, 
    message: &str
) -> Result<()> {
    sqlx::query(
        "UPDATE leadgen_sessions SET progress = $2, message = $3 WHERE id = $1"
    )
    .bind(session_id)
    .bind(progress)
    .bind(message)
    .execute(pool)
    .await?;
    
    Ok(())
}

pub async fn update_leadgen_session_error(
    pool: &PgPool,
    session_id: i32,
    error: &str
) -> Result<()> {
    sqlx::query(
        "UPDATE leadgen_sessions SET status = 'failed', error = $2, completed_at = CURRENT_TIMESTAMP WHERE id = $1"
    )
    .bind(session_id)
    .bind(error)
    .execute(pool)
    .await?;
    
    Ok(())
}

pub async fn complete_leadgen_session(
    pool: &PgPool,
    session_id: i32,
    companies_generated: i32,
    contacts_generated: i32
) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE leadgen_sessions 
        SET status = 'completed', 
            progress = 100, 
            message = 'Lead generation completed successfully',
            companies_generated = $2,
            contacts_generated = $3,
            completed_at = CURRENT_TIMESTAMP
        WHERE id = $1
        "#
    )
    .bind(session_id)
    .bind(companies_generated)
    .bind(contacts_generated)
    .execute(pool)
    .await?;
    
    Ok(())
}