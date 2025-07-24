function app() {
    return {
        // State
        currentView: localStorage.getItem('bobCurrentView') || 'dashboard',
        // Simple Light/Dark theme system
        currentTheme: localStorage.getItem('bobTheme') || 'light',
        loading: false,
        contacts: [],
        filteredContacts: [],
        searchQuery: '',
        contactFilter: 'all',
        activeSettingsTab: localStorage.getItem('bobActiveSettingsTab') || 'general',
        selectedContact: null,
        showContactForm: false,
        dashboardData: {},
        showOverdue: false,
        showUpcoming: false,
        showAddContact: false,
        editMode: false,
        editedContact: {},
        newFieldKey: '',
        newFieldValue: '',
        contactMethod: '',
        contactDate: '',
        contactNotes: '',
        uploadResult: '',
        selectedContactIds: [],
        bulkContactMethod: '',
        bulkContactNotes: '',
        bulkTagId: '',
        showBulkActions: false,
        notesStatus: '',
        notesTimeout: null,
        
        // Tags state
        allTags: [],
        showTagManagement: false,
        newTagName: '',
        newTagColor: '#3b82f6',
        editingTag: null,
        
        // Activity Timeline state
        activities: [],
        timelineContactFilter: '',
        filteredActivities: [],
        showManualActivityForm: false,
        manualActivityContact: '',
        manualActivityDescription: '',
        
        // Enhanced search state
        showSearchTooltip: false,
        
        // Drag selection state
        isDragSelecting: false,
        dragStartY: 0,
        dragCurrentY: 0,
        
        // Bulk mark as contacted state
        showBulkContactForm: false,
        
        // Quick actions state
        hoveredContactId: null,
        
        // Scraper state
        scraperConfig: {
            login_url: '',
            customers_url: '',
            username: '',
            password: ''
        },
        scraperProgress: {
            isRunning: false,
            progress: {
                percentage: 0,
                message: 'Not running'
            }
        },
        scraperCustomersCount: 0,
        scraperErrors: '',
        showPassword: false,
        progressInterval: null,
        
        // UPDATED: Leadgen state - removed separate progress, sessions now handle everything
        leadgenConfig: {
            openai_api_key: '',
            openai_model: 'gpt-4',
            apollo_api_key: '',
            max_companies: 50,
            max_employees_per_company: 25,
            openai_prompt: ''
        },
        leadgenErrors: '',
        leadgenSessions: [],
        showOpenAIPassword: false,
        showApolloPassword: false,
        leadgenSessionsInterval: null,
        
        newContact: {
            name: '',
            company: '',
            email: '',
            phone: '',
            linkedin: '',
            website: '',
            position: '',
            contact_frequency: 15,
            notes: '',
            custom_fields: {}
        },
        
        // Import/Backup tracking
        lastImportDate: null,
        lastBackupDate: null,

        // Initialize
        async init() {
            // Set initial theme
            this.setTheme(this.currentTheme);
            
            // Load data
            await this.loadContacts();
            await this.loadDashboard();
            await this.loadTags();
            await this.loadScraperConfig();
            await this.loadScraperCustomersCount();
            await this.loadLeadgenConfig();
            await this.loadLeadgenSessions();
            await this.loadMetadata();
            
            // Load activities if on timeline view
            if (this.currentView === 'timeline') {
                await this.loadActivities();
            }
            
            // Initialize indicators after DOM is fully rendered
            setTimeout(() => {
                this.updateFilterIndicator();
                this.updateSettingsTabIndicator();
            }, 200);
            
            // Watch for theme changes
            this.$watch('currentTheme', (value) => {
                localStorage.setItem('bobTheme', value);
                this.setTheme(value);
            });

            // Watch for contact filter changes
            this.$watch('contactFilter', () => {
                this.filterContacts();
                this.updateFilterIndicator();
            });
            
            // Watch for timeline contact filter changes
            this.$watch('timelineContactFilter', () => {
                this.filterActivities();
            });
            
            // Watch for search query changes to show/hide tooltip
            this.$watch('searchQuery', (value) => {
                if (value && value.length > 0) {
                    this.showSearchTooltip = false;
                }
            });
            
            // Save current view and settings tab to localStorage
            this.$watch('currentView', (value) => {
                localStorage.setItem('bobCurrentView', value);
                // Reinitialize indicators when view changes
                this.$nextTick(() => {
                    setTimeout(() => {
                        this.updateFilterIndicator();
                        this.updateSettingsTabIndicator();
                    }, 100);
                });
            });
            
            this.$watch('activeSettingsTab', (value) => {
                localStorage.setItem('bobActiveSettingsTab', value);
                // Re-initialize feather icons when switching tabs
                this.$nextTick(() => {
                    if (typeof feather !== 'undefined') {
                        feather.replace();
                    }
                });
                // Update settings tab indicator
                this.updateSettingsTabIndicator();
            });
            
            // Watch for edit mode changes to reinitialize icons
            this.$watch('editMode', () => {
                this.$nextTick(() => {
                    if (typeof feather !== 'undefined') {
                        feather.replace();
                    }
                });
            });
            
            
        },

        // ================================
        // TAGS MANAGEMENT
        // ================================
        
        async loadTags() {
            try {
                const response = await fetch('/api/tags');
                this.allTags = await response.json();
            } catch (error) {
                console.error('Error loading tags:', error);
            }
        },
        
        async createTag() {
            if (!this.newTagName.trim()) {
                alert('Please enter a tag name');
                return;
            }
            
            try {
                const response = await fetch('/api/tags', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: this.newTagName.trim(),
                        color: this.newTagColor
                    })
                });
                
                if (response.ok) {
                    await this.loadTags();
                    this.newTagName = '';
                    this.newTagColor = '#3b82f6';
                    this.showBulkSuccessMessage(`Tag "${this.newTagName}" created successfully!`);
                } else {
                    const error = await response.json();
                    alert(error.error || 'Failed to create tag');
                }
            } catch (error) {
                console.error('Error creating tag:', error);
                alert('Error creating tag');
            }
        },
        
        async updateTag(tag) {
            try {
                const response = await fetch(`/api/tags/${tag.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: tag.name,
                        color: tag.color
                    })
                });
                
                if (response.ok) {
                    await this.loadTags();
                    await this.loadContacts(); // Reload to update tag colors
                    this.editingTag = null;
                    this.showBulkSuccessMessage('Tag updated successfully!');
                } else {
                    const error = await response.json();
                    alert(error.error || 'Failed to update tag');
                }
            } catch (error) {
                console.error('Error updating tag:', error);
                alert('Error updating tag');
            }
        },
        
        async deleteTag(tagId) {
            if (!confirm('Are you sure you want to delete this tag? It will be removed from all contacts.')) {
                return;
            }
            
            try {
                const response = await fetch(`/api/tags/${tagId}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    await this.loadTags();
                    await this.loadContacts(); // Reload to update contacts
                    this.showBulkSuccessMessage('Tag deleted successfully!');
                } else {
                    alert('Failed to delete tag');
                }
            } catch (error) {
                console.error('Error deleting tag:', error);
                alert('Error deleting tag');
            }
        },
        
        async addTagToContact(contactId, tagId) {
            try {
                const response = await fetch(`/api/contacts/${contactId}/tags`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tagId: tagId })
                });
                
                if (response.ok) {
                    await this.loadContacts();
                    // If viewing this contact, reload it
                    if (this.selectedContact && this.selectedContact.id === contactId) {
                        await this.selectContact(contactId);
                    }
                } else {
                    alert('Failed to add tag');
                }
            } catch (error) {
                console.error('Error adding tag:', error);
                alert('Error adding tag');
            }
        },
        
        async removeTagFromContact(contactId, tagId) {
            try {
                const response = await fetch(`/api/contacts/${contactId}/tags/${tagId}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    await this.loadContacts();
                    // If viewing this contact, reload it
                    if (this.selectedContact && this.selectedContact.id === contactId) {
                        await this.selectContact(contactId);
                    }
                } else {
                    alert('Failed to remove tag');
                }
            } catch (error) {
                console.error('Error removing tag:', error);
                alert('Error removing tag');
            }
        },
        
        getAvailableTagsForContact(contactId) {
            const contact = this.contacts.find(c => c.id === contactId);
            if (!contact) return this.allTags;
            
            const contactTagIds = contact.tags.map(t => t.id);
            return this.allTags.filter(tag => !contactTagIds.includes(tag.id));
        },
        
        // ================================
        // ACTIVITY TIMELINE
        // ================================
        
        async loadActivities() {
            try {
                const response = await fetch('/api/activities?limit=100');
                this.activities = await response.json();
                this.filterActivities();
                
                // Re-initialize feather icons for timeline
                this.$nextTick(() => {
                    if (typeof feather !== 'undefined') {
                        feather.replace();
                        // Force re-render of timeline icons
                        setTimeout(() => {
                            feather.replace();
                        }, 100);
                    }
                });
            } catch (error) {
                console.error('Error loading activities:', error);
            }
        },
        
        filterActivities() {
            if (!this.timelineContactFilter.trim()) {
                this.filteredActivities = this.activities;
            } else {
                const query = this.timelineContactFilter.toLowerCase().trim();
                this.filteredActivities = this.activities.filter(activity => 
                    activity.contact_name && activity.contact_name.toLowerCase().includes(query)
                );
            }
            
            // Re-initialize feather icons after filtering
            this.$nextTick(() => {
                if (typeof feather !== 'undefined') {
                    feather.replace();
                }
            });
            this.$nextTick(() => {
                if (typeof feather !== 'undefined') {
                    feather.replace();
                }
            });
        },
        
        async createManualActivity() {
            if (!this.manualActivityContact || !this.manualActivityDescription.trim()) {
                alert('Please select a contact and enter a description');
                return;
            }
            
            try {
                const response = await fetch('/api/activities', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contactId: this.manualActivityContact,
                        description: this.manualActivityDescription.trim()
                    })
                });
                
                if (response.ok) {
                    await this.loadActivities();
                    this.manualActivityContact = '';
                    this.manualActivityDescription = '';
                    this.showManualActivityForm = false;
                    this.showBulkSuccessMessage('Activity added successfully!');
                } else {
                    alert('Failed to create activity');
                }
            } catch (error) {
                console.error('Error creating activity:', error);
                alert('Error creating activity');
            }
        },
        
        formatActivityDate(dateString) {
            const date = new Date(dateString);
            const now = new Date();
            const diffTime = Math.abs(now - date);
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 0) {
                return 'Today at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else if (diffDays === 1) {
                return 'Yesterday at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else if (diffDays < 7) {
                return diffDays + ' days ago';
            } else {
                return date.toLocaleDateString();
            }
        },
        
        getActivityIcon(type) {
            const icons = {
                'contact_created': 'user-plus',
                'contact_updated': 'edit-3',
                'communication': 'message-circle',
                'communication_updated': 'edit',
                'communication_deleted': 'trash-2',
                'tag_added': 'tag',
                'tag_removed': 'x-circle',
                'manual_entry': 'clipboard'
            };
            return icons[type] || 'file-text';
        },

        
        getActivityColor(type) {
            const colors = {
                'contact_created': 'var(--success)',
                'contact_updated': 'var(--accent-primary)',
                'communication': 'var(--accent-primary)',
                'communication_updated': 'var(--warning)',
                'communication_deleted': 'var(--danger)',
                'tag_added': 'var(--success)',
                'tag_removed': 'var(--warning)',
                'manual_entry': 'var(--accent-secondary)'
            };
            return colors[type] || 'var(--text-secondary)';
        },
        
        viewContactTimeline(contactId) {
            this.currentView = 'timeline';
            this.timelineContactFilter = this.contacts.find(c => c.id === contactId)?.name || '';
            this.loadActivities();
        },
        
        // ================================
        // ENHANCED SEARCH
        // ================================
        
        showSearchHelp() {
            this.showSearchTooltip = true;
            setTimeout(() => {
                this.showSearchTooltip = false;
            }, 5000);
        },
        
        // ================================
        // QUICK ACTIONS
        // ================================
        
        setHoveredContact(contactId) {
            this.hoveredContactId = contactId;
            // Re-initialize feather icons for quick actions
            this.$nextTick(() => {
                if (typeof feather !== 'undefined') {
                    feather.replace();
                }
            });
        },
        
        clearHoveredContact() {
            this.hoveredContactId = null;
        },
        
        async quickScheduleFollowUp(contactId, days = 7) {
            try {
                const nextDate = new Date();
                nextDate.setDate(nextDate.getDate() + days);
                const nextDateStr = nextDate.toISOString().split('T')[0];
                
                const contact = this.contacts.find(c => c.id === contactId);
                
                const response = await fetch(`/api/contacts/${contactId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...contact,
                        next_contact_date: nextDateStr
                    })
                });
                
                if (response.ok) {
                    await this.loadContacts();
                    await this.loadDashboard();
                    this.showBulkSuccessMessage(`Follow-up scheduled for ${nextDateStr}`);
                } else {
                    alert('Failed to schedule follow-up');
                }
            } catch (error) {
                console.error('Error scheduling follow-up:', error);
                alert('Error scheduling follow-up');
            }
        },
        
        openEmailClient(email) {
            if (email) {
                window.open(`mailto:${email}`, '_blank');
            }
        },
        
        openLinkedIn(linkedinUrl) {
            if (linkedinUrl) {
                let url = linkedinUrl;
                if (!url.startsWith('http')) {
                    url = 'https://' + url;
                }
                window.open(url, '_blank');
            }
        },
        
        copyPhoneNumber(phone) {
            if (phone && navigator.clipboard) {
                navigator.clipboard.writeText(phone);
                this.showBulkSuccessMessage('Phone number copied to clipboard!');
            }
        },

        // Search and Filter Functionality
        filterContacts() {
            let contacts = this.contacts;
            
            // Apply contact filter first
            if (this.contactFilter === 'overdue') {
                contacts = contacts.filter(contact => this.isOverdue(contact.next_contact_date));
            } else if (this.contactFilter === 'upcoming') {
                contacts = contacts.filter(contact => this.isUpcoming(contact.next_contact_date));
            }
            
            // Then apply search filter if there's a search query
            if (this.searchQuery.trim()) {
                // If user is searching from a page other than contacts, switch to contacts page
                if (this.currentView !== 'contacts') {
                    this.currentView = 'contacts';
                }
                
                const query = this.searchQuery.toLowerCase().trim();
                contacts = contacts.filter(contact => {
                    // Search in basic fields
                    const basicMatch = (
                        contact.name.toLowerCase().includes(query) ||
                        (contact.company && contact.company.toLowerCase().includes(query)) ||
                        (contact.email && contact.email.toLowerCase().includes(query)) ||
                        (contact.phone && contact.phone.toLowerCase().includes(query)) ||
                        (contact.position && contact.position.toLowerCase().includes(query)) ||
                        (contact.notes && contact.notes.toLowerCase().includes(query))
                    );
                    
                    // Search in custom fields
                    const customFieldsMatch = contact.custom_fields && Object.values(contact.custom_fields).some(value => 
                        value && value.toString().toLowerCase().includes(query)
                    );
                    
                    // Search in tags
                    const tagsMatch = contact.tags && contact.tags.some(tag => 
                        tag.name.toLowerCase().includes(query)
                    );
                    
                    return basicMatch || customFieldsMatch || tagsMatch;
                });
            }
            
            this.filteredContacts = contacts;
            
            // Clear selections when filters change
            this.selectedContactIds = [];
            this.showBulkActions = false;
        },

        clearSearch() {
            this.searchQuery = '';
            this.filterContacts();
        },

        // Simple Theme Management
        toggleTheme() {
            this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
            this.setTheme(this.currentTheme);
        },

        setTheme(themeId) {
            this.currentTheme = themeId;
            document.documentElement.setAttribute('data-theme', themeId);
            localStorage.setItem('bobTheme', themeId);
        },

        // Date Helper Functions
        isOverdue(dateString) {
            if (!dateString) return false;
            const today = new Date().toISOString().split('T')[0];
            return dateString <= today;
        },

        isUpcoming(dateString) {
            if (!dateString) return false;
            const today = new Date();
            const nextWeek = new Date();
            nextWeek.setDate(today.getDate() + 7);
            
            const todayStr = today.toISOString().split('T')[0];
            const nextWeekStr = nextWeek.toISOString().split('T')[0];
            
            return dateString > todayStr && dateString <= nextWeekStr;
        },

        // API Methods
        async loadContacts() {
            try {
                this.loading = true;
                const response = await fetch('/api/contacts');
                this.contacts = await response.json();
                this.filterContacts(); // Update filtered contacts
                
                // Add staggered animation classes
                this.$nextTick(() => {
                    document.querySelectorAll('.contact-item').forEach((item, index) => {
                        item.classList.add('animate-in');
                        item.style.animationDelay = `${index * 50}ms`;
                    });
                });
            } catch (error) {
                console.error('Error loading contacts:', error);
            } finally {
                // Minimum loading time for better UX
                setTimeout(() => {
                    this.loading = false;
                }, 800);
            }
        },

        // Dashboard calculation methods










        async loadDashboard() {
            try {
                const response = await fetch('/api/dashboard');
                this.dashboardData = await response.json();
            } catch (error) {
                console.error('Error loading dashboard:', error);
            }
        },

        async selectContact(id) {
            try {
                const response = await fetch(`/api/contacts/${id}`);
                this.selectedContact = await response.json();
                // Ensure custom_fields is always an object
                if (!this.selectedContact.custom_fields) {
                    this.selectedContact.custom_fields = {};
                }
                // Ensure linkedin field exists
                if (!this.selectedContact.linkedin) {
                    this.selectedContact.linkedin = '';
                }
                // Ensure tags is always an array
                if (!this.selectedContact.tags) {
                    this.selectedContact.tags = [];
                }
                this.editedContact = { 
                    ...this.selectedContact,
                    linkedin: this.selectedContact.linkedin || '',
                    custom_fields: { ...this.selectedContact.custom_fields }
                };
                this.editMode = false;
                this.contactMethod = '';
                this.contactDate = new Date().toISOString().split('T')[0]; // Default to today
                this.contactNotes = '';
                this.newFieldKey = '';
                this.newFieldValue = '';
                
                // Add editing state to communications
                if (this.selectedContact.communications) {
                    this.selectedContact.communications.forEach(comm => {
                        comm.editing = false;
                        comm.originalNotes = comm.notes;
                    });
                }
                
                // Re-initialize feather icons for contact detail view
                this.$nextTick(() => {
                    if (typeof feather !== 'undefined') {
                        feather.replace();
                    }
                });
            } catch (error) {
                console.error('Error loading contact:', error);
            }
        },

        async updateContact() {
            try {
                const response = await fetch(`/api/contacts/${this.selectedContact.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.editedContact)
                });
                
                if (response.ok) {
                    // Update the selectedContact with the edited data
                    this.selectedContact = { 
                        ...this.editedContact,
                        linkedin: this.editedContact.linkedin || '',
                        custom_fields: { ...this.editedContact.custom_fields },
                        tags: this.selectedContact.tags // Keep existing tags
                    };
                    this.editMode = false;
                    await this.loadContacts();
                    await this.loadDashboard();
                }
            } catch (error) {
                console.error('Error updating contact:', error);
            }
        },

        async deleteContact(contactId) {
            if (!confirm('Are you sure you want to delete this contact?')) {
                return;
            }

            try {
                const response = await fetch(`/api/contacts/${contactId}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    this.selectedContact = null;
                    await this.loadContacts();
                    await this.loadDashboard();
                }
            } catch (error) {
                console.error('Error deleting contact:', error);
            }
        },

        async bulkDeleteContacts() {
            if (this.selectedContactIds.length === 0) {
                alert('Please select contacts to delete');
                return;
            }

            if (!confirm(`Are you sure you want to delete ${this.selectedContactIds.length} contact(s)?`)) {
                return;
            }

            try {
                const response = await fetch('/api/contacts/bulk-delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contactIds: this.selectedContactIds })
                });
                
                if (response.ok) {
                    this.selectedContactIds = [];
                    this.showBulkActions = false;
                    await this.loadContacts();
                    await this.loadDashboard();
                }
            } catch (error) {
                console.error('Error bulk deleting contacts:', error);
            }
        },

        async bulkAddTag() {
            if (this.selectedContactIds.length === 0) {
                alert('Please select contacts first');
                return;
            }

            if (!this.bulkTagId) {
                alert('Please select a tag');
                return;
            }

            try {
                // Use existing endpoint for each contact
                const promises = this.selectedContactIds.map(contactId =>
                    fetch(`/api/contacts/${contactId}/tags`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            tagId: this.bulkTagId
                        }),
                    })
                );

                const responses = await Promise.all(promises);
                const allSuccessful = responses.every(response => response.ok);

                if (allSuccessful) {
                    // Show success message
                    const count = this.selectedContactIds.length;
                    const tagName = this.allTags.find(tag => tag.id == this.bulkTagId)?.name || 'tag';
                    const message = count === 1 ? 
                        `Great! Added "${tagName}" to 1 contact` : 
                        `Awesome! Added "${tagName}" to ${count} contacts`;
                    
                    this.showBulkSuccessMessage(message);
                    
                    await this.loadContacts();
                    this.selectedContactIds = [];
                    this.showBulkActions = false;
                    this.bulkTagId = '';
                } else {
                    alert('Error adding tags to some contacts');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Error adding tags to contacts');
            }
        },

        async bulkMarkAsContacted() {
            if (this.selectedContactIds.length === 0) {
                alert('Please select contacts to mark as contacted');
                return;
            }

            if (!this.bulkContactMethod) {
                alert('Please select a contact method');
                return;
            }

            try {
                const response = await fetch('/api/contacts/bulk-contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contactIds: this.selectedContactIds,
                        method: this.bulkContactMethod,
                        notes: this.bulkContactNotes
                    })
                });
                
                if (response.ok) {
                    // Show celebration for bulk action
                    const count = this.selectedContactIds.length;
                    const message = count === 1 ? 
                        'Nice work! 1 contact updated' : 
                        `Amazing! ${count} contacts updated`;
                    
                    this.showBulkSuccessMessage(message);
                    
                    this.selectedContactIds = [];
                    this.bulkContactMethod = '';
                    this.bulkContactNotes = '';
                    this.bulkContactDate = '';
                    this.showBulkActions = false;
                    this.showBulkContactForm = false;
                    await this.loadContacts();
                    await this.loadDashboard();
                } else {
                    alert('Error marking contacts as contacted');
                }
            } catch (error) {
                console.error('Error bulk marking as contacted:', error);
            }
        },

        // Success messaging
        showBulkSuccessMessage(message) {
            // Create and show success message element
            const successDiv = document.createElement('div');
            successDiv.className = 'success-message';
            successDiv.textContent = message;
            
            // Insert at top of main content
            const mainContent = document.querySelector('.app-main');
            if (mainContent) {
                mainContent.insertBefore(successDiv, mainContent.firstChild);
                
                // Remove after 4 seconds
                setTimeout(() => {
                    if (successDiv.parentNode) {
                        successDiv.remove();
                    }
                }, 4000);
            }
        },

        toggleContactSelection(contactId) {
            const index = this.selectedContactIds.indexOf(contactId);
            if (index > -1) {
                this.selectedContactIds.splice(index, 1);
            } else {
                this.selectedContactIds.push(contactId);
            }
            this.showBulkActions = this.selectedContactIds.length > 0;
            
            // Re-initialize feather icons for quick actions that appear in bulk mode
            this.$nextTick(() => {
                if (typeof feather !== 'undefined') {
                    feather.replace();
                }
            });
        },

        selectAllContacts() {
            // Work with filtered contacts instead of all contacts
            if (this.selectedContactIds.length === this.filteredContacts.length) {
                this.selectedContactIds = [];
                this.showBulkActions = false;
            } else {
                this.selectedContactIds = this.filteredContacts.map(c => c.id);
                this.showBulkActions = true;
            }
            
            // Re-initialize feather icons for quick actions
            this.$nextTick(() => {
                if (typeof feather !== 'undefined') {
                    feather.replace();
                }
            });
        },

        cancelEdit() {
            this.editMode = false;
            this.editedContact = { 
                ...this.selectedContact,
                linkedin: this.selectedContact.linkedin || '',
                custom_fields: { ...this.selectedContact.custom_fields }
            };
            this.newFieldKey = '';
            this.newFieldValue = '';
        },

        // Custom field management
        addCustomField() {
            if (!this.newFieldKey.trim() || !this.newFieldValue.trim()) {
                alert('Please enter both field name and value');
                return;
            }
            
            if (!this.editedContact.custom_fields) {
                this.editedContact.custom_fields = {};
            }
            
            this.editedContact.custom_fields[this.newFieldKey.trim()] = this.newFieldValue.trim();
            this.newFieldKey = '';
            this.newFieldValue = '';
        },

        removeCustomField(fieldKey) {
            if (confirm(`Remove field "${fieldKey}"?`)) {
                if (this.editedContact.custom_fields) {
                    delete this.editedContact.custom_fields[fieldKey];
                }
            }
        },

        // Notes auto-save functionality
        updateNotesDebounced() {
            // Safety check - don't update if no contact is selected
            if (!this.selectedContact) {
                return;
            }
            
            // Clear existing timeout
            if (this.notesTimeout) {
                clearTimeout(this.notesTimeout);
            }
            
            // Show saving status
            this.notesStatus = 'Saving...';
            
            // Set new timeout to save after 1.5 seconds of no typing
            this.notesTimeout = setTimeout(async () => {
                await this.saveNotes();
            }, 1500);
        },

        async saveNotes() {
            // Safety check - don't save if no contact is selected
            if (!this.selectedContact) {
                this.notesStatus = '';
                return;
            }
            
            try {
                const response = await fetch(`/api/contacts/${this.selectedContact.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...this.selectedContact,
                        notes: this.selectedContact.notes
                    })
                });
                
                if (response.ok) {
                    this.notesStatus = 'Saved ✓';
                    // Hide status after 2 seconds
                    setTimeout(() => {
                        this.notesStatus = '';
                    }, 2000);
                } else {
                    this.notesStatus = 'Error saving';
                    setTimeout(() => {
                        this.notesStatus = '';
                    }, 3000);
                }
            } catch (error) {
                console.error('Error saving notes:', error);
                this.notesStatus = 'Error saving';
                setTimeout(() => {
                    this.notesStatus = '';
                }, 3000);
            }
        },

        // Communication history management
        editCommunication(comm) {
            // Cancel any other editing communications
            if (this.selectedContact.communications) {
                this.selectedContact.communications.forEach(c => {
                    if (c !== comm) {
                        c.editing = false;
                        c.editedNotes = c.notes;
                    }
                });
            }
            
            comm.editing = true;
            comm.editedNotes = comm.notes || '';
        },

        cancelEditCommunication(comm) {
            comm.editing = false;
            comm.editedNotes = comm.notes;
        },

        async saveCommunication(comm) {
            try {
                const response = await fetch(`/api/communications/${comm.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        notes: comm.editedNotes
                    })
                });
                
                if (response.ok) {
                    comm.notes = comm.editedNotes;
                    comm.editing = false;
                    this.showSuccessMessage('Communication updated successfully');
                } else {
                    alert('Error updating communication');
                }
            } catch (error) {
                console.error('Error updating communication:', error);
                alert('Error updating communication');
            }
        },

        async deleteCommunication(commId) {
            if (!confirm('Are you sure you want to delete this communication?')) {
                return;
            }

            try {
                const response = await fetch(`/api/communications/${commId}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    // Remove from the communications array
                    this.selectedContact.communications = this.selectedContact.communications.filter(c => c.id !== commId);
                    this.showSuccessMessage('Communication deleted successfully');
                    
                    // Refresh contact to update next contact date if needed
                    await this.selectContact(this.selectedContact.id);
                    await this.loadContacts();
                    await this.loadDashboard();
                } else {
                    alert('Error deleting communication');
                }
            } catch (error) {
                console.error('Error deleting communication:', error);
                alert('Error deleting communication');
            }
        },

        // Helper functions for clickable content
        isEmail(text) {
            if (!text) return false;
            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            return emailRegex.test(text.toString().trim());
        },

        isURL(text) {
            if (!text) return false;
            const textStr = text.toString().trim();
            
            // More strict URL detection
            const urlPatterns = [
                /^https?:\/\/.+\..+/i,                    // http://something.com
                /^www\..+\..+/i,                          // www.something.com
                /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$/,         // domain.com (no subdomains, simple)
                /^[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$/,  // subdomain.domain.com
                /linkedin\.com\/in\/.+/i                  // LinkedIn profiles
            ];
            
            return urlPatterns.some(pattern => pattern.test(textStr)) && 
                   !this.isEmail(textStr) && // Don't treat emails as URLs
                   textStr.includes('.') && // Must have a dot
                   textStr.length > 4; // Reasonable minimum length
        },

        formatClickableContent(text) {
            if (!text) return 'N/A';
            
            const textStr = text.toString().trim();
            
            if (this.isEmail(textStr)) {
                return `<a href="mailto:${textStr}">${textStr}</a>`;
            }
            
            if (this.isURL(textStr)) {
                const href = textStr.toLowerCase().startsWith('http') ? textStr : 'https://' + textStr;
                return `<a href="${href}" target="_blank" rel="noopener noreferrer">${textStr}</a>`;
            }
            
            return textStr;
        },

        async addContact() {
            try {
                // Add loading state to submit button
                const submitBtn = document.querySelector('button[type="submit"]');
                if (submitBtn) {
                    submitBtn.classList.add('loading');
                    submitBtn.disabled = true;
                }
                
                const response = await fetch('/api/contacts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.newContact)
                });
                
                if (response.ok) {
                    // Success animation
                    const modal = document.querySelector('.modal');
                    if (modal) {
                        modal.classList.add('success-flash');
                        setTimeout(() => modal.classList.remove('success-flash'), 600);
                    }
                    
                    // Show friendly success message
                    this.showBulkSuccessMessage(`Welcome ${this.newContact.name}! Contact added successfully`);
                    
                    setTimeout(() => {
                        this.showAddContact = false;
                        this.newContact = {
                            name: '',
                            company: '',
                            email: '',
                            phone: '',
                            linkedin: '',
                            position: '',
                            contact_frequency: 15,
                            notes: '',
                            custom_fields: {}
                        };
                    }, 500);
                    
                    await this.loadContacts();
                    await this.loadDashboard();
                }
            } catch (error) {
                console.error('Error adding contact:', error);
                // Show error state
                const modal = document.querySelector('.modal');
                if (modal) {
                    modal.classList.add('shake');
                    setTimeout(() => modal.classList.remove('shake'), 500);
                }
            } finally {
                // Remove loading state
                const submitBtn = document.querySelector('button[type="submit"]');
                if (submitBtn) {
                    submitBtn.classList.remove('loading');
                    submitBtn.disabled = false;
                }
            }
        },

        async markAsContacted() {
            if (!this.contactMethod) {
                alert('Please select a contact method');
                return;
            }
            
            if (!this.contactDate) {
                alert('Please select a contact date');
                return;
            }

            try {
                const response = await fetch(`/api/contacts/${this.selectedContact.id}/contact`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        method: this.contactMethod,
                        date: this.contactDate,
                        notes: this.contactNotes
                    })
                });
                
                if (response.ok) {
                    const result = await response.json();
                    console.log('Contact marked as contacted:', result);
                    
                    // Show success message
                    this.showSuccessMessage(`Great job! ${this.selectedContact.name} is all caught up`);
                    
                    // Add a small delay to ensure database operations complete
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    // Refresh contact details, contacts list, and dashboard
                    await this.selectContact(this.selectedContact.id);
                    await this.loadContacts();
                    await this.loadDashboard();
                    
                    this.contactMethod = '';
                    this.contactDate = new Date().toISOString().split('T')[0]; // Reset to today
                    this.contactNotes = '';
                } else {
                    const error = await response.json();
                    console.error('Error response:', error);
                    alert(`Error: ${error.error || 'Failed to mark as contacted'}`);
                }
            } catch (error) {
                console.error('Error marking as contacted:', error);
                alert('Error marking as contacted');
            }
        },

        // Success messaging
        showSuccessMessage(message) {
            // Create and show success message element
            const successDiv = document.createElement('div');
            successDiv.className = 'success-message';
            successDiv.textContent = message;
            
            // Insert at top of modal body
            const modalBody = document.querySelector('.modal-body');
            if (modalBody) {
                modalBody.insertBefore(successDiv, modalBody.firstChild);
                
                // Remove after 3 seconds
                setTimeout(() => {
                    if (successDiv.parentNode) {
                        successDiv.remove();
                    }
                }, 3000);
            }
        },

        // Drag selection functionality
        startDragSelect(event) {
            if (!this.showBulkActions) return;
            
            // Only start drag selection on left mouse button
            if (event.button !== 0) return;
            
            // Don't start drag selection if clicking on interactive elements
            if (event.target.closest('button, input, select, a, .contact-checkbox')) return;
            
            this.isDragSelecting = true;
            this.dragStartY = event.clientY;
            this.dragCurrentY = event.clientY;
            
            // Prevent text selection during drag
            event.preventDefault();
        },

        updateDragSelect(event) {
            if (!this.isDragSelecting || !this.showBulkActions) return;
            
            this.dragCurrentY = event.clientY;
            
            // Get all contact elements
            const contactElements = document.querySelectorAll('.contact-item');
            
            // Determine selection range
            const minY = Math.min(this.dragStartY, this.dragCurrentY);
            const maxY = Math.max(this.dragStartY, this.dragCurrentY);
            
            // Select contacts in the drag range
            contactElements.forEach((element, index) => {
                const rect = element.getBoundingClientRect();
                const contactCenterY = rect.top + rect.height / 2;
                
                if (contactCenterY >= minY && contactCenterY <= maxY) {
                    const contact = this.filteredContacts[index];
                    if (contact && !this.selectedContactIds.includes(contact.id)) {
                        this.selectedContactIds.push(contact.id);
                    }
                }
            });
        },

        endDragSelect(event) {
            if (!this.isDragSelecting) return;
            
            this.isDragSelecting = false;
            this.dragStartY = 0;
            this.dragCurrentY = 0;
        },

        async exportContacts() {
            try {
                const response = await fetch('/api/export');
                if (response.ok) {
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `contacts-export-${new Date().toISOString().split('T')[0]}.csv`;
                    a.click();
                    window.URL.revokeObjectURL(url);
                    
                    // Show success message
                    this.showBulkSuccessMessage('Contacts exported successfully!');
                    
                    // Refresh metadata to get new backup timestamp
                    await this.loadMetadata();
                } else {
                    const error = await response.json();
                    alert(error.error || 'Export failed');
                }
            } catch (error) {
                console.error('Error exporting contacts:', error);
                alert('Export failed');
            }
        },

        // UI Methods
        showOverdueContacts() {
            this.currentView = 'contacts';
            this.contactFilter = 'overdue';
        },

        showUpcomingContacts() {
            this.currentView = 'contacts';
            this.contactFilter = 'upcoming';
        },

        goToContactsPage() {
            this.currentView = 'contacts';
            this.contactFilter = 'all';
        },

        // File Upload Methods
        handleFileSelect(event) {
            const file = event.target.files[0];
            if (file) {
                this.uploadFile(file);
            }
        },

        handleFileDrop(event) {
            const file = event.dataTransfer.files[0];
            if (file) {
                this.uploadFile(file);
            }
        },

        async uploadFile(file) {
            const formData = new FormData();
            formData.append('file', file);

            try {
                this.uploadResult = 'Processing your file...';
                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();
                
                if (response.ok) {
                    const successMsg = `Great job! Successfully imported ${result.imported} of ${result.total} contacts`;
                    this.uploadResult = result.errors.length > 0 
                        ? `${successMsg} Some contacts had issues: ${result.errors.join(', ')}`
                        : successMsg;
                    
                    await this.loadContacts();
                    await this.loadDashboard();
                    await this.loadMetadata(); // Refresh metadata to get new import timestamp
                } else {
                    this.uploadResult = `Oops! ${result.error}`;
                }
            } catch (error) {
                this.uploadResult = `Something went wrong: ${error.message}`;
                console.error('Upload error:', error);
            }
        },

        // Scraper Methods (existing)
        async loadScraperConfig() {
            try {
                const response = await fetch('/api/scraper/config');
                if (response.ok) {
                    const config = await response.json();
                    // Always load the config values (masked or not)
                    this.scraperConfig = { ...this.scraperConfig, ...config };
                }
            } catch (error) {
                console.error('Error loading scraper config:', error);
            }
        },

        async saveScraperConfig() {
            try {
                const response = await fetch('/api/scraper/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.scraperConfig)
                });

                if (response.ok) {
                    this.showBulkSuccessMessage('Scraper configuration saved successfully!');
                    await this.loadScraperConfig(); // Reload to get masked password
                } else {
                    const error = await response.json();
                    alert(`Error saving configuration: ${error.error}`);
                }
            } catch (error) {
                console.error('Error saving scraper config:', error);
                alert('Error saving scraper configuration');
            }
        },

        async loadScraperCustomersCount() {
            try {
                const response = await fetch('/api/scraper/customers/count');
                if (response.ok) {
                    const result = await response.json();
                    this.scraperCustomersCount = result.count;
                }
            } catch (error) {
                console.error('Error loading scraped customers count:', error);
            }
        },

        async runScraper() {
            try {
                this.scraperErrors = '';
                const response = await fetch('/api/scraper/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                const result = await response.json();
                
                if (response.ok) {
                    this.scraperProgress.isRunning = true;
                    this.startProgressPolling();
                } else {
                    this.scraperErrors = result.error || 'Failed to start scraper';
                }
            } catch (error) {
                console.error('Error running scraper:', error);
                this.scraperErrors = `Error starting scraper: ${error.message}`;
            }
        },

        startProgressPolling() {
            if (this.progressInterval) {
                clearInterval(this.progressInterval);
            }

            this.progressInterval = setInterval(async () => {
                try {
                    const response = await fetch('/api/scraper/progress');
                    if (response.ok) {
                        const progress = await response.json();
                        this.scraperProgress = progress;

                        if (!progress.isRunning) {
                            clearInterval(this.progressInterval);
                            this.progressInterval = null;
                            
                            // Refresh customers count
                            await this.loadScraperCustomersCount();
                            
                            if (progress.progress && progress.progress.percentage === 100) {
                                this.showBulkSuccessMessage('Customer scraping completed successfully!');
                            } else if (progress.progress && progress.progress.message && progress.progress.message.includes('Error')) {
                                this.scraperErrors = progress.progress.message;
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error polling scraper progress:', error);
                    clearInterval(this.progressInterval);
                    this.progressInterval = null;
                    this.scraperProgress.isRunning = false;
                }
            }, 1000); // Poll every second
        },

        togglePasswordVisibility() {
            this.showPassword = !this.showPassword;
        },

        // UPDATED: Leadgen Methods - simplified with session-based approach
        async loadLeadgenConfig() {
            try {
                const response = await fetch('/api/leadgen/config');
                if (response.ok) {
                    const config = await response.json();
                    
                    // Always load the config values (masked or not)
                    this.leadgenConfig.openai_api_key = config.openai_api_key || '';
                    this.leadgenConfig.apollo_api_key = config.apollo_api_key || '';
                    this.leadgenConfig.openai_model = config.openai_model || 'gpt-4';
                    this.leadgenConfig.max_companies = config.max_companies || 50;
                    this.leadgenConfig.request_delay = config.request_delay || 1.2;
                }
            } catch (error) {
                console.error('Error loading leadgen config:', error);
            }
        },

        async saveLeadgenConfig() {
            // Validate API keys before saving
            if (!this.leadgenConfig.openai_api_key) {
                alert('Please enter your OpenAI API key');
                return;
            }

            if (!this.leadgenConfig.apollo_api_key) {
                alert('Please enter your Apollo API key');
                return;
            }

            // Don't save if the API keys are still masked (user hasn't changed them)
            if (this.leadgenConfig.openai_api_key.includes('•') || this.leadgenConfig.openai_api_key.includes('*')) {
                alert('Please enter your actual OpenAI API key (click the field to enter a new key)');
                return;
            }

            if (this.leadgenConfig.apollo_api_key.includes('•') || this.leadgenConfig.apollo_api_key.includes('*')) {
                alert('Please enter your actual Apollo API key (click the field to enter a new key)');
                return;
            }

            if (!this.leadgenConfig.openai_api_key.startsWith('sk-')) {
                alert('Invalid OpenAI API key format. Should start with "sk-"');
                return;
            }

            try {
                const response = await fetch('/api/leadgen/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.leadgenConfig)
                });

                if (response.ok) {
                    this.showBulkSuccessMessage('Lead generation configuration saved successfully!');
                    // Reload config to get the masked values back
                    await this.loadLeadgenConfig();
                } else {
                    const error = await response.json();
                    alert(`Error saving configuration: ${error.error}`);
                }
            } catch (error) {
                console.error('Error saving leadgen config:', error);
                alert('Error saving lead generation configuration');
            }
        },

        async loadLeadgenSessions() {
            try {
                const response = await fetch('/api/leadgen/sessions');
                if (response.ok) {
                    this.leadgenSessions = await response.json();
                }
            } catch (error) {
                console.error('Error loading leadgen sessions:', error);
            }
        },
        
        async loadMetadata() {
            try {
                const response = await fetch('/api/metadata');
                if (response.ok) {
                    const metadata = await response.json();
                    this.lastImportDate = metadata.last_import_date;
                    this.lastBackupDate = metadata.last_backup_date;
                }
            } catch (error) {
                console.error('Error loading metadata:', error);
            }
        },

        async runLeadGeneration() {
            try {
                this.leadgenErrors = '';
                const response = await fetch('/api/leadgen/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                const result = await response.json();
                
                if (response.ok) {
                    // Immediately refresh sessions to show the new running session
                    await this.loadLeadgenSessions();
                    this.startLeadgenSessionsPolling();
                } else {
                    this.leadgenErrors = result.error || 'Failed to start lead generation';
                }
            } catch (error) {
                console.error('Error running lead generation:', error);
                this.leadgenErrors = `Error starting lead generation: ${error.message}`;
            }
        },

        async cancelLeadGeneration() {
            try {
                const response = await fetch('/api/leadgen/cancel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                const result = await response.json();
                
                if (response.ok) {
                    // Show cancellation message
                    this.showBulkSuccessMessage('Lead generation cancellation requested...');
                    
                    // Refresh sessions immediately to show cancelled state
                    await this.loadLeadgenSessions();
                } else {
                    console.error('Cancel request failed:', result.message);
                }
            } catch (error) {
                console.error('Error cancelling lead generation:', error);
            }
        },

        startLeadgenSessionsPolling() {
            if (this.leadgenSessionsInterval) {
                clearInterval(this.leadgenSessionsInterval);
            }

            this.leadgenSessionsInterval = setInterval(async () => {
                try {
                    await this.loadLeadgenSessions();
                    
                    // Check if there are any running sessions
                    const hasRunningSession = this.leadgenSessions.some(session => session.status === 'running');
                    
                    if (!hasRunningSession) {
                        // No running sessions, stop polling
                        clearInterval(this.leadgenSessionsInterval);
                        this.leadgenSessionsInterval = null;
                        
                        // Refresh contacts and dashboard data
                        await this.loadContacts();
                        await this.loadDashboard();
                        
                        // Check if the latest session completed successfully
                        if (this.leadgenSessions.length > 0) {
                            const latestSession = this.leadgenSessions[0];
                            if (latestSession.status === 'completed') {
                                this.showBulkSuccessMessage('Lead generation completed successfully! New leads added to contacts.');
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error polling leadgen sessions:', error);
                    clearInterval(this.leadgenSessionsInterval);
                    this.leadgenSessionsInterval = null;
                }
            }, 1000); // Poll every second
        },

        // Check if any session is currently running
        hasRunningLeadgenSession() {
            return this.leadgenSessions.some(session => session.status === 'running');
        },

        toggleOpenAIPasswordVisibility() {
            this.showOpenAIPassword = !this.showOpenAIPassword;
        },

        toggleApolloPasswordVisibility() {
            this.showApolloPassword = !this.showApolloPassword;
        },

        getDefaultPrompt() {
            return `Generate a CSV list of {count} REAL US-based engineering and manufacturing companies (10-1000 employees).

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

Provide exactly {count} entries in this CSV format:`;
        },

        formatDate(dateString) {
            if (!dateString) return 'N/A';
            const date = new Date(dateString);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        },
        
        formatRelativeDate(dateString) {
            if (!dateString) return 'Never';
            
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffMinutes = Math.floor(diffMs / (1000 * 60));
            
            if (diffMinutes < 1) return 'Just now';
            if (diffMinutes < 60) return `${diffMinutes}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays < 30) return `${diffDays}d ago`;
            if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
            return `${Math.floor(diffDays / 365)}y ago`;
        },

        getSessionStatusColor(status) {
            switch (status) {
                case 'completed': return 'var(--completed-accent)';
                case 'failed': return 'var(--danger)';
                case 'running': return 'var(--accent-primary)';
                case 'cancelled': return 'var(--warning)';
                default: return 'var(--text-secondary)';
            }
        },

        updateFilterIndicator() {
            // Only update if we're on the contacts page
            if (this.currentView !== 'contacts') return;
            
            // Wait for DOM to be ready
            this.$nextTick(() => {
                const indicator = document.querySelector('.filter-indicator');
                const activeButton = document.querySelector(`.filter-btn.filter-${this.contactFilter}`);
                
                if (indicator && activeButton && activeButton.offsetParent !== null) {
                    const container = activeButton.parentElement;
                    const containerRect = container.getBoundingClientRect();
                    const buttonRect = activeButton.getBoundingClientRect();
                    
                    // Simple calculation - match button position relative to container
                    const leftPosition = buttonRect.left - containerRect.left;
                    const topPosition = buttonRect.top - containerRect.top;
                    const width = buttonRect.width;
                    const height = buttonRect.height;
                    
                    // Update indicator position and size to match button exactly
                    indicator.style.left = `${leftPosition}px`;
                    indicator.style.top = `${topPosition}px`;
                    indicator.style.width = `${width}px`;
                    indicator.style.height = `${height}px`;
                }
            });
        },

        updateSettingsTabIndicator() {
            // Only update if we're on the settings page
            if (this.currentView !== 'settings') return;
            
            // Wait for DOM to be ready
            this.$nextTick(() => {
                const indicator = document.querySelector('.settings-tab-indicator');
                const activeButton = document.querySelector(`.settings-tab-${this.activeSettingsTab}`);
                
                if (indicator && activeButton && activeButton.offsetParent !== null) {
                    const container = activeButton.parentElement;
                    const containerRect = container.getBoundingClientRect();
                    const buttonRect = activeButton.getBoundingClientRect();
                    
                    // Simple calculation - match button position relative to container
                    const leftPosition = buttonRect.left - containerRect.left;
                    const topPosition = buttonRect.top - containerRect.top;
                    const width = buttonRect.width;
                    const height = buttonRect.height;
                    
                    // Update indicator position and size to match button exactly
                    indicator.style.left = `${leftPosition}px`;
                    indicator.style.top = `${topPosition}px`;
                    indicator.style.width = `${width}px`;
                    indicator.style.height = `${height}px`;
                }
            });
        }
    }
}