const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const xlsx = require('xlsx');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Create uploads directory
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Initialize SQLite database
const db = new sqlite3.Database('./data/contacts.db', (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

function initializeDatabase() {
    // Create contacts table
    db.run(`
        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            company TEXT,
            email TEXT,
            phone TEXT,
            linkedin TEXT,
            position TEXT,
            last_contact_date TEXT,
            next_contact_date TEXT,
            contact_frequency INTEGER DEFAULT 7,
            notes TEXT,
            custom_fields TEXT,
            source TEXT DEFAULT 'manual',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Error creating contacts table:', err);
        } else {
            // Add new columns if they don't exist
            const newColumns = [
                'linkedin TEXT',
                'source TEXT DEFAULT "manual"'
            ];
            
            newColumns.forEach(column => {
                const columnName = column.split(' ')[0];
                db.run(`ALTER TABLE contacts ADD COLUMN ${column}`, (err) => {
                    if (err && !err.message.includes('duplicate column')) {
                        console.error(`Error adding ${columnName} column:`, err);
                    } else if (!err) {
                        console.log(`Added ${columnName} column to contacts table`);
                    }
                });
            });
        }
    });

    // Create communications table
    db.run(`
        CREATE TABLE IF NOT EXISTS communications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_id INTEGER,
            date TEXT NOT NULL,
            method TEXT NOT NULL,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (contact_id) REFERENCES contacts (id)
        )
    `);

    // Create tags table
    db.run(`
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            color TEXT DEFAULT '#3b82f6',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Error creating tags table:', err);
        } else {
            // Insert default CRM tags
            const defaultTags = [
                { name: 'Hot Prospect', color: '#ef4444' },
                { name: 'Customer', color: '#10b981' },
                { name: 'Partner', color: '#3b82f6' },
                { name: 'Referral Source', color: '#f59e0b' },
                { name: 'Cold Lead', color: '#6b7280' },
                { name: 'Vendor', color: '#8b5cf6' },
                { name: 'VIP', color: '#f97316' }
            ];

            defaultTags.forEach(tag => {
                db.run('INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)', [tag.name, tag.color]);
            });
        }
    });

    // Create contact_tags junction table
    db.run(`
        CREATE TABLE IF NOT EXISTS contact_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_id INTEGER,
            tag_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (contact_id) REFERENCES contacts (id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
            UNIQUE(contact_id, tag_id)
        )
    `);

    // Create activities table
    db.run(`
        CREATE TABLE IF NOT EXISTS activities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_id INTEGER,
            type TEXT NOT NULL,
            description TEXT NOT NULL,
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (contact_id) REFERENCES contacts (id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) {
            console.error('Error creating activities table:', err);
        } else {
            console.log('Activities table ready');
        }
    });

    // Create scraper_config table
    db.run(`
        CREATE TABLE IF NOT EXISTS scraper_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            login_url TEXT NOT NULL,
            customers_url TEXT,
            username TEXT NOT NULL,
            password TEXT NOT NULL,
            headless INTEGER DEFAULT 1,
            timeout INTEGER DEFAULT 15,
            max_customers INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create scraped_customers table
    db.run(`
        CREATE TABLE IF NOT EXISTS scraped_customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            source TEXT DEFAULT 'precision_expedited',
            scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            scrape_session_id TEXT
        )
    `);

    // Create leadgen_config table
    db.run(`
        CREATE TABLE IF NOT EXISTS leadgen_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            openai_api_key TEXT,
            openai_model TEXT DEFAULT 'gpt-4',
            apollo_api_key TEXT,
            max_companies INTEGER DEFAULT 50,
            request_delay REAL DEFAULT 1.2,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Error creating leadgen_config table:', err);
        } else {
            console.log('Leadgen config table ready');
        }
    });

    // Create leadgen_sessions table
    db.run(`
        CREATE TABLE IF NOT EXISTS leadgen_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            status TEXT DEFAULT 'running',
            progress INTEGER DEFAULT 0,
            message TEXT,
            companies_generated INTEGER DEFAULT 0,
            contacts_generated INTEGER DEFAULT 0,
            error TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME
        )
    `, (err) => {
        if (err) {
            console.error('Error creating leadgen_sessions table:', err);
        } else {
            console.log('Leadgen sessions table ready');
        }
    });
}

// Helper function to create activity
function createActivity(contactId, type, description, metadata = null) {
    const stmt = db.prepare('INSERT INTO activities (contact_id, type, description, metadata) VALUES (?, ?, ?, ?)');
    stmt.run([contactId, type, description, JSON.stringify(metadata)], function(err) {
        if (err) {
            console.error('Error creating activity:', err);
        }
    });
    stmt.finalize();
}

// Target job titles for Apollo search
const TARGET_TITLES = [
    "Mechanical Engineer", "Senior Mechanical Engineer", "Lead Mechanical Engineer", 
    "Principal Mechanical Engineer", "Mechanical Design Engineer", "Design Engineer", 
    "Product Design Engineer", "Hardware Design Engineer", "Development Engineer",
    "R&D Engineer", "Product Engineer", "Engineering Manager", "Mechanical Engineering Manager", 
    "Product Development Manager", "R&D Manager", "Design Manager", "Chief Engineer", 
    "VP Engineering", "Director of Engineering", "Buyer", "Purchaser", "Procurement Specialist", 
    "Procurement Manager", "Supply Chain Manager", "Sourcing Manager", "Product Manager", 
    "Senior Product Manager", "New Product Development", "NPI Manager", "NPI Engineer"
];

// Leadgen class for Apollo integration (keeping existing implementation...)
class LeadGenerator {
    constructor() {
        this.isRunning = false;
        this.isCancelled = false;
        this.progress = { percentage: 0, message: 'Initializing...' };
        this.sessionId = null;
        this.openai = null;
        this.config = null;
        this.maxRetries = 3;
        this.baseDelay = 1000; // 1 second base delay for exponential backoff
    }

    async initialize() {
        // Load configuration
        this.config = await this.loadConfig();
        if (!this.config.openai_api_key || !this.config.apollo_api_key) {
            throw new Error('OpenAI and Apollo API keys are required');
        }

        // Validate API key format before using it
        const apiKey = this.config.openai_api_key.trim();
        console.log('API Key format check:', {
            length: apiKey.length,
            startsWithSk: apiKey.startsWith('sk-'),
            hasInvalidChars: /[^\w\-]/.test(apiKey.replace(/^sk-/, '')),
            isMasked: apiKey.includes('•') || apiKey.includes('*')
        });

        if (apiKey.includes('•') || apiKey.includes('*')) {
            throw new Error('API key appears to be masked. Please re-enter your actual OpenAI API key.');
        }

        if (!apiKey.startsWith('sk-')) {
            throw new Error('Invalid OpenAI API key format. API key should start with "sk-".');
        }

        if (apiKey.length < 20) {
            throw new Error('OpenAI API key appears to be incomplete.');
        }

        // Initialize OpenAI with increased timeout and better error handling
        try {
            const { OpenAI } = require('openai');
            this.openai = new OpenAI({ 
                apiKey: apiKey,
                timeout: 120000, // Increased to 2 minutes
                maxRetries: 2,   // Built-in retry for the OpenAI client
                dangerouslyAllowBrowser: false
            });
            
            // Test the connection with a simple request
            console.log('Testing OpenAI connection...');
            const testResponse = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo', // Use faster model for test
                messages: [{ role: 'user', content: 'Hello' }],
                max_tokens: 5
            });
            
            console.log('OpenAI client initialized and tested successfully');
        } catch (error) {
            console.error('OpenAI initialization error details:', {
                message: error.message,
                cause: error.cause,
                type: error.constructor.name
            });
            
            if (error.cause && error.cause.message && error.cause.message.includes('not a legal HTTP header value')) {
                throw new Error('Invalid characters in OpenAI API key. Please check that your API key contains only valid characters.');
            } else if (error.message.includes('API key') || error.message.includes('Incorrect API key')) {
                throw new Error('Invalid OpenAI API key. Please check your configuration.');
            } else if (error.message.includes('Unrecognized request argument') || error.message.includes('400')) {
                throw new Error('OpenAI API configuration error. Please try again or contact support if this persists.');
            } else if (error.message.includes('network') || error.message.includes('timeout') || error.message.includes('ENOTFOUND') || error.message.includes('ECONNRESET')) {
                throw new Error('Network connection error. Please check your internet connection.');
            } else if (error.message.includes('quota') || error.message.includes('billing')) {
                throw new Error('OpenAI API quota exceeded or billing issue. Please check your OpenAI account.');
            } else {
                throw new Error(`OpenAI initialization failed: ${error.message}`);
            }
        }
    }

    async loadConfig() {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM leadgen_config ORDER BY updated_at DESC LIMIT 1', (err, config) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(config || {});
                }
            });
        });
    }

    async loadBlacklist() {
        return new Promise((resolve, reject) => {
            // Get companies from existing contacts
            db.all('SELECT DISTINCT company FROM contacts WHERE company IS NOT NULL AND company != ""', (err, contactCompanies) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // Get companies from scraped customers (Precision Expedited)
                db.all('SELECT DISTINCT name FROM scraped_customers', (err, scrapedCompanies) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    // Combine both lists and create blacklist set
                    const blacklist = new Set();
                    
                    // Add contact companies
                    contactCompanies.forEach(row => {
                        if (row.company && row.company.trim()) {
                            blacklist.add(row.company.toLowerCase().trim());
                        }
                    });
                    
                    // Add scraped customer companies
                    scrapedCompanies.forEach(row => {
                        if (row.name && row.name.trim()) {
                            blacklist.add(row.name.toLowerCase().trim());
                        }
                    });
                    
                    // Add some default large companies to avoid
                    const defaultBlacklist = [
                        'General Electric', 'Boeing', 'Apple Inc', 'Microsoft Corporation', 
                        'Amazon', 'Google', 'Meta', 'Tesla', 'Ford Motor Company', 
                        'General Motors', 'IBM', 'Intel', 'Oracle', 'Salesforce'
                    ];
                    
                    defaultBlacklist.forEach(company => {
                        blacklist.add(company.toLowerCase());
                    });
                    
                    console.log(`Dynamic blacklist created with ${blacklist.size} companies`);
                    resolve(blacklist);
                });
            });
        });
    }

    async createSession() {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare('INSERT INTO leadgen_sessions (status, message) VALUES (?, ?)');
            stmt.run(['running', 'Initializing lead generation...'], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    async updateSession(sessionId, updates) {
        return new Promise((resolve, reject) => {
            const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const values = Object.values(updates);
            values.push(sessionId);
            
            const stmt = db.prepare(`UPDATE leadgen_sessions SET ${fields} WHERE id = ?`);
            stmt.run(values, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    updateProgress(percentage, message) {
        this.progress = { percentage, message };
        console.log(`Lead Generation Progress: ${percentage}% - ${message}`);
        
        if (this.sessionId) {
            this.updateSession(this.sessionId, {
                progress: percentage,
                message: message
            }).catch(console.error);
        }
    }

    cancel() {
        console.log('Lead generation cancellation requested');
        this.isCancelled = true;
        
        if (this.sessionId) {
            this.updateSession(this.sessionId, {
                status: 'cancelled',
                message: 'Lead generation was cancelled by user',
                completed_at: new Date().toISOString()
            }).catch(console.error);
        }
    }

    // Enhanced sleep function for delays
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Retry wrapper with exponential backoff
    async retryWithBackoff(operation, operationName, maxRetries = this.maxRetries) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            if (this.isCancelled) {
                throw new Error('Operation cancelled by user');
            }
            
            try {
                console.log(`${operationName} - Attempt ${attempt}/${maxRetries}`);
                return await operation();
            } catch (error) {
                lastError = error;
                console.warn(`${operationName} failed on attempt ${attempt}:`, error.message);
                
                if (attempt === maxRetries) {
                    throw new Error(`${operationName} failed after ${maxRetries} attempts. Last error: ${error.message}`);
                }
                
                // Exponential backoff: 1s, 2s, 4s, etc.
                const delay = this.baseDelay * Math.pow(2, attempt - 1);
                console.log(`Waiting ${delay}ms before retry...`);
                await this.sleep(delay);
            }
        }
        
        throw lastError;
    }

    async verifyWebsite(url, timeout = 10000) {
        if (!url) return false;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        
        try {
            const fetch = require('node-fetch');
            const response = await fetch(url, { 
                method: 'HEAD', 
                timeout,
                redirect: 'follow'
            });
            const isValid = response.status >= 200 && response.status < 400;
            console.log(`Website verification: ${url} -> ${response.status} (${isValid ? 'VALID' : 'INVALID'})`);
            return isValid;
        } catch (error) {
            console.log(`Website verification failed: ${url} -> ${error.message}`);
            return false;
        }
    }

    isCompanyBlacklisted(companyName, blacklist) {
        if (!companyName || !blacklist) return false;
        
        const companyLower = companyName.toLowerCase().trim();
        
        // Remove common suffixes for matching
        const suffixes = ['inc', 'inc.', 'corporation', 'corp', 'corp.', 'llc', 'ltd', 'ltd.', 'limited', 'co', 'co.'];
        let companyClean = companyLower;
        
        for (const suffix of suffixes) {
            if (companyClean.endsWith(` ${suffix}`)) {
                companyClean = companyClean.slice(0, -suffix.length - 1).trim();
            }
        }
        
        return blacklist.has(companyClean) || blacklist.has(companyLower);
    }

    async generateCompaniesWithOpenAI(blacklist) {
        if (this.isCancelled) throw new Error('Operation cancelled by user');
        
        this.updateProgress(10, 'Generating companies with OpenAI...');
        
        const targetCount = this.config.max_companies + 20; // Generate extra for filtering
        
        // Simplified and more focused prompt to reduce processing time
        const prompt = `Generate a CSV list of ${targetCount} REAL US-based engineering and manufacturing companies (10-1000 employees).

Focus on: Product design consultancies, medical device manufacturers, hardware startups, aerospace suppliers, automotive suppliers, clean tech companies.

Requirements:
- REAL companies only (no fictional names)
- US-based
- Small to medium size (10-1000 employees)
- Companies that develop physical products
- Include complete website URLs

Format exactly as CSV:
company_name,company_website

Example:
IDEO,https://www.ideo.com
Frog Design,https://www.frogdesign.com

Provide exactly ${targetCount} entries in this CSV format:`;

        const generateCompanies = async () => {
            if (this.isCancelled) throw new Error('Operation cancelled by user');
            
            console.log(`Making OpenAI API request for ${targetCount} companies...`);
            const response = await this.openai.chat.completions.create({
                model: this.config.openai_model || 'gpt-4',
                messages: [
                    { role: "system", content: "You are a business research assistant. Provide only accurate, real company information in exact CSV format requested." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.1,
                max_tokens: 3000 // Increased token limit
            });
            
            return response.choices[0].message.content.trim();
        };

        try {
            const companiesCSV = await this.retryWithBackoff(generateCompanies, 'OpenAI Company Generation');
            
            console.log('OpenAI Response received, length:', companiesCSV.length);
            console.log('First 500 chars:', companiesCSV.substring(0, 500));
            
            const companies = [];

            // Parse CSV response with better error handling
            const lines = companiesCSV.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (this.isCancelled) throw new Error('Operation cancelled by user');
                
                const line = lines[i].trim();
                if (!line || line.toLowerCase().startsWith('company_name')) continue;
                
                try {
                    // Handle CSV parsing more robustly
                    const commaIndex = line.lastIndexOf(',');
                    if (commaIndex === -1) continue;
                    
                    const companyName = line.substring(0, commaIndex).trim().replace(/^"|"$/g, '');
                    const companyWebsite = line.substring(commaIndex + 1).trim().replace(/^"|"$/g, '');
                    
                    if (companyName && companyWebsite && companyName.length > 1) {
                        companies.push({ company_name: companyName, company_website: companyWebsite });
                        console.log(`Parsed: ${companyName} -> ${companyWebsite}`);
                    }
                } catch (error) {
                    console.log(`Error parsing line ${i + 1}: ${line} - ${error.message}`);
                    continue;
                }
            }

            console.log(`OpenAI generated ${companies.length} companies total`);
            this.updateProgress(25, `Parsed ${companies.length} companies from OpenAI`);
            
            if (companies.length === 0) {
                throw new Error('No valid companies parsed from OpenAI response. Response format may be incorrect.');
            }
            
            // Filter blacklisted companies
            const filteredCompanies = companies.filter(company => {
                if (this.isCancelled) return false;
                
                const isBlacklisted = this.isCompanyBlacklisted(company.company_name, blacklist);
                if (isBlacklisted) {
                    console.log(`Filtered out (blacklisted): ${company.company_name}`);
                }
                return !isBlacklisted;
            });

            console.log(`After blacklist filter: ${filteredCompanies.length} companies (filtered out ${companies.length - filteredCompanies.length})`);
            this.updateProgress(30, `After blacklist filter: ${filteredCompanies.length} companies`);
            
            // Verify websites with progress updates
            this.updateProgress(35, 'Verifying websites...');
            const verifiedCompanies = [];
            
            for (let i = 0; i < filteredCompanies.length; i++) {
                if (this.isCancelled) throw new Error('Operation cancelled by user');
                
                const company = filteredCompanies[i];
                
                try {
                    const isValid = await this.verifyWebsite(company.company_website);
                    console.log(`Website check: ${company.company_name} (${company.company_website}) -> ${isValid ? 'VALID' : 'INVALID'}`);
                    
                    if (isValid) {
                        verifiedCompanies.push(company);
                    }
                } catch (error) {
                    console.log(`Website verification error for ${company.company_name}: ${error.message}`);
                }
                
                if ((i + 1) % 10 === 0) {
                    const progress = 35 + ((i + 1) / filteredCompanies.length) * 15;
                    this.updateProgress(progress, `Verified ${i + 1}/${filteredCompanies.length} websites`);
                }
                
                await this.sleep(500); // Be nice to websites
            }

            console.log(`Website verification: ${verifiedCompanies.length} valid websites out of ${filteredCompanies.length}`);
            this.updateProgress(50, `Verified ${verifiedCompanies.length} companies with working websites`);
            
            const finalCompanies = verifiedCompanies.slice(0, this.config.max_companies);
            console.log(`Final company list: ${finalCompanies.length} companies`);
            
            return finalCompanies;
            
        } catch (error) {
            console.error('OpenAI API Error Details:', {
                message: error.message,
                type: error.constructor.name,
                stack: error.stack
            });
            
            if (error.message.includes('cancelled by user')) {
                throw error;
            } else if (error.message.includes('Unrecognized request argument') || error.message.includes('400')) {
                throw new Error(`OpenAI API configuration error: ${error.message}. Please try again or contact support if this persists.`);
            } else if (error.message.includes('timeout')) {
                throw new Error(`OpenAI API request timed out. The request took longer than expected. Please try again or contact support if this persists.`);
            } else if (error.message.includes('network') || error.message.includes('ENOTFOUND') || error.message.includes('ECONNRESET')) {
                throw new Error(`Network connection error while contacting OpenAI. Please check your internet connection and try again.`);
            } else if (error.message.includes('API key') || error.message.includes('Incorrect API key')) {
                throw new Error(`OpenAI API key is invalid. Please check your API key configuration.`);
            } else if (error.message.includes('quota') || error.message.includes('billing')) {
                throw new Error(`OpenAI API quota exceeded or billing issue. Please check your OpenAI account.`);
            } else {
                throw new Error(`OpenAI API failed: ${error.message}`);
            }
        }
    }

    async searchOrganizationId(companyName, companyWebsite) {
        if (this.isCancelled) throw new Error('Operation cancelled by user');
        
        const searchData = {
            q_organization_name: companyName,
            per_page: 25,
            page: 1
        };

        const headers = {
            'x-api-key': this.config.apollo_api_key,
            'Content-Type': 'application/json',
            'accept': 'application/json',
            'Cache-Control': 'no-cache'
        };

        const url = `https://api.apollo.io/api/v1/mixed_companies/search`;
        
        await this.sleep(this.config.request_delay * 1000);

        try {
            const fetch = require('node-fetch');
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(searchData),
                timeout: 30000
            });

            if (response.ok) {
                const responseData = await response.json();
                const organizations = responseData.organizations || responseData.companies || [];
                console.log(`Apollo organization search for "${companyName}" returned ${organizations.length} results`);
                
                if (organizations.length > 0) {
                    return this.findBestOrganizationMatch(companyName, companyWebsite, organizations);
                }
            } else {
                console.error(`Apollo organization search failed: ${response.status} ${response.statusText}`);
                const errorText = await response.text();
                console.error('Apollo error response:', errorText);
            }
        } catch (error) {
            console.warn(`Organization search error for ${companyName}: ${error.message}`);
        }

        return null;
    }

    findBestOrganizationMatch(companyName, companyWebsite, organizations) {
        const cleanName = (name) => {
            if (!name) return "";
            let cleaned = name.toLowerCase().trim();
            const suffixes = ['inc', 'inc.', 'corporation', 'corp', 'corp.', 'llc', 'ltd', 'ltd.', 'limited', 'co', 'co.', 'company'];
            for (const suffix of suffixes) {
                if (cleaned.endsWith(` ${suffix}`)) {
                    cleaned = cleaned.slice(0, -suffix.length - 1).trim();
                }
            }
            return cleaned;
        };

        const calculateMatchScore = (searchName, orgName, searchWebsite = "", orgWebsite = "") => {
            if (!orgName) return 0;

            const cleanSearch = cleanName(searchName);
            const cleanOrg = cleanName(orgName);

            // Exact match after cleaning
            if (cleanSearch === cleanOrg) return 100;

            // One contains the other
            if (cleanSearch.includes(cleanOrg) || cleanOrg.includes(cleanSearch)) return 90;

            // Domain matching
            if (searchWebsite && orgWebsite) {
                try {
                    const { URL } = require('url');
                    const searchDomain = new URL(searchWebsite).hostname.replace('www.', '').toLowerCase();
                    const orgDomain = new URL(orgWebsite).hostname.replace('www.', '').toLowerCase();
                    if (searchDomain === orgDomain) return 95;
                } catch {
                    // URL parsing failed, continue
                }
            }

            // Word-based matching
            const searchWords = new Set(cleanSearch.split(' ').filter(word => word.length > 2));
            const orgWords = new Set(cleanOrg.split(' ').filter(word => word.length > 2));

            if (searchWords.size > 0 && orgWords.size > 0) {
                const commonWords = new Set([...searchWords].filter(x => orgWords.has(x)));
                if (commonWords.size > 0) {
                    const wordScore = commonWords.size / Math.min(searchWords.size, orgWords.size);
                    if (wordScore >= 0.5) return Math.floor(70 + (wordScore * 20));
                    if (wordScore >= 0.3) return Math.floor(50 + (wordScore * 20));
                }
            }

            return 0;
        };

        // Score all organizations
        const scoredOrgs = organizations.map(org => ({
            score: calculateMatchScore(companyName, org.name || '', companyWebsite, org.website_url || org.primary_domain || ''),
            org: org,
            name: org.name || '',
            website: org.website_url || org.primary_domain || ''
        })).filter(item => item.score > 0);

        // Sort by score
        scoredOrgs.sort((a, b) => b.score - a.score);

        if (scoredOrgs.length > 0 && scoredOrgs[0].score >= 30) {
            const best = scoredOrgs[0];
            return [best.org.id, best.name, best.website];
        }

        return null;
    }

    async searchPeopleAtCompany(companyName, companyWebsite) {
        if (this.isCancelled) throw new Error('Operation cancelled by user');
        
        const orgResult = await this.searchOrganizationId(companyName, companyWebsite);
        
        if (!orgResult) {
            console.warn(`Organization not found: ${companyName}`);
            return [];
        }

        const [organizationId, actualCompanyName, actualWebsite] = orgResult;
        console.log(`Found organization: ${actualCompanyName} (ID: ${organizationId})`);

        // Build search query exactly like the Python script
        const queryParams = [`organization_ids[]=${organizationId}`];
        
        TARGET_TITLES.forEach(title => {
            queryParams.push(`person_titles[]=${encodeURIComponent(title)}`);
        });
        
        queryParams.push('person_locations[]=United%20States');
        queryParams.push('per_page=25');
        queryParams.push('page=1');
        
        const queryString = queryParams.join('&');
        const url = `https://api.apollo.io/api/v1/mixed_people/search?${queryString}`;

        const headers = {
            'x-api-key': this.config.apollo_api_key,
            'Content-Type': 'application/json',
            'accept': 'application/json',
            'Cache-Control': 'no-cache'
        };
        
        await this.sleep(this.config.request_delay * 1000);

        try {
            const fetch = require('node-fetch');
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                timeout: 30000
            });

            if (!response.ok) {
                console.error(`People search failed for ${companyName}: ${response.status} ${response.statusText}`);
                const errorText = await response.text();
                console.error('Apollo error response:', errorText);
                return [];
            }

            const responseData = await response.json();
            const people = responseData.people || [];
            console.log(`Apollo returned ${people.length} people for ${companyName}`);
            
            const contacts = [];

            for (const person of people) {
                if (this.isCancelled) throw new Error('Operation cancelled by user');
                
                if (!person.first_name) continue;

                // Filter to US only
                const country = (person.country || '').trim();
                if (country && !['united states', 'usa', 'us', ''].includes(country.toLowerCase())) {
                    continue;
                }

                // Get email and phone (may be locked)
                let email = person.email || '';
                if (!email || email.includes('email_not_unlocked')) {
                    email = '';
                }

                let phone = person.phone || person.phone_number || '';
                if (!phone || phone.includes('phone_not_unlocked')) {
                    phone = '';
                }

                const contact = {
                    name: person.name || '',
                    company: actualCompanyName,
                    position: person.title || '',
                    email: email,
                    phone: phone,
                    linkedin: person.linkedin_url || '',
                    notes: `Generated via Apollo API from ${actualWebsite}`,
                    source: 'apollo_leadgen',
                    // Set next_contact_date to today to make it "overdue"
                    next_contact_date: new Date().toISOString().split('T')[0]
                };
                contacts.push(contact);
            }

            console.log(`Processed ${contacts.length} valid contacts from ${people.length} people at ${actualCompanyName}`);
            return contacts;

        } catch (error) {
            console.error(`People search error for ${companyName}: ${error.message}`);
            return [];
        }
    }

    async saveContactsToDatabase(contacts) {
        if (!contacts.length) return 0;

        let savedCount = 0;
        const stmt = db.prepare(`
            INSERT INTO contacts (name, company, email, phone, linkedin, position, next_contact_date, contact_frequency, notes, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const contact of contacts) {
            if (this.isCancelled) break;
            
            try {
                await new Promise((resolve, reject) => {
                    stmt.run([
                        contact.name,
                        contact.company,
                        contact.email,
                        contact.phone,
                        contact.linkedin,
                        contact.position,
                        contact.next_contact_date,
                        7, // default frequency
                        contact.notes,
                        contact.source
                    ], function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            // Create activity for new contact
                            createActivity(this.lastID, 'contact_created', `Contact "${contact.name}" was created via Apollo Lead Generation`, {
                                source: 'apollo_leadgen',
                                company: contact.company
                            });
                            savedCount++;
                            resolve();
                        }
                    });
                });
            } catch (error) {
                console.error(`Error saving contact ${contact.name}: ${error.message}`);
            }
        }

        stmt.finalize();
        return savedCount;
    }

    async run() {
        this.isRunning = true;
        this.isCancelled = false;
        let sessionId = null;

        try {
            // Create session
            sessionId = await this.createSession();
            this.sessionId = sessionId;

            // Initialize with better error handling
            this.updateProgress(3, 'Initializing OpenAI and Apollo connections...');
            await this.initialize();
            this.updateProgress(5, 'Configuration loaded and APIs tested');

            if (this.isCancelled) throw new Error('Operation cancelled by user');

            // Load blacklist
            const blacklist = await this.loadBlacklist();
            this.updateProgress(8, `Loaded ${blacklist.size} companies to exclude (contacts + customers + defaults)`);

            if (this.isCancelled) throw new Error('Operation cancelled by user');

            // Generate companies with retry logic
            const companies = await this.generateCompaniesWithOpenAI(blacklist);
            await this.updateSession(sessionId, { companies_generated: companies.length });

            if (this.isCancelled) throw new Error('Operation cancelled by user');

            this.updateProgress(55, `Processing ${companies.length} companies for contacts...`);

            // Find contacts at each company
            const allContacts = [];
            let successfulCompanies = 0;

            for (let i = 0; i < companies.length; i++) {
                if (this.isCancelled) throw new Error('Operation cancelled by user');
                
                const company = companies[i];
                const progress = 55 + ((i / companies.length) * 35);
                
                this.updateProgress(progress, `Processing ${company.company_name} (${i + 1}/${companies.length})`);

                try {
                    const contacts = await this.searchPeopleAtCompany(company.company_name, company.company_website);
                    
                    if (contacts.length > 0) {
                        allContacts.push(...contacts);
                        successfulCompanies++;
                    }
                } catch (error) {
                    console.error(`Error processing ${company.company_name}: ${error.message}`);
                    if (error.message.includes('cancelled by user')) {
                        throw error;
                    }
                }
            }

            if (this.isCancelled) throw new Error('Operation cancelled by user');

            this.updateProgress(90, 'Saving contacts to database...');

            // Save contacts to database
            const savedCount = await this.saveContactsToDatabase(allContacts);
            
            await this.updateSession(sessionId, {
                status: 'completed',
                progress: 100,
                message: `Lead generation completed successfully`,
                contacts_generated: savedCount,
                completed_at: new Date().toISOString()
            });

            this.updateProgress(100, `Completed! Generated ${savedCount} new leads from ${successfulCompanies} companies`);

            return {
                success: true,
                companiesProcessed: companies.length,
                companiesWithContacts: successfulCompanies,
                contactsGenerated: savedCount,
                sessionId: sessionId
            };

        } catch (error) {
            console.error('Lead generation failed:', error);
            
            if (sessionId) {
                const errorStatus = error.message.includes('cancelled by user') ? 'cancelled' : 'failed';
                await this.updateSession(sessionId, {
                    status: errorStatus,
                    error: error.message,
                    completed_at: new Date().toISOString()
                });
            }

            this.updateProgress(0, `Error: ${error.message}`);
            
            return {
                success: false,
                error: error.message,
                contactsGenerated: 0,
                sessionId: sessionId
            };
        } finally {
            this.isRunning = false;
        }
    }

    getProgress() {
        return this.progress;
    }
}

// Global lead generator instance
let leadGeneratorInstance = null;

// Customer Scraper Class (existing code...)
class CustomerScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isRunning = false;
        this.progress = { percentage: 0, message: 'Initializing...' };
    }

    async initialize(config) {
        try {
            this.updateProgress(10, 'Launching browser...');
            
            // Comprehensive browser launch options for Docker/containerized environments
            const launchOptions = {
                headless: config.headless === 1,
                ignoreDefaultArgs: ['--disable-extensions'],
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu',
                    '--disable-gpu-sandbox',
                    '--disable-software-rasterizer',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-features=TranslateUI',
                    '--disable-ipc-flooding-protection',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--run-all-compositor-stages-before-draw',
                    '--memory-pressure-off'
                ],
                ignoreHTTPSErrors: true,
                dumpio: false
            };

            // Use system Chromium if available (Docker environment)
            if (process.env.PUPPETEER_EXECUTABLE_PATH) {
                launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
                console.log('Using system Chromium:', process.env.PUPPETEER_EXECUTABLE_PATH);
            }
            
            // Add timeout for browser launch
            const launchTimeout = setTimeout(() => {
                throw new Error('Browser launch timeout after 30 seconds');
            }, 30000);
            
            this.browser = await puppeteer.launch(launchOptions);
            clearTimeout(launchTimeout);
            
            // Test browser connectivity
            this.updateProgress(15, 'Testing browser connection...');
            const pages = await this.browser.pages();
            if (pages.length === 0) {
                await this.browser.newPage();
            }
            
            this.page = await this.browser.newPage();
            
            // Configure page settings
            await this.page.setViewport({ width: 1280, height: 720 });
            await this.page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            // Set longer timeouts for stability
            this.page.setDefaultTimeout(30000);
            this.page.setDefaultNavigationTimeout(30000);
            
            this.updateProgress(20, 'Browser ready');
            console.log('Browser initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize browser:', error);
            
            // Clean up any partial initialization
            if (this.browser) {
                try {
                    await this.browser.close();
                } catch (e) {
                    console.error('Error closing browser during cleanup:', e);
                }
                this.browser = null;
            }
            
            throw new Error(`Browser initialization failed: ${error.message}`);
        }
    }

    async login(config) {
        try {
            this.updateProgress(30, 'Navigating to login page...');
            
            await this.page.goto(config.login_url, { waitUntil: 'networkidle2' });
            
            this.updateProgress(40, 'Filling login credentials...');
            
            // Wait for and fill username
            await this.page.waitForSelector('.uk-input.uk-form-large', { timeout: 15000 });
            await this.page.type('.uk-input.uk-form-large', config.username);
            
            // Fill password
            await this.page.type('.uk-input.password.uk-form-large', config.password);
            
            this.updateProgress(50, 'Submitting login...');
            
            // Click submit and wait for navigation
            await Promise.all([
                this.page.waitForNavigation({ waitUntil: 'networkidle2' }),
                this.page.click('#signin_submit')
            ]);
            
            // Verify login success
            const currentUrl = this.page.url();
            if (currentUrl.toLowerCase().includes('login') || currentUrl.toLowerCase().includes('signin')) {
                throw new Error('Login failed - still on login page');
            }
            
            this.updateProgress(60, 'Login successful');
            return true;
        } catch (error) {
            console.error('Login failed:', error);
            throw new Error(`Login failed: ${error.message}`);
        }
    }

    async extractCustomers(config) {
        try {
            this.updateProgress(70, 'Navigating to customers page...');
            
            const customersUrl = config.customers_url || config.login_url.replace('/login', '/customers');
            await this.page.goto(customersUrl, { waitUntil: 'networkidle2' });
            
            this.updateProgress(75, 'Waiting for customer table...');
            
            // Wait for customer table
            await this.page.waitForSelector('#customer-table', { timeout: 15000 });
            await this.page.waitForTimeout(3000); // Wait for DataTable to initialize
            
            this.updateProgress(80, 'Configuring table display...');
            
            // Try multiple approaches to show all entries
            let showAllWorked = false;
            try {
                // Try different selectors and values for "show all"
                const selectorsToTry = [
                    'select[name="customer-table_length"]',
                    '.dataTables_length select',
                    'select[aria-controls="customer-table"]',
                    '.dataTables_wrapper select'
                ];
                
                for (const selector of selectorsToTry) {
                    try {
                        await this.page.waitForSelector(selector, { timeout: 3000 });
                        
                        // Get all available options
                        const options = await this.page.evaluate((sel) => {
                            const select = document.querySelector(sel);
                            if (!select) return [];
                            return Array.from(select.options).map(opt => ({ value: opt.value, text: opt.text }));
                        }, selector);
                        
                        console.log('Available entries per page options:', options);
                        
                        // Try different values for "show all"
                        const allValues = ['-1', 'All', '1000', '500', '100'];
                        for (const value of allValues) {
                            try {
                                const optionExists = options.some(opt => opt.value === value || opt.text.toLowerCase() === value.toLowerCase());
                                if (optionExists) {
                                    await this.page.select(selector, value);
                                    console.log(`Successfully selected "${value}" entries per page`);
                                    await this.page.waitForTimeout(3000); // Wait for reload
                                    showAllWorked = true;
                                    break;
                                }
                            } catch (e) {
                                console.log(`Failed to select "${value}":`, e.message);
                            }
                        }
                        
                        if (showAllWorked) break;
                        
                    } catch (e) {
                        console.log(`Selector "${selector}" not found or failed:`, e.message);
                    }
                }
            } catch (e) {
                console.log('Could not change entries per page, will paginate:', e.message);
            }
            
            this.updateProgress(85, 'Extracting customer data...');
            
            const customers = [];
            let page = 1;
            let hasNextPage = true;
            let consecutiveEmptyPages = 0;
            
            while (hasNextPage && consecutiveEmptyPages < 3 && (!config.max_customers || customers.length < config.max_customers)) {
                this.updateProgress(85 + Math.min(10, page), `Processing page ${page}...`);
                
                // Wait for table content to be stable
                await this.page.waitForTimeout(1000);
                
                // Extract customers from current page with more robust selectors
                const pageCustomers = await this.page.evaluate(() => {
                    const customers = [];
                    
                    // Try multiple row selectors
                    const rowSelectors = [
                        '#customer-table tbody tr',
                        '#customer-table tr',
                        '.dataTable tbody tr',
                        'table tbody tr'
                    ];
                    
                    let rows = [];
                    for (const selector of rowSelectors) {
                        rows = document.querySelectorAll(selector);
                        if (rows.length > 0) {
                            console.log(`Found ${rows.length} rows using selector: ${selector}`);
                            break;
                        }
                    }
                    
                    if (rows.length === 0) {
                        console.log('No table rows found with any selector');
                        return customers;
                    }
                    
                    rows.forEach((row, index) => {
                        try {
                            // Try multiple approaches to get the name cell
                            let nameCell = null;
                            
                            // Try second column (common for DataTables with checkbox in first column)
                            nameCell = row.querySelector('td:nth-child(2)');
                            
                            // If that fails, try first column
                            if (!nameCell || !nameCell.textContent.trim()) {
                                nameCell = row.querySelector('td:nth-child(1)');
                            }
                            
                            // If still no luck, try any cell with substantial text
                            if (!nameCell || !nameCell.textContent.trim()) {
                                const cells = row.querySelectorAll('td');
                                for (const cell of cells) {
                                    const text = cell.textContent.trim();
                                    if (text && text.length > 2 && !text.match(/^\d+$/) && !text.match(/^(edit|delete|actions?)$/i)) {
                                        nameCell = cell;
                                        break;
                                    }
                                }
                            }
                            
                            if (nameCell) {
                                const name = nameCell.textContent.trim();
                                if (name && 
                                    name.length > 1 && 
                                    !name.includes('No data available') && 
                                    !name.includes('No matching records') && 
                                    !name.includes('Loading...') &&
                                    !name.match(/^\d+$/) && // Skip pure numbers
                                    !name.match(/^(edit|delete|actions?)$/i)) { // Skip action buttons
                                    
                                    customers.push({ name });
                                    console.log(`Row ${index + 1}: Found customer "${name}"`);
                                }
                            }
                        } catch (e) {
                            console.log(`Error processing row ${index + 1}:`, e.message);
                        }
                    });
                    
                    console.log(`Page extraction complete: ${customers.length} customers found`);
                    return customers;
                });
                
                customers.push(...pageCustomers);
                console.log(`Page ${page}: Found ${pageCustomers.length} customers (Total: ${customers.length})`);
                
                if (pageCustomers.length === 0) {
                    consecutiveEmptyPages++;
                    console.log(`Empty page detected (${consecutiveEmptyPages}/3)`);
                } else {
                    consecutiveEmptyPages = 0;
                }
                
                // Check for next page with multiple selectors
                let nextPageFound = false;
                const nextButtonSelectors = [
                    '#customer-table_next:not(.disabled)',
                    '#customer-table_next a:not(.disabled)',
                    '.dataTables_paginate .next:not(.disabled)',
                    '.dataTables_paginate .next a:not(.disabled)',
                    '.pagination .next:not(.disabled)',
                    '.pagination .next a:not(.disabled)',
                    '.paginate_button.next:not(.disabled)',
                    '.paginate_button.next a:not(.disabled)',
                    'a[aria-label="Next"]:not(.disabled)',
                    'button[aria-label="Next"]:not(.disabled)',
                    '.next:not(.disabled):not(.page-numbers)',
                    '.page-item.next a:not(.disabled)',
                    '.paginate .next:not(.disabled)'
                ];
                
                for (const selector of nextButtonSelectors) {
                    try {
                        const nextButton = await this.page.$(selector);
                        if (nextButton) {
                            // Check if button is actually clickable
                            const isDisabled = await this.page.evaluate((btn) => {
                                return btn.disabled || 
                                       btn.classList.contains('disabled') || 
                                       btn.classList.contains('ui-state-disabled') ||
                                       btn.getAttribute('aria-disabled') === 'true' ||
                                       btn.style.pointerEvents === 'none';
                            }, nextButton);
                            
                            if (!isDisabled) {
                                console.log(`Clicking next page button: ${selector}`);
                                await this.page.evaluate((btn) => btn.click(), nextButton);
                                await this.page.waitForTimeout(3000); // Wait for page load
                                nextPageFound = true;
                                page++;
                                break;
                            } else {
                                console.log(`Next button found but disabled: ${selector}`);
                            }
                        }
                    } catch (e) {
                        console.log(`Next button selector failed: ${selector} - ${e.message}`);
                    }
                }
                
                if (!nextPageFound) {
                    console.log('No more pages found - extraction complete');
                    hasNextPage = false;
                }
                
                // Safety check to prevent infinite loops
                if (page > 100) {
                    console.log('Reached page limit (100) - stopping extraction');
                    break;
                }
            }
            
            this.updateProgress(95, 'Extraction complete');
            console.log(`Successfully extracted ${customers.length} customers from ${page} pages`);
            
            if (customers.length === 0) {
                throw new Error('No customers found. Please check the table structure and selectors.');
            }
            
            return customers;
            
        } catch (error) {
            console.error('Customer extraction failed:', error);
            throw new Error(`Customer extraction failed: ${error.message}`);
        }
    }

    async scrape(config) {
        this.isRunning = true;
        try {
            await this.initialize(config);
            await this.login(config);
            const customers = await this.extractCustomers(config);
            
            this.updateProgress(100, 'Scraping completed successfully');
            return {
                success: true,
                customers,
                count: customers.length
            };
        } catch (error) {
            this.updateProgress(0, `Error: ${error.message}`);
            return {
                success: false,
                error: error.message,
                customers: [],
                count: 0
            };
        } finally {
            await this.cleanup();
            this.isRunning = false;
        }
    }

    async cleanup() {
        console.log('Starting browser cleanup...');
        if (this.page) {
            try {
                await this.page.close();
                console.log('Page closed successfully');
            } catch (error) {
                console.error('Error closing page:', error);
            }
            this.page = null;
        }
        
        if (this.browser) {
            try {
                await this.browser.close();
                console.log('Browser closed successfully');
            } catch (error) {
                console.error('Error closing browser:', error);
            }
            this.browser = null;
        }
    }

    updateProgress(percentage, message) {
        this.progress = { percentage, message };
        console.log(`Progress: ${percentage}% - ${message}`);
    }

    getProgress() {
        return this.progress;
    }
}

// Global scraper instance
let scraperInstance = null;

// ================================
// TAGS API ROUTES
// ================================

// Get all tags
app.get('/api/tags', (req, res) => {
    db.all('SELECT * FROM tags ORDER BY name', (err, tags) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(tags);
    });
});

// Create new tag
app.post('/api/tags', (req, res) => {
    const { name, color } = req.body;
    
    if (!name) {
        res.status(400).json({ error: 'Tag name is required' });
        return;
    }
    
    const stmt = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)');
    stmt.run([name, color || '#3b82f6'], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                res.status(400).json({ error: 'Tag name already exists' });
            } else {
                res.status(500).json({ error: err.message });
            }
            return;
        }
        res.json({ id: this.lastID, name, color: color || '#3b82f6' });
    });
});

// Update tag
app.put('/api/tags/:id', (req, res) => {
    const tagId = req.params.id;
    const { name, color } = req.body;
    
    const stmt = db.prepare('UPDATE tags SET name = ?, color = ? WHERE id = ?');
    stmt.run([name, color, tagId], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                res.status(400).json({ error: 'Tag name already exists' });
            } else {
                res.status(500).json({ error: err.message });
            }
            return;
        }
        res.json({ changes: this.changes });
    });
});

// Delete tag
app.delete('/api/tags/:id', (req, res) => {
    const tagId = req.params.id;
    
    // First delete associations
    db.run('DELETE FROM contact_tags WHERE tag_id = ?', [tagId], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        // Then delete tag
        db.run('DELETE FROM tags WHERE id = ?', [tagId], function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ changes: this.changes });
        });
    });
});

// Add tag to contact
app.post('/api/contacts/:id/tags', (req, res) => {
    const contactId = req.params.id;
    const { tagId } = req.body;
    
    if (!tagId) {
        res.status(400).json({ error: 'Tag ID is required' });
        return;
    }
    
    // Get contact and tag info for activity
    db.get('SELECT name FROM contacts WHERE id = ?', [contactId], (err, contact) => {
        if (err || !contact) {
            res.status(404).json({ error: 'Contact not found' });
            return;
        }
        
        db.get('SELECT name FROM tags WHERE id = ?', [tagId], (err, tag) => {
            if (err || !tag) {
                res.status(404).json({ error: 'Tag not found' });
                return;
            }
            
            const stmt = db.prepare('INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)');
            stmt.run([contactId, tagId], function(err) {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                
                if (this.changes > 0) {
                    // Create activity
                    createActivity(contactId, 'tag_added', `Tag "${tag.name}" was added to ${contact.name}`, {
                        tag_name: tag.name,
                        tag_id: tagId
                    });
                }
                
                res.json({ success: true, changes: this.changes });
            });
        });
    });
});

// Remove tag from contact
app.delete('/api/contacts/:id/tags/:tagId', (req, res) => {
    const contactId = req.params.id;
    const tagId = req.params.tagId;
    
    // Get contact and tag info for activity
    db.get('SELECT name FROM contacts WHERE id = ?', [contactId], (err, contact) => {
        if (err || !contact) {
            res.status(404).json({ error: 'Contact not found' });
            return;
        }
        
        db.get('SELECT name FROM tags WHERE id = ?', [tagId], (err, tag) => {
            if (err || !tag) {
                res.status(404).json({ error: 'Tag not found' });
                return;
            }
            
            const stmt = db.prepare('DELETE FROM contact_tags WHERE contact_id = ? AND tag_id = ?');
            stmt.run([contactId, tagId], function(err) {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                
                if (this.changes > 0) {
                    // Create activity
                    createActivity(contactId, 'tag_removed', `Tag "${tag.name}" was removed from ${contact.name}`, {
                        tag_name: tag.name,
                        tag_id: tagId
                    });
                }
                
                res.json({ success: true, changes: this.changes });
            });
        });
    });
});

// Get contact tags
app.get('/api/contacts/:id/tags', (req, res) => {
    const contactId = req.params.id;
    
    const query = `
        SELECT t.* FROM tags t
        JOIN contact_tags ct ON t.id = ct.tag_id
        WHERE ct.contact_id = ?
        ORDER BY t.name
    `;
    
    db.all(query, [contactId], (err, tags) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(tags);
    });
});

// ================================
// ACTIVITIES API ROUTES
// ================================

// Get activities timeline
app.get('/api/activities', (req, res) => {
    const { contactId, limit = 50, offset = 0 } = req.query;
    
    let query = `
        SELECT a.*, c.name as contact_name 
        FROM activities a
        LEFT JOIN contacts c ON a.contact_id = c.id
    `;
    let params = [];
    
    if (contactId) {
        query += ' WHERE a.contact_id = ?';
        params.push(contactId);
    }
    
    query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    db.all(query, params, (err, activities) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        // Parse metadata for each activity
        const formattedActivities = activities.map(activity => ({
            ...activity,
            metadata: activity.metadata ? JSON.parse(activity.metadata) : null
        }));
        
        res.json(formattedActivities);
    });
});

// Create manual activity
app.post('/api/activities', (req, res) => {
    const { contactId, description } = req.body;
    
    if (!contactId || !description) {
        res.status(400).json({ error: 'Contact ID and description are required' });
        return;
    }
    
    // Get contact name for the activity
    db.get('SELECT name FROM contacts WHERE id = ?', [contactId], (err, contact) => {
        if (err || !contact) {
            res.status(404).json({ error: 'Contact not found' });
            return;
        }
        
        const stmt = db.prepare('INSERT INTO activities (contact_id, type, description, metadata) VALUES (?, ?, ?, ?)');
        stmt.run([contactId, 'manual_entry', description, JSON.stringify({ manual: true })], function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID, contactId, description });
        });
    });
});

// ================================
// ENHANCED CONTACTS API ROUTES  
// ================================

// Get all contacts with tags
app.get('/api/contacts', (req, res) => {
    const query = `
        SELECT c.*, 
               GROUP_CONCAT(t.id) as tag_ids,
               GROUP_CONCAT(t.name) as tag_names,
               GROUP_CONCAT(t.color) as tag_colors
        FROM contacts c
        LEFT JOIN contact_tags ct ON c.id = ct.contact_id
        LEFT JOIN tags t ON ct.tag_id = t.id
        GROUP BY c.id
        ORDER BY c.name
    `;
    
    db.all(query, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        // Format contacts with tags
        const contacts = rows.map(contact => {
            const tags = [];
            if (contact.tag_ids) {
                const tagIds = contact.tag_ids.split(',');
                const tagNames = contact.tag_names.split(',');
                const tagColors = contact.tag_colors.split(',');
                
                for (let i = 0; i < tagIds.length; i++) {
                    tags.push({
                        id: parseInt(tagIds[i]),
                        name: tagNames[i],
                        color: tagColors[i]
                    });
                }
            }
            
            return {
                ...contact,
                custom_fields: contact.custom_fields ? JSON.parse(contact.custom_fields) : {},
                tags: tags,
                // Remove the concatenated tag fields
                tag_ids: undefined,
                tag_names: undefined,
                tag_colors: undefined
            };
        });
        
        res.json(contacts);
    });
});

// Get single contact with communications and tags
app.get('/api/contacts/:id', (req, res) => {
    const contactId = req.params.id;
    
    db.get('SELECT * FROM contacts WHERE id = ?', [contactId], (err, contact) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (!contact) {
            res.status(404).json({ error: 'Contact not found' });
            return;
        }
        
        // Get communications
        db.all('SELECT * FROM communications WHERE contact_id = ? ORDER BY date DESC', [contactId], (err, communications) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            // Get tags
            const tagQuery = `
                SELECT t.* FROM tags t
                JOIN contact_tags ct ON t.id = ct.tag_id
                WHERE ct.contact_id = ?
                ORDER BY t.name
            `;
            
            db.all(tagQuery, [contactId], (err, tags) => {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                
                res.json({
                    ...contact,
                    custom_fields: contact.custom_fields ? JSON.parse(contact.custom_fields) : {},
                    communications: communications,
                    tags: tags
                });
            });
        });
    });
});

// Create new contact with activity tracking
app.post('/api/contacts', (req, res) => {
    const { name, company, email, phone, linkedin, position, contact_frequency, notes, custom_fields } = req.body;
    
    if (!name) {
        res.status(400).json({ error: 'Name is required' });
        return;
    }
    
    // Calculate next contact date
    const nextContactDate = new Date();
    nextContactDate.setDate(nextContactDate.getDate() + (contact_frequency || 7));
    
    const stmt = db.prepare(`
        INSERT INTO contacts (name, company, email, phone, linkedin, position, next_contact_date, contact_frequency, notes, custom_fields, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run([
        name, company, email, phone, linkedin, position,
        nextContactDate.toISOString().split('T')[0],
        contact_frequency || 7,
        notes,
        JSON.stringify(custom_fields || {}),
        'manual'
    ], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        // Create activity
        createActivity(this.lastID, 'contact_created', `Contact "${name}" was created`, {
            source: 'manual',
            company: company
        });
        
        res.json({ id: this.lastID });
    });
});

// Update contact with activity tracking
app.put('/api/contacts/:id', (req, res) => {
    const contactId = req.params.id;
    const { name, company, email, phone, linkedin, position, contact_frequency, notes, custom_fields } = req.body;
    
    // First, get the current contact to track changes
    db.get('SELECT * FROM contacts WHERE id = ?', [contactId], (err, currentContact) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        if (!currentContact) {
            res.status(404).json({ error: 'Contact not found' });
            return;
        }
        
        let nextContactDate = null;
        
        // If frequency changed and there's a last contact date, recalculate next contact date
        if (contact_frequency !== currentContact.contact_frequency && currentContact.last_contact_date) {
            const lastContactDate = new Date(currentContact.last_contact_date);
            const newNextContactDate = new Date(lastContactDate);
            newNextContactDate.setDate(lastContactDate.getDate() + contact_frequency);
            nextContactDate = newNextContactDate.toISOString().split('T')[0];
        }
        
        // Update the contact
        const updateSQL = nextContactDate ? 
            `UPDATE contacts 
             SET name = ?, company = ?, email = ?, phone = ?, linkedin = ?, position = ?, 
                 contact_frequency = ?, next_contact_date = ?, notes = ?, custom_fields = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?` :
            `UPDATE contacts 
             SET name = ?, company = ?, email = ?, phone = ?, linkedin = ?, position = ?, 
                 contact_frequency = ?, notes = ?, custom_fields = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`;
        
        const updateParams = nextContactDate ? 
            [name, company, email, phone, linkedin, position, contact_frequency, nextContactDate, notes, JSON.stringify(custom_fields || {}), contactId] :
            [name, company, email, phone, linkedin, position, contact_frequency, notes, JSON.stringify(custom_fields || {}), contactId];
        
        const stmt = db.prepare(updateSQL);
        
        stmt.run(updateParams, function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            // Create activity for significant changes
            const changes = [];
            if (name !== currentContact.name) changes.push('name');
            if (company !== currentContact.company) changes.push('company');
            if (email !== currentContact.email) changes.push('email');
            if (position !== currentContact.position) changes.push('position');
            
            if (changes.length > 0) {
                createActivity(contactId, 'contact_updated', `Contact information was updated (${changes.join(', ')})`, {
                    changes: changes,
                    updated_fields: changes
                });
            }
            
            res.json({ 
                changes: this.changes,
                nextContactDate: nextContactDate 
            });
        });
    });
});

// Delete contact
app.delete('/api/contacts/:id', (req, res) => {
    const contactId = req.params.id;
    
    // Get contact name for activity (before deletion)
    db.get('SELECT name FROM contacts WHERE id = ?', [contactId], (err, contact) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        if (!contact) {
            res.status(404).json({ error: 'Contact not found' });
            return;
        }
        
        // Delete contact tags first
        db.run('DELETE FROM contact_tags WHERE contact_id = ?', [contactId], (err) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            // Delete communications
            db.run('DELETE FROM communications WHERE contact_id = ?', [contactId], (err) => {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                
                // Activities will be deleted automatically due to CASCADE
                
                // Delete contact
                db.run('DELETE FROM contacts WHERE id = ?', [contactId], function(err) {
                    if (err) {
                        res.status(500).json({ error: err.message });
                        return;
                    }
                    res.json({ changes: this.changes });
                });
            });
        });
    });
});

// Mark contact as contacted with activity tracking
app.post('/api/contacts/:id/contact', (req, res) => {
    const contactId = req.params.id;
    const { method, notes, date } = req.body;
    const contactDate = date || new Date().toISOString().split('T')[0];
    
    console.log(`Marking contact ${contactId} as contacted on ${contactDate}`);
    
    // Get contact info
    db.get('SELECT name, contact_frequency FROM contacts WHERE id = ?', [contactId], (err, contact) => {
        if (err) {
            console.error('Error getting contact:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        
        if (!contact) {
            console.error('Contact not found');
            res.status(404).json({ error: 'Contact not found' });
            return;
        }
        
        // Add communication record
        const commStmt = db.prepare(`
            INSERT INTO communications (contact_id, date, method, notes)
            VALUES (?, ?, ?, ?)
        `);
        
        commStmt.run([contactId, contactDate, method, notes], function(err) {
            if (err) {
                console.error('Error inserting communication:', err);
                res.status(500).json({ error: err.message });
                return;
            }
            
            console.log(`Communication inserted with ID: ${this.lastID}`);
            const communicationId = this.lastID;
            
            // Update contact's last contact date and calculate next contact date
            const frequency = contact.contact_frequency || 7;
            const nextContactDate = new Date(contactDate);
            nextContactDate.setDate(nextContactDate.getDate() + frequency);
            const nextContactDateStr = nextContactDate.toISOString().split('T')[0];
            
            console.log(`Contact frequency: ${frequency} days`);
            console.log(`Last contact: ${contactDate}`);
            console.log(`Next contact: ${nextContactDateStr}`);
            
            const updateStmt = db.prepare(`
                UPDATE contacts 
                SET last_contact_date = ?, next_contact_date = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
            
            updateStmt.run([contactDate, nextContactDateStr, contactId], function(err) {
                if (err) {
                    console.error('Error updating contact dates:', err);
                    res.status(500).json({ error: err.message });
                    return;
                }
                
                console.log(`Contact updated. Changes: ${this.changes}`);
                
                // Create activity
                createActivity(contactId, 'communication', `${method} communication with ${contact.name}`, {
                    method: method,
                    date: contactDate,
                    notes: notes,
                    communication_id: communicationId
                });
                
                res.json({ 
                    success: true,
                    lastContactDate: contactDate,
                    nextContactDate: nextContactDateStr,
                    communicationId: communicationId 
                });
            });
        });
    });
});

// Update communication
app.put('/api/communications/:id', (req, res) => {
    const commId = req.params.id;
    const { notes } = req.body;
    
    // Get communication info for activity
    db.get('SELECT contact_id, method, date FROM communications WHERE id = ?', [commId], (err, comm) => {
        if (err || !comm) {
            res.status(404).json({ error: 'Communication not found' });
            return;
        }
        
        const stmt = db.prepare(`
            UPDATE communications 
            SET notes = ?
            WHERE id = ?
        `);
        
        stmt.run([notes, commId], function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            // Create activity
            if (this.changes > 0) {
                createActivity(comm.contact_id, 'communication_updated', `${comm.method} communication notes were updated`, {
                    method: comm.method,
                    date: comm.date,
                    communication_id: commId
                });
            }
            
            res.json({ changes: this.changes });
        });
    });
});

// Delete communication
app.delete('/api/communications/:id', (req, res) => {
    const commId = req.params.id;
    
    // Get communication info for activity
    db.get('SELECT contact_id, method, date FROM communications WHERE id = ?', [commId], (err, comm) => {
        if (err || !comm) {
            res.status(404).json({ error: 'Communication not found' });
            return;
        }
        
        db.run('DELETE FROM communications WHERE id = ?', [commId], function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            // Create activity
            if (this.changes > 0) {
                createActivity(comm.contact_id, 'communication_deleted', `${comm.method} communication was deleted`, {
                    method: comm.method,
                    date: comm.date,
                    communication_id: commId
                });
            }
            
            res.json({ changes: this.changes });
        });
    });
});

// Get dashboard stats
app.get('/api/dashboard', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];
    
    const thisMonth = new Date();
    const monthStart = new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1).toISOString().split('T')[0];
    
    // Get total contacts
    db.get('SELECT COUNT(*) as total FROM contacts', (err, totalResult) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        // Get overdue contacts
        db.all('SELECT * FROM contacts WHERE next_contact_date <= ? ORDER BY next_contact_date', [today], (err, overdueContacts) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            // Get upcoming contacts (next 7 days)
            const nextWeek = new Date();
            nextWeek.setDate(nextWeek.getDate() + 7);
            const nextWeekStr = nextWeek.toISOString().split('T')[0];
            
            db.all('SELECT * FROM contacts WHERE next_contact_date > ? AND next_contact_date <= ? ORDER BY next_contact_date', [today, nextWeekStr], (err, upcomingContacts) => {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                
                // Get communications this week
                db.get('SELECT COUNT(*) as count FROM communications WHERE date >= ?', [weekAgoStr], (err, weeklyCommsResult) => {
                    if (err) {
                        res.status(500).json({ error: err.message });
                        return;
                    }
                    
                    // Get new contacts this month
                    db.get('SELECT COUNT(*) as count FROM contacts WHERE created_at >= ?', [monthStart], (err, monthlyContactsResult) => {
                        if (err) {
                            res.status(500).json({ error: err.message });
                            return;
                        }
                        
                        // Get Apollo-generated leads
                        db.get('SELECT COUNT(*) as count FROM contacts WHERE source = ?', ['apollo_leadgen'], (err, apolloLeadsResult) => {
                            if (err) {
                                res.status(500).json({ error: err.message });
                                return;
                            }
                            
                            res.json({
                                totalContacts: totalResult.total,
                                overdueContacts: overdueContacts.length,
                                overdueList: overdueContacts,
                                upcomingContacts: upcomingContacts.length,
                                upcomingList: upcomingContacts,
                                weeklyComms: weeklyCommsResult.count,
                                monthlyNewContacts: monthlyContactsResult.count,
                                apolloLeads: apolloLeadsResult.count
                            });
                        });
                    });
                });
            });
        });
    });
});

// Scraper API Routes (existing implementation continues...)

// Get scraper configuration
app.get('/api/scraper/config', (req, res) => {
    db.get('SELECT * FROM scraper_config ORDER BY updated_at DESC LIMIT 1', (err, config) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        if (config) {
            // Only return user-facing config fields
            const userConfig = {
                id: config.id,
                login_url: config.login_url,
                customers_url: config.customers_url,
                username: config.username,
                password: config.password ? '••••••••' : '',
                created_at: config.created_at,
                updated_at: config.updated_at
            };
            res.json(userConfig);
        } else {
            res.json({});
        }
    });
});

// Save scraper configuration
app.post('/api/scraper/config', (req, res) => {
    const { login_url, customers_url, username, password } = req.body;
    
    if (!login_url || !username || !password) {
        res.status(400).json({ error: 'Login URL, username, and password are required' });
        return;
    }
    
    // Use environment defaults for technical settings
    const headless = process.env.SCRAPER_HEADLESS !== 'false' ? 1 : 0;
    const timeout = parseInt(process.env.SCRAPER_TIMEOUT) || 25;
    const max_customers = process.env.SCRAPER_MAX_CUSTOMERS ? parseInt(process.env.SCRAPER_MAX_CUSTOMERS) : null;
    
    // Check if config exists
    db.get('SELECT id FROM scraper_config LIMIT 1', (err, existing) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        const stmt = existing ? 
            db.prepare(`UPDATE scraper_config SET login_url = ?, customers_url = ?, username = ?, password = ?, headless = ?, timeout = ?, max_customers = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`) :
            db.prepare(`INSERT INTO scraper_config (login_url, customers_url, username, password, headless, timeout, max_customers) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        
        const params = existing ?
            [login_url, customers_url, username, password, headless, timeout, max_customers, existing.id] :
            [login_url, customers_url, username, password, headless, timeout, max_customers];
        
        stmt.run(params, function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ success: true, id: existing ? existing.id : this.lastID });
        });
    });
});

// Get scraped customers count
app.get('/api/scraper/customers/count', (req, res) => {
    db.get('SELECT COUNT(*) as count FROM scraped_customers', (err, result) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ count: result.count });
    });
});

// Run scraper
app.post('/api/scraper/run', async (req, res) => {
    if (scraperInstance && scraperInstance.isRunning) {
        res.status(400).json({ error: 'Scraper is already running' });
        return;
    }
    
    // Get configuration
    db.get('SELECT * FROM scraper_config ORDER BY updated_at DESC LIMIT 1', async (err, dbConfig) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        if (!dbConfig) {
            res.status(400).json({ error: 'No scraper configuration found. Please configure the scraper first.' });
            return;
        }
        
        // Merge database config with environment defaults for technical settings
        const config = {
            ...dbConfig,
            headless: process.env.SCRAPER_HEADLESS !== 'false' ? 1 : 0,
            timeout: parseInt(process.env.SCRAPER_TIMEOUT) || 25,
            max_customers: process.env.SCRAPER_MAX_CUSTOMERS ? parseInt(process.env.SCRAPER_MAX_CUSTOMERS) : null
        };
        
        console.log('Starting scraper with config:', {
            login_url: config.login_url,
            customers_url: config.customers_url,
            username: config.username,
            password: '***',
            headless: config.headless,
            timeout: config.timeout,
            max_customers: config.max_customers || 'unlimited'
        });
        
        // Start scraping in background
        scraperInstance = new CustomerScraper();
        
        // Respond immediately that scraping has started
        res.json({ success: true, message: 'Scraping started' });
        
        // Run scraping asynchronously
        const result = await scraperInstance.scrape(config);
        
        if (result.success && result.customers.length > 0) {
            // Save customers to database
            const sessionId = Date.now().toString();
            
            // Clear existing customers
            db.run('DELETE FROM scraped_customers', (err) => {
                if (err) {
                    console.error('Error clearing existing customers:', err);
                    return;
                }
                
                // Insert new customers
                const stmt = db.prepare('INSERT INTO scraped_customers (name, scrape_session_id) VALUES (?, ?)');
                
                result.customers.forEach(customer => {
                    stmt.run([customer.name, sessionId], (err) => {
                        if (err) {
                            console.error('Error inserting customer:', err);
                        }
                    });
                });
                
                stmt.finalize();
                console.log(`Saved ${result.customers.length} customers to database`);
            });
        }
    });
});

// Get scraper progress
app.get('/api/scraper/progress', (req, res) => {
    if (scraperInstance) {
        res.json({
            isRunning: scraperInstance.isRunning,
            progress: scraperInstance.getProgress()
        });
    } else {
        res.json({
            isRunning: false,
            progress: { percentage: 0, message: 'Not running' }
        });
    }
});

// LEADGEN API ROUTES (existing implementation continues...)

// Get leadgen configuration
app.get('/api/leadgen/config', (req, res) => {
    db.get('SELECT * FROM leadgen_config ORDER BY updated_at DESC LIMIT 1', (err, config) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        if (config) {
            // Mask sensitive information
            const userConfig = {
                id: config.id,
                openai_api_key: config.openai_api_key ? '••••••••' : '',
                openai_model: config.openai_model,
                apollo_api_key: config.apollo_api_key ? '••••••••' : '',
                max_companies: config.max_companies,
                request_delay: config.request_delay,
                created_at: config.created_at,
                updated_at: config.updated_at
            };
            res.json(userConfig);
        } else {
            res.json({
                openai_model: 'gpt-4',
                max_companies: 50,
                request_delay: 1.2
            });
        }
    });
});

// Save leadgen configuration
app.post('/api/leadgen/config', (req, res) => {
    const { openai_api_key, openai_model, apollo_api_key, max_companies, request_delay } = req.body;
    
    if (!openai_api_key || !apollo_api_key) {
        res.status(400).json({ error: 'OpenAI and Apollo API keys are required' });
        return;
    }

    // Don't save if the API keys are masked (••••••••) - this means user didn't change them
    if (openai_api_key.includes('•') || openai_api_key.includes('*')) {
        res.status(400).json({ error: 'Please enter your actual OpenAI API key. Click the field to enter a new key.' });
        return;
    }

    if (apollo_api_key.includes('•') || apollo_api_key.includes('*')) {
        res.status(400).json({ error: 'Please enter your actual Apollo API key. Click the field to enter a new key.' });
        return;
    }

    // Validate API key formats for new/real keys
    if (!openai_api_key.startsWith('sk-') || openai_api_key.length < 20) {
        res.status(400).json({ error: 'Invalid OpenAI API key format. Should start with "sk-" and be at least 20 characters.' });
        return;
    }
    
    // Check if config exists
    db.get('SELECT id FROM leadgen_config LIMIT 1', (err, existing) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        const stmt = existing ? 
            db.prepare(`UPDATE leadgen_config SET openai_api_key = ?, openai_model = ?, apollo_api_key = ?, max_companies = ?, request_delay = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`) :
            db.prepare(`INSERT INTO leadgen_config (openai_api_key, openai_model, apollo_api_key, max_companies, request_delay) VALUES (?, ?, ?, ?, ?)`);
        
        const params = existing ?
            [openai_api_key, openai_model || 'gpt-4', apollo_api_key, max_companies || 50, request_delay || 1.2, existing.id] :
            [openai_api_key, openai_model || 'gpt-4', apollo_api_key, max_companies || 50, request_delay || 1.2];
        
        stmt.run(params, function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ success: true, id: existing ? existing.id : this.lastID });
        });
    });
});

// Run lead generation
app.post('/api/leadgen/run', async (req, res) => {
    if (leadGeneratorInstance && leadGeneratorInstance.isRunning) {
        res.status(400).json({ error: 'Lead generation is already running' });
        return;
    }
    
    // Start lead generation in background
    leadGeneratorInstance = new LeadGenerator();
    
    // Respond immediately that lead generation has started
    res.json({ success: true, message: 'Lead generation started' });
    
    // Run lead generation asynchronously
    try {
        const result = await leadGeneratorInstance.run();
        console.log('Lead generation completed:', result);
    } catch (error) {
        console.error('Lead generation failed:', error);
    }
});

// Cancel lead generation
app.post('/api/leadgen/cancel', (req, res) => {
    if (leadGeneratorInstance && leadGeneratorInstance.isRunning) {
        leadGeneratorInstance.cancel();
        res.json({ success: true, message: 'Lead generation cancellation requested' });
    } else {
        res.json({ success: false, message: 'No lead generation process running' });
    }
});

// Get lead generation progress
app.get('/api/leadgen/progress', (req, res) => {
    if (leadGeneratorInstance) {
        res.json({
            isRunning: leadGeneratorInstance.isRunning,
            progress: leadGeneratorInstance.getProgress()
        });
    } else {
        res.json({
            isRunning: false,
            progress: { percentage: 0, message: 'Not running' }
        });
    }
});

// Get lead generation sessions/history
app.get('/api/leadgen/sessions', (req, res) => {
    db.all('SELECT * FROM leadgen_sessions ORDER BY created_at DESC LIMIT 10', (err, sessions) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(sessions);
    });
});

// Bulk operations
app.post('/api/contacts/bulk-delete', (req, res) => {
    const { contactIds } = req.body;
    
    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
        res.status(400).json({ error: 'Contact IDs array is required' });
        return;
    }
    
    const placeholders = contactIds.map(() => '?').join(',');
    
    // Delete contact tags first
    db.run(`DELETE FROM contact_tags WHERE contact_id IN (${placeholders})`, contactIds, (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        // Delete communications
        db.run(`DELETE FROM communications WHERE contact_id IN (${placeholders})`, contactIds, (err) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            // Activities will be deleted automatically due to CASCADE
            
            // Delete contacts
            db.run(`DELETE FROM contacts WHERE id IN (${placeholders})`, contactIds, function(err) {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                res.json({ deleted: this.changes });
            });
        });
    });
});

// Bulk mark as contacted
app.post('/api/contacts/bulk-contact', (req, res) => {
    const { contactIds, method, notes, date } = req.body;
    const contactDate = date || new Date().toISOString().split('T')[0];
    
    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
        res.status(400).json({ error: 'Contact IDs array is required' });
        return;
    }
    
    if (!method) {
        res.status(400).json({ error: 'Contact method is required' });
        return;
    }
    
    // Insert communication records for all contacts
    const commStmt = db.prepare(`
        INSERT INTO communications (contact_id, date, method, notes)
        VALUES (?, ?, ?, ?)
    `);
    
    let completed = 0;
    let errors = [];
    
    contactIds.forEach(contactId => {
        commStmt.run([contactId, contactDate, method, notes], function(err) {
            if (err) {
                errors.push(`Contact ${contactId}: ${err.message}`);
            } else {
                // Create activity for each contact
                createActivity(contactId, 'communication', `${method} communication (bulk action)`, {
                    method: method,
                    date: contactDate,
                    notes: notes,
                    bulk_action: true,
                    communication_id: this.lastID
                });
            }
            
            completed++;
            
            if (completed === contactIds.length) {
                // Update all contacts' last contact date and calculate next contact date
                const placeholders = contactIds.map(() => '?').join(',');
                
                db.all(`SELECT id, contact_frequency FROM contacts WHERE id IN (${placeholders})`, contactIds, (err, contacts) => {
                    if (err) {
                        res.status(500).json({ error: err.message });
                        return;
                    }
                    
                    const updateStmt = db.prepare(`
                        UPDATE contacts 
                        SET last_contact_date = ?, next_contact_date = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `);
                    
                    let updateCompleted = 0;
                    
                    contacts.forEach(contact => {
                        const nextContactDate = new Date(contactDate);
                        nextContactDate.setDate(nextContactDate.getDate() + (contact.contact_frequency || 7));
                        
                        updateStmt.run([contactDate, nextContactDate.toISOString().split('T')[0], contact.id], function(updateErr) {
                            if (updateErr) {
                                errors.push(`Update contact ${contact.id}: ${updateErr.message}`);
                            }
                            
                            updateCompleted++;
                            
                            if (updateCompleted === contacts.length) {
                                res.json({ 
                                    updated: contactIds.length,
                                    errors: errors
                                });
                            }
                        });
                    });
                });
            }
        });
    });
});

// File upload and processing
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
    }
    
    const filePath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    
    let contacts = [];
    
    try {
        if (fileExtension === '.csv') {
            // Process CSV
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const lines = fileContent.split('\n');
            if (lines.length < 2) {
                throw new Error('CSV file must have headers and at least one data row');
            }
            
            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
            
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim()) {
                    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
                    const contact = {};
                    headers.forEach((header, index) => {
                        contact[header] = values[index] || '';
                    });
                    contacts.push(contact);
                }
            }
        } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
            // Process Excel
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            contacts = xlsx.utils.sheet_to_json(worksheet);
        } else {
            throw new Error('Unsupported file format');
        }
        
        // Clean up uploaded file
        fs.unlinkSync(filePath);
        
        // Process and insert contacts
        let imported = 0;
        let errors = [];
        
        const insertPromises = contacts.map((contactData, index) => {
            return new Promise((resolve) => {
                // Map common field names
                const mappedContact = mapContactFields(contactData);
                
                if (!mappedContact.name) {
                    errors.push(`Row ${index + 2}: Missing name`);
                    resolve();
                    return;
                }
                
                // Calculate next contact date
                const nextContactDate = new Date();
                nextContactDate.setDate(nextContactDate.getDate() + 7);
                
                const stmt = db.prepare(`
                    INSERT INTO contacts (name, company, email, phone, linkedin, position, next_contact_date, contact_frequency, notes, custom_fields, source)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                
                stmt.run([
                    mappedContact.name,
                    mappedContact.company,
                    mappedContact.email,
                    mappedContact.phone,
                    mappedContact.linkedin,
                    mappedContact.position,
                    nextContactDate.toISOString().split('T')[0],
                    7,
                    mappedContact.notes,
                    JSON.stringify(mappedContact.custom_fields),
                    'file_import'
                ], function(err) {
                    if (err) {
                        errors.push(`Row ${index + 2}: ${err.message}`);
                    } else {
                        // Create activity for imported contact
                        createActivity(this.lastID, 'contact_created', `Contact "${mappedContact.name}" was imported from file`, {
                            source: 'file_import',
                            company: mappedContact.company
                        });
                        imported++;
                    }
                    resolve();
                });
            });
        });
        
        Promise.all(insertPromises).then(() => {
            res.json({ 
                imported,
                errors,
                total: contacts.length
            });
        });
        
    } catch (error) {
        // Clean up uploaded file
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        res.status(500).json({ error: error.message });
    }
});

// Export contacts to CSV
app.get('/api/export', (req, res) => {
    db.all('SELECT * FROM contacts ORDER BY name', (err, contacts) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        if (contacts.length === 0) {
            res.status(404).json({ error: 'No contacts to export' });
            return;
        }
        
        // Prepare data for CSV export
        const exportData = contacts.map(contact => {
            const customFields = contact.custom_fields ? JSON.parse(contact.custom_fields) : {};
            return {
                name: contact.name,
                company: contact.company,
                email: contact.email,
                phone: contact.phone,
                linkedin: contact.linkedin,
                position: contact.position,
                last_contact_date: contact.last_contact_date,
                next_contact_date: contact.next_contact_date,
                contact_frequency: contact.contact_frequency,
                notes: contact.notes,
                source: contact.source,
                created_at: contact.created_at,
                updated_at: contact.updated_at,
                ...customFields
            };
        });
        
        // Create CSV
        const filename = `contacts-export-${new Date().toISOString().split('T')[0]}.csv`;
        const filepath = `./uploads/${filename}`;
        
        // Get all possible headers
        const allHeaders = new Set();
        exportData.forEach(contact => {
            Object.keys(contact).forEach(key => allHeaders.add(key));
        });
        
        const csvWriter = createCsvWriter({
            path: filepath,
            header: Array.from(allHeaders).map(header => ({ id: header, title: header }))
        });
        
        csvWriter.writeRecords(exportData)
            .then(() => {
                res.download(filepath, filename, (err) => {
                    if (err) {
                        console.error('Download error:', err);
                    }
                    // Clean up file after download
                    setTimeout(() => {
                        if (fs.existsSync(filepath)) {
                            fs.unlinkSync(filepath);
                        }
                    }, 5000);
                });
            })
            .catch(error => {
                res.status(500).json({ error: error.message });
            });
    });
});

// Helper function to map contact fields
function mapContactFields(data) {
    const mapped = {
        name: '',
        company: '',
        email: '',
        phone: '',
        linkedin: '',
        position: '',
        notes: '',
        custom_fields: {}
    };
    
    // Common field mappings (excluding name which we handle specially)
    const fieldMappings = {
        company: ['company', 'organization', 'business', 'employer'],
        email: ['email', 'email address', 'e-mail'],
        phone: ['phone', 'telephone', 'mobile', 'cell', 'phone number'],
        linkedin: ['linkedin', 'linkedin profile', 'linkedin url'],
        position: ['position', 'title', 'job title', 'role']
    };
    
    // Smart name handling
    let fullName = '';
    let firstName = '';
    let lastName = '';
    
    // Find name-related fields
    Object.keys(data).forEach(key => {
        const lowerKey = key.toLowerCase().trim();
        const value = (data[key] || '').toString().trim();
        
        if (['full name', 'name', 'contact name'].includes(lowerKey)) {
            fullName = value;
        } else if (['first name', 'firstname'].includes(lowerKey)) {
            firstName = value;
        } else if (['last name', 'lastname', 'surname'].includes(lowerKey)) {
            lastName = value;
        }
    });
    
    // Determine the best name to use
    if (fullName) {
        mapped.name = fullName;
    } else if (firstName && lastName) {
        mapped.name = `${firstName} ${lastName}`.trim();
    } else if (firstName) {
        mapped.name = firstName;
    } else if (lastName) {
        mapped.name = lastName;
    }
    
    // Map other known fields
    Object.keys(data).forEach(key => {
        const lowerKey = key.toLowerCase().trim();
        const value = data[key];
        let mapped_field = null;
        
        // Skip name fields as we've already handled them
        if (['full name', 'name', 'contact name', 'first name', 'firstname', 'last name', 'lastname', 'surname'].includes(lowerKey)) {
            return;
        }
        
        Object.keys(fieldMappings).forEach(field => {
            if (fieldMappings[field].includes(lowerKey)) {
                mapped_field = field;
            }
        });
        
        if (mapped_field) {
            mapped[mapped_field] = value;
        } else {
            // Store as custom field
            mapped.custom_fields[key] = value;
        }
    });
    
    return mapped;
}

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});