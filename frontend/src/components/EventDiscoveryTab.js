import React, { useState, useEffect, useCallback } from "react";
import {
    FiSearch, FiLinkedin, FiGlobe,
    FiPlus, FiCheckCircle, FiUsers, FiMail, FiBarChart2,
    FiArrowRight, FiTrash2, 
    FiActivity, FiZap, FiTarget, FiPhone,
    FiCopy, FiX, FiRefreshCw, FiAlertCircle, FiEye
} from "react-icons/fi";
import "./EventDiscoveryTab.css";
import SplashScreen from "./SplashScreen";
import { getApiBaseUrl } from "../utils/api";

// Normalize base and append discovery prefix
const API_BASE_URL = `${getApiBaseUrl()}/api/discovery`;

function EventDiscoveryTab() {
    const [events, setEvents] = useState([]);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [leads, setLeads] = useState([]);
    const [filterQuery, setFilterQuery] = useState("");
    const [loading, setLoading] = useState({ events: false, leads: false, starting: false });
    const [discoveryLogs, setDiscoveryLogs] = useState([]);
    const [selectedLeadInsights, setSelectedLeadInsights] = useState(null);
    const [loadingInsights, setLoadingInsights] = useState(false);
    const [searchForm, setSearchForm] = useState({
        event_name: "",
        location: "",
        platforms: ["LinkedIn", "Twitter", "Websites"],
        keywords: ""
    });
    const [showSplash, setShowSplash] = useState(false);

    const fetchEvents = useCallback(async () => {
        try {
            setLoading(prev => ({ ...prev, events: true }));
            const response = await fetch(`${API_BASE_URL}/events`, { credentials: 'include' });
            const data = await response.json();
            if (data.events) {
                setEvents(data.events);
                if (!selectedEvent && data.events.length > 0) {
                    setSelectedEvent(data.events[0]);
                } else if (selectedEvent) {
                    const updated = data.events.find(e => e.id === selectedEvent.id);
                    if (updated) setSelectedEvent(updated);
                }
            }
        } catch (err) { console.error(err); }
        finally { setLoading(prev => ({ ...prev, events: false })); }
    }, [selectedEvent]);

    React.useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    // Stable alias to satisfy linting in nested callbacks
    const fetchEventsRef = fetchEvents;

    const fetchLeads = async (eventId) => {
        try {
            setLoading(prev => ({ ...prev, leads: true }));
            const response = await fetch(`${API_BASE_URL}/events/${eventId}/leads`, { credentials: 'include' });
            const data = await response.json();
            if (data.leads) setLeads(data.leads);
        } catch (err) { console.error(err); }
        finally { setLoading(prev => ({ ...prev, leads: false })); }
    };

    const handleStartDiscovery = async (e) => {
        e.preventDefault();
        setShowSplash(true);
        setDiscoveryLogs([]);
        setLoading(prev => ({ ...prev, starting: true }));
        setDiscoveryLogs(["Initializing Intelligent Discovery Script...", "Parsing Event Intelligence..."]);

        try {
            const response = await fetch(`${API_BASE_URL}/events/start`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(searchForm)
            });
            const data = await response.json();
            if (data.success) {
                setTimeout(() => setDiscoveryLogs(p => [...p, "Cross-referencing LinkedIn Attendees..."]), 400);
                setTimeout(() => setDiscoveryLogs(p => [...p, "Enriching with Apollo & Hunter..."]), 800);
                setTimeout(() => {
                    setLoading(prev => ({ ...prev, starting: false }));
                    fetchEventsRef();
                }, 1200);
            }
        } catch (err) {
            setLoading(prev => ({ ...prev, starting: false }));
        }
    };

    const fetchLeadInsights = async (lead) => {
        setLoadingInsights(true);
        setSelectedLeadInsights({ lead, data: null });
        try {
            const res = await fetch(`${API_BASE_URL}/leads/${lead.id}/insights`, { credentials: 'include' });
            const data = await res.json();
            if (data.insights) setSelectedLeadInsights({ lead, data: data.insights });
        } catch (err) { console.error(err); }
        finally { setLoadingInsights(false); }
    };

    const getStatusBadgeClass = (lead) => {
        if (lead.status === 'campaign_sent') return 'status-badge-primary';
        if (lead.email_status === 'verified') return 'status-badge-verified';
        if (lead.email_status === 'risky') return 'status-badge-warning';
        return 'status-badge-default';
    };

    const getStatusLabel = (lead) => {
        if (lead.status === 'campaign_sent') return 'CAMPAIGN SENT';
        return lead.email_status.toUpperCase();
    };

    const filteredLeads = leads.filter(l =>
        l.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
        l.company_name.toLowerCase().includes(filterQuery.toLowerCase())
    );

    return (
        <div className="discovery-tab-container">
            {showSplash && <SplashScreen message="Initializing Event Discovery Engine..." onComplete={() => setShowSplash(false)} />}
            {/* --- DASHBOARD HEADER --- */}
            <div className="discovery-dashboard-header">
                <div className="header-info">
                    <h1>Intelligence Dashboard</h1>
                    <p>Event-Based Lead Discovery & Outreach Tracking</p>
                </div>
                <div className="header-actions">
                    <button className="btn-primary" onClick={() => setSelectedEvent(null)}>
                        <FiPlus /> New Campaign
                    </button>
                </div>
            </div>

            {/* --- METRIC CARDS --- */}
            <div className="discovery-metrics-grid">
                <div className="metric-card">
                    <div className="metric-icon blue"><FiUsers /></div>
                    <div className="metric-data">
                        <span className="value">{selectedEvent?.leads_found || 0}</span>
                        <span className="label">Leads Discovered</span>
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-icon green"><FiCheckCircle /></div>
                    <div className="metric-data">
                        <span className="value">{selectedEvent?.verified_count || 0}</span>
                        <span className="label">Emails Verified</span>
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-icon purple"><FiBarChart2 /></div>
                    <div className="metric-data">
                        <span className="value">{selectedEvent?.emails_sent || 0}</span>
                        <span className="label">Campaigns Sent</span>
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-icon orange"><FiActivity /></div>
                    <div className="metric-data">
                        <span className="value">{selectedEvent?.replies_received || 0}</span>
                        <span className="label">Replies Received</span>
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-icon red"><FiAlertCircle /></div>
                    <div className="metric-data">
                        <span className="value">{selectedEvent?.bounced_emails || 0}</span>
                        <span className="label">Bounces</span>
                    </div>
                </div>
            </div>

            <div className="discovery-split-view">
                {/* --- SIDEBAR: SEARCH & HISTORY --- */}
                <div className="discovery-sidebar">
                    <div className="search-config-card">
                        <h3><FiTarget /> Discovery Config</h3>
                        <form onSubmit={handleStartDiscovery}>
                            <div className="form-group">
                                <label>Event Context</label>
                                <input
                                    type="text"
                                    placeholder="e.g. SaaS Summit NYC"
                                    value={searchForm.event_name}
                                    onChange={e => setSearchForm({ ...searchForm, event_name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Location Override</label>
                                <input
                                    type="text"
                                    placeholder="Optional location"
                                    value={searchForm.location}
                                    onChange={e => setSearchForm({ ...searchForm, location: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Ideal Customer Profile (ICP)</label>
                                <textarea
                                    placeholder="Keywords: CEO, CTO, Product Manager..."
                                    value={searchForm.keywords}
                                    onChange={e => setSearchForm({ ...searchForm, keywords: e.target.value })}
                                />
                            </div>
                            <div className="platform-selector">
                                {["LinkedIn", "Twitter", "Websites", "Google Maps"].map(p => (
                                    <button
                                        key={p}
                                        type="button"
                                        className={`platform-chip ${searchForm.platforms.includes(p) ? 'active' : ''}`}
                                        onClick={() => {
                                            const newP = searchForm.platforms.includes(p)
                                                ? searchForm.platforms.filter(x => x !== p)
                                                : [...searchForm.platforms, p];
                                            setSearchForm({ ...searchForm, platforms: newP });
                                        }}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                            <button type="submit" className="btn-execute" disabled={loading.starting}>
                                {loading.starting ? <FiRefreshCw className="discovery-spin" /> : <FiZap />}
                                Start Intelligent Search
                            </button>
                        </form>

                        {loading.starting && (
                            <div className="discovery-console">
                                <div className="console-header"><div className="pulse"></div> Lead Agent Active</div>
                                <div className="console-logs">
                                    {discoveryLogs.map((log, i) => <div key={i} className="log-line">{log}</div>)}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="history-card">
                        <h3>History</h3>
                        <div className="history-list">
                            {events.map(ev => (
                                <div
                                    key={ev.id}
                                    className={`history-item ${selectedEvent?.id === ev.id ? 'active' : ''}`}
                                    onClick={() => setSelectedEvent(ev)}
                                >
                                    <div className="item-info">
                                        <span className="name">{ev.event_name}</span>
                                        <span className="date">{new Date(ev.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <FiArrowRight />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* --- MAIN PANEL: RESULTS --- */}
                <div className="discovery-results-panel">
                    <div className="panel-header">
                        <h2>{selectedEvent ? `Intelligence: ${selectedEvent.event_name}` : "Results Intelligence"}</h2>
                        <div className="panel-filters">
                            <div className="filter-search">
                                <FiSearch />
                                <input
                                    type="text"
                                    placeholder="Filter by name or company..."
                                    value={filterQuery}
                                    onChange={e => setFilterQuery(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="table-responsive">
                        <table className="leads-table">
                            <thead>
                                <tr>
                                    <th>Identified Prospect</th>
                                    <th>Match Score</th>
                                    <th>Corporation</th>
                                    <th>Contact Data</th>
                                    <th>Corporation Site</th>
                                    <th>Status</th>
                                    <th>Engage</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLeads.map(lead => (
                                    <tr key={lead.id}>
                                        <td>
                                            <div className="prospective-info">
                                                <span className="lead-name">{lead.name}</span>
                                                <span className="lead-title">{lead.job_title}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="match-score">
                                                <div className="score-bar-bg"><div className="score-bar-fill" style={{ width: `${lead.lead_score}%` }}></div></div>
                                                <span>{lead.lead_score}%</span>
                                            </div>
                                        </td>
                                        <td><span className="company-tag">{lead.company_name}</span></td>
                                        <td>
                                            <div className="contact-info">
                                                <div className="contact-item"><FiMail /> {lead.email}</div>
                                                {lead.phone_number && <div className="contact-item"><FiPhone /> {lead.phone_number}</div>}
                                            </div>
                                        </td>
                                        <td>
                                            {lead.website ? (
                                                <a href={lead.website} target="_blank" rel="noreferrer" className="website-link">
                                                    <FiGlobe /> {(() => {
                                                        try {
                                                            return new URL(lead.website).hostname.replace('www.', '');
                                                        } catch (e) {
                                                            return lead.website.replace(/^https?:\/\//, '').split('/')[0];
                                                        }
                                                    })()}
                                                </a>
                                            ) : (
                                                <span className="text-muted">Not Found</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`status-badge ${getStatusBadgeClass(lead)}`}>
                                                {getStatusLabel(lead)}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="action-btns">
                                                <button className="btn-insight" title="View AI Insights" onClick={() => fetchLeadInsights(lead)}><FiActivity /></button>
                                                {lead.linkedin_url && (
                                                    <a
                                                        href={lead.linkedin_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className={`btn-social linkedin ${lead.linkedin_url.includes('/search') ? 'search-mode' : ''}`}
                                                        title={lead.linkedin_url.includes('/search') ? "Search on LinkedIn" : "LinkedIn Profile"}
                                                    >
                                                        {lead.linkedin_url.includes('/search') ? <FiSearch /> : <FiLinkedin />}
                                                    </a>
                                                )}
                                                {lead.website && (
                                                    <a href={lead.website} target="_blank" rel="noreferrer" className="btn-social website" title="Company Website">
                                                        <FiGlobe />
                                                    </a>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* --- INSIGHTS MODAL --- */}
            {selectedLeadInsights && (
                <div className="modal-overlay">
                    <div className="insights-modal">
                        <div className="modal-header">
                            <h3>Prospect Intelligence Profile</h3>
                            <button onClick={() => setSelectedLeadInsights(null)}><FiX /></button>
                        </div>
                        <div className="modal-body">
                            {loadingInsights ? <div className="loading-state"><FiRefreshCw className="discovery-spin" /> Analyzing persona...</div> : (
                                <div className="insights-content">
                                    <div className="insight-section">
                                        <label><FiEye /> AI Strategic Perspective</label>
                                        <p>{selectedLeadInsights.data?.perspective}</p>
                                    </div>
                                    <div className="insight-section">
                                        <label><FiZap /> High-Performance Hooks</label>
                                        {selectedLeadInsights.data?.hooks?.map((h, i) => (
                                            <div key={i} className="hook-card">
                                                <p>{h}</p>
                                                <button onClick={() => navigator.clipboard.writeText(h)}><FiCopy /></button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="insight-footer">
                                        <span className="rationale">{selectedLeadInsights.data?.score_rationale}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default EventDiscoveryTab;
