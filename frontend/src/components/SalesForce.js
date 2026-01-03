import React, { useState, useEffect } from "react";
import {
  FiUsers, FiRefreshCw, FiPlus, FiCheckCircle,
  FiX, FiClock, FiEye, FiTrash2, FiAlertCircle,
  FiKey, FiLink, FiDatabase, FiSettings, FiMail,
  FiUploadCloud, FiLogOut
} from "react-icons/fi";
import "./SalesForce.css";

// Dynamic API base URL
const getApiBaseUrl = () => {
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  const { hostname } = window.location;
  if (hostname === 'localhost' || hostname === '65.1.129.37') {
    return 'http://65.1.129.37:5000';
  }
  return '';
};

const API_BASE_URL = getApiBaseUrl();

function SalesforceCRMTab() {
  const [repliedUsers, setRepliedUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState({
    users: false,
    connecting: false,
    disconnecting: false,
    addingLead: false,
    bulkSyncing: false
  });
  
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [showUserDetails, setShowUserDetails] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  
  const [connectionStatus, setConnectionStatus] = useState({
    connected: false,
    message: "Not connected to Salesforce"
  });

  // Check Salesforce connection status on component mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const error = params.get('error');
    
    if (success === 'connected') {
      alert("✅ Successfully connected to Salesforce!");
      // Clear the URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
      checkSalesforceConnection(); // Refresh connection status
    }
    
    if (error) {
      alert(`❌ Connection failed: ${decodeURIComponent(error)}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    // Existing checks
    checkSalesforceConnection();
    fetchRepliedUsers();
  }, []);

  const makeRequest = async (endpoint, options = {}) => {
    const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    const defaultOptions = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, { ...defaultOptions, ...options });
      if (!response.ok) {
        console.error(`Request failed: ${response.status}`);
      }
      return response;
    } catch (error) {
      console.error('Request failed:', error);
      throw error;
    }
  };

  const checkSalesforceConnection = async () => {
    try {
      const res = await makeRequest('/salesforce/status');
      if (res.ok) {
        const data = await res.json();
        setConnectionStatus({
          connected: data.connected || false,
          message: data.connected ? "Connected to Salesforce" : "Not connected to Salesforce"
        });
      }
    } catch (err) {
      console.error("Error checking Salesforce connection:", err);
    }
  };

  const fetchRepliedUsers = async () => {
    setLoading(prev => ({ ...prev, users: true }));
    try {
      // This would be your existing endpoint for replied users
      const res = await makeRequest('/api/get-replied-users'); // Adjust to your actual endpoint
      
      if (res.ok) {
        const data = await res.json();
        setRepliedUsers(data.replied_users || []);
      }
    } catch (err) {
      console.error("Error fetching replied users:", err);
    } finally {
      setLoading(prev => ({ ...prev, users: false }));
    }
  };

  const connectToSalesforce = async () => {
    setLoading(prev => ({ ...prev, connecting: true }));
    try {
      // Redirect to Salesforce OAuth flow
      window.location.href = `${API_BASE_URL}/salesforce/auth`;
    } catch (err) {
      console.error("Error connecting to Salesforce:", err);
      alert("Error connecting to Salesforce: " + err.message);
    } finally {
      setLoading(prev => ({ ...prev, connecting: false }));
    }
  };

  const disconnectSalesforce = async () => {
    if (!window.confirm("Are you sure you want to disconnect from Salesforce? This will revoke access to your Salesforce data.")) {
      return;
    }

    setLoading(prev => ({ ...prev, disconnecting: true }));
    try {
      const res = await makeRequest('/salesforce/revoke');
      const data = await res.json();
      
      if (res.ok && data.success) {
        alert("✅ Disconnected from Salesforce successfully!");
        setConnectionStatus({
          connected: false,
          message: "Not connected to Salesforce"
        });
      } else {
        alert("❌ Error disconnecting: " + (data.message || "Unknown error"));
      }
    } catch (err) {
      console.error("Error disconnecting:", err);
      alert("Error disconnecting from Salesforce: " + err.message);
    } finally {
      setLoading(prev => ({ ...prev, disconnecting: false }));
    }
  };

  const addLeadToSalesforce = async (user) => {
    if (!connectionStatus.connected) {
      alert("Please connect to Salesforce first");
      return;
    }

    setLoading(prev => ({ ...prev, addingLead: true }));
    try {
      const res = await makeRequest('/salesforce/add-lead', {
        method: "POST",
        body: JSON.stringify({
          name: user.name,
          email: user.email,
          company: user.company,
          message: user.reply_message
        })
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        alert("✅ Lead added to Salesforce successfully!");
        // Update UI
        setRepliedUsers(prev => 
          prev.map(u => u.id === user.id ? { ...u, added_to_salesforce: true } : u)
        );
      } else {
        alert("❌ Error adding lead: " + (data.message || "Unknown error"));
      }
    } catch (err) {
      console.error("Error adding lead:", err);
      alert("Error adding lead to Salesforce: " + err.message);
    } finally {
      setLoading(prev => ({ ...prev, addingLead: false }));
    }
  };

  const addAllToSalesforce = async () => {
    if (!connectionStatus.connected) {
      alert("Please connect to Salesforce first");
      return;
    }

    const usersToSync = repliedUsers.filter(user => !user.added_to_salesforce);
    
    if (usersToSync.length === 0) {
      alert("All users have already been synced to Salesforce");
      return;
    }

    if (!window.confirm(`Add ${usersToSync.length} users to Salesforce as Leads?`)) {
      return;
    }

    setLoading(prev => ({ ...prev, bulkSyncing: true }));
    setSyncProgress({ current: 0, total: usersToSync.length });
    
    try {
      const res = await makeRequest('/salesforce/add-bulk-leads', {
        method: "POST",
        body: JSON.stringify({ users: usersToSync })
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        alert(`✅ Successfully added ${data.added_count || 0} users to Salesforce`);
        fetchRepliedUsers(); // Refresh list
      } else {
        alert("❌ Error syncing users: " + (data.message || "Unknown error"));
      }
    } catch (err) {
      console.error("Error syncing all users:", err);
      alert("Error syncing users: " + err.message);
    } finally {
      setLoading(prev => ({ ...prev, bulkSyncing: false }));
      setSyncProgress({ current: 0, total: 0 });
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
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleString();
    } catch (e) {
      return "Invalid Date";
    }
  };

  const unsyncedUsersCount = repliedUsers.filter(user => !user.added_to_salesforce).length;

  return (
    <div className="salesforce-crm-tab">
      {/* Header */}
      <div className="tab-header">
        <h1>Salesforce Integration</h1>
        <p>Sync replied users with your Salesforce CRM as Leads</p>
      </div>

      {/* Connection Card */}
      <div className="card">
        <div className="card-header">
          <div className="card-icon-wrapper salesforce-bg">
            <FiDatabase className="card-main-icon" />
          </div>
          <h3>Salesforce Connection</h3>
          <div className="header-actions">
            {connectionStatus.connected ? (
              <button 
                onClick={disconnectSalesforce}
                disabled={loading.disconnecting}
                className="btn btn-secondary"
              >
                {loading.disconnecting ? (
                  <div className="loading-spinner"></div>
                ) : (
                  <FiLogOut />
                )}
                Disconnect
              </button>
            ) : (
              <button 
                onClick={connectToSalesforce}
                disabled={loading.connecting}
                className="btn btn-primary"
              >
                {loading.connecting ? (
                  <div className="loading-spinner"></div>
                ) : (
                  <FiLink />
                )}
                Connect Salesforce
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

          {connectionStatus.connected ? (
            <div className="connection-info">
              <div className="info-item">
                <FiCheckCircle className="info-icon success" />
                <span>Your Salesforce account is connected and ready</span>
              </div>
              <div className="info-item">
                <FiUsers className="info-icon" />
                <span>You can add replied users as Leads to Salesforce</span>
              </div>
            </div>
          ) : (
            <div className="connection-help">
              <div className="info-item">
                <FiAlertCircle className="info-icon warning" />
                <span>Click "Connect Salesforce" to authorize access to your Salesforce account</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Sync Progress */}
      {loading.bulkSyncing && (
        <div className="card sync-progress-card">
          <div className="card-content">
            <div className="sync-progress">
              <h4>Syncing with Salesforce</h4>
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

      {/* Statistics */}
      <div className="card">
        <div className="card-header">
          <div className="card-icon-wrapper salesforce-bg">
            <FiUsers className="card-main-icon" />
          </div>
          <h3>Sync Statistics</h3>
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
              <div className="stats-label">Total Users</div>
            </div>
            <div className="stats-card">
              <div className="stats-value">
                {repliedUsers.filter(user => user.added_to_salesforce).length}
              </div>
              <div className="stats-label">In Salesforce</div>
            </div>
            <div className="stats-card">
              <div className="stats-value">{unsyncedUsersCount}</div>
              <div className="stats-label">Pending Sync</div>
            </div>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="card">
        <div className="card-header">
          <div className="card-icon-wrapper salesforce-bg">
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
                onClick={addAllToSalesforce}
                disabled={loading.bulkSyncing}
                className="btn btn-primary"
              >
                {loading.bulkSyncing ? (
                  <>
                    <div className="loading-spinner"></div>
                    Syncing...
                  </>
                ) : (
                  <>
                    <FiUploadCloud />
                    Sync All to Salesforce
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
              <p>Loading users...</p>
            </div>
          ) : repliedUsers.length === 0 ? (
            <div className="empty-state">
              <FiMail size={48} style={{marginBottom: '10px', opacity: 0.5}} />
              <p>No replied users found.</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Campaign</th>
                    <th>Reply Time</th>
                    <th>Salesforce Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {repliedUsers.map((user) => (
                    <tr key={user.id} className={user.added_to_salesforce ? 'synced' : 'pending'}>
                      <td>
                        <div className="user-info">
                          <strong>{user.name || "Unknown"}</strong>
                          <div className="user-email">{user.email}</div>
                        </div>
                      </td>
                      <td>{user.campaign_name || "N/A"}</td>
                      <td>{formatDate(user.reply_time)}</td>
                      <td>
                        <span className={`status-badge ${user.added_to_salesforce ? 'synced' : 'pending'}`}>
                          {user.added_to_salesforce ? (
                            <>
                              <FiCheckCircle /> In Salesforce
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
                          >
                            <FiEye />
                          </button>
                          {!user.added_to_salesforce && (
                            <button 
                              onClick={() => addLeadToSalesforce(user)}
                              disabled={loading.addingLead || !connectionStatus.connected}
                              className="btn btn-primary btn-sm"
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
              <h3>Connect Salesforce</h3>
              <button onClick={resetModals} className="btn btn-secondary">
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <div className="connection-steps">
                <div className="step">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <h4>Authorization</h4>
                    <p>Click "Connect" to authorize this application to access your Salesforce data.</p>
                  </div>
                </div>
                <div className="step">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <h4>Permissions</h4>
                    <p>You'll be redirected to Salesforce to grant access. Required permissions:</p>
                    <ul>
                      <li>Access basic profile information</li>
                      <li>Create and update Leads</li>
                      <li>Read Contact information</li>
                    </ul>
                  </div>
                </div>
                <div className="step">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <h4>Ready to Sync</h4>
                    <p>Once connected, you can sync replied users as Leads in Salesforce.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={resetModals} className="btn btn-secondary">
                Cancel
              </button>
              <button 
                onClick={connectToSalesforce}
                disabled={loading.connecting}
                className="btn btn-primary"
              >
                {loading.connecting ? (
                  <>
                    <div className="loading-spinner"></div>
                    Connecting...
                  </>
                ) : (
                  <>
                    <FiLink /> Connect to Salesforce
                  </>
                )}
              </button>
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
                  <strong>Reply Time:</strong> {formatDate(selectedUser.reply_time)}
                </div>
                <div className="detail-row">
                  <strong>Salesforce Status:</strong>
                  <span className={`status-badge ${selectedUser.added_to_salesforce ? 'synced' : 'pending'}`}>
                    {selectedUser.added_to_salesforce ? 'In Salesforce' : 'Not Synced'}
                  </span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={resetModals} className="btn btn-secondary">
                Close
              </button>
              {!selectedUser.added_to_salesforce && connectionStatus.connected && (
                <button 
                  onClick={() => {
                    addLeadToSalesforce(selectedUser);
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
                      <FiPlus /> Add to Salesforce
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


export default SalesforceCRMTab;
