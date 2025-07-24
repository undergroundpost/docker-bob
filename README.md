# Book of Business - CRM & Lead Generation

**Alpha Software Disclaimer**: This software is in active development. Features may change and database schema updates may require data migration. Use in production environments at your own risk.

A high-performance CRM system with integrated AI-powered lead generation capabilities. Built with Rust for maximum performance, safety, and scalability.

![Book of Business Screenshot](images/light-dashboard.png)

## Features

### Contact Management
- Complete CRUD operations with custom fields support
- Advanced search and filtering capabilities
- Bulk operations for efficient contact management
- Tag system with color coding for organization
- Communication tracking with full history
- File upload and CSV export functionality

### AI Lead Generation
- OpenAI integration for intelligent company discovery
- Apollo.io API for contact data enrichment
- Smart filtering against existing customers and contacts
- Automated blacklist management from scraped data
- Real-time progress tracking with session management
- Configurable generation parameters and rate limiting

### Data Integration
- Web scraping capabilities for customer data
- Automated exclusion list maintenance
- File import/export with multiple format support
- Object storage for uploaded files

### User Interface
- Responsive design for all devices
- Multiple theme support (dark, light, forest, tokyo)
- Activity timeline for comprehensive audit trails
- Real-time dashboard with key metrics
- Intuitive navigation and controls

## Architecture

### Backend Technology
The system is built with Rust and Axum for several key advantages:

- **Performance**: Rust provides near-C performance with 10x faster request handling than Node.js
- **Memory Safety**: Zero-cost abstractions prevent memory leaks and crashes
- **Concurrency**: Excellent async performance for handling 100+ concurrent users  
- **Type Safety**: Compile-time error checking prevents runtime failures
- **Small Footprint**: Docker images under 20MB vs 500MB+ for Node.js applications

### Database & Storage
- **PostgreSQL with pgvector**: Production-grade database with vector similarity search
- **Redis**: Caching and session management
- **MinIO**: S3-compatible object storage for file uploads
- **Full ACID compliance** with proper transaction handling

### Infrastructure
- **Docker Compose**: Multi-service orchestration with health checks
- **Structured logging**: Request tracing and error monitoring
- **Security headers**: Protection against common web vulnerabilities
- **Input validation**: SQL injection and XSS prevention

## Quick Start

### Prerequisites
- Docker and Docker Compose
- OpenAI API key (for lead generation)
- Apollo.io API key (for contact enrichment)

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/undergroundpost/docker-bob.git
   cd docker-bob
   ```

2. Start with Docker Compose
   ```bash
   docker-compose up -d
   ```

3. Access the application at `http://localhost:3000`

The application automatically initializes all required services and databases.

### API Key Configuration

Navigate to Settings → Leadgen to configure:
- OpenAI API Key for AI company generation
- Apollo.io API Key for contact data enrichment
- Generation parameters (max companies, request delays, prompts)

## Core API Endpoints

### Contact Management
- `GET /api/contacts` - List contacts with filtering
- `POST /api/contacts` - Create new contact
- `PUT /api/contacts/:id` - Update contact
- `DELETE /api/contacts/:id` - Delete contact
- `POST /api/contacts/bulk-delete` - Bulk deletion
- `POST /api/contacts/bulk-contact` - Bulk communication logging

### Lead Generation
- `GET /api/leadgen/config` - Configuration management
- `POST /api/leadgen/run` - Start AI workflow
- `GET /api/leadgen/progress` - Real-time progress
- `GET /api/leadgen/sessions` - Session history

### Data Operations
- `POST /api/upload` - File import
- `GET /api/export` - CSV export
- `GET /api/dashboard` - Metrics and analytics
- `GET /api/activities` - Activity timeline

## Lead Generation Workflow

The AI lead generation follows a four-step process:

1. **Company Generation**: OpenAI generates target company lists based on configurable prompts
2. **Company Verification**: Web-based validation to ensure companies exist
3. **Blacklist Filtering**: Automatic exclusion of existing customers and scraped data
4. **Contact Enrichment**: Apollo.io API enriches companies with contact information

All steps include progress tracking, error handling, and session management.

## Database Schema

Core tables include:
- `contacts` - Contact information with vector embeddings for AI search
- `tags` and `contact_tags` - Organization and categorization
- `activities` - Comprehensive audit trail
- `communications` - Contact interaction history
- `leadgen_sessions` - AI generation tracking
- `scraped_customers` - Blacklist data
- `files` - Object storage metadata

## Development

### Local Development
```bash
# Install Rust
curl --proto='=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Start backing services
docker-compose up -d postgres redis minio

# Run application
export DATABASE_URL=postgresql://crm_user:crm_password@localhost:5432/crm
cargo run
```

### Building
```bash
# Release build
cargo build --release

# Docker image
docker build -t crm-rust .
```

## Technology Stack

- **Rust** - Systems programming language for performance and safety
- **Axum** - Modern async web framework
- **PostgreSQL + pgvector** - Relational database with vector search
- **Redis** - Caching and session store
- **MinIO** - Object storage
- **Alpine.js** - Reactive frontend framework
- **Docker** - Containerization platform

Built for production with enterprise-grade performance, security, and scalability.