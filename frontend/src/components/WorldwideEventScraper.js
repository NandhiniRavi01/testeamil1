import React, { useState } from 'react';
import axios from 'axios';
import {
    FiCalendar, FiSearch, FiX, FiMapPin, FiClock,
    FiUsers, FiExternalLink, FiDownload, FiMail, FiLinkedin,
    FiFacebook, FiSend, FiGlobe, FiPhone, FiTag, FiAward,
    FiRefreshCw, FiCheckCircle, FiAlertCircle, FiCpu, FiUser, FiTwitter
} from 'react-icons/fi';
import './WorldwideEventScraper.css';

const WorldwideEventScraper = ({ setGlobalLoading }) => {
    const [eventName, setEventName] = useState('');
    const [eventResults, setEventResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeEventTab, setActiveEventTab] = useState('overview');
    const [timeFilter, setTimeFilter] = useState('all');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const SCRAPER_BASE_URL = 'https://emailagent.cubegtp.com//webscraping';

    const handleEventSearch = async () => {
        if (!eventName.trim()) return;
        setLoading(true);
        if (setGlobalLoading) setGlobalLoading(true);
        setError('');
        setSuccess('');
        setEventResults([]);
        try {
            const response = await axios.post(`${SCRAPER_BASE_URL}/scrape-events`, {
                event_name: eventName,
                time_filter: timeFilter
            });

            if (response.data.status === 'success') {
                setEventResults(response.data.events || []);
                if (response.data.events && response.data.events.length === 0) {
                    setError(response.data.message || 'No events found for this query.');
                } else {
                    setSuccess('Successfully found events!');
                    setTimeout(() => setSuccess(''), 3000);
                }
            } else {
                setError(response.data.message || 'Unable to fetch events');
            }
        } catch (err) {
            setError('Error connection to server. Please ensure backend is running.');
            console.error(err);
        } finally {
            setLoading(false);
            if (setGlobalLoading) setGlobalLoading(false);
        }
    };

    const getTimingBadge = (timing) => {
        const badges = {
            'past': { color: '#64748b', label: 'Past Event' },
            'present': { color: '#10b981', label: 'Happening Now' },
            'upcoming': { color: '#0078d4', label: 'Upcoming' }
        };
        return badges[timing] || badges['upcoming'];
    };

    const exportToCSV = () => {
        if (eventResults.length === 0) return;

        const headers = ['Event Name', 'Platform', 'Region', 'Date', 'Location', 'Organizer', 'Event Type', 'Timing', 'URL', 'Emails', 'Phones'];
        const csvContent = [
            headers.join(','),
            ...eventResults.map(e => [
                `"${e.event_name || ''}"`,
                `"${e.platform || ''}"`,
                `"${e.region || ''}"`,
                `"${e.date || ''}"`,
                `"${e.location || ''}"`,
                `"${e.organizer || ''}"`,
                `"${e.event_type || ''}"`,
                `"${e.event_timing || ''}"`,
                `"${e.url || ''}"`,
                `"${(e.emails || []).join('; ')}"`,
                `"${(e.phones || []).join('; ')}"`
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `events_${eventName.replace(/\s+/g, '_')}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="events-scraper-container">
            <div className="events-scraper-wrapper">
                {/* Search Card */}
                <div className="card search-card">
                    <div className="card-header">
                        <div className="card-icon-wrapper">
                            <FiCalendar className="card-main-icon" />
                        </div>
                        <div className="card-header-content">
                            <h3>Worldwide Event Scraper</h3>
                            <p>Discover professional events, conferences, and meetups</p>
                        </div>
                    </div>

                    <div className="card-section">
                        <div className="form-group">
                            <label>Event Name or Topic:</label>
                            <div className="search-input-wrapper">
                                <FiSearch className="search-icon" />
                                <input
                                    type="text"
                                    className="form-control"
                                    value={eventName}
                                    onChange={(e) => setEventName(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleEventSearch()}
                                    placeholder="e.g. AI Innovation Summit 2025, SaaS Conferences Europe"
                                />
                            </div>
                        </div>

                        <div className="filter-group">
                            <label>Time Period:</label>
                            <div className="time-filters">
                                <button className={`filter-btn ${timeFilter === 'all' ? 'active' : ''}`} onClick={() => setTimeFilter('all')}>
                                    <FiCalendar /> All
                                </button>
                                <button className={`filter-btn ${timeFilter === 'past' ? 'active' : ''}`} onClick={() => setTimeFilter('past')}>
                                    <FiClock /> Past
                                </button>
                                <button className={`filter-btn ${timeFilter === 'present' ? 'active' : ''}`} onClick={() => setTimeFilter('present')}>
                                    <FiAward /> Ongoing
                                </button>
                                <button className={`filter-btn ${timeFilter === 'upcoming' ? 'active' : ''}`} onClick={() => setTimeFilter('upcoming')}>
                                    <FiCalendar /> Upcoming
                                </button>
                            </div>
                        </div>

                        <div className="action-buttons">
                            <button className="btn btn-primary search-btn" onClick={handleEventSearch} disabled={!eventName || loading}>
                                {loading ? <><FiRefreshCw className="spinning" /> Searching...</> : <><FiSearch /> Search Events</>}
                            </button>
                            {eventResults.length > 0 && (
                                <button className="btn btn-secondary export-btn" onClick={exportToCSV}>
                                    <FiDownload /> Export CSV
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {error && <div className="status-msg error-msg"><FiX /> {error}</div>}
                {success && <div className="status-msg success-msg"><FiCheckCircle /> {success}</div>}

                {/* Results Section */}
                {loading && (
                    <div className="loading-state centered">
                        <div className="cubeai-loader">
                            <FiCpu className="logo-blinking" />
                        </div>
                        <p>Analyzing event platforms worldwide...</p>
                    </div>
                )}
                {eventResults.length > 0 && (
                    <div className="results-container">
                        <div className="results-tabs">
                            <button className={`tab-btn ${activeEventTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveEventTab('overview')}>
                                <FiGlobe /> Overview ({eventResults.length})
                            </button>
                            <button className={`tab-btn ${activeEventTab === 'contacts' ? 'active' : ''}`} onClick={() => setActiveEventTab('contacts')}>
                                <FiUser /> Professional Contacts
                            </button>
                            <button className={`tab-btn ${activeEventTab === 'details' ? 'active' : ''}`} onClick={() => setActiveEventTab('details')}>
                                <FiTag /> Full Details
                            </button>
                        </div>

                        <div className="tab-content">
                            {activeEventTab === 'overview' && (
                                <div className="events-grid">
                                    {eventResults.map((event, index) => {
                                        const timing = getTimingBadge(event.event_timing);
                                        return (
                                            <div key={index} className="event-card animate-in" style={{ animationDelay: `${index * 0.1}s` }}>
                                                <div className="event-card-header">
                                                    <h4>{event.event_name}</h4>
                                                    <span className="timing-badge" style={{ backgroundColor: timing.color }}>{timing.label}</span>
                                                </div>

                                                <div className="event-meta">
                                                    <div className="meta-item"><FiMapPin /> {event.location || 'Remote/Online'}</div>
                                                    <div className="meta-item"><FiClock /> {event.date || 'TBD'}</div>
                                                    <div className="meta-item"><FiGlobe /> {event.platform}</div>
                                                </div>

                                                <p className="event-desc">{event.description}</p>

                                                <div className="event-card-footer">
                                                    <div className="contact-previews">
                                                        {event.emails?.length > 0 && <span className="preview-badge"><FiMail /> {event.emails.length} Emails</span>}
                                                        {event.phones?.length > 0 && <span className="preview-badge"><FiPhone /> {event.phones.length} Phones</span>}
                                                    </div>
                                                    <a href={event.url} target="_blank" rel="noopener noreferrer" className="btn-link">
                                                        View Details <FiExternalLink />
                                                    </a>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {activeEventTab === 'contacts' && (
                                <div className="contacts-view">
                                    {eventResults.map((event, index) => (
                                        <div key={index} className="contact-group-card animate-in" style={{ animationDelay: `${index * 0.1}s` }}>
                                            <div className="contact-card-header">
                                                <h5>{event.event_name}</h5>
                                                <div className="organizer-badge"><FiAward /> Organizer: {event.organizer || 'Provided upon request'}</div>
                                            </div>

                                            <div className="contact-details-grid">
                                                {/* Organizer & Key Decision Maker details */}
                                                <div className="detail-section">
                                                    <h6><FiUser /> Right Person & Decision Maker</h6>
                                                    {event.professional_contacts && event.professional_contacts.length > 0 ? (
                                                        event.professional_contacts.map((contact, i) => (
                                                            <div key={i} className="pro-contact premium">
                                                                <div className="pro-avatar">{contact.name?.[0] || 'C'}</div>
                                                                <div className="pro-identity">
                                                                    <span className="pro-name">{contact.name}</span>
                                                                    <span className="pro-role">{contact.role || 'Event Host/Organizer'}</span>
                                                                </div>
                                                                <div className="pro-actions">
                                                                    {contact.email && <a href={`mailto:${contact.email}`} title="Email ID"><FiMail /></a>}
                                                                    {contact.phone && <a href={`tel:${contact.phone}`} title="Phone Number"><FiPhone /></a>}
                                                                </div>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="no-contact-placeholder">
                                                            <FiAlertCircle /> No direct personnel found. Check social reach below.
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Social Reach & Direct Links */}
                                                <div className="detail-section">
                                                    <h6><FiGlobe /> Official Social Reach</h6>
                                                    <div className="social-grid-enhanced">
                                                        {event.social_links?.linkedin ? (
                                                            <a href={event.social_links.linkedin} target="_blank" rel="noopener noreferrer" className="social-link-item linkedin">
                                                                <FiLinkedin /> <span>LinkedIn</span>
                                                            </a>
                                                        ) : <div className="social-link-item disabled"><FiLinkedin /> <span>LinkedIn</span></div>}

                                                        {event.social_links?.twitter ? (
                                                            <a href={event.social_links.twitter} target="_blank" rel="noopener noreferrer" className="social-link-item twitter">
                                                                <FiTwitter /> <span>Twitter</span>
                                                            </a>
                                                        ) : <div className="social-link-item disabled"><FiTwitter /> <span>Twitter</span></div>}

                                                        {event.social_links?.facebook ? (
                                                            <a href={event.social_links.facebook} target="_blank" rel="noopener noreferrer" className="social-link-item facebook">
                                                                <FiFacebook /> <span>Facebook</span>
                                                            </a>
                                                        ) : <div className="social-link-item disabled"><FiFacebook /> <span>Facebook</span></div>}

                                                        {event.social_links?.telegram ? (
                                                            <a href={event.social_links.telegram} target="_blank" rel="noopener noreferrer" className="social-link-item telegram">
                                                                <FiSend /> <span>Telegram</span>
                                                            </a>
                                                        ) : <div className="social-link-item disabled"><FiSend /> <span>Telegram</span></div>}
                                                    </div>
                                                </div>

                                                {/* Direct Resource Access */}
                                                <div className="detail-section">
                                                    <h6><FiMail /> Verified Reach Points</h6>
                                                    <div className="reach-list-enhanced">
                                                        {event.emails && event.emails.length > 0 ? (
                                                            event.emails.map((email, i) => <span key={i} className="reach-tag email"><FiMail /> {email}</span>)
                                                        ) : <span className="reach-tag empty">No verified emails</span>}

                                                        {event.phones && event.phones.length > 0 ? (
                                                            event.phones.map((phone, i) => <span key={i} className="reach-tag phone"><FiPhone /> {phone}</span>)
                                                        ) : <span className="reach-tag empty">No verified phones</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {activeEventTab === 'details' && (
                                <div className="full-details-view">
                                    {eventResults.map((event, index) => (
                                        <div key={index} className="detail-card animate-in" style={{ animationDelay: `${index * 0.1}s` }}>
                                            <div className="detail-header">
                                                <h4>{event.event_name}</h4>
                                                <a href={event.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
                                                    <FiExternalLink /> Visit Site
                                                </a>
                                            </div>
                                            <div className="specs-grid">
                                                <div className="spec-item"><strong>Region:</strong> {event.region}</div>
                                                <div className="spec-item"><strong>Platform:</strong> {event.platform}</div>
                                                <div className="spec-item"><strong>Type:</strong> {event.event_type}</div>
                                                {event.registration?.fee && (
                                                    <div className="spec-item"><strong>Fee:</strong> {event.registration.fee}</div>
                                                )}
                                                {event.registration?.deadline && (
                                                    <div className="spec-item"><strong>Deadline:</strong> {event.registration.deadline}</div>
                                                )}
                                            </div>
                                            <div className="full-desc">
                                                <h5>Description</h5>
                                                <p>{event.description}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Global Contact Section */}
                <div className="card contact-card">
                    <div className="card-header">
                        <div className="card-icon-wrapper contact">
                            <FiSend />
                        </div>
                        <div className="card-header-content">
                            <h3>Contact & Support</h3>
                            <p>Need help? Reach out to our professional support team</p>
                        </div>
                    </div>
                    <div className="card-section contact-info-section">
                        <div className="support-email">
                            <FiMail className="mail-icon" />
                            <a href="mailto:support@leadgenerator.com">support@leadgenerator.com</a>
                        </div>
                        <div className="social-support-grid">
                            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="support-social-link ln"><FiLinkedin /> LinkedIn</a>
                            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="support-social-link tw"><FiTwitter /> Twitter</a>
                            <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="support-social-link fb"><FiFacebook /> Facebook</a>
                            <a href="https://t.me" target="_blank" rel="noopener noreferrer" className="support-social-link tg"><FiSend /> Telegram</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
export default WorldwideEventScraper;


