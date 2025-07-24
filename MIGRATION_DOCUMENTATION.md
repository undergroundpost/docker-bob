# CRM Migration Documentation
## Current System Analysis for Rust + Axum + PostgreSQL Migration

*Generated: 2025-01-24*

## Current Tech Stack
- **Backend**: Node.js + Express.js
- **Database**: SQLite with 9 tables
- **Frontend**: Vanilla JS + Alpine.js + CSS
- **File Storage**: Local filesystem (uploads/)
- **Deployment**: Likely Docker-ready

## API Endpoints Inventory

### Contacts Management
- `GET /api/contacts` - List all contacts with filtering/search
- `GET /api/contacts/:id` - Get single contact
- `POST /api/contacts` - Create new contact
- `PUT /api/contacts/:id` - Update contact
- `DELETE /api/contacts/:id` - Delete contact
- `POST /api/contacts/:id/contact` - Log communication with contact
- `POST /api/contacts/bulk-delete` - Delete multiple contacts
- `POST /api/contacts/bulk-contact` - Bulk communication logging

### Tags System
- `GET /api/tags` - List all tags
- `POST /api/tags` - Create tag
- `PUT /api/tags/:id` - Update tag
- `DELETE /api/tags/:id` - Delete tag
- `POST /api/contacts/:id/tags` - Add tag to contact
- `DELETE /api/contacts/:id/tags/:tagId` - Remove tag from contact
- `GET /api/contacts/:id/tags` - Get contact's tags

### Activities/Timeline
- `GET /api/activities` - Get activity timeline
- `POST /api/activities` - Create activity

### Communications
- `PUT /api/communications/:id` - Update communication
- `DELETE /api/communications/:id` - Delete communication

### Dashboard & Analytics
- `GET /api/dashboard` - Dashboard metrics and stats

### Web Scraping System
- `GET /api/scraper/config` - Get scraper configuration
- `POST /api/scraper/config` - Update scraper config
- `GET /api/scraper/customers/count` - Get scraped customers count
- `POST /api/scraper/run` - Run web scraper
- `GET /api/scraper/progress` - Get scraper progress

### Lead Generation (AI/LLM Integration)
- `GET /api/leadgen/config` - Get lead generation config
- `POST /api/leadgen/config` - Update lead generation config
- `POST /api/leadgen/run` - Run AI lead generation
- `POST /api/leadgen/cancel` - Cancel lead generation
- `GET /api/leadgen/progress` - Get lead generation progress
- `GET /api/leadgen/sessions` - Get lead generation sessions

### File Management
- `POST /api/upload` - Upload files (supports Excel/CSV import)
- `GET /api/export` - Export contacts as CSV

### System
- `GET /api/metadata` - Get system metadata
- `GET /` - Serve main application

## Database Schema

### Core Tables

#### contacts
- **Purpose**: Main contact/customer database
- **Columns**: id, name, company, email, phone, linkedin, website, position, contact_frequency, notes, custom_fields, source, timestamps
- **Key Features**: Custom fields (JSON), contact frequency tracking, source attribution

#### tags  
- **Purpose**: Contact categorization system
- **Columns**: id, name, color, created_at
- **Relationships**: Many-to-many with contacts via contact_tags

#### contact_tags
- **Purpose**: Junction table for contact-tag relationships
- **Columns**: id, contact_id, tag_id, created_at
- **Constraints**: Unique(contact_id, tag_id)

#### activities
- **Purpose**: Timeline/activity feed
- **Columns**: id, contact_id, type, description, metadata (JSON), created_at
- **Relationships**: Belongs to contact

#### communications
- **Purpose**: Communication history tracking
- **Columns**: id, contact_id, date, method, notes, created_at
- **Relationships**: Belongs to contact

### Automation/AI Tables

#### leadgen_config
- **Purpose**: AI lead generation configuration
- **Columns**: id, openai_api_key, openai_model, apollo_api_key, max_companies, request_delay, openai_prompt, max_employees_per_company, timestamps
- **Security Note**: Contains API keys (needs encryption in migration)

#### leadgen_sessions
- **Purpose**: Track AI lead generation runs
- **Columns**: id, status, progress, message, companies_generated, contacts_generated, error, timestamps

#### scraper_config
- **Purpose**: Web scraper configuration
- **Columns**: id, login_url, customers_url, username, password, headless, timeout, max_customers, timestamps
- **Security Note**: Contains credentials (needs encryption)

#### scraped_customers
- **Purpose**: Results from web scraping
- **Columns**: id, name, source, scraped_at, scrape_session_id

#### metadata
- **Purpose**: System configuration/state
- **Columns**: id, key (unique), value, updated_at

## Key Features Requiring Migration

### 1. File Upload System
- **Current**: Multer + local filesystem
- **Files**: Excel/CSV import, general file uploads
- **Migration**: Need object storage (MinIO/S3) + file processing

### 2. AI/LLM Integration
- **Current**: OpenAI API for lead generation
- **Features**: Custom prompts, batch processing, progress tracking
- **Migration**: Keep OpenAI integration, add vector storage prep

### 3. Web Scraping
- **Current**: Puppeteer-based scraping with session management
- **Features**: Login automation, customer data extraction
- **Migration**: Keep Puppeteer or migrate to Rust alternatives

### 4. Import/Export
- **Current**: Excel/CSV processing with XLSX library
- **Features**: Contact import, data export, bulk operations
- **Migration**: Rust CSV libraries + Excel processing

### 5. Security Features (Recently Added)
- **Headers**: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy
- **Validation**: Input validation middleware, SQL injection protection
- **Error Handling**: Global error handler, async route wrapper
- **Migration**: Implement in Axum middleware

## Frontend Architecture

### Pages/Views
- **Dashboard**: Metrics, activity feed, quick stats
- **Contacts**: List, search, CRUD operations, tagging
- **Timeline**: Activity chronological view
- **Settings**: Configuration panels for integrations

### Key UI Components
- **Search**: Real-time contact filtering
- **Tags**: Color-coded contact categorization
- **File Upload**: Drag-drop interface for imports
- **Progress Tracking**: Real-time updates for long-running operations
- **Modals**: Contact editing, configuration forms

### CSS Architecture
- **Files**: base.css, themes.css, components.css, layout.css (112KB total)
- **System**: Design tokens, themes (dark/light/forest/tokyo), glass morphism
- **Migration**: CSS can be reused with minimal changes

## Critical Migration Considerations

### 1. Data Migration Strategy
```sql
-- Export current data
sqlite3 contacts.db ".dump" > current_data.sql

-- Transform for PostgreSQL:
-- - Change AUTOINCREMENT to SERIAL
-- - Update SQLite-specific syntax
-- - Add vector columns for future RAG
```

### 2. API Compatibility
- Maintain exact same endpoint structure
- Keep JSON response formats identical
- Preserve query parameters and filters

### 3. File Storage Migration
- Move from local uploads/ to object storage
- Maintain file access patterns
- Add CDN support for global access

### 4. Security Enhancements
- Encrypt API keys in database
- Add proper authentication/authorization
- Implement rate limiting
- Add audit logging

### 5. Performance Improvements
- Connection pooling for PostgreSQL
- Async all the way down
- Prepared statements
- Vector indexing ready

## Migration Priority Order

### Phase 1: Core Infrastructure
1. Set up Rust + Axum project structure
2. PostgreSQL + pgvector setup
3. Database migration scripts
4. Basic CRUD operations

### Phase 2: Feature Parity
1. Contact management APIs
2. Tags and categorization
3. Activities and timeline
4. File upload system

### Phase 3: Advanced Features
1. AI/LLM integration
2. Web scraping system
3. Import/export functionality
4. Dashboard and analytics

### Phase 4: Enhancements
1. RAG preparation (vector storage)
2. Real-time updates (WebSockets)
3. Enhanced security
4. Performance optimizations

## Dependencies for Rust Migration

### Core Framework
- `axum` - Web framework
- `tokio` - Async runtime
- `serde` - JSON serialization
- `sqlx` - Database toolkit

### Database
- `sqlx` with PostgreSQL driver
- `pgvector` extension for future RAG

### File Processing
- `csv` - CSV processing
- `calamine` - Excel file reading
- `tokio-util` - File streaming

### External APIs
- `reqwest` - HTTP client for OpenAI/Apollo
- `serde_json` - JSON handling

### Scraping (if keeping)
- `headless_chrome` or `fantoccini` - Browser automation
- Or migrate to API-based approaches

## Next Steps

1. **Export current SQLite data** for migration testing
2. **Set up Rust project** with Axum and PostgreSQL
3. **Create PostgreSQL schema** with vector support
4. **Implement core APIs** maintaining exact compatibility
5. **Migrate file storage** to object storage
6. **Test feature parity** before cutover

---

*This documentation serves as the blueprint for migrating the current Node.js/SQLite CRM to a Rust/Axum/PostgreSQL stack while maintaining full feature compatibility and preparing for AI/RAG enhancements.*