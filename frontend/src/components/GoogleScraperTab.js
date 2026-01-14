import React, { useState, useEffect } from "react";
import {
  FiMap,
  FiSearch,
  FiDownload,
  FiRefreshCw,
  FiEye,
  FiChevronDown,
  FiChevronUp,
  FiChrome,
  FiGlobe,
  FiUsers,
  FiLinkedin,
  FiInfo,
  FiCpu,
  FiDatabase,
  FiSave,
  FiSend,
  FiExternalLink,
  FiShield,
  FiAlertCircle,
  FiCheckCircle,
  FiCalendar
} from "react-icons/fi";
import "./GoogleScraperTab.css";
// Removed Loader to avoid missing module error; use inline loading UI instead.

const getBaseUrl = () => {
  const { hostname } = window.location;
  // Handle localhost and IP addresses
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://127.0.0.1:5000';
  }
  return `https://${hostname}/api`;
};
const API_BASE_URL = getBaseUrl();

function GoogleScraperTab() {
  const [searchType, setSearchType] = useState("search");
  const [query, setQuery] = useState("");
  const [locationUrl, setLocationUrl] = useState("");
  const [maxResults, setMaxResults] = useState(10);
  const [headless, setHeadless] = useState(true);
  const [enrichLinkedin, setEnrichLinkedin] = useState(false);
  const [enableEmailDiscovery, setEnableEmailDiscovery] = useState(false);
  const [loading, setLoading] = useState(false);
  // Removed branded preloader; rely on `loading` only
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  const triggerToast = (msg, type = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 5000);
  };
  const [activeResultsTab, setActiveResultsTab] = useState("overview");

  // Data State matching the specified schema
  const [eventData, setEventData] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [metadata, setMetadata] = useState(null);

  const [eventStatus, setEventStatus] = useState(null);
  const [allEvents, setAllEvents] = useState([]); // NEW state for discovery list

  const [browser, setBrowser] = useState("auto");
  const [availableBrowsers, setAvailableBrowsers] = useState([]);
  const [detectingBrowsers, setDetectingBrowsers] = useState(true);

  // Filters state
  const [roleFilter, setRoleFilter] = useState("All");
  const [linkedinOnly, setLinkedinOnly] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0);

  useEffect(() => {
    detectAvailableBrowsers();
  }, []);

  const detectAvailableBrowsers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/googlescraper/available_browsers`);
      const data = await response.json();

      if (response.ok && data.available_browsers) {
        setAvailableBrowsers(data.available_browsers);
      } else {
        setAvailableBrowsers(["auto"]);
      }
    } catch (error) {
      console.error("Error detecting browsers:", error);
      setAvailableBrowsers(["auto"]);
    } finally {
      setDetectingBrowsers(false);
    }
  };

  const handleAction = async (actionType) => {
    if (searchType === "search" && !query.trim()) {
      triggerToast("Please enter a search query!", "error");
      return;
    }

    if (searchType === "url" && !locationUrl.trim()) {
      triggerToast("Please enter a Google Maps URL!", "error");
      return;
    }

    // Start scraping immediately
    startActualScrape(actionType);
  };

  const startActualScrape = async (actionType) => {
    setLoading(true);
    setEventStatus(null);

    try {
      const payload = {
        max_results: maxResults,
        headless: headless,
        browser: browser,
        enrich_linkedin: enrichLinkedin || actionType === "enrich",
        email_discovery: enableEmailDiscovery,
        action: actionType
      };

      if (searchType === "search") {
        payload.query = query;
      } else {
        payload.url = locationUrl;
      }

      let endpoint = `${API_BASE_URL}/googlescraper/scrape`;

      // Use new Event Engine for Search queries
      if (searchType === "search") {
        endpoint = `${API_BASE_URL}/webscraping/discover-events`;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        // Handle New Engine Response Format
        if (searchType === "search") {
          if (data.events && data.events.length > 0) {
            // Primary event is the first one or the most relevant
            const primary = data.events[0];

            // Map to existing UI structure
            setEventData({
              name: primary.event_overview.name,
              description: primary.event_overview.description,
              type: primary.event_overview.event_type,
              start_date: primary.event_overview.start_date,
              end_date: primary.event_overview.end_date,
              status: primary.event_overview.status,
              venue: {
                name: primary.event_overview.location,
                city: primary.event_overview.city_country
              },
              official_website: primary.official_links.official_website,
              confidence_score: primary.confidence.score
            });

            setParticipants(primary.participants || []);
            setAllEvents(data.events); // Store all found events
            setMetadata({
              sources_used: primary.confidence.sources,
              scrape_timestamp: new Date().toISOString()
            });

            setEventStatus("FOUND");
            // Default to discovery tab if multiple events found
            setActiveResultsTab(data.events.length > 1 ? "discovery" : "overview");
          } else {
            setEventStatus("NOT_FOUND");
            setEventData(null);
          }
        } else {
          // Old Logic for Maps URL
          if (data.event_status === "NOT_FOUND") {
            setEventStatus("NOT_FOUND");
            setEventData(null);
            setParticipants([]);
          } else {
            setEventData(data.event);
            setParticipants(data.participants || []);
            setMetadata(data.metadata);
            setEventStatus("FOUND");
            setActiveResultsTab("overview");
          }
        }
      } else {
        triggerToast("Error: " + data.error, "error");
      }
    } catch (error) {
      triggerToast("Error: " + error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const clearResults = () => {
    setEventData(null);
    setParticipants([]);
    setMetadata(null);
    setEventStatus(null);
  };

  const filteredParticipants = participants.filter(p => {
    if (roleFilter !== "All" && p.role !== roleFilter) return false;
    if (linkedinOnly && (!p.linkedin_url || p.linkedin_url === "NOT_FOUND")) return false;
    if (p.confidence_score < confidenceThreshold) return false;
    return true;
  });

  const getConfidenceColor = (score) => {
    if (score >= 80) return "#10b981";
    if (score >= 50) return "#f59e0b";
    return "#ef4444";
  };

  return (
    <div className="event-intelligence-container">
      {/* Search Header */}
      <div className="card google-scraper-card premium-card">
        <div className="card-header premium-header">
          <div className="header-main">
            <div className="card-icon-wrapper pulse-icon">
              <FiCpu className="card-main-icon" />
            </div>
            <div>
              <h3>Event & Participant Intelligence</h3>
              <p className="subtitle">AI-Powered Extraction from Google Maps & Web</p>
            </div>
          </div>
          <div className="browser-selector-mini">
            <FiChrome />
            <select value={browser} onChange={(e) => setBrowser(e.target.value)}>
              {availableBrowsers.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>

        <div className="card-grid">
          {/* Left Column: Search Inputs */}
          <div className="search-controls">
            <div className="input-group-premium">
              <label>Search Input Type</label>
              <div className="toggle-buttons">
                <button
                  className={searchType === "search" ? "active" : ""}
                  onClick={() => setSearchType("search")}
                >
                  <FiSearch /> Query
                </button>
                <button
                  className={searchType === "url" ? "active" : ""}
                  onClick={() => setSearchType("url")}
                >
                  <FiMap /> Maps URL
                </button>
              </div>
            </div>

            {searchType === "search" ? (
              <div className="content-field anim-slide-in">
                <label>Event Name or Location Query</label>
                <div className="search-input-wrapper">
                  <FiSearch className="input-icon" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="premium-input"
                    placeholder="e.g., AI Conference Bangalore, Startup Meetup Chennai"
                  />
                </div>
              </div>
            ) : (
              <div className="content-field anim-slide-in">
                <label>Google Maps URL</label>
                <div className="search-input-wrapper">
                  <FiGlobe className="input-icon" />
                  <input
                    type="text"
                    value={locationUrl}
                    onChange={(e) => setLocationUrl(e.target.value)}
                    className="premium-input"
                    placeholder="https://www.google.com/maps/place/..."
                  />
                </div>
              </div>
            )}

            <div className="settings-row">
              <div className="content-field mini">
                <label>Max Results</label>
                <input
                  type="number"
                  value={maxResults}
                  onChange={(e) => setMaxResults(parseInt(e.target.value))}
                  className="premium-input"
                />
              </div>
              <div className="content-field mini">
                <label>Browser Mode</label>
                <select className="premium-input" value={headless ? "headless" : "visible"} onChange={(e) => setHeadless(e.target.value === "headless")}>
                  <option value="headless">Headless</option>
                  <option value="visible">Visible</option>
                </select>
              </div>
            </div>
          </div>

          {/* Right Column: AI Toggles & Actions */}
          <div className="ai-features">
            <label className="section-subtitle">Intelligence Modules</label>
            <div className="switch-group">
              <div className="switch-item">
                <div className="switch-text">
                  <FiLinkedin className="switch-icon" />
                  <span>LinkedIn Enrichment</span>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={enrichLinkedin} onChange={(e) => setEnrichLinkedin(e.target.checked)} />
                  <span className="slider round"></span>
                </label>
              </div>
              <div className="switch-item">
                <div className="switch-text">
                  <FiSend className="switch-icon" />
                  <span>Email Discovery</span>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={enableEmailDiscovery} onChange={(e) => setEnableEmailDiscovery(e.target.checked)} />
                  <span className="slider round"></span>
                </label>
              </div>
            </div>

            <div className="action-buttons-grid">
              <button className="btn-premium primary" onClick={() => handleAction("detect")} disabled={loading}>
                {loading ? <FiRefreshCw className="spin" /> : <FiCpu />}
                Detect Event Automatically
              </button>
              <button className="btn-premium secondary" onClick={() => handleAction("participants")} disabled={loading}>
                <FiUsers /> Fetch Participants
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Error / Not Found State */}
      {eventStatus === "NOT_FOUND" && (
        <div className="error-alert anim-fade-in">
          <FiInfo />
          <div>
            <strong>No Event Found</strong>
            <p>No verifiable event data found from reliable sources. Try a more specific query.</p>
          </div>
        </div>
      )}

      {/* Results Section */}
      {eventData && (
        <div className="results-container anim-fade-up">
          <div className="results-navigation">
            <div className="nav-tabs">
              <button className={activeResultsTab === "overview" ? "active" : ""} onClick={() => setActiveResultsTab("overview")}>
                <FiEye /> Event Overview
              </button>
              <button className={activeResultsTab === "participants" ? "active" : ""} onClick={() => setActiveResultsTab("participants")}>
                <FiUsers /> Participants ({participants.length})
              </button>
              <button className={activeResultsTab === "linkedin" ? "active" : ""} onClick={() => setActiveResultsTab("linkedin")}>
                <FiLinkedin /> LinkedIn Profiles
              </button>
              <button className={activeResultsTab === "timeline" ? "active" : ""} onClick={() => setActiveResultsTab("timeline")}>
                <FiCalendar /> Timeline
              </button>
              <button className={activeResultsTab === "discovery" ? "active" : ""} onClick={() => setActiveResultsTab("discovery")}>
                <FiGlobe /> Upcoming Tech Events
              </button>
              <button className={activeResultsTab === "metadata" ? "active" : ""} onClick={() => setActiveResultsTab("metadata")}>
                <FiDatabase /> Sources & Confidence
              </button>
            </div>
            <div className="export-actions">
              <button className="btn-export csv" title="Export as CSV"><FiDownload /> CSV</button>
              <button className="btn-export crm" title="Export to CRM"><FiSave /> Sync CRM</button>
            </div>
          </div>

          <div className="tab-content card">
            {activeResultsTab === "overview" && (
              <div className="overview-tab anim-fade-in">
                <div className="event-hero">
                  <div className="event-badge">{eventData.type}</div>
                  <h2>{eventData.name}</h2>
                  <div className="event-main-description">
                    <p>{eventData.description}</p>
                  </div>

                  <div className="event-details-chips">
                    <div className="chip">
                      <FiCalendar /> {eventData.start_date} - {eventData.end_date}
                    </div>
                    <div className="chip">
                      <FiMap /> {eventData.venue.name}, {eventData.venue.city}
                    </div>
                    <div className="chip status-chip" data-status={eventData.status}>
                      {eventData.status}
                    </div>
                  </div>
                </div>

                <div className="quick-links">
                  <a href={eventData.official_website} className="link-card" target="_blank" rel="noreferrer">
                    <FiGlobe /> Official Website <FiExternalLink />
                  </a>
                  <a href={`https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(eventData.name)}`} className="link-card linkedin-featured" target="_blank" rel="noreferrer">
                    <FiLinkedin /> Event LinkedIn Page <FiExternalLink />
                  </a>
                </div>
              </div>
            )}

            {activeResultsTab === "participants" && (
              <div className="participants-tab anim-fade-in">
                <div className="filters-bar">
                  <div className="filter-item">
                    <label>Role</label>
                    <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                      <option value="All">All Roles</option>
                      <option value="Speaker">Speaker</option>
                      <option value="Organizer">Organizer</option>
                      <option value="Attendeee">Attendee</option>
                    </select>
                  </div>
                  <div className="filter-item">
                    <label>Confidence %</label>
                    <input type="range" min="0" max="100" value={confidenceThreshold} onChange={(e) => setConfidenceThreshold(e.target.value)} />
                    <span>{confidenceThreshold}%+</span>
                  </div>
                  <label className="linkedin-toggle">
                    <input type="checkbox" checked={linkedinOnly} onChange={(e) => setLinkedinOnly(e.target.checked)} />
                    LinkedIn Only
                  </label>
                </div>

                <div className="participants-grid">
                  {filteredParticipants.map((p, idx) => (
                    <div key={idx} className="participant-card">
                      <div className="persona">
                        <div className="p-avatar">{p.name.charAt(0)}</div>
                        <div className="p-info">
                          <h4>{p.name}</h4>
                          <span className="p-role">{p.role}</span>
                        </div>
                      </div>
                      <div className="corp-info">
                        <p><strong>{p.company}</strong></p>
                        <p className="p-title">{p.title}</p>
                      </div>
                      <div className="p-actions">
                        {p.linkedin_url !== "NOT_FOUND" ? (
                          <a href={p.linkedin_url} target="_blank" rel="noreferrer" className="linkedin-link">
                            <FiLinkedin /> Profile
                          </a>
                        ) : (
                          <span className="no-link">No LinkedIn</span>
                        )}
                        <div className="confidence-indicator">
                          <div className="conf-bar" style={{ width: `${p.confidence_score}%`, backgroundColor: getConfidenceColor(p.confidence_score) }}></div>
                          <span>{p.confidence_score}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeResultsTab === "linkedin" && (
              <div className="linkedin-tab anim-fade-in">
                <h3>LinkedIn Lead Intelligence</h3>
                <div className="leads-list">
                  {participants.filter(p => p.linkedin_url !== "NOT_FOUND").map((p, idx) => (
                    <div key={idx} className="lead-row">
                      <FiLinkedin className="lead-icon" />
                      <div className="lead-details">
                        <strong>{p.name}</strong>
                        <span>{p.title} at {p.company}</span>
                      </div>
                      <a href={p.linkedin_url} target="_blank" rel="noreferrer" className="btn-mini">View</a>
                      <button className="btn-mini primary"><FiSave /> Save as Lead</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeResultsTab === "timeline" && (
              <div className="timeline-tab anim-fade-in">
                <h3>Event Schedule & Timeline</h3>
                <div className="timeline-list">
                  <div className="timeline-item">
                    <div className="time">Day 1 - Morning</div>
                    <div className="content">
                      <strong>Registration & Keynote</strong>
                      <p>Opening remarks and industry outlook.</p>
                    </div>
                  </div>
                  <div className="timeline-item">
                    <div className="time">Day 1 - Afternoon</div>
                    <div className="content">
                      <strong>Workshop Sessions</strong>
                      <p>Deep dive into technical implementations.</p>
                    </div>
                  </div>
                  <div className="timeline-item">
                    <div className="time">Day 2 - Morning</div>
                    <div className="content">
                      <strong>Panel Discussions</strong>
                      <p>Expert talk on future trends.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeResultsTab === "discovery" && (
              <div className="discovery-tab anim-fade-in">
                <div className="discovery-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3>🚀 Discovered Events & Conferences</h3>
                    <p>Found {allEvents.length} events matching your criteria (World, India, Tamil Nadu)...</p>
                  </div>
                  <button className="btn-premium secondary" onClick={() => handleAction("detect")} disabled={loading}>
                    <FiRefreshCw className={loading ? "spin" : ""} /> Refresh
                  </button>
                </div>
                <div className="tech-event-list">
                  {allEvents.map((ev, i) => (
                    <div key={i} className="discovery-card" onClick={() => {
                      // Optional: Click to set as primary
                      setEventData({
                        name: ev.event_overview.name,
                        description: ev.event_overview.description,
                        type: ev.event_overview.event_type,
                        start_date: ev.event_overview.start_date,
                        end_date: ev.event_overview.end_date,
                        status: ev.event_overview.status,
                        venue: {
                          name: ev.event_overview.location,
                          city: ev.event_overview.city_country
                        },
                        official_website: ev.official_links.official_website,
                        confidence_score: ev.confidence.score
                      });
                      setParticipants(ev.participants || []);
                      setActiveResultsTab("overview");
                    }}>
                      <div className="d-icon"><FiCalendar /></div>
                      <div className="d-body">
                        <h4>{ev.event_overview.name}</h4>
                        <span className="d-date"><FiMap /> {ev.event_overview.location} • {ev.event_overview.start_date}</span>
                        <p>{ev.event_overview.description}</p>
                        {ev.official_links.official_website && (
                          <a href={ev.official_links.official_website} target="_blank" rel="noreferrer" className="d-link" onClick={(e) => e.stopPropagation()}>
                            <FiExternalLink /> Visit Website
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeResultsTab === "metadata" && (
              <div className="metadata-tab anim-fade-in">
                <div className="sources-container">
                  <h4><FiShield /> Data Reliability Report</h4>
                  <div className="confidence-score-large">
                    <span className="score">{eventData.confidence_score}%</span>
                    <span className="label">Overall Confidence</span>
                  </div>
                  <div className="sources-list">
                    <h5>Sources Used:</h5>
                    <ul>
                      {metadata.sources_used.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                  <div className="timestamp">
                    Scraped at: {new Date(metadata.scrape_timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Branded Loader removed */}

      {showToast && (
        <div className={`toast-notification-${toastType} anim-fade-up`}>
          <div className="toast-icon">
            {toastType === 'success' ? <FiCheckCircle /> : <FiAlertCircle />}
          </div>
          <div className="toast-body">
            <strong>{toastType === 'success' ? 'Success' : 'Notice'}</strong>
            <p>{toastMessage}</p>
          </div>
        </div>
      )}

      {/* Background Loading Indicator */}
      {loading && (
        <div className="background-loader-toast anim-fade-up">
          <FiRefreshCw className="spin" />
          <span>Finalizing search results...</span>
        </div>
      )}
    </div>
  );
}


export default GoogleScraperTab;
