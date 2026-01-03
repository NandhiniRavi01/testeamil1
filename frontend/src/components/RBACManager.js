// RBACManager.js - Enterprise-grade Role-Based Access Control System
import React, { useState, useEffect } from 'react';
import {
    FiShield, FiUsers, FiLock, FiUnlock, FiSave, FiRotateCcw,
    FiActivity, FiBarChart2, FiSearch, FiCheckCircle, FiMap, FiGlobe,
    FiMail, FiRefreshCw, FiCpu, FiX, FiPlus, FiEdit2, FiTrash2,
    FiClock, FiUser, FiAlertCircle, FiCheck
} from 'react-icons/fi';
import './RBACManager.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// Module definitions with icons and colors
const MODULES = [
    { id: 'dashboard', label: 'Dashboard', icon: FiActivity, color: '#3b82f6', description: 'View analytics and reports' },
    { id: 'web_scraping', label: 'Web Scraping', icon: FiSearch, color: '#8b5cf6', description: 'LinkedIn lead generation' },
    { id: 'worldwide_event_scraper', label: 'Worldwide Event Scraper', icon: FiGlobe, color: '#059669', description: 'Discover events and extract attendee contacts' },
    { id: 'email_validator', label: 'Email Validator', icon: FiCheckCircle, color: '#10b981', description: 'Validate email addresses' },
    { id: 'google_maps_scraper', label: 'Google Maps Scraper', icon: FiMap, color: '#f59e0b', description: 'Extract business data' },
    { id: 'auto_email', label: 'Auto Email', icon: FiMail, color: '#ef4444', description: 'Send bulk email campaigns' },
    { id: 'email_tracking', label: 'Email Tracking', icon: FiRefreshCw, color: '#06b6d4', description: 'Track email performance' },
    { id: 'zoho_crm', label: 'Zoho CRM', icon: FiCpu, color: '#ec4899', description: 'CRM integration' },
    { id: 'admin_panel', label: 'Admin Panel', icon: FiShield, color: '#6366f1', description: 'User management' }
];

const DEFAULT_ROLES = ['super_admin', 'admin', 'user'];

const RBACManager = ({ onClose }) => {
    const [selectedRole, setSelectedRole] = useState('user');
    const [roles, setRoles] = useState([]);
    const [permissions, setPermissions] = useState({});
    const [originalPermissions, setOriginalPermissions] = useState({});
    const [activityLog, setActivityLog] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showCreateRole, setShowCreateRole] = useState(false);
    const [newRoleName, setNewRoleName] = useState('');
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastType, setToastType] = useState('success');

    useEffect(() => {
        fetchRoles();
        fetchActivityLog();
    }, []);

    useEffect(() => {
        if (selectedRole) {
            fetchPermissions(selectedRole);
        }
    }, [selectedRole]);

    const fetchRoles = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/admin/roles`, {
                credentials: 'include'
            });
            const data = await response.json();
            if (response.ok) {
                setRoles(data.roles || DEFAULT_ROLES);
            }
        } catch (error) {
            console.error('Error fetching roles:', error);
            setRoles(DEFAULT_ROLES);
        }
    };

    const fetchPermissions = async (role) => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/admin/permissions/${role}`, {
                credentials: 'include'
            });
            const data = await response.json();
            if (response.ok) {
                const perms = data.permissions || {};
                setPermissions(perms);
                setOriginalPermissions(JSON.parse(JSON.stringify(perms)));
            }
        } catch (error) {
            console.error('Error fetching permissions:', error);
            showNotification('Error loading permissions', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchActivityLog = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/admin/activity-log?type=permission`, {
                credentials: 'include'
            });
            const data = await response.json();
            if (response.ok) {
                setActivityLog(data.logs || []);
            }
        } catch (error) {
            console.error('Error fetching activity log:', error);
        }
    };

    const togglePermission = (moduleId) => {
        const newPermissions = {
            ...permissions,
            [moduleId]: !permissions[moduleId]
        };
        setPermissions(newPermissions);

        // Add to activity log (local preview)
        const newLog = {
            id: Date.now(),
            user_name: 'Current User',
            role_name: selectedRole,
            action: newPermissions[moduleId] ? 'enabled' : 'disabled',
            module_name: MODULES.find(m => m.id === moduleId)?.label || moduleId,
            timestamp: new Date().toISOString(),
            isPreview: true
        };
        setActivityLog([newLog, ...activityLog]);
    };

    const savePermissions = async () => {
        setSaving(true);
        try {
            const response = await fetch(`${API_BASE_URL}/admin/permissions/${selectedRole}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ permissions })
            });

            const data = await response.json();
            if (response.ok) {
                setOriginalPermissions(JSON.parse(JSON.stringify(permissions)));
                showNotification('Permissions saved successfully!', 'success');
                fetchActivityLog(); // Refresh activity log
            } else {
                showNotification(data.error || 'Failed to save permissions', 'error');
            }
        } catch (error) {
            showNotification('Error saving permissions', 'error');
        } finally {
            setSaving(false);
        }
    };

    const resetChanges = () => {
        setPermissions(JSON.parse(JSON.stringify(originalPermissions)));
        // Remove preview logs
        setActivityLog(activityLog.filter(log => !log.isPreview));
        showNotification('Changes reset', 'info');
    };

    const createCustomRole = async () => {
        if (!newRoleName.trim()) {
            showNotification('Please enter a role name', 'error');
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/admin/roles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ role_name: newRoleName.toLowerCase().replace(/\s+/g, '_') })
            });

            const data = await response.json();
            if (response.ok) {
                showNotification('Role created successfully!', 'success');
                setNewRoleName('');
                setShowCreateRole(false);
                fetchRoles();
            } else {
                showNotification(data.error || 'Failed to create role', 'error');
            }
        } catch (error) {
            showNotification('Error creating role', 'error');
        }
    };

    const deleteRole = async (role) => {
        if (DEFAULT_ROLES.includes(role)) {
            showNotification('Cannot delete default roles', 'error');
            return;
        }

        if (!window.confirm(`Are you sure you want to delete the role "${role}"?`)) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/admin/roles/${role}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            const data = await response.json();
            if (response.ok) {
                showNotification('Role deleted successfully!', 'success');
                fetchRoles();
                if (selectedRole === role) {
                    setSelectedRole('user');
                }
            } else {
                showNotification(data.error || 'Failed to delete role', 'error');
            }
        } catch (error) {
            showNotification('Error deleting role', 'error');
        }
    };

    const showNotification = (message, type = 'success') => {
        setToastMessage(message);
        setToastType(type);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
    };

    const hasChanges = () => {
        return JSON.stringify(permissions) !== JSON.stringify(originalPermissions);
    };

    const getPermissionCount = () => {
        return Object.values(permissions).filter(Boolean).length;
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
    };

    return (
        <div className="rbac-manager-overlay">
            <div className="rbac-manager-container">
                {/* Header */}
                <div className="rbac-header">
                    <div className="rbac-header-content">
                        <div className="rbac-header-icon">
                            <FiShield />
                        </div>
                        <div>
                            <h1>Role & Permissions Management</h1>
                            <p>Configure access control for different user roles</p>
                        </div>
                    </div>
                    <button className="rbac-close-btn" onClick={onClose}>
                        <FiX />
                    </button>
                </div>

                {/* Main Content */}
                <div className="rbac-content">
                    {/* Left Panel - Permissions */}
                    <div className="rbac-left-panel">
                        {/* Role Selector */}
                        <div className="rbac-role-selector">
                            <div className="role-selector-header">
                                <div className="role-selector-label">
                                    <FiUsers />
                                    <span>Select Role</span>
                                </div>
                                <button
                                    className="btn-create-role"
                                    onClick={() => setShowCreateRole(!showCreateRole)}
                                >
                                    <FiPlus /> New Role
                                </button>
                            </div>

                            <div className="role-selector-grid">
                                {roles.map(role => (
                                    <div
                                        key={role}
                                        className={`role-card ${selectedRole === role ? 'active' : ''}`}
                                        onClick={() => setSelectedRole(role)}
                                    >
                                        <div className="role-card-content">
                                            <div className="role-card-icon">
                                                {role === 'super_admin' ? <FiShield /> : role === 'admin' ? <FiUsers /> : <FiUser />}
                                            </div>
                                            <div className="role-card-info">
                                                <h4>{role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h4>
                                                <span>{getPermissionCount()} modules</span>
                                            </div>
                                        </div>
                                        {!DEFAULT_ROLES.includes(role) && (
                                            <button
                                                className="role-delete-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    deleteRole(role);
                                                }}
                                            >
                                                <FiTrash2 />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Create Role Form */}
                            {showCreateRole && (
                                <div className="create-role-form">
                                    <input
                                        type="text"
                                        placeholder="Enter role name..."
                                        value={newRoleName}
                                        onChange={(e) => setNewRoleName(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && createCustomRole()}
                                    />
                                    <button className="btn btn-primary" onClick={createCustomRole}>
                                        <FiCheck /> Create
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Permissions Grid */}
                        <div className="rbac-permissions-section">
                            <div className="permissions-header">
                                <h3>Module Permissions</h3>
                                <span className="permissions-count">
                                    {getPermissionCount()} of {MODULES.length} enabled
                                </span>
                            </div>

                            {loading ? (
                                <div className="loading-skeleton">
                                    {[1, 2, 3, 4].map(i => (
                                        <div key={i} className="skeleton-card"></div>
                                    ))}
                                </div>
                            ) : (
                                <div className="permissions-grid">
                                    {MODULES.map(module => {
                                        const isEnabled = permissions[module.id] || false;
                                        const ModuleIcon = module.icon;

                                        return (
                                            <div
                                                key={module.id}
                                                className={`permission-card ${isEnabled ? 'enabled' : 'disabled'}`}
                                                onClick={() => togglePermission(module.id)}
                                            >
                                                <div className="permission-card-header">
                                                    <div
                                                        className="permission-icon"
                                                        style={{ backgroundColor: `${module.color}15`, color: module.color }}
                                                    >
                                                        <ModuleIcon />
                                                    </div>
                                                    <div className="permission-toggle">
                                                        <div className={`toggle-switch ${isEnabled ? 'active' : ''}`}>
                                                            <div className="toggle-slider"></div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="permission-card-body">
                                                    <h4>{module.label}</h4>
                                                    <p>{module.description}</p>
                                                </div>
                                                <div className="permission-card-footer">
                                                    <div className={`permission-status ${isEnabled ? 'granted' : 'denied'}`}>
                                                        {isEnabled ? <FiUnlock /> : <FiLock />}
                                                        <span>{isEnabled ? 'Access Granted' : 'Access Denied'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="rbac-actions">
                            <button
                                className="btn btn-secondary"
                                onClick={resetChanges}
                                disabled={!hasChanges() || saving}
                            >
                                <FiRotateCcw /> Reset Changes
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={savePermissions}
                                disabled={!hasChanges() || saving}
                            >
                                {saving ? (
                                    <>
                                        <div className="btn-spinner"></div> Saving...
                                    </>
                                ) : (
                                    <>
                                        <FiSave /> Save Permissions
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Right Panel - Activity Log */}
                    <div className="rbac-right-panel">
                        <div className="activity-log-section">
                            <div className="activity-log-header">
                                <div className="activity-log-title">
                                    <FiClock />
                                    <h3>Activity Log</h3>
                                </div>
                                <button className="btn-refresh" onClick={fetchActivityLog}>
                                    <FiRefreshCw />
                                </button>
                            </div>

                            <div className="activity-log-list">
                                {activityLog.length === 0 ? (
                                    <div className="activity-log-empty">
                                        <FiAlertCircle />
                                        <p>No activity recorded yet</p>
                                    </div>
                                ) : (
                                    activityLog.map((log, index) => (
                                        <div
                                            key={log.id || index}
                                            className={`activity-log-item ${log.isPreview ? 'preview' : ''}`}
                                        >
                                            <div className="activity-log-icon">
                                                {log.action === 'enabled' ? (
                                                    <FiUnlock className="icon-enabled" />
                                                ) : (
                                                    <FiLock className="icon-disabled" />
                                                )}
                                            </div>
                                            <div className="activity-log-content">
                                                <div className="activity-log-main">
                                                    <strong>{log.user_name || 'System'}</strong>
                                                    <span className={`activity-action ${log.action}`}>
                                                        {log.action}
                                                    </span>
                                                    <span>access to</span>
                                                    <strong>{log.module_name}</strong>
                                                </div>
                                                <div className="activity-log-meta">
                                                    <span className="activity-role">{log.role_name}</span>
                                                    <span className="activity-time">{formatDate(log.timestamp)}</span>
                                                </div>
                                            </div>
                                            {log.isPreview && (
                                                <div className="activity-preview-badge">Preview</div>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Toast Notification */}
                {showToast && (
                    <div className={`rbac-toast ${toastType}`}>
                        <div className="toast-icon">
                            {toastType === 'success' ? <FiCheck /> : <FiAlertCircle />}
                        </div>
                        <span>{toastMessage}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RBACManager;
