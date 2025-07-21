# Book of Business - AI-Powered CRM & Lead Generation

> **⚠️ Alpha Software**: This is early-stage software built as a full-stack technology demonstration. While fully functional, expect bugs and breaking changes.

A modern, lightweight CRM system with integrated AI-powered lead generation capabilities. Built as a comprehensive tech demo showcasing full-stack development with modern web technologies.

![Book of Business Screenshot](https://via.placeholder.com/800x400/3b82f6/ffffff?text=Book+of+Business+CRM)

## Features

### Contact Management
- **Complete CRUD operations** for contacts with custom fields
- **Smart search** across all contact data including tags and notes
- **Bulk operations** for efficient contact management
- **Tag system** with color coding for organization
- **Communication tracking** with full history
- **File import/export** support (CSV, Excel formats)

### AI-Powered Lead Generation
- **OpenAI integration** for intelligent company discovery
- **Apollo.io API** for contact data enrichment
- **Smart filtering** to avoid existing customers and contacts
- **Automated exclusion lists** from scraped customer data
- **Progress tracking** with real-time status updates

### Customer Data Integration
- **Web scraping capabilities** using Puppeteer
- **Automated customer list updates** from existing systems
- **Data synchronization** to maintain exclusion lists
- **Progress monitoring** for scraping operations

### Modern User Experience
- **Responsive design** that works on all devices
- **Dark/Light theme support** with smooth transitions
- **Activity timeline** for comprehensive audit trails
- **Real-time updates** and progress indicators
- **Intuitive dashboard** with key metrics

## Tech Stack

### Backend
- **Node.js** + **Express.js** - Server framework
- **SQLite3** - Database (file-based, no setup required)
- **Puppeteer** - Web scraping automation
- **Multer** - File upload handling

### Frontend
- **Alpine.js** - Reactive JavaScript framework
- **Vanilla CSS** - Custom design system with CSS variables
- **Feather Icons** - Beautiful icon set
- **Modern CSS** - Grid, Flexbox, custom properties

### APIs & Integrations
- **OpenAI API** - AI-powered company generation
- **Apollo.io API** - Contact data enrichment
- **Custom scraping** - Automated data collection

### DevOps
- **Docker** - Containerized deployment
- **Docker Compose** - Multi-service orchestration

## Quick Start

### Prerequisites
- Docker & Docker Compose
- OpenAI API key (for lead generation)
- Apollo.io API key (for contact enrichment)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/undergroundpost/docker-bob.git
   cd docker-bob
   ```

2. **Start with Docker Compose**
   ```bash
   docker-compose up -d
   ```

3. **Access the application**
   ```
   http://localhost:3001
   ```

The application will automatically:
- Initialize the SQLite database
- Create necessary tables and default data
- Start the web server on port 3001

## Configuration

### API Keys Setup

Navigate to **Settings → Leadgen** to configure:

- **OpenAI API Key**: Required for AI lead generation
- **Apollo.io API Key**: Required for contact data enrichment
- **Generation Settings**: Max companies, request delays

### Environment Variables

Create a `.env` file or set environment variables:

```env
PORT=3000
NODE_ENV=production
SCRAPER_HEADLESS=true
SCRAPER_TIMEOUT=25
# SCRAPER_MAX_CUSTOMERS=1000  # Optional limit
```

## Usage Guide

### Dashboard
- View key metrics and overdue contacts
- Quick navigation to important sections
- Real-time statistics updates

### Contact Management
- **Add contacts** manually or import from files
- **Smart search** with advanced filtering
- **Bulk operations** for efficient management
- **Tag organization** with custom colors

### Lead Generation
1. Configure API keys in Settings
2. Navigate to Leadgen tab
3. Click "Generate Leads"
4. Monitor progress in real-time
5. New contacts appear automatically

### Data Import
- Supports CSV and Excel files
- Automatic field mapping
- Handles custom fields
- Import progress tracking

## API Endpoints

### Contacts
- `GET /api/contacts` - List all contacts
- `POST /api/contacts` - Create contact
- `PUT /api/contacts/:id` - Update contact
- `DELETE /api/contacts/:id` - Delete contact
- `POST /api/contacts/:id/contact` - Mark as contacted

### Lead Generation
- `GET /api/leadgen/config` - Get configuration
- `POST /api/leadgen/config` - Save configuration
- `POST /api/leadgen/run` - Start lead generation
- `GET /api/leadgen/progress` - Get progress status

### Tags & Organization
- `GET /api/tags` - List all tags
- `POST /api/tags` - Create tag
- `POST /api/contacts/:id/tags` - Add tag to contact

### Data Management
- `POST /api/upload` - Import contacts from file
- `GET /api/export` - Export contacts to CSV

## Development

### Database Schema
- **contacts** - Core contact information
- **communications** - Contact history tracking
- **tags** - Organization and categorization
- **activities** - Comprehensive audit trail
- **leadgen_sessions** - AI generation tracking
- **scraped_customers** - Exclusion list management

### Design System
- CSS custom properties for theming
- Consistent spacing and typography scales
- Component-based architecture
- Mobile-first responsive design

## Important Notes

### Alpha Software Disclaimer
- **Not production ready** - Use for testing and development only
- **Breaking changes expected** - Database schema may change
- **Limited error handling** - Some edge cases may not be covered
- **Security considerations** - Not hardened for production use

### API Rate Limits
- **OpenAI**: Respect your plan's rate limits
- **Apollo.io**: Monitor usage to avoid overages
- **Built-in delays**: Configurable request throttling

### Data Privacy
- **Local storage**: All data stored in local SQLite file
- **No external data sharing** except via configured APIs
- **Scraping compliance**: Ensure you have permission for target sites

## Technologies Used

- [Node.js](https://nodejs.org/) - JavaScript runtime
- [Express.js](https://expressjs.com/) - Web framework
- [Alpine.js](https://alpinejs.dev/) - Reactive framework
- [SQLite](https://www.sqlite.org/) - Database engine
- [Puppeteer](https://pptr.dev/) - Browser automation
- [OpenAI API](https://openai.com/api/) - AI services
- [Apollo.io API](https://www.apollo.io/) - Contact data
- [Docker](https://www.docker.com/) - Containerization

---

**Built as a full-stack technology demonstration. Not recommended for production use without additional security and stability improvements.**
