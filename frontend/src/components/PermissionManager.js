// components/PermissionManager.js
import React, { useState, useEffect } from "react";
import {
    FiShield, FiCheck, FiX, FiSave, FiRefreshCw,
    FiAlertCircle, FiCheckCircle, FiLock, FiUnlock
} from "react-icons/fi";
import "./PermissionManager.css";

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const MODULE_LABELS = {
    dashboard: "Dashboard",
    web_scraping: "Web Scraping",
    email_validator: "Email Validator",
    google_maps_scraper: "Google Maps Scraper",
    auto_email: "Auto Email",
    email_tracking: "Email Tracking",
    zoho_crm: "Zoho CRM",
    admin_panel: "Admin Panel"
};

function PermissionManager({ userId, username, onClose }) {
    const [permissions, setPermissions] = useState({});
    const [originalPermissions, setOriginalPermissions] = useState({});
    const [availableModules, setAvailableModules] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: "", text: "" });
    const [userInfo, setUserInfo] = useState(null);

    useEffect(() => {
        fetchPermissions();
    }, [userId]);

    const fetchPermissions = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/auth/permissions/${userId}`, {
                method: 'GET',
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setPermissions(data.permissions);
                setOriginalPermissions(data.permissions);
                setAvailableModules(data.available_modules);
                setUserInfo(data.user);
            } else {
                const error = await response.json();
                setMessage({ type: "error", text: error.error || "Failed to load permissions" });
            }
        } catch (error) {
            console.error("Error fetching permissions:", error);
            setMessage({ type: "error", text: "Network error" });
        } finally {
            setLoading(false);
        }
    };

    const handleTogglePermission = (module) => {
        setPermissions(prev => ({
            ...prev,
            [module]: !prev[module]
        }));
    };

    const handleSavePermissions = async () => {
        setSaving(true);
        setMessage({ type: "", text: "" });

        try {
            const response = await fetch(`${API_BASE_URL}/auth/permissions/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ permissions })
            });

            if (response.ok) {
                const data = await response.json();
                setOriginalPermissions(data.permissions);
                setMessage({
                    type: "success",
                    text: "Permissions updated successfully!"
                });
                setTimeout(() => {
                    setMessage({ type: "", text: "" });
                }, 3000);
            } else {
                const error = await response.json();
                setMessage({ type: "error", text: error.error || "Failed to update permissions" });
            }
        } catch (error) {
            console.error("Error saving permissions:", error);
            setMessage({ type: "error", text: "Network error" });
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        setPermissions(originalPermissions);
        setMessage({ type: "", text: "" });
    };

    const hasChanges = () => {
        return JSON.stringify(permissions) !== JSON.stringify(originalPermissions);
    };

    const getEnabledCount = () => {
        return Object.values(permissions).filter(Boolean).length;
    };

    if (loading) {
        return (
            <div className="permission-manager">
                <div className="loading-container">
                    <div className="loading-spinner"></div>
                    <p>Loading permissions...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="permission-manager">
            <div className="permission-header">
                <div className="header-content">
                    <h3>
                        <FiShield /> Manage Permissions
                    </h3>
                    <p>Configure module access for <strong>{username}</strong></p>
                    {userInfo && (
                        <div className="user-role-badge">
                            Role: <span className={`role-tag role-${userInfo.role}`}>{userInfo.role}</span>
                        </div>
                    )}
                </div>
                <button onClick={onClose} className="close-btn">
                    <FiX />
                </button>
            </div>

            {message.text && (
                <div className={`alert alert-${message.type}`}>
                    {message.type === 'success' ? <FiCheckCircle /> : <FiAlertCircle />}
                    {message.text}
                </div>
            )}

            <div className="permission-stats">
                <div className="stat-item">
                    <span className="stat-value">{getEnabledCount()}</span>
                    <span className="stat-label">Enabled Modules</span>
                </div>
                <div className="stat-item">
                    <span className="stat-value">{availableModules.length}</span>
                    <span className="stat-label">Total Modules</span>
                </div>
            </div>

            <div className="permissions-grid">
                {availableModules.map(module => (
                    <div
                        key={module}
                        className={`permission-card ${permissions[module] ? 'enabled' : 'disabled'}`}
                        onClick={() => handleTogglePermission(module)}
                    >
                        <div className="permission-icon">
                            {permissions[module] ? <FiUnlock /> : <FiLock />}
                        </div>
                        <div className="permission-info">
                            <h4>{MODULE_LABELS[module] || module}</h4>
                            <p className="permission-status">
                                {permissions[module] ? 'Access Granted' : 'Access Denied'}
                            </p>
                        </div>
                        <div className="permission-toggle">
                            <div className={`toggle-switch ${permissions[module] ? 'active' : ''}`}>
                                <div className="toggle-slider"></div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="permission-actions">
                <button
                    onClick={handleReset}
                    disabled={!hasChanges() || saving}
                    className="btn btn-secondary"
                >
                    <FiRefreshCw /> Reset Changes
                </button>
                <button
                    onClick={handleSavePermissions}
                    disabled={!hasChanges() || saving}
                    className="btn btn-primary"
                >
                    <FiSave /> {saving ? "Saving..." : "Save Permissions"}
                </button>
            </div>
        </div>
    );
}

export default PermissionManager;
