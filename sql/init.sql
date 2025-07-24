-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create contacts table
CREATE TABLE contacts (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    company TEXT,
    email TEXT,
    phone TEXT,
    linkedin TEXT,
    website TEXT,
    position TEXT,
    last_contact_date DATE,
    next_contact_date DATE,
    contact_frequency INTEGER DEFAULT 7,
    notes TEXT,
    custom_fields JSONB,
    source TEXT DEFAULT 'manual',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Vector embedding for future RAG
    embedding vector(1536)
);

-- Create indexes for performance
CREATE INDEX idx_contacts_name ON contacts(name);
CREATE INDEX idx_contacts_company ON contacts(company);
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_source ON contacts(source);
CREATE INDEX idx_contacts_next_contact ON contacts(next_contact_date);
CREATE INDEX idx_contacts_created_at ON contacts(created_at);
-- Vector similarity search index
CREATE INDEX idx_contacts_embedding ON contacts USING ivfflat (embedding vector_cosine_ops);

-- Create tags table
CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    color TEXT DEFAULT '#3b82f6',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create contact_tags junction table
CREATE TABLE contact_tags (
    id SERIAL PRIMARY KEY,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(contact_id, tag_id)
);

-- Create activities table
CREATE TABLE activities (
    id SERIAL PRIMARY KEY,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create communications table
CREATE TABLE communications (
    id SERIAL PRIMARY KEY,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    method TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create scraped_customers table
CREATE TABLE scraped_customers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    source TEXT DEFAULT 'precision_expedited',
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    scrape_session_id TEXT
);

-- Create leadgen_sessions table
CREATE TABLE leadgen_sessions (
    id SERIAL PRIMARY KEY,
    status TEXT DEFAULT 'running',
    progress INTEGER DEFAULT 0,
    message TEXT,
    companies_generated INTEGER DEFAULT 0,
    contacts_generated INTEGER DEFAULT 0,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Create leadgen_config table
CREATE TABLE leadgen_config (
    id SERIAL PRIMARY KEY,
    openai_api_key TEXT,
    openai_model TEXT DEFAULT 'gpt-4',
    openai_prompt TEXT,
    apollo_api_key TEXT,
    max_companies INTEGER DEFAULT 50,
    max_employees_per_company INTEGER DEFAULT 25,
    request_delay REAL DEFAULT 1.2,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create scraper_config table
CREATE TABLE scraper_config (
    id SERIAL PRIMARY KEY,
    login_url TEXT NOT NULL,
    customers_url TEXT,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    headless BOOLEAN DEFAULT true,
    timeout INTEGER DEFAULT 15,
    max_customers INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create metadata table
CREATE TABLE metadata (
    id SERIAL PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create files table for object storage metadata
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_name TEXT NOT NULL,
    storage_key TEXT UNIQUE NOT NULL,
    content_type TEXT DEFAULT 'application/octet-stream',
    size BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_activities_contact_id ON activities(contact_id);
CREATE INDEX idx_activities_created_at ON activities(created_at);
CREATE INDEX idx_communications_contact_id ON communications(contact_id);
CREATE INDEX idx_communications_date ON communications(date);
CREATE INDEX idx_scraped_customers_session ON scraped_customers(scrape_session_id);
CREATE INDEX idx_leadgen_sessions_status ON leadgen_sessions(status);
CREATE INDEX idx_files_storage_key ON files(storage_key);
CREATE INDEX idx_files_created_at ON files(created_at);

-- Create trigger to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to relevant tables
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leadgen_config_updated_at BEFORE UPDATE ON leadgen_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scraper_config_updated_at BEFORE UPDATE ON scraper_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_metadata_updated_at BEFORE UPDATE ON metadata
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();