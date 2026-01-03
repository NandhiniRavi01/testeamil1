// contexts/PermissionContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import { getApiBaseUrl } from "../utils/api";

const PermissionContext = createContext();
const API_BASE_URL = getApiBaseUrl();

export const usePermissions = () => {
    const context = useContext(PermissionContext);
    if (!context) {
        throw new Error('usePermissions must be used within a PermissionProvider');
    }
    return context;
};

export const PermissionProvider = ({ children, currentUser }) => {
    const [permissions, setPermissions] = useState({});
    const [loading, setLoading] = useState(true);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        if (currentUser) {
            fetchPermissions();
        } else {
            setPermissions({});
            setLoading(false);
        }
    }, [currentUser, refreshTrigger]);

    const fetchPermissions = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/auth/permissions/my-permissions`, {
                method: 'GET',
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setPermissions(data.permissions || {});
            } else {
                console.error('Failed to fetch permissions');
                setPermissions({});
            }
        } catch (error) {
            console.error('Error fetching permissions:', error);
            setPermissions({});
        } finally {
            setLoading(false);
        }
    };

    const hasPermission = (moduleName) => {
        // Super admin always has access
        if (currentUser?.role === 'super_admin') {
            return true;
        }

        // Check specific permission
        return permissions[moduleName] === true;
    };

    const canAccessModule = (moduleName) => {
        return hasPermission(moduleName);
    };

    const refreshPermissions = () => {
        // Force re-fetch by updating trigger
        setRefreshTrigger(prev => prev + 1);
    };

    const value = {
        permissions,
        loading,
        hasPermission,
        canAccessModule,
        refreshPermissions
    };

    return (
        <PermissionContext.Provider value={value}>
            {children}
        </PermissionContext.Provider>
    );
};
