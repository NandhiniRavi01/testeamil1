import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  FiUsers, FiShield, FiCheck, FiX, FiEdit, FiActivity,
  FiLock, FiUnlock, FiRefreshCw, FiTrash2, FiEye
} from 'react-icons/fi';
import './RoleManagement.css';

const RoleManagement = () => {
  const [users, setUsers] = useState([]);
  const [modules, setModules] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [userPermissions, setUserPermissions] = useState({});
  const [activeTab, setActiveTab] = useState('users');
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [showActivityDetailModal, setShowActivityDetailModal] = useState(false);

  const API_BASE_URL = 'http://localhost:5000';

  useEffect(() => {
    fetchUsers();
    fetchModules();
    fetchActivityLogs();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/roles/users`, {
        withCredentials: true
      });
      setUsers(response.data.users);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchModules = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/roles/modules`, {
        withCredentials: true
      });
      setModules(response.data.modules);
    } catch (error) {
      console.error('Error fetching modules:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchActivityLogs = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/roles/activity-log?limit=50`, {
        withCredentials: true
      });
      setActivityLogs(response.data.logs);
    } catch (error) {
      console.error('Error fetching activity logs:', error);
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm('⚠️ WARNING: Are you sure you want to clear ALL activity history?\n\nThis will permanently delete all activity logs and CANNOT be undone.')) {
      return;
    }

    try {
      await axios.delete(`${API_BASE_URL}/api/roles/activity-log/clear`, {
        withCredentials: true
      });
      alert('Activity history cleared successfully!');
      fetchActivityLogs();
    } catch (error) {
      alert('Failed to clear activity history');
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    if (!window.confirm(`Are you sure you want to change this user's role to ${newRole}?`)) {
      return;
    }

    try {
      await axios.put(`${API_BASE_URL}/api/roles/user/${userId}/role`, 
        { role: newRole },
        { withCredentials: true }
      );
      alert('Role updated successfully!');
      fetchUsers();
      fetchActivityLogs();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update role');
    }
  };

  const handleToggleStatus = async (userId, currentStatus) => {
    const newStatus = !currentStatus;
    const action = newStatus ? 'activate' : 'deactivate';
    
    if (!window.confirm(`Are you sure you want to ${action} this user?`)) {
      return;
    }

    try {
      await axios.put(`${API_BASE_URL}/api/roles/user/${userId}/toggle-status`,
        { is_active: newStatus },
        { withCredentials: true }
      );
      alert(`User ${action}d successfully!`);
      fetchUsers();
      fetchActivityLogs();
    } catch (error) {
      alert(`Failed to ${action} user`);
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`⚠️ WARNING: Are you sure you want to permanently delete user "${username}"?\n\nThis action CANNOT be undone and will remove:\n• User account\n• All permissions\n• All activity logs\n• All sessions\n\nType "DELETE" to confirm.`)) {
      return;
    }

    const confirmation = window.prompt('Type DELETE to confirm:');
    if (confirmation !== 'DELETE') {
      alert('Deletion cancelled');
      return;
    }

    try {
      await axios.delete(`${API_BASE_URL}/api/roles/user/${userId}`, {
        withCredentials: true
      });
      alert('User deleted successfully!');
      fetchUsers();
      fetchActivityLogs();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete user');
    }
  };

  const openPermissionModal = async (user) => {
    setSelectedUser(user);
    setUserPermissions(user.permissions || {});
    setShowPermissionModal(true);
  };

  const handleViewActivityDetail = (activity) => {
    setSelectedActivity(activity);
    setShowActivityDetailModal(true);
  };

  const handleCloseActivityDetail = () => {
    setSelectedActivity(null);
    setShowActivityDetailModal(false);
  };

  const handlePermissionToggle = (moduleKey) => {
    setUserPermissions(prev => ({
      ...prev,
      [moduleKey]: !prev[moduleKey]
    }));
  };

  const savePermissions = async () => {
    try {
      await axios.post(`${API_BASE_URL}/api/roles/user/${selectedUser.id}/permissions/batch`,
        { permissions: userPermissions },
        { withCredentials: true }
      );
      alert('✅ Permissions updated successfully! The user will see new permissions on next login or page refresh.');
      setShowPermissionModal(false);
      fetchUsers();
      fetchActivityLogs();
    } catch (error) {
      alert('Failed to update permissions');
    }
  };

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case 'super_admin': return 'role-super-admin';
      case 'admin': return 'role-admin';
      default: return 'role-user';
    }
  };

  if (loading) {
    return (
      <div className="role-management">
        <div className="loading-state">
          <FiRefreshCw className="spinning" size={40} />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="role-management">
      <div className="role-header">
        <div className="header-left">
          <h1><FiShield /> Role & Permission Management</h1>
          <p>Manage user roles and module access permissions</p>
        </div>
        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button 
            className={`tab-button ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <FiUsers /> User Management
          </button>
          <button 
            className={`tab-button ${activeTab === 'activity' ? 'active' : ''}`}
            onClick={() => setActiveTab('activity')}
          >
            <FiActivity /> Activity Log
          </button>
        </div>
      </div>

      {/* Users Table */}
      {activeTab === 'users' && (
        <div className="role-card">
          <div className="card-header">
            <h2><FiUsers /> Users & Roles</h2>
            <button className="btn btn-refresh" onClick={fetchUsers}>
              <FiRefreshCw /> Refresh
            </button>
          </div>
        
        <div className="table-container">
          <table className="users-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className={!user.is_active ? 'inactive-user' : ''}>
                  <td>{user.username}</td>
                  <td>{user.email}</td>
                  <td>
                    <select 
                      className={`role-select ${getRoleBadgeClass(user.role)}`}
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </td>
                  <td>
                    <span className={`status-badge ${user.is_active ? 'status-active' : 'status-inactive'}`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>{new Date(user.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="action-buttons">
                      <button 
                        className="btn-icon btn-primary"
                        onClick={() => openPermissionModal(user)}
                        title="Manage Permissions"
                      >
                        <FiEdit />
                      </button>
                      <button 
                        className={`btn-icon ${user.is_active ? 'btn-danger' : 'btn-success'}`}
                        onClick={() => handleToggleStatus(user.id, user.is_active)}
                        title={user.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {user.is_active ? <FiLock /> : <FiUnlock />}
                      </button>
                      <button 
                        className="btn-icon btn-delete"
                        onClick={() => handleDeleteUser(user.id, user.username)}
                        title="Delete User Permanently"
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Activity Log */}
      {activeTab === 'activity' && (
        <div className="role-card">
          <div className="card-header color-black">
            <h2><FiActivity /> Recent Activity</h2>
            <div className="header-actions">
              <button className="btn btn-danger" onClick={handleClearHistory}>
                <FiTrash2 /> Clear History
              </button>
              <button className="btn btn-refresh" onClick={fetchActivityLogs}>
                <FiRefreshCw /> Refresh
              </button>
            </div>
          </div>
        
        <div className="activity-log">
          {activityLogs.map(log => (
            <div key={log.id} className="activity-item">
              <div className="activity-icon">
                <FiActivity />
              </div>
              <div className="activity-details">
                <div className="activity-description">
                  <strong>{log.actor_username || log.username}</strong> - {log.description}
                </div>
                <div className="activity-meta">
                  {log.module_key && <span className="module-tag">{log.module_key}</span>}
                  <span className="activity-time">{new Date(log.created_at).toLocaleString()}</span>
                </div>
              </div>
              <button 
                className="btn-view-detail"
                onClick={() => handleViewActivityDetail(log)}
                title="View Details"
              >
                <FiEye />
              </button>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Permission Modal */}
      {showPermissionModal && (
        <div className="modal-overlay" onClick={() => setShowPermissionModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Manage Permissions - {selectedUser?.username}</h3>
              <button className="btn-close" onClick={() => setShowPermissionModal(false)}>
                <FiX />
              </button>
            </div>
            
            <div className="modal-body">
              <div className="permissions-grid">
                {modules.map(module => (
                  <div key={module.module_key} className="permission-item">
                    <label className="permission-label">
                      <input
                        type="checkbox"
                        checked={userPermissions[module.module_key] || false}
                        onChange={() => handlePermissionToggle(module.module_key)}
                      />
                      <div className="permission-info">
                        <div className="permission-name">{module.module_name}</div>
                        <div className="permission-desc">{module.description}</div>
                      </div>
                      <div className="permission-status">
                        {userPermissions[module.module_key] ? (
                          <FiCheck className="icon-success" />
                        ) : (
                          <FiX className="icon-danger" />
                        )}
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowPermissionModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={savePermissions}>
                <FiCheck /> Save Permissions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activity Detail Modal */}
      {showActivityDetailModal && selectedActivity && (
        <div className="modal-overlay" onClick={handleCloseActivityDetail}>
          <div className="modal-content activity-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><FiActivity /> Activity Details</h3>
              <button className="btn-close" onClick={handleCloseActivityDetail}>
                <FiX />
              </button>
            </div>
            
            <div className="modal-body">
              <div className="activity-detail-section">
                <div className="detail-row">
                  <label>Performed By:</label>
                  <div className="detail-value">
                    <strong>{selectedActivity.actor_username || selectedActivity.username}</strong>
                    {selectedActivity.actor_email && (
                      <span className="detail-email"> ({selectedActivity.actor_email})</span>
                    )}
                  </div>
                </div>

                {selectedActivity.target_username && (
                  <div className="detail-row">
                    <label>Target User:</label>
                    <div className="detail-value">
                      <strong>{selectedActivity.target_username}</strong>
                      {selectedActivity.target_email && (
                        <span className="detail-email"> ({selectedActivity.target_email})</span>
                      )}
                    </div>
                  </div>
                )}

                <div className="detail-row">
                  <label>Action Type:</label>
                  <div className="detail-value">
                    <span className="activity-type-badge">{selectedActivity.activity_type}</span>
                  </div>
                </div>

                {(selectedActivity.old_value || selectedActivity.new_value) && (
                  <div className="detail-row">
                    <label>Changes:</label>
                    <div className="detail-value changes-value">
                      {selectedActivity.old_value && (
                        <span className="old-value">
                          <FiX className="change-icon" />
                          {selectedActivity.old_value}
                        </span>
                      )}
                      {selectedActivity.old_value && selectedActivity.new_value && (
                        <span className="arrow">→</span>
                      )}
                      {selectedActivity.new_value && (
                        <span className="new-value">
                          <FiCheck className="change-icon" />
                          {selectedActivity.new_value}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="detail-row">
                  <label>Description:</label>
                  <div className="detail-value">
                    {selectedActivity.description}
                  </div>
                </div>

                {selectedActivity.module_key && (
                  <div className="detail-row">
                    <label>Module:</label>
                    <div className="detail-value">
                      <span className="module-badge">{selectedActivity.module_key}</span>
                    </div>
                  </div>
                )}

                <div className="detail-row">
                  <label>Timestamp:</label>
                  <div className="detail-value">
                    {new Date(selectedActivity.created_at).toLocaleString()}
                  </div>
                </div>

                {selectedActivity.ip_address && (
                  <div className="detail-row">
                    <label>IP Address:</label>
                    <div className="detail-value">
                      {selectedActivity.ip_address}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={handleCloseActivityDetail}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleManagement;
