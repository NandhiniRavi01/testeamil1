import React, { useState, useEffect } from 'react';
import { FiZap, FiSearch, FiDownload, FiRefreshCw, FiBriefcase, FiGlobe, FiMail, FiLinkedin, FiX, FiCpu, FiFile, FiBarChart2, FiCheck, FiSave, FiTrash2, FiMapPin, FiPhone, FiChevronDown, FiTwitter, FiUsers, FiLoader } from 'react-icons/fi';
import './WebScrapingTab.css';
import SplashScreen from './SplashScreen';

const WebScrapingTab = () => {
  const [formData, setFormData] = useState({
    keywords: '',
    leadLimit: 5,
    sources: ['linkedin'] // Default to LinkedIn
  });

  const [suggestions, setSuggestions] = useState({
    keywords: []
  });

  const [showSuggestions, setShowSuggestions] = useState({
    keywords: false
  });

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [showError, setShowError] = useState(false);
  const [openDropdowns, setOpenDropdowns] = useState({});
  const [showSplash, setShowSplash] = useState(false);

  // Available data sources - Only LinkedIn and Twitter
  const availableSources = [
    { id: 'linkedin', name: 'LinkedIn', icon: FiLinkedin, color: '#0077b5' },
    { id: 'twitter', name: 'Twitter', icon: FiTwitter, color: '#1DA1F2' }
  ];

  const suggestionLists = {
    keywords: [
      'CEO Technology Startup',
      'CTO Software Development',
      'CMO Digital Marketing',
      'Product Manager Tech',
      'Founder Startup',
      'VP Engineering',
      'Data Scientist',
      'UX Designer',
      'Sales Director',
      'HR Manager'
    ]
  };

  useEffect(() => {
    loadSuggestions();
  }, []);

  const loadSuggestions = async () => {
    try {
      console.log('Suggestions loaded');
    } catch (error) {
      console.log('Could not load suggestions from API');
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    if (value.length > 0 && field === 'keywords') {
      const filtered = suggestionLists[field].filter(item =>
        item.toLowerCase().includes(value.toLowerCase())
      );
      setSuggestions(prev => ({
        ...prev,
        [field]: filtered
      }));
      setShowSuggestions(prev => ({
        ...prev,
        [field]: filtered.length > 0
      }));
    } else {
      setShowSuggestions(prev => ({
        ...prev,
        [field]: false
      }));
    }
  };

  const handleSourceToggle = (sourceId) => {
    setFormData(prev => ({
      ...prev,
      sources: prev.sources.includes(sourceId)
        ? prev.sources.filter(id => id !== sourceId)
        : [...prev.sources, sourceId]
    }));
  };

  const selectSuggestion = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setShowSuggestions(prev => ({
      ...prev,
      [field]: false
    }));
  };

  const hideSuggestions = (field) => {
    setTimeout(() => {
      setShowSuggestions(prev => ({
        ...prev,
        [field]: false
      }));
    }, 200);
  };

  const toggleDropdown = (leadId) => {
    setOpenDropdowns(prev => ({
      ...prev,
      [leadId]: !prev[leadId]
    }));
  };

  const generateLeads = async () => {
    const { keywords, leadLimit, sources } = formData;

    if (!keywords.trim()) {
      showErrorMsg('Please enter search keywords');
      return;
    }

    if (sources.length === 0) {
      showErrorMsg('Please select at least one data source');
      return;
    }

    setLoading(true);
    setShowSplash(true);
    setProgress(0);
    setOpenDropdowns({});

    try {
      // Build queries for each selected source
      const queries = sources.map(source => {
        // Split keywords into individual terms and wrap each in quotes
        const keywordTerms = keywords.split(',')
          .map(term => term.trim())
          .filter(term => term.length > 0)
          .map(term => `"${term}"`)
          .join(' ');

        let baseQuery = '';

        switch (source) {
          case 'linkedin':
            baseQuery = `site:linkedin.com/in ${keywordTerms}`;
            break;
          case 'twitter':
            baseQuery = `site:x.com ${keywordTerms}`;
            break;
          default:
            baseQuery = keywordTerms;
        }

        return {
          source: source,
          query: baseQuery,
          keywords: keywords
        };
      });

      const requestData = {
        query: queries[0].query,
        max_leads: leadLimit,
        keywords: keywords
      };

      console.log("Generated queries:", queries);

      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 85) {
            clearInterval(progressInterval);
            return 85;
          }
          return prev + 2 + Math.random() * 3;
        });
      }, 600);

      // const response = await fetch('http://65.1.129.37:5000/webscraping/generate-leads', {
      //     method: 'POST',
      //     headers: {
      //         'Content-Type': 'application/json',
      //     },
      //     body: JSON.stringify(requestData)
      // });

      const response = await fetch('http://65.1.129.37:5000/webscraping/generate-leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
      });

      clearInterval(progressInterval);
      setProgress(100);

      await new Promise(resolve => setTimeout(resolve, 800));

      const data = await response.json();
      console.log(data)
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate leads');
      }

      setResults(data);
      setLoading(false);

    } catch (error) {
      setLoading(false);
      showErrorMsg(error.message);
    }
  };

  const showErrorMsg = (message) => {
    setError(message);
    setShowError(true);
  };

  const hideError = () => {
    setShowError(false);
    setError('');
  };

  const exportLeads = (format = 'csv') => {
    if (!results || !results.leads || results.leads.length === 0) {
      showErrorMsg('No results to export');
      return;
    }

    try {
      let content, mimeType, extension;

      switch (format) {
        case 'json':
          content = JSON.stringify({
            generated_at: results.generated_at,
            summary: results.summary,
            leads: results.leads
          }, null, 2);
          mimeType = 'application/json';
          extension = 'json';
          break;

        case 'csv':
        default:
          const headers = [
            'Name', 'Job Title', 'Company', 'Location', 'Industry',
            'Domain', 'Lead Score', 'Source', 'URL',
            'Validated Emails', 'Phone Numbers',
            'Search Emails', 'Search Phones'
          ];

          const csvContent = results.leads.map(lead => {
            const allEmails = lead.all_emails || [];
            const phoneNumbers = lead.phone_numbers || [];
            const searchEmails = lead.search_emails || [];
            const searchPhones = lead.search_phones || [];

            return [
              `"${lead.name || 'N/A'}"`,
              `"${lead.job_title || 'N/A'}"`,
              `"${lead.company || 'N/A'}"`,
              `"${lead.location || 'N/A'}"`,
              `"${lead.industry || 'N/A'}"`,
              `"${lead.domain || 'N/A'}"`,
              lead.lead_score || 0,
              `"${lead.source || 'N/A'}"`,
              `"${lead.url || 'N/A'}"`,
              `"${allEmails.map(e => e.email).join('; ')}"`,
              `"${phoneNumbers.map(p => p.phone).join('; ')}"`,
              `"${searchEmails.map(e => e.email).join('; ')}"`,
              `"${searchPhones.map(p => p.phone).join('; ')}"`
            ].join(',');
          });

          content = [headers.join(','), ...csvContent].join('\n');
          mimeType = 'text/csv;charset=utf-8;';
          extension = 'csv';
      }

      const blob = new Blob([content], { type: mimeType });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      link.setAttribute('href', url);
      link.setAttribute('download', `enhanced-leads-${new Date().toISOString().split('T')[0]}.${extension}`);
      link.style.visibility = 'hidden';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setError(`Leads exported as ${format.toUpperCase()} successfully!`);
      setShowError(true);

    } catch (error) {
      showErrorMsg('Failed to export leads: ' + error.message);
    }
  };

  const newSearch = () => {
    setResults(null);
    setFormData({
      keywords: '',
      leadLimit: 5,
      sources: ['linkedin']
    });
    setOpenDropdowns({});
  };

  const clearForm = () => {
    if (window.confirm("Are you sure you want to clear all search criteria?")) {
      setFormData({
        keywords: '',
        leadLimit: 5,
        sources: ['linkedin']
      });
    }
  };

  const saveSearchCriteria = () => {
    localStorage.setItem('savedSearchCriteria', JSON.stringify(formData));
    showErrorMsg('Search criteria saved successfully!');
  };

  const loadSearchCriteria = () => {
    const saved = localStorage.getItem('savedSearchCriteria');
    if (saved) {
      setFormData(JSON.parse(saved));
      showErrorMsg('Search criteria loaded successfully!');
    } else {
      showErrorMsg('No saved search criteria found!');
    }
  };

  const generateLeadKey = (lead, index) => {
    if (lead.url) {
      return `${lead.url}-${index}`;
    }
    if (lead.name) {
      return `${lead.name}-${index}`;
    }
    return `lead-${index}`;
  };

  const getSourceIcon = (sourceId) => {
    const source = availableSources.find(s => s.id === sourceId);
    return source ? source.icon : FiGlobe;
  };

  const getSourceColor = (sourceId) => {
    const source = availableSources.find(s => s.id === sourceId);
    return source ? source.color : '#666';
  };

  const createEnhancedLeadCard = (lead, index) => {
    const allEmails = lead.all_emails || [];
    const phoneNumbers = lead.phone_numbers || [];
    const searchEmails = lead.search_emails || [];
    const searchPhones = lead.search_phones || [];
    const employees = lead.employees || [];
    const companyInfo = lead.company_info || {};
    const leadId = generateLeadKey(lead, index);
    const isOpen = openDropdowns[leadId] || false;
    const SourceIcon = getSourceIcon(lead.source);
    const sourceColor = getSourceColor(lead.source);

    return (
      <div key={leadId} className="card lead-card">
        {/* Header with Dropdown Toggle */}
        <div
          className="lead-card-header"
          onClick={() => toggleDropdown(leadId)}
        >
          <div className="lead-name">{lead.name || 'Unknown'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div className="source-badge" style={{ backgroundColor: sourceColor }}>
              <SourceIcon />
              <span>{lead.source || 'unknown'}</span>
            </div>
            <div className="lead-score">Score: {lead.lead_score || 0}</div>
            <FiChevronDown
              className={`dropdown-arrow ${isOpen ? 'open' : ''}`}
            />
          </div>
        </div>

        {/* Collapsible Content */}
        <div className={`lead-card-content ${isOpen ? 'open' : ''}`}>
          {/* Main Details */}
          <div className="lead-details">
            <div className="detail-item">
              <FiBriefcase />
              <span>{lead.job_title || 'N/A'}</span>
            </div>
            <div className="detail-item">
              <FiBriefcase />
              <span>{lead.company || 'N/A'}</span>
            </div>
            {lead.location && (
              <div className="detail-item">
                <FiMapPin />
                <span>{lead.location}</span>
              </div>
            )}
            {lead.industry && (
              <div className="detail-item">
                <FiGlobe />
                <span>{lead.industry}</span>
              </div>
            )}
            <div className="detail-item">
              <FiMail />
              <span>{allEmails.length} validated emails</span>
            </div>
            <div className="detail-item">
              <FiPhone />
              <span>{phoneNumbers.length} phone numbers</span>
            </div>
            {lead.domain && (
              <div className="detail-item">
                <FiGlobe />
                <span>Domain: {lead.domain}</span>
              </div>
            )}
          </div>

          {/* Company Information */}
          {companyInfo.name && (
            <div className="company-section">
              <div className="section-title">
                <div className="section-icon">
                  <FiBriefcase />
                </div>
                Company Information
              </div>
              <div className="company-details">
                {companyInfo.name && <span className="company-name">{companyInfo.name}</span>}
                {companyInfo.description && (
                  <div className="company-description">{companyInfo.description}</div>
                )}
              </div>
            </div>
          )}

          {/* Search-found Contacts */}
          {(searchEmails.length > 0 || searchPhones.length > 0) && (
            <div className="contacts-section">
              <div className="section-title">
                <div className="section-icon">
                  <FiSearch />
                </div>
                Found in Search Results
              </div>
              <div className="contact-list">
                {searchEmails.map((email, emailIndex) => (
                  <span key={`search-email-${emailIndex}`} className="contact-badge email">
                    <FiMail />
                    {email.email} (Score: {email.score})
                  </span>
                ))}
                {searchPhones.map((phone, phoneIndex) => (
                  <span key={`search-phone-${phoneIndex}`} className="contact-badge phone">
                    <FiPhone />
                    {phone.phone} ({phone.type})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Validated Emails Section */}
          <div className="emails-section">
            <div className="section-title">
              <div className="section-icon">
                <FiMail />
              </div>
              Validated Emails
            </div>
            {allEmails.length > 0 ? (
              <div className="email-list">
                {allEmails.map((email, emailIndex) => (
                  <div key={`email-${emailIndex}`} className="email-item">
                    <span className={`email-address ${email.score > 80 ? 'high-score' : email.score > 60 ? 'medium-score' : 'low-score'}`}>
                      <FiMail />
                      {email.email}
                    </span>
                    <div className="email-details">
                      <span className="email-score">Score: {email.score}</span>
                      <span className="email-source">Source: {email.source}</span>
                      {email.smtp_valid && <span className="email-verified">✓ SMTP Verified</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-data">No validated emails found</div>
            )}
          </div>

          {/* Phone Numbers Section */}
          <div className="phones-section">
            <div className="section-title">
              <div className="section-icon">
                <FiPhone />
              </div>
              Phone Numbers
            </div>
            {phoneNumbers.length > 0 ? (
              <div className="phone-list">
                {phoneNumbers.map((phone, phoneIndex) => (
                  <div key={`phone-${phoneIndex}`} className="phone-item">
                    <span className="phone-number">
                      <FiPhone />
                      {phone.phone}
                    </span>
                    <div className="phone-details">
                      <span className="phone-type">Type: {phone.type}</span>
                      <span className="phone-source">Source: {phone.source}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-data">No phone numbers found</div>
            )}
          </div>

          {/* Employees from Company Website */}
          {employees.length > 0 && (
            <div className="employees-section">
              <div className="section-title">
                <div className="section-icon">
                  <FiUsers />
                </div>
                Team Members Found
              </div>
              <div className="employees-list">
                {employees.slice(0, 5).map((employee, empIndex) => (
                  <div key={`employee-${empIndex}`} className="employee-item">
                    <span className="employee-name">{employee.name}</span>
                    {employee.role && <span className="employee-role">{employee.role}</span>}
                    {employee.email && <span className="employee-email">{employee.email}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Profile Link */}
          {lead.url && (
            <div className="lead-actions">
              <a href={lead.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ backgroundColor: sourceColor }}>
                <SourceIcon /> View {lead.source ? lead.source.charAt(0).toUpperCase() + lead.source.slice(1) : 'Profile'}
              </a>
              {/* Twitter-specific actions */}
              {lead.source === 'twitter' && lead.name && (
                <a
                  href={`https://twitter.com/intent/tweet?text=Hi%20${encodeURIComponent(lead.name.split(' ')[0])}%2C%20I%20came%20across%20your%20profile...`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                  style={{ backgroundColor: '#1DA1F2', marginLeft: '10px' }}
                >
                  <FiTwitter /> Send Tweet
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Loading State with Enhanced Animation
  if (loading) {
    return (
      <div className="webscraping-container">
        {showSplash && <SplashScreen message="Initializing Lead Generator Engine..." onComplete={() => setShowSplash(false)} />}
        <div className="card loading-section">
          <div className="card-header">
            <div className="card-icon-wrapper">
              <FiCpu className="card-main-icon spinning" />
            </div>
            <div className="card-header-content">
              <h3>Generating Leads...</h3>
            </div>
          </div>

          <div className="progress-stats">
            <div className="progress-stat">
              <span className="progress-stat-value">{Math.round(progress)}%</span>
              <span className="progress-stat-label">Complete</span>
            </div>
          </div>

          <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${progress}%` }}></div>
          </div>

          <p>Searching across {formData.sources.length} sources: {formData.sources.map(source => availableSources.find(s => s.id === source)?.name).join(', ')}</p>

          <div className="status-badge status-running">
            <FiLoader className="spinning" />
            Status: {progress < 100 ? 'Running' : 'Finalizing'}
          </div>

          {/* Progress Steps */}
          <div className="progress-steps">
            <div className={`progress-step ${progress >= 20 ? 'completed' : progress >= 10 ? 'active' : ''}`}>
              <div className="step-label">Searching</div>
            </div>
            <div className={`progress-step ${progress >= 50 ? 'completed' : progress >= 30 ? 'active' : ''}`}>
              <div className="step-label">Scraping</div>
            </div>
            <div className={`progress-step ${progress >= 80 ? 'completed' : progress >= 60 ? 'active' : ''}`}>
              <div className="step-label">Validating</div>
            </div>
            <div className={`progress-step ${progress >= 100 ? 'completed' : progress >= 90 ? 'active' : ''}`}>
              <div className="step-label">Finalizing</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Results State
  if (results) {
    return (
      <div className="webscraping-container">
        {showSplash && <SplashScreen message="Initializing Lead Generator Engine..." onComplete={() => setShowSplash(false)} />}
        <div className="card results-section">
          <div className="card-header">
            <div className="card-icon-wrapper">
              <FiFile className="card-main-icon" />
            </div>
            <div className="card-header-content">
              <div>
                <h3>Lead Generation Results</h3>
                <p>{results.summary?.total_leads || 0} leads found from {formData.sources.length} sources</p>
              </div>
            </div>
          </div>

          {/* ENHANCED Summary Section */}
          <div className="summary-cards">
            <div className="summary-card">
              <h3>Total Leads</h3>
              <div className="number">{results.summary?.total_leads || 0}</div>
            </div>
            <div className="summary-card">
              <h3>With Emails</h3>
              <div className="number">{results.summary?.leads_with_emails || 0}</div>
            </div>
            <div className="summary-card">
              <h3>With Phones</h3>
              <div className="number">{results.summary?.leads_with_phones || 0}</div>
            </div>
            <div className="summary-card">
              <h3>With Location</h3>
              <div className="number">{results.summary?.leads_with_location || 0}</div>
            </div>
            <div className="summary-card">
              <h3>With Industry</h3>
              <div className="number">{results.summary?.leads_with_industry || 0}</div>
            </div>
          </div>

          {/* Data Breakdown */}
          {results.data_breakdown && (
            <div className="data-breakdown">
              <div className="section-title">
                <div className="section-icon">
                  <FiBarChart2 />
                </div>
                Data Breakdown
              </div>
              <div className="breakdown-stats">
                <span>📧 {results.data_breakdown.emails_found} emails</span>
                <span>📞 {results.data_breakdown.phones_found} phones</span>
                <span>🔍 {results.data_breakdown.search_emails_found} search emails</span>
                <span>📱 {results.data_breakdown.search_phones_found} search phones</span>
              </div>
            </div>
          )}

          <div id="leadsContainer">
            {results.leads && results.leads.length > 0 ? (
              results.leads.map((lead, index) => createEnhancedLeadCard(lead, index))
            ) : (
              <div className="no-leads">No leads found. Try different search terms.</div>
            )}
          </div>

          <div className="download-section">
            <h3>Export Results</h3>
            <div className="controls">
              <button className="download-btn" onClick={() => exportLeads('csv')}>
                <FiDownload /> Export as CSV
              </button>
              <button className="download-btn" onClick={() => exportLeads('json')}>
                <FiDownload /> Export as JSON
              </button>
              <button className="btn btn-secondary" onClick={newSearch}>
                <FiRefreshCw /> New Search
              </button>
              <button className="btn btn-secondary" onClick={saveSearchCriteria}>
                <FiSave /> Save Criteria
              </button>
            </div>
          </div>
        </div>

        {showError && (
          <div className="modal">
            <div className="modal-content">
              <span className="close" onClick={hideError}><FiX /></span>
              <h3>{error.includes('successfully') ? 'Success' : 'Error'}</h3>
              <p>{error}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Main Form State
  return (
    <div className="webscraping-container">
      {showSplash && <SplashScreen message="Initializing Lead Generator Engine..." onComplete={() => setShowSplash(false)} />}
      <div className="card">
        <div className="card-header">
          <div className="card-icon-wrapper">
            <FiZap className="card-main-icon" />
          </div>
          <div className="card-header-content">
            <div>
              <h3>LinkedIn & Twitter Lead Generator</h3>
              <p>Find professional contacts from LinkedIn and Twitter using AI-powered web scraping</p>
            </div>
          </div>
        </div>

        <div className="card-section">
          <div className="section-title">
            <div className="section-icon">
              <FiSearch />
            </div>
            Search Configuration
          </div>

          <div className="form-group">
            <label htmlFor="keywords">Search Keywords *</label>
            <input
              type="text"
              id="keywords"
              value={formData.keywords}
              onChange={(e) => handleInputChange('keywords', e.target.value)}
              onFocus={() => setShowSuggestions(prev => ({ ...prev, keywords: true }))}
              onBlur={() => hideSuggestions('keywords')}
              placeholder="e.g., CEO, Technology, Startup (separate with commas)"
              className="form-input"
            />
            <div className={`suggestions ${showSuggestions.keywords ? 'show' : ''}`}>
              {suggestions.keywords.map((item, index) => (
                <div key={`keywords-${index}`} className="suggestion-item" onClick={() => selectSuggestion('keywords', item)}>
                  {item}
                </div>
              ))}
            </div>
            <div className="help-text">Enter keywords separated by commas - each will be searched individually in quotes</div>
          </div>

          {/* Data Sources Selection */}
          <div className="form-group">
            <label>Data Sources *</label>
            <div className="sources-grid">
              {availableSources.map(source => {
                const IconComponent = source.icon;
                const isSelected = formData.sources.includes(source.id);

                return (
                  <div
                    key={source.id}
                    className={`source-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSourceToggle(source.id)}
                    style={{
                      borderColor: isSelected ? source.color : '#e2e8f0',
                      backgroundColor: isSelected ? `${source.color}15` : 'white'
                    }}
                  >
                    <IconComponent
                      style={{
                        color: isSelected ? source.color : '#64748b',
                        fontSize: '1.5em'
                      }}
                    />
                    <span className="source-name">{source.name}</span>
                    <div className={`source-checkbox ${isSelected ? 'checked' : ''}`}>
                      {isSelected && <FiCheck />}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="help-text">Select platforms to search for leads</div>
          </div>

          <div className="form-group">
            <label htmlFor="leadLimit">Lead Limit</label>
            <input
              type="number"
              id="leadLimit"
              value={formData.leadLimit}
              onChange={(e) => handleInputChange('leadLimit', parseInt(e.target.value) || 5)}
              min="1"
              max="20"
              className="form-input"
            />
            <div className="help-text">Number of leads to generate per source (1-20)</div>
          </div>

          <div className="controls">
            <button className="btn btn-primary generate-btn" onClick={generateLeads}>
              <FiZap /> Generate Leads from {formData.sources.length} Sources
            </button>

            <div className="secondary-controls">
              <button className="btn btn-secondary" onClick={loadSearchCriteria}>
                <FiFile /> Load Criteria
              </button>
              <button className="btn btn-clear" onClick={clearForm}>
                <FiTrash2 /> Clear All
              </button>
            </div>
          </div>
        </div>
      </div>

      {showError && (
        <div className="modal">
          <div className="modal-content">
            <span className="close" onClick={hideError}><FiX /></span>
            <h3>{error.includes('successfully') ? 'Success' : 'Error'}</h3>
            <p>{error}</p>
          </div>
        </div>
      )}
    </div>
  );
};


export default WebScrapingTab;
