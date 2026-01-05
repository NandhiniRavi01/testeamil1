import React, { useState, useEffect, useCallback } from "react";
import {
  FiUsers, FiRefreshCw, FiPlus, FiCheckCircle,
  FiX, FiClock, FiUser, FiMessageSquare,
  FiSave, FiEye, FiTrash2, FiCopy, FiAlertCircle,
  FiAtSign, FiKey, FiUserPlus, FiZap, FiLink,
  FiDatabase, FiSettings, FiMail, FiArrowRight,
  FiUploadCloud
} from "react-icons/fi";
import "./ZohoCRMTab.css";
import SplashScreen from "./SplashScreen";

// Dynamic API base URL detection
const getApiBaseUrl = () => {
  // Use environment variable if set
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }

  // Auto-detect based on current environment
  const { protocol, hostname, port } = window.location;

  // Development - running on localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Check if we're in development mode
    if (process.env.NODE_ENV === 'development') {
      return 'https://emailagent.cubegtp.com//api/zoho';
    }
  }

  // Production - use relative path (same domain)
  return '/api/zoho';
};

const API_BASE_URL = getApiBaseUrl();

function ZohoCRMTab() {
  const [repliedUsers, setRepliedUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState({
    users: false,
    connecting: false,
    addingLead: false,
    saving: false,
    bulkSyncing: false
  });
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [showUserDetails, setShowUserDetails] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });

  // Zoho CRM configuration
  const [zohoConfig, setZohoConfig] = useState({
    clientId: "",
    clientSecret: "",
    connected: false,
    region: "IN"
  });

  const [connectionStatus, setConnectionStatus] = useState({
    connected: false,
    message: "Not connected to Zoho CRM",
    errorType: null
  });

  const [isTestMode, setIsTestMode] = useState(false);

  // Request function with dynamic URL handling
  const makeRequest = async (endpoint, options = {}) => {
    // Clean endpoint - remove leading slash if present
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
    const url = `${API_BASE_URL}/${cleanEndpoint}`;

    const defaultOptions = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    try {
      console.log(`Making request to: ${url}`);
      const response = await fetch(url, { ...defaultOptions, ...options });

      if (!response.ok) {
        console.error(`Request failed with status: ${response.status}`, response);
      }

      return response;
    } catch (error) {
      console.error('Request failed:', error);
      console.error('Full URL attempted:', url);

      // Provide helpful error messages
      if (error.message.includes('Failed to fetch')) {
        const errorMsg = `Cannot connect to server at ${API_BASE_URL}. Please check if:`;
        const suggestions = [
          "1. The backend server is running",
          `2. The backend is accessible at ${API_BASE_URL}`,
          "3. There are no CORS issues (if running on different domains)"
        ];

        console.error(errorMsg + '\n' + suggestions.join('\n'));
        alert(`${errorMsg}\n\n${suggestions.join('\n')}`);
      }

      throw error;
    }
  };

  // Log API base URL on component mount
  useEffect(() => {
    console.log('ZohoCRMTab mounted');
    console.log('API Base URL:', API_BASE_URL);
    console.log('Current host:', window.location.host);
    console.log('Environment:', process.env.NODE_ENV);
    console.log('REACT_APP_API_URL:', process.env.REACT_APP_API_URL);
  }, []);

  // Load replied users and connection status on component mount
  useEffect(() => {
    fetchRepliedUsers();
    checkZohoConnectionStatus();
    // Load saved Zoho config from localStorage
    const savedConfig = localStorage.getItem('zohoCRMConfig');
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      // Ensure region exists in loaded config
      if (!parsed.region) parsed.region = "IN";
      setZohoConfig(parsed);
    }

    // Check for OAuth errors in URL
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    const message = urlParams.get('message');

    if (error === 'oauth_failed' && message && message.includes('no_org')) {
      setConnectionStatus(prev => ({
        ...prev,
        connected: false,
        errorType: 'no_org',
        message: "No CRM Organization Found"
      }));
    } else if (error === 'oauth_failed') {
      setConnectionStatus(prev => ({
        ...prev,
        connected: false,
        message: decodeURIComponent(message || "Connection failed")
      }));
    } else if (urlParams.get('success') === 'connected') {
      setConnectionStatus(prev => ({ ...prev, connected: true }));
    }
  }, []);

  const fetchRepliedUsers = async () => {
    setLoading(prev => ({ ...prev, users: true }));
    try {
      const res = await makeRequest('get-replied-users');

      if (res.ok) {
        const data = await res.json();
        setRepliedUsers(data.replied_users || []);
      } else {
        console.error("Error fetching replied users");
        alert("Failed to load replied users. Please check if the backend is running.");
      }
    } catch (err) {
      console.error("Error fetching replied users:", err);
      alert("Error fetching replied users: " + err.message);
    } finally {
      setLoading(prev => ({ ...prev, users: false }));
    }
  };

  const checkZohoConnectionStatus = useCallback(async () => {
    try {
      const res = await makeRequest('connection-status');

      if (res.ok) {
        const data = await res.json();
        setConnectionStatus(data);
        setZohoConfig(prev => ({ ...prev, connected: data.connected }));
      }
    } catch (err) {
      console.error("Error checking Zoho connection status:", err);
    }
  }, []);

  const fetchRepliedUsersCallback = useCallback(fetchRepliedUsers, []);

  React.useEffect(() => {
    checkZohoConnectionStatus();
    fetchRepliedUsersCallback();
  }, [checkZohoConnectionStatus, fetchRepliedUsersCallback]);

  const saveZohoCredentials = async () => {
    if (!zohoConfig.clientId || !zohoConfig.clientSecret) {
      alert("Please enter both Client ID and Client Secret");
      return;
    }

    setLoading(prev => ({ ...prev, saving: true }));
    setSaveStatus('Saving credentials...');

    try {
      const res = await makeRequest('save-credentials', {
        method: "POST",
        body: JSON.stringify({
          client_id: zohoConfig.clientId,
          client_secret: zohoConfig.clientSecret
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('zohoCRMConfig', JSON.stringify(zohoConfig));
        setSaveStatus('Credentials saved successfully!');
        setTimeout(() => {
          setSaveStatus('');
          checkZohoConnectionStatus(); // Refresh connection status
        }, 2000);
      } else {
        setSaveStatus('Failed to save credentials: ' + (data.message || "Unknown error"));
      }
    } catch (err) {
      setSaveStatus('Error saving credentials: ' + err.message);
    } finally {
      setLoading(prev => ({ ...prev, saving: false }));
    }
  };

  const connectToZoho = async () => {
    if (!zohoConfig.clientId || !zohoConfig.clientSecret) {
      alert("Please save your Zoho credentials first");
      return;
    }

    setLoading(prev => ({ ...prev, connecting: true }));
    try {
      // First ensure credentials are saved
      await saveZohoCredentials();

      // Then try to connect with region
      const res = await makeRequest(`connect?region=${zohoConfig.region || 'IN'}`);

      const data = await res.json();

      if (res.ok && data.success) {
        if (data.auth_url) {
          // Redirect to Zoho OAuth page
          console.log('Redirecting to Zoho OAuth:', data.auth_url);
          window.location.href = data.auth_url;
        } else {
          alert("Failed to get authorization URL");
        }
      } else {
        // More detailed error handling
        let errorMessage = data.message || "Failed to connect to Zoho CRM";

        if (data.error_type === 'no_credentials') {
          errorMessage = "No Zoho credentials found. Please save your Client ID and Client Secret first.";
        } else if (data.error_type === 'missing_credentials') {
          errorMessage = `Missing credentials: ${data.missing_fields?.join(', ')}. Please save your Zoho credentials first.`;
        }

        alert("Error connecting to Zoho: " + errorMessage);
      }
    } catch (err) {
      alert("Error connecting to Zoho: " + err.message);
    } finally {
      setLoading(prev => ({ ...prev, connecting: false }));
    }
  };

  const addLeadToZoho = async (user) => {
    if (!connectionStatus.connected) {
      alert("Please connect to Zoho CRM first");
      return;
    }

    setLoading(prev => ({ ...prev, addingLead: true }));
    try {
      console.log("Adding lead to Zoho:", user);

      const res = await makeRequest('add-lead', {
        method: "POST",
        body: JSON.stringify({
          lead_id: user.id
        })
      });

      const data = await res.json();
      console.log("Add lead response:", data);

      if (res.ok && data.success) {
        alert("Lead added to Zoho CRM successfully!");
        // Update the user status in the list
        setRepliedUsers(prev =>
          prev.map(u => u.id === user.id ? { ...u, added_to_zoho: true } : u)
        );
      } else {
        let errorMessage = data.message || "Unknown error occurred";

        // Provide more specific error messages
        if (data.message && data.message.includes('access token')) {
          errorMessage = "Authentication issue. Please reconnect to Zoho CRM.";
        } else if (data.message && data.message.includes('permission')) {
          errorMessage = "Insufficient permissions. Please check your Zoho CRM scope settings.";
        } else if (data.message && data.message.includes('Lead_Source')) {
          errorMessage = "Invalid field value. Please check your Zoho CRM field configuration.";
        }

        alert("Error adding lead to Zoho: " + errorMessage);
      }
    } catch (err) {
      console.error("Error adding lead:", err);
      alert("Error adding lead to Zoho: " + err.message);
    } finally {
      setLoading(prev => ({ ...prev, addingLead: false }));
    }
  };

  const addAllDataToCRM = async () => {
    if (!connectionStatus.connected) {
      alert("Please connect to Zoho CRM first");
      return;
    }

    if (repliedUsers.length === 0) {
      alert("No replied users to sync");
      return;
    }

    // Count users that haven't been synced yet
    const usersToSync = repliedUsers.filter(user => !user.added_to_zoho);

    if (usersToSync.length === 0) {
      alert("All users have already been synced to Zoho CRM");
      return;
    }

    if (!window.confirm(`Are you sure you want to add all ${usersToSync.length} unsynced users to Zoho CRM?\n\nThis will create new leads in your Zoho CRM account.`)) {
      return;
    }

    setLoading(prev => ({ ...prev, bulkSyncing: true }));
    setSyncProgress({ current: 0, total: usersToSync.length });

    try {
      const res = await makeRequest('add-all-leads', {
        method: "POST",
        body: JSON.stringify({})
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // Show success message with results
        let successMessage = `✅ Successfully added ${data.results?.successful || 0} users to Zoho CRM`;

        if (data.results?.failed > 0) {
          successMessage += `\n❌ ${data.results.failed} users failed to sync`;
        }

        alert(successMessage);

        // Update the UI to reflect successful syncs
        if (data.results && data.results.successful > 0) {
          // Refresh the user list to show updated status
          fetchRepliedUsers();
        }

        // Show detailed results if there were failures
        if (data.results && data.results.failed > 0 && data.results.errors.length > 0) {
          console.log("Failed syncs:", data.results.errors);
          const errorDetails = data.results.errors.slice(0, 3).map(err =>
            `• ${err.email}: ${err.error}`
          ).join('\n');

          if (data.results.errors.length > 3) {
            alert(`Some users failed to sync. First 3 errors:\n${errorDetails}\n\nCheck console for full details.`);
          } else {
            alert(`Some users failed to sync:\n${errorDetails}`);
          }
        }
      } else {
        // If we get an authentication error, guide user to connect
        if (data.message && (data.message.includes('authentication') || data.message.includes('token') || data.message.includes('access token'))) {
          alert("❌ Authentication failed. Please connect to Zoho CRM first and try again.");
          setShowConnectionModal(true);
        } else {
          alert("❌ Error syncing users: " + (data.message || "Unknown error"));
        }
      }
    } catch (err) {
      console.error("Error syncing all users:", err);
      if (err.message.includes('Failed to fetch')) {
        alert(`❌ Cannot connect to server at ${API_BASE_URL}. Please make sure the backend is running.`);
      } else {
        alert("❌ Error syncing all users: " + err.message);
      }
    } finally {
      setLoading(prev => ({ ...prev, bulkSyncing: false }));
      setSyncProgress({ current: 0, total: 0 });
    }
  };

  const disconnectZoho = async () => {
    try {
      const res = await makeRequest('disconnect', {
        method: "POST"
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert("Disconnected from Zoho CRM successfully!");
        setConnectionStatus({
          connected: false,
          message: "Not connected to Zoho CRM"
        });
        setZohoConfig(prev => ({ ...prev, connected: false }));
      } else {
        alert("Error disconnecting: " + (data.message || "Unknown error"));
      }
    } catch (err) {
      alert("Error disconnecting from Zoho: " + err.message);
    }
  };

  const viewUserDetails = (user) => {
    setSelectedUser(user);
    setShowUserDetails(true);
  };

  const resetModals = () => {
    setShowConnectionModal(false);
    setShowUserDetails(false);
    setSelectedUser(null);
    setSaveStatus('');
  };

  const handleZohoConfigChange = (field, value) => {
    setZohoConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleString();
    } catch (e) {
      return "Invalid Date";
    }
  };

  // Count unsynced users
  const unsyncedUsersCount = repliedUsers.filter(user => !user.added_to_zoho).length;

  return (
    <div className="zoho-crm-tab">
      {/* Header */}
      <div className="zoho-header">
        <div className="zoho-header-left">
          <h1>Zoho CRM Integration</h1>
          <p>Sync your warm leads and automate your sales pipeline.</p>
        </div>
        <div className="zoho-header-actions">
          <button
            className={`zoho-btn-secondary ${isTestMode ? 'active' : ''}`}
            onClick={() => setIsTestMode(!isTestMode)}
            style={{ marginRight: '12px', border: isTestMode ? '1px solid #10b981' : '' }}
          >
            <FiZap color={isTestMode ? '#10b981' : ''} /> {isTestMode ? 'Test Mode Active' : 'Enter Test Mode'}
          </button>
          <button className="zoho-btn-primary" onClick={() => setShowConnectionModal(true)}>
            <FiSettings /> CRM Settings
          </button>
        </div>
      </div>

      {connectionStatus.errorType === 'no_org' && !connectionStatus.connected && (
        <div className="zoho-error-banner" style={{
          background: '#fff7ed',
          border: '1px solid #fb923c',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px',
          display: 'flex',
          gap: '20px',
          alignItems: 'center'
        }}>
          <div style={{ background: '#ffedd5', padding: '15px', borderRadius: '12px' }}>
            <FiAlertCircle size={32} color="#f97316" />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: '0 0 8px 0', color: '#9a3412' }}>Setup Required: Create your Zoho CRM Organization</h3>
            <p style={{ margin: 0, color: '#c2410c', fontSize: '0.9rem', lineHeight: '1.5' }}>
              Your Zoho account is active, but you haven't started a CRM instance yet.
              Click the button on the right to activate CRM (it only takes 2 minutes), then return here to connect.
            </p>
          </div>
          <a
            href="https://crm.zoho.in/crm/GetStarted.do"
            target="_blank"
            rel="noreferrer"
            className="zoho-btn-primary"
            style={{ background: '#f97316', border: 'none' }}
          >
            Fix in Zoho <FiArrowRight />
          </a>
        </div>
      )}

      {/* Zoho CRM Connection Card */}
      <div className="card">
        <div className="card-header">
          <div className="card-icon-wrapper">
            <FiLink className="card-main-icon" />
          </div>
          <h3>Zoho CRM Connection</h3>
          <div className="header-actions">
            {connectionStatus.connected ? (
              <button
                onClick={disconnectZoho}
                className="btn btn-secondary"
              >
                <FiX /> Disconnect
              </button>
            ) : (
              <button
                onClick={() => setShowConnectionModal(true)}
                className="btn btn-primary"
              >
                <FiLink /> Connect Zoho CRM
              </button>
            )}
          </div>
        </div>
        <div className="card-content">
          <div className="connection-status">
            <div className={`status-indicator ${connectionStatus.connected ? 'connected' : 'disconnected'}`}>
              <div className="status-dot"></div>
              <span>{connectionStatus.connected ? 'Connected' : 'Disconnected'}</span>
            </div>
            <p className="status-message">{connectionStatus.message}</p>
          </div>

          {connectionStatus.connected && (
            <div className="connection-info">
              <div className="info-item">
                <FiCheckCircle className="info-icon success" />
                <span>Your Zoho CRM account is connected and ready</span>
              </div>
              <div className="info-item">
                <FiDatabase className="info-icon" />
                <span>You can now add replied users as leads to Zoho CRM</span>
              </div>
              <div className="info-item">
                <FiUserPlus className="info-icon" />
                <span>Leads will be created with reply messages and timestamps</span>
              </div>
            </div>
          )}

          {!connectionStatus.connected && (
            <div className="connection-help">
              <div className="info-item">
                <FiAlertCircle className="info-icon warning" />
                <span>To get started, save your Zoho CRM credentials and connect your account</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Sync Progress - Only show when actually syncing */}
      {loading.bulkSyncing && (
        <div className="card sync-progress-card">
          <div className="card-content">
            <div className="sync-progress">
              <h4>Adding Users to Zoho CRM</h4>
              <p>Processing {syncProgress.current} of {syncProgress.total} users...</p>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                ></div>
              </div>
              <div className="progress-text">
                {Math.round((syncProgress.current / syncProgress.total) * 100)}% Complete
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Statistics Card */}
      <div className="card">
        <div className="card-header">
          <div className="card-icon-wrapper">
            <FiUsers className="card-main-icon" />
          </div>
          <h3>Replied Users Statistics</h3>
          <button
            onClick={fetchRepliedUsers}
            className="btn btn-secondary"
            disabled={loading.users}
          >
            {loading.users ? (
              <div className="loading-spinner"></div>
            ) : (
              <FiRefreshCw />
            )}
            Refresh
          </button>
        </div>
        <div className="card-content">
          <div className="stats-grid">
            <div className="stats-card">
              <div className="stats-value">{repliedUsers.length}</div>
              <div className="stats-label">Total Replied Users</div>
            </div>
            <div className="stats-card">
              <div className="stats-value">
                {repliedUsers.filter(user => user.added_to_zoho).length}
              </div>
              <div className="stats-label">Added to Zoho CRM</div>
            </div>
            <div className="stats-card">
              <div className="stats-value">
                {unsyncedUsersCount}
              </div>
              <div className="stats-label">Pending Sync</div>
            </div>
          </div>
        </div>
      </div>

      {/* Replied Users Table */}
      <div className="card">
        <div className="card-header">
          <div className="card-icon-wrapper">
            <FiMail className="card-main-icon" />
          </div>
          <h3>Replied Users</h3>
          <div className="header-actions">
            <span className="table-count">
              {repliedUsers.length} user{repliedUsers.length !== 1 ? 's' : ''}
              {unsyncedUsersCount > 0 && (
                <span className="unsynced-count"> ({unsyncedUsersCount} unsynced)</span>
              )}
            </span>
            {unsyncedUsersCount > 0 && connectionStatus.connected && (
              <button
                onClick={addAllDataToCRM}
                disabled={loading.bulkSyncing}
                className="btn btn-primary"
                title="Add All Unsynced Users to Zoho CRM"
              >
                {loading.bulkSyncing ? (
                  <>
                    <div className="loading-spinner"></div>
                    Adding...
                  </>
                ) : (
                  <>
                    <FiUploadCloud />
                    Add All to CRM
                  </>
                )}
              </button>
            )}
          </div>
        </div>
        <div className="card-content">
          {loading.users ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading replied users...</p>
            </div>
          ) : repliedUsers.length === 0 ? (
            <div className="empty-state">
              <FiMail size={48} style={{ marginBottom: '10px', opacity: 0.5 }} />
              <p>No replied users found yet. Check your email campaigns for replies.</p>
              <button onClick={fetchRepliedUsers} className="btn btn-primary">
                <FiRefreshCw /> Check Again
              </button>
            </div>
          ) : (
            <div className="table-container">
              <table className="zoho-users-table">
                <thead>
                  <tr>
                    <th>User Details</th>
                    <th>Campaign</th>
                    <th>Reply Received</th>
                    <th>Reply Preview</th>
                    <th>Zoho CRM Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {repliedUsers.map((user) => (
                    <tr key={user.id} className={user.added_to_zoho ? 'synced' : 'pending'}>
                      <td>
                        <div className="user-info">
                          <strong>{user.name || "Unknown"}</strong>
                          <div className="user-email">{user.email}</div>
                        </div>
                      </td>
                      <td>{user.campaign_name || "N/A"}</td>
                      <td>{formatDate(user.reply_time)}</td>
                      <td>
                        <div className="reply-preview">
                          {user.reply_message ?
                            (user.reply_message.length > 100
                              ? user.reply_message.substring(0, 100) + "..."
                              : user.reply_message
                            )
                            : "No message"
                          }
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge ${user.added_to_zoho ? 'synced' : 'pending'}`}>
                          {user.added_to_zoho ? (
                            <>
                              <FiCheckCircle /> Added to Zoho
                            </>
                          ) : (
                            <>
                              <FiClock /> Not Synced
                            </>
                          )}
                        </span>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            onClick={() => viewUserDetails(user)}
                            className="btn btn-secondary btn-sm"
                            title="View Details"
                          >
                            <FiEye />
                          </button>
                          {!user.added_to_zoho && (
                            <button
                              onClick={() => addLeadToZoho(user)}
                              disabled={loading.addingLead || !connectionStatus.connected}
                              className="btn btn-primary btn-sm"
                              title="Add to Zoho CRM"
                            >
                              {loading.addingLead ? (
                                <div className="loading-spinner"></div>
                              ) : (
                                <FiPlus />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Connection Modal */}
      {showConnectionModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Connect Zoho CRM</h3>
              <button onClick={resetModals} className="btn btn-secondary">
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              {saveStatus && (
                <div className={`save-status ${saveStatus.includes('successfully') ? 'success' : 'error'}`}>
                  {saveStatus}
                </div>
              )}

              <div className="connection-steps">
                {/* Region Selector */}
                <div className="step">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <h4>Select Your Region</h4>
                    <p>Select the data center where your Zoho CRM account is hosted.</p>
                    <select
                      className="form-input region-select"
                      value={zohoConfig.region || 'IN'}
                      onChange={(e) => handleZohoConfigChange('region', e.target.value)}
                      style={{ marginTop: '10px', maxWidth: '300px' }}
                    >
                      <option value="IN">India (.in)</option>
                      <option value="US">United States / Global (.com)</option>
                      <option value="EU">Europe (.eu)</option>
                      <option value="AU">Australia (.com.au)</option>
                      <option value="JP">Japan (.jp)</option>
                      <option value="CN">China (.com.cn)</option>
                    </select>
                  </div>
                </div>

                <div className="step">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <h4>Get Zoho CRM Credentials</h4>
                    <p>
                      Go to <a href="https://api-console.zoho.com" target="_blank" rel="noopener noreferrer">Zoho API Console</a> and create a new client.
                      Use the following redirect URI:
                    </p>
                    <div className="redirect-uri-box">
                      <code>{API_BASE_URL.startsWith('http') ? `${API_BASE_URL}/oauth-callback` : `${window.location.origin}${API_BASE_URL}/oauth-callback`}</code>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          const uri = API_BASE_URL.startsWith('http') ? `${API_BASE_URL}/oauth-callback` : `${window.location.origin}${API_BASE_URL}/oauth-callback`;
                          navigator.clipboard.writeText(uri);
                        }}
                        title="Copy to clipboard"
                      >
                        <FiCopy />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="step">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <h4>Enter Your Credentials</h4>
                    <div className="credentials-form">
                      <div className="form-group">
                        <label>
                          <FiKey className="input-icon" />
                          Client ID: *
                        </label>
                        <input
                          type="text"
                          value={zohoConfig.clientId}
                          onChange={(e) => handleZohoConfigChange('clientId', e.target.value)}
                          placeholder="Enter your Zoho Client ID"
                          className="form-input"
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>
                          <FiKey className="input-icon" />
                          Client Secret: *
                        </label>
                        <input
                          type="password"
                          value={zohoConfig.clientSecret}
                          onChange={(e) => handleZohoConfigChange('clientSecret', e.target.value)}
                          placeholder="Enter your Zoho Client Secret"
                          className="form-input"
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="step">
                  <div className="step-number">4</div>
                  <div className="step-content">
                    <h4>Save and Connect</h4>
                    <p>Save your credentials and then connect to Zoho CRM to authorize the application.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                onClick={resetModals}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <div className="modal-actions">
                <button
                  onClick={saveZohoCredentials}
                  disabled={loading.saving || !zohoConfig.clientId || !zohoConfig.clientSecret}
                  className="btn btn-secondary"
                >
                  {loading.saving ? (
                    <>
                      <div className="loading-spinner"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <FiSave /> Save Credentials
                    </>
                  )}
                </button>
                <button
                  onClick={connectToZoho}
                  disabled={loading.connecting || !zohoConfig.clientId || !zohoConfig.clientSecret}
                  className="btn btn-primary"
                >
                  {loading.connecting ? (
                    <>
                      <div className="loading-spinner"></div>
                      Connecting...
                    </>
                  ) : (
                    <>
                      <FiLink /> Connect
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Details Modal */}
      {showUserDetails && selectedUser && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>User Details</h3>
              <button onClick={resetModals} className="btn btn-secondary">
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <div className="user-details">
                <div className="detail-row">
                  <strong>Name:</strong> {selectedUser.name || "Unknown"}
                </div>
                <div className="detail-row">
                  <strong>Email:</strong> {selectedUser.email}
                </div>
                <div className="detail-row">
                  <strong>Campaign:</strong> {selectedUser.campaign_name || "N/A"}
                </div>
                <div className="detail-row">
                  <strong>Sent Time:</strong> {formatDate(selectedUser.sent_time)}
                </div>
                <div className="detail-row">
                  <strong>Reply Time:</strong> {formatDate(selectedUser.reply_time)}
                </div>
                <div className="detail-row full-width">
                  <strong>Reply Message:</strong>
                  <div className="reply-message">
                    {selectedUser.reply_message || "No message"}
                  </div>
                </div>
                <div className="detail-row">
                  <strong>Zoho CRM Status:</strong>
                  <span className={`status-badge ${selectedUser.added_to_zoho ? 'synced' : 'pending'}`}>
                    {selectedUser.added_to_zoho ? 'Added to Zoho' : 'Not Synced'}
                  </span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                onClick={resetModals}
                className="btn btn-secondary"
              >
                Close
              </button>
              {!selectedUser.added_to_zoho && connectionStatus.connected && (
                <button
                  onClick={() => {
                    addLeadToZoho(selectedUser);
                    resetModals();
                  }}
                  className="btn btn-primary"
                  disabled={loading.addingLead}
                >
                  {loading.addingLead ? (
                    <>
                      <div className="loading-spinner"></div>
                      Adding...
                    </>
                  ) : (
                    <>
                      <FiPlus /> Add to Zoho CRM
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export default ZohoCRMTab;

