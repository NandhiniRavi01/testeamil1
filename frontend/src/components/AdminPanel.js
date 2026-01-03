// components/AdminPanel.js - Updated with View Details and Role Management
import React, { useState, useCallback, useEffect } from "react";
import { 
  FiUserPlus, FiUser, FiShield, 
  FiSave, FiX, FiUsers, FiKey, FiCheck, FiXCircle,
  FiRefreshCw, FiSearch, FiDownload, FiEye,
  FiCheckSquare, FiXSquare, FiActivity,
  FiMail, FiUserCheck, FiXOctagon, FiClock,
  FiLock, FiUnlock, FiSettings, FiCalendar
} from "react-icons/fi";
import "./AdminPanel.css";
import RoleManagement from './RoleManagement';

function AdminPanel() {
  const [activeTab, setActiveTab] = useState('users'); // 'users' or 'roles'
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newUser, setNewUser] = useState({ 
    username: "", 
    email: "", 
    password: "",
    role: "user" 
  });
  const [message, setMessage] = useState({ type: "", text: "" });
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRole, setSelectedRole] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedUser, setSelectedUser] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    admins: 0,
    superAdmins: 0
  });

  // Calculate statistics
  const calculateStats = (userList) => {
    const total = userList.length;
    const active = userList.filter(u => u.is_active).length;
    const admins = userList.filter(u => u.role === "admin").length;
    const superAdmins = userList.filter(u => u.role === "super_admin").length;
    
    setStats({
      total,
      active,
      admins,
      superAdmins
    });
  };

  // Filter users
  useEffect(() => {
    let filtered = users;
    
    if (searchTerm) {
      filtered = filtered.filter(user =>
        user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (selectedRole !== "all") {
      filtered = filtered.filter(user => user.role === selectedRole);
    }
    
    if (selectedStatus !== "all") {
      filtered = filtered.filter(user => 
        selectedStatus === "active" ? user.is_active : !user.is_active
      );
    }
    
    setFilteredUsers(filtered);
    calculateStats(filtered);
  }, [users, searchTerm, selectedRole, selectedStatus]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:5000/auth/admin/users', {
        method: 'GET',
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
        setFilteredUsers(data.users);
        calculateStats(data.users);
      } else if (response.status === 403) {
        setMessage({ type: "error", text: "Access denied. Super admin only." });
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setLoading(false);
    }
  };

  const fetchUsersCallback = useCallback(fetchUsers, []);

  React.useEffect(() => {
    fetchUsersCallback();
  }, [fetchUsersCallback]);

  const handleCreateUser = async () => {
    if (!newUser.username || !newUser.email || !newUser.password) {
      setMessage({ type: "error", text: "Please fill all fields" });
      return;
    }

    if (newUser.password.length < 6) {
      setMessage({ type: "error", text: "Password must be at least 6 characters" });
      return;
    }

    setLoading(true);
    setMessage({ type: "", text: "" });
    
    try {
      const response = await fetch('http://localhost:5000/auth/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newUser)
      });
      
      if (response.ok) {
        const data = await response.json();
        const updatedUsers = [...users, data.user];
        setUsers(updatedUsers);
        setFilteredUsers(updatedUsers);
        setNewUser({ username: "", email: "", password: "", role: "user" });
        setMessage({ 
          type: "success", 
          text: `User "${data.user.username}" created successfully!` 
        });
        setTimeout(() => setMessage({ type: "", text: "" }), 3000);
      } else {
        const error = await response.json();
        setMessage({ type: "error", text: error.error || "Failed to create user" });
      }
    } catch (error) {
      console.error("Error creating user:", error);
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async (userId, newRole) => {
    if (!window.confirm(`Change user role to ${newRole}?`)) return;
    
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:5000/auth/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role: newRole })
      });
      
      if (response.ok) {
        await fetchUsers();
        setMessage({ type: "success", text: "User role updated!" });
        setTimeout(() => setMessage({ type: "", text: "" }), 3000);
      } else {
        const error = await response.json();
        setMessage({ type: "error", text: error.error || "Failed to update role" });
      }
    } catch (error) {
      console.error("Error updating role:", error);
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUser = async (userId, currentStatus, username) => {
    const action = currentStatus ? "deactivate" : "activate";
    if (!window.confirm(`Are you sure you want to ${action} user "${username}"?`)) return;
    
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:5000/auth/admin/users/${userId}/toggle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_active: !currentStatus })
      });
      
      if (response.ok) {
        await fetchUsers();
        setMessage({ 
          type: "success", 
          text: `User "${username}" ${action}d successfully!` 
        });
        setTimeout(() => setMessage({ type: "", text: "" }), 3000);
      } else {
        const error = await response.json();
        setMessage({ type: "error", text: error.error || "Failed to toggle user status" });
      }
    } catch (error) {
      console.error("Error toggling user:", error);
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (user) => {
    setSelectedUser(user);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedUser(null);
  };

  const handleExportCSV = () => {
  const headers = ["ID", "Username", "Email", "Role", "Status", "Created At"];
  const csvData = filteredUsers.map(user => [
    user.id,
    user.username,
    user.email,
    user.role,
    user.is_active ? "Active" : "Inactive",
    user.created_at ? formatDate(user.created_at) : "N/A"  // Use safe formatting
  ]);
  
  const csvContent = [
    headers.join(","),
    ...csvData.map(row => row.map(cell => `"${cell}"`).join(","))
  ].join("\n");
  
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `users-export-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

  const getRoleBadge = (role) => {
    const badges = {
      'super_admin': <span className="badge badge-superadmin"><FiShield /> Super Admin</span>,
      'admin': <span className="badge badge-admin"><FiActivity /> Admin</span>,
      'user': <span className="badge badge-user"><FiUser /> User</span>
    };
    return badges[role] || badges['user'];
  };

  const formatDate = (dateString) => {
  if (!dateString) {
    return 'N/A'; // Handle null/undefined/empty
  }
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return 'Invalid Date'; // Handle invalid date strings
    }
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    console.error('Error formatting date:', dateString, error);
    return 'N/A';
  }
};

  // View Details Modal Component
  const UserDetailsModal = () => {
    if (!selectedUser) return null;

    return (
      <div className="modal-overlay" onClick={handleCloseModal}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>User Details</h3>
            <button className="modal-close" onClick={handleCloseModal}>
              <FiX />
            </button>
          </div>
          
          <div className="user-details-modal">
            <div className="user-avatar-large">
              {selectedUser.role === "super_admin" ? <FiShield /> : 
               selectedUser.role === "admin" ? <FiActivity /> : <FiUser />}
            </div>
            
            <div className="user-details-grid">
              <div className="detail-item">
                <span className="detail-label">Username</span>
                <span className="detail-value">{selectedUser.username}</span>
              </div>
              
              <div className="detail-item">
                <span className="detail-label">Email</span>
                <a href={`mailto:${selectedUser.email}`} className="detail-value user-email">
                  <FiMail /> {selectedUser.email}
                </a>
              </div>
              
              <div className="detail-item">
                <span className="detail-label">User ID</span>
                <span className="detail-value">{selectedUser.id}</span>
              </div>
              
              <div className="detail-item">
                <span className="detail-label">Role</span>
                <span className="detail-value">{getRoleBadge(selectedUser.role)}</span>
              </div>
              
              <div className="detail-item">
                <span className="detail-label">Status</span>
                <span className={`detail-value ${selectedUser.is_active ? 'active' : 'inactive'}`}>
                  {selectedUser.is_active ? <FiUserCheck /> : <FiXOctagon />}
                  {selectedUser.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              
             {selectedUser.created_at && (
  <div className="detail-item">
    <span className="detail-label">Created</span>
    <span className="detail-value">
      <FiCalendar /> {formatDate(selectedUser.created_at)}
    </span>
  </div>
)}
              
              {selectedUser.last_login && (
                <div className="detail-item">
                  <span className="detail-label">Last Login</span>
                  <span className="detail-value">
                    <FiClock /> {formatDate(selectedUser.last_login)}
                  </span>
                </div>
              )}
            </div>
            
            <div className="modal-actions">
              <button 
                onClick={() => handleToggleUser(selectedUser.id, selectedUser.is_active, selectedUser.username)}
                disabled={selectedUser.role === "super_admin"}
                className={`btn ${selectedUser.is_active ? 'btn-warning' : 'btn-secondary'}`}
              >
                {selectedUser.is_active ? <FiLock /> : <FiUnlock />}
                {selectedUser.is_active ? 'Deactivate User' : 'Activate User'}
              </button>
              
              <button 
                onClick={() => handleUpdateRole(selectedUser.id, selectedUser.role === 'user' ? 'admin' : 'user')}
                disabled={selectedUser.role === "super_admin"}
                className="btn btn-primary"
              >
                <FiUser /> Change Role
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="admin-panel">
      <div className="panel-header">
        <h2><FiShield /> User Management Dashboard</h2>
        <p>Super Admin Panel - Manage user accounts and permissions</p>
      </div>

      {/* Tab Navigation */}
      <div className="admin-tabs">
        <button 
          className={`tab-button ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <FiUsers /> User Management
        </button>
        <button 
          className={`tab-button ${activeTab === 'roles' ? 'active' : ''}`}
          onClick={() => setActiveTab('roles')}
        >
          <FiSettings /> Role & Permissions
        </button>
      </div>

      {activeTab === 'users' ? (
        <>
      {message.text && (
        <div className={`alert alert-${message.type}`}>
          {message.type === 'success' ? <FiCheckSquare /> : <FiXSquare />}
          {message.text}
        </div>
      )}

      {/* Statistics Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Users</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.active}</div>
          <div className="stat-label">Active Users</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.admins}</div>
          <div className="stat-label">Admin Users</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.superAdmins}</div>
          <div className="stat-label">Super Admins</div>
        </div>
      </div>

      {/* Create User Form */}
      <div className="card">
        <h3><FiUserPlus /> Create New User</h3>
        <div className="form-grid">
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              placeholder="Enter username"
              value={newUser.username}
              onChange={(e) => setNewUser({...newUser, username: e.target.value})}
              disabled={loading}
            />
          </div>
          
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              placeholder="user@example.com"
              value={newUser.email}
              onChange={(e) => setNewUser({...newUser, email: e.target.value})}
              disabled={loading}
            />
          </div>
          
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              placeholder="Minimum 6 characters"
              value={newUser.password}
              onChange={(e) => setNewUser({...newUser, password: e.target.value})}
              disabled={loading}
              minLength="6"
            />
          </div>
          
          <div className="form-group">
            <label>Role</label>
            <select 
              value={newUser.role}
              onChange={(e) => setNewUser({...newUser, role: e.target.value})}
              disabled={loading}
              className="role-select"
            >
              <option value="user">Regular User</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>&nbsp;</label>
            <button 
              onClick={handleCreateUser} 
              disabled={loading || !newUser.username || !newUser.email || !newUser.password}
              className="btn btn-primary"
            >
              <FiUserPlus /> {loading ? "Creating..." : "Create User"}
            </button>
          </div>
        </div>
      </div>

      {/* Users List with Filters */}
<div className="card">
  <div className="card-header">
    <h3><FiUsers /> User Management ({filteredUsers.length} users)</h3>
    <div className="action-buttons">
      <button onClick={handleExportCSV} className="btn btn-secondary" title="Export to CSV">
        <FiDownload /> Export
      </button>
      <button onClick={fetchUsers} disabled={loading} className="btn btn-secondary">
        <FiRefreshCw /> Refresh
      </button>
    </div>
  </div>
  
  {/* Filters - FIXED STRUCTURE */}
  <div className="filters-grid">
    <div className="search-container">
      <FiSearch className="search-icon" />
      <input
        type="text"
        className="search-input"
        placeholder="Search users by name or email..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
    </div>
    
    <div className="filter-group">
      <label htmlFor="role-filter">Filter by Role</label>
      <select 
        id="role-filter"
        value={selectedRole}
        onChange={(e) => setSelectedRole(e.target.value)}
        className="filter-select"
      >
        <option value="all">All Roles</option>
        <option value="user">Users</option>
        <option value="admin">Administrators</option>
        <option value="super_admin">Super Admins</option>
      </select>
    </div>
    
    <div className="filter-group">
      <label htmlFor="status-filter">Filter by Status</label>
      <select 
        id="status-filter"
        value={selectedStatus}
        onChange={(e) => setSelectedStatus(e.target.value)}
        className="filter-select"
      >
        <option value="all">All Status</option>
        <option value="active">Active Users</option>
        <option value="inactive">Inactive Users</option>
      </select>
    </div>
  </div>
  
 
        
        {loading ? (
          <div className="loading">
            <div className="loading-spinner"></div>
            <p>Loading users...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="empty-state">
            <p>No users found</p>
            {users.length > 0 && <small>Try changing your filters</small>}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="users-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr key={user.id} className={user.is_active ? "" : "user-inactive"}>
                    <td>
                      <div className="user-info">
                        <div className="user-avatar">
                          {user.role === "super_admin" ? <FiShield /> : 
                           user.role === "admin" ? <FiActivity /> : <FiUser />}
                        </div>
                        <div className="user-details">
                          <strong>{user.username}</strong>
                          <small>ID: {user.id}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <a href={`mailto:${user.email}`} className="user-email">
                        {user.email}
                      </a>
                    </td>
                    <td>
                      {user.role === "super_admin" ? (
                        getRoleBadge(user.role)
                      ) : (
                        <select 
                          value={user.role}
                          onChange={(e) => handleUpdateRole(user.id, e.target.value)}
                          disabled={loading}
                          className="role-select"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      )}
                    </td>
                    <td>
  <span 
    className="date-text" 
    title={user.created_at ? new Date(user.created_at).toISOString() : 'Date not available'}
  >
    {formatDate(user.created_at)}
  </span>
</td>
                    <td>
                      <span className={`status-badge ${user.is_active ? 'active' : 'inactive'}`}>
                        {user.is_active ? <FiCheck /> : <FiXCircle />}
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          onClick={() => handleToggleUser(user.id, user.is_active, user.username)}
                          disabled={loading || user.role === "super_admin"}
                          className={`btn btn-sm ${user.is_active ? 'btn-warning' : 'btn-secondary'}`}
                          title={user.is_active ? "Deactivate User" : "Activate User"}
                        >
                          {user.is_active ? <FiLock /> : <FiUnlock />}
                        </button>
                        <button
                          onClick={() => handleViewDetails(user)}
                          className="btn btn-sm btn-primary"
                          title="View User Details"
                        >
                          <FiEye />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* User Details Modal */}
      {showModal && <UserDetailsModal />}
      </>
      ) : (
        <RoleManagement />
      )}
    </div>
  );
}

export default AdminPanel;