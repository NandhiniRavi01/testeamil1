// App.js - Updated with WhatsApp-style login
import React, { useState, useEffect } from "react";
import { PermissionProvider, usePermissions } from "./contexts/PermissionContext";
import WebScrapingTab from "./components/WebScrapingTab";
import BulkMailTab from "./components/BulkMailTab";
import AutoMailTab from "./components/AutoMailTab";
import FollowUpTab from "./components/FollowUpTab";
import ContentCreationTab from "./components/ContentCreationTab";
import EmailDesignerTab from "./components/EmailDesignerTab";
import ZohoCRMTab from "./components/ZohoCRMTab";
import SalesforceCRMTab from "./components/SalesForce";
import EmailValidator from "./components/EmailValidator";
import CampaignHistoryTab from "./components/CampaignHistoryTab";
import GoogleScraperTab from "./components/GoogleScraperTab";
import Homepage from "./components/Homepage";
import LoginPage from "./components/LoginPage";
import AdminPanel from "./components/AdminPanel";
import SummaryDashboard from "./components/SummaryDashboard";
import EventDiscoveryTab from "./components/EventDiscoveryTab";
import WorldwideEventScraper from "./components/WorldwideEventScraper";

import {
  FiMail,
  FiUser,
  FiLogOut,
  FiSearch,
  FiChevronLeft,
  FiChevronRight,
  FiCpu,
  FiCheckCircle,
  FiRefreshCw,
  FiMap,
  FiShield,
  FiActivity,
  FiBarChart2,
  FiGlobe,
  FiXCircle,
  FiChevronDown,
  FiMenu,
  FiClock,
  FiZap,
  FiLink,
  FiDatabase,
  FiEdit3
} from "react-icons/fi";
import "./App.css";

// ADD THIS CONSTANT
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://emailagent.cubegtp.com/';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem("activeTab") || "summary";
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  useEffect(() => {
    localStorage.setItem("activeTab", activeTab);
  }, [activeTab]);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch(`https://emailagent.cubegtp.com/auth/check-auth`, {
        method: 'GET',
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        console.log("Auth check data:", data);

        if (data.authenticated) {
          setIsAuthenticated(true);
          setCurrentUser(data.user);
          console.log("User authenticated, role:", data.user?.role);
        } else {
          setIsAuthenticated(false);
          setCurrentUser(null);
        }
      } else {
        setIsAuthenticated(false);
        setCurrentUser(null);
      }
    } catch (error) {
      console.error("Error checking auth status:", error);
      setIsAuthenticated(false);
      setCurrentUser(null);
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleLogin = (user) => {
    setIsAuthenticated(true);
    setCurrentUser(user);
    setShowLogin(false);
    localStorage.setItem('cubeai_user', JSON.stringify(user));
  };

  const handleShowLogin = () => {
    setShowLogin(true);
  };

  const handleShowHomepage = () => {
    setShowLogin(false);
  };

  const handleLogout = async () => {
    try {
      await fetch(``https://emailagent.cubegtp.com/auth/logout`, {
        method: "POST",
        credentials: "include",
      });

      localStorage.removeItem("zohoCredentials");
      localStorage.removeItem("zohoStatus");
      localStorage.removeItem("connectionStatus");
      localStorage.removeItem("emailContent");
      localStorage.removeItem("imapConfig");
    } catch (error) {
      console.error("Error logging out:", error);
    } finally {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setShowLogin(false);

      setActiveTab("webscraping");
      localStorage.clear();
    }
  };

  if (checkingAuth) {
    return (
      <div className="loading-container">
        <div className="loading-spinner-large"></div>
        <p className="loading-text">Checking authentication...</p>
      </div>
    );
  }

  if (!isAuthenticated && !showLogin) {
    return (
      <div className="public-homepage">
        <Homepage onLoginClick={handleShowLogin} />
      </div>
    );
  }

  if (!isAuthenticated && showLogin) {
    return <LoginPage onLogin={handleLogin} onBackToHome={handleShowHomepage} />;
  }

  return (
    <PermissionProvider currentUser={currentUser}>
      <AuthenticatedApp
        currentUser={currentUser}
        handleLogout={handleLogout}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
    </PermissionProvider>
  );
}

// Authenticated App Component with Permission Filtering
function AuthenticatedApp({ currentUser, handleLogout, sidebarCollapsed, setSidebarCollapsed, activeTab, setActiveTab }) {
  const { permissions, hasPermission: permissionContextHasPermission, loading: permissionsLoading } = usePermissions();
  const userPermissions = permissions || {};
  const [emailMenuExpanded, setEmailMenuExpanded] = useState(true);
  const [scraperMenuExpanded, setScraperMenuExpanded] = useState(true);
  const [connectorsMenuExpanded, setConnectorsMenuExpanded] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth');
    return saved ? parseInt(saved) : 240;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Handle sidebar resize
  const handleMouseDown = (e) => {
    setIsResizing(true);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = e.clientX;
      if (newWidth >= 200 && newWidth <= 500) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        localStorage.setItem('sidebarWidth', sidebarWidth.toString());
      }
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, sidebarWidth]);

  // Detect mobile breakpoints and collapse sidebar by default
  useEffect(() => {
    const updateIsMobile = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarCollapsed(true);
      }
    };

    updateIsMobile();
    window.addEventListener('resize', updateIsMobile);
    return () => window.removeEventListener('resize', updateIsMobile);
  }, [setSidebarCollapsed]);

  // No mapping needed - use backend module keys directly
  const permissionKeyMap = {};

  const getMenuExpanded = (groupId) => {
    switch (groupId) {
      case "email":
        return emailMenuExpanded;
      case "scraper":
        return scraperMenuExpanded;
      case "connectors":
        return connectorsMenuExpanded;
      default:
        return true;
    }
  };

  const toggleMenuExpanded = (groupId) => {
    switch (groupId) {
      case "email":
        setEmailMenuExpanded((prev) => !prev);
        break;
      case "scraper":
        setScraperMenuExpanded((prev) => !prev);
        break;
      case "connectors":
        setConnectorsMenuExpanded((prev) => !prev);
        break;
      default:
        break;
    }
  };

  // Check if user has permission or is super admin
  const hasModulePermission = (moduleKey) => {
    if (currentUser?.role === "super_admin") return true;

    // Always allow dashboard access for logged-in users
    if (moduleKey === "dashboard") return true;

    if (permissionContextHasPermission(moduleKey)) return true;

    const mappedKey = permissionKeyMap[moduleKey];
    if (mappedKey && permissionContextHasPermission(mappedKey)) return true;

    if (mappedKey && userPermissions[mappedKey]) return true;

    return userPermissions[moduleKey] === true;
  };

  // Build navigation items based on permissions
  const getAvailableNavItems = () => {
    const allItems = [
      { id: "summary", label: "Dashboard", icon: <FiActivity />, moduleKey: "dashboard" },
    ];

    const availableItems = allItems.filter(item => hasModulePermission(item.moduleKey));

    // Build scraper submenu items
    const scraperSubItems = [
      { id: "webscraping", label: "Web Scraping", icon: <FiSearch />, moduleKey: "webscraping" },
      { id: "googleScraper", label: "Google Maps Scraper", icon: <FiMap />, moduleKey: "google_scraper" },
      { id: "worldwideEvents", label: "Worldwide Event Scraper", icon: <FiGlobe />, moduleKey: "worldwide_event_scraper" },
      { id: "eventHashtag", label: "Lead Discovery", icon: <FiSearch />, moduleKey: "worldwide_event_scraper" },
    ].filter(item => hasModulePermission(item.moduleKey));

    // Add scraper parent item if any scraper subitems are available
    if (scraperSubItems.length > 0) {
      availableItems.push({
        id: "scraper",
        label: "Scraper",
        icon: <FiSearch />,
        isParent: true,
        children: scraperSubItems
      });
    }

    // Build email submenu items
    const emailSubItems = [
      { id: "emailValidator", label: "Email Validator", icon: <FiCheckCircle />, moduleKey: "email_validator" },
      { id: "contentCreation", label: "Content Creation", icon: <FiZap />, moduleKey: "content_creation" },
      { id: "emailDesigner", label: "Design Studio", icon: <FiEdit3 />, moduleKey: "email_campaigns" },
      { id: "autoEmail", label: "Bulk Mail", icon: <FiMail />, moduleKey: "email_campaigns" },
      { id: "emailTracking", label: "Email Tracking", icon: <FiRefreshCw />, moduleKey: "auto_email" },
      { id: "autoMail", label: "Auto Mail", icon: <FiMail />, moduleKey: "auto_email" },
      { id: "followUp", label: "Follow Up", icon: <FiClock />, moduleKey: "auto_email" },
    ].filter(item => hasModulePermission(item.moduleKey));

    // Add email parent item if any email subitems are available
    if (emailSubItems.length > 0) {
      availableItems.push({
        id: "email",
        label: "Email",
        icon: <FiMail />,
        isParent: true,
        children: emailSubItems
      });
    }

    const connectorSubItems = [
      { id: "zohoCRM", label: "Zoho CRM", icon: <FiCpu />, moduleKey: "zoho_crm" },
      { id: "salesForce", label: "Salesforce", icon: <FiDatabase />, moduleKey: "salesforce" },
    ].filter(item => hasModulePermission(item.moduleKey));

    if (connectorSubItems.length > 0) {
      availableItems.push({
        id: "connectors",
        label: "Connectors",
        icon: <FiLink />,
        isParent: true,
        children: connectorSubItems
      });
    }

    if (currentUser?.role === "super_admin") {
      availableItems.push({ id: "admin", label: "Admin Panel", icon: <FiShield />, moduleKey: "admin_panel" });
    }

    return availableItems;
  };

  const navItems = getAvailableNavItems();

  // Ensure active tab is accessible (check both parent items and children)
  useEffect(() => {
    if (!permissionsLoading && navItems.length > 0) {
      const activeTabExists = navItems.some(item => {
        if (item.id === activeTab) return true;
        // Check if activeTab is in children
        if (item.children) {
          return item.children.some(child => child.id === activeTab);
        }
        return false;
      });
      if (!activeTabExists) {
        setActiveTab(navItems[0].id);
      }
    }
  }, [permissionsLoading, navItems, activeTab, setActiveTab]);

  const renderNoPermission = () => (
    <div className="access-denied">
      <FiXCircle size={64} color="#ef4444" />
      <h2>Access Denied</h2>
      <p>You don't have permission to access this module.</p>
      <p>Please contact your administrator for access.</p>
    </div>
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case "summary":
        return hasModulePermission("dashboard") ? <SummaryDashboard /> : renderNoPermission();
      case "webscraping":
        return hasModulePermission("webscraping") ? <WebScrapingTab /> : renderNoPermission();
      case "worldwideEvents":
        return hasModulePermission("worldwide_event_scraper") ? <WorldwideEventScraper /> : renderNoPermission();
      case "eventHashtag":
        return hasModulePermission("worldwide_event_scraper") ? <EventDiscoveryTab /> : renderNoPermission();
      case "emailValidator":
        return hasModulePermission("email_validator") ? <EmailValidator /> : renderNoPermission();
      case "googleScraper":
        return hasModulePermission("google_scraper") ? <GoogleScraperTab /> : renderNoPermission();
      case "contentCreation":
        return hasModulePermission("content_creation") ? <ContentCreationTab /> : renderNoPermission();
      case "emailDesigner":
        return hasModulePermission("email_campaigns") ? <EmailDesignerTab /> : renderNoPermission();
      case "autoEmail":
        return hasModulePermission("email_campaigns") ? <BulkMailTab /> : renderNoPermission();
      case "emailTracking":
        return hasModulePermission("auto_email") ? <CampaignHistoryTab /> : renderNoPermission();
      case "autoMail":
        return hasModulePermission("auto_email") ? <AutoMailTab /> : renderNoPermission();
      case "followUp":
        return hasModulePermission("auto_email") ? <FollowUpTab /> : renderNoPermission();
      case "zohoCRM":
        return hasModulePermission("zoho_crm") ? <ZohoCRMTab /> : renderNoPermission();
      case "salesForce":
        return hasModulePermission("salesforce") ? <SalesforceCRMTab /> : renderNoPermission();
      case "admin":
        return currentUser?.role === "super_admin" && hasModulePermission("admin_panel")
          ? <AdminPanel />
          : renderNoPermission();
      default:
        return navItems.length > 0
          ? renderNoPermission()
          : <div className="no-permission">No modules available</div>;
    }
  };

  if (permissionsLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner-large"></div>
        <p className="loading-text">Loading permissions...</p>
      </div>
    );
  }

  return (
    <div className={`app-container ${isResizing ? 'resizing' : ''}`}>
      <aside 
        className={`sidebar ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${isMobile ? 'sidebar-mobile' : ''} ${isMobile && !sidebarCollapsed ? 'sidebar-mobile-open' : ''}`}
        style={{ width: isMobile ? '230px' : sidebarCollapsed ? '72px' : `${sidebarWidth}px` }}
      >
        <div className="sidebar-header">
          <div className="sidebar-logo">
            {!sidebarCollapsed && (
              <>
                <div className="logo-icon">
                  <FiCpu />
                </div>
                <div className="logo-text">
                  <h2>CubeAI</h2>
                  <span>Solutions</span>
                </div>
              </>
            )}
            <button
              className="sidebar-toggle"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              {sidebarCollapsed ? <FiChevronRight /> : <FiChevronLeft />}
            </button>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            if (item.isParent) {
              // Render parent item with children
              const isAnyChildActive = item.children?.some(child => child.id === activeTab);
              const isExpanded = getMenuExpanded(item.id);
              const toggleExpanded = () => toggleMenuExpanded(item.id);
              
              return (
                <div key={item.id} className="sidebar-group">
                  <button
                    className={`sidebar-item sidebar-parent ${isAnyChildActive ? "active" : ""}`}
                    onClick={toggleExpanded}
                    title={sidebarCollapsed ? item.label : ''}
                  >
                    <span className="sidebar-icon">{item.icon}</span>
                    {!sidebarCollapsed && (
                      <>
                        <span className="sidebar-label">{item.label}</span>
                        <span className="sidebar-arrow">
                          {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                        </span>
                      </>
                    )}
                  </button>
                  {isExpanded && !sidebarCollapsed && item.children && (
                    <div className="sidebar-submenu">
                      {item.children.map((child) => (
                        <button
                          key={child.id}
                          className={`sidebar-item sidebar-subitem ${activeTab === child.id ? "active" : ""}`}
                          onClick={() => setActiveTab(child.id)}
                        >
                          <span className="sidebar-icon">{child.icon}</span>
                          <span className="sidebar-label">{child.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            // Render regular item
            return (
              <button
                key={item.id}
                className={`sidebar-item ${activeTab === item.id ? "active" : ""}`}
                onClick={() => setActiveTab(item.id)}
                title={sidebarCollapsed ? item.label : ''}
              >
                <span className="sidebar-icon">{item.icon}</span>
                {!sidebarCollapsed && <span className="sidebar-label">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {!sidebarCollapsed && (
          <div 
            className="sidebar-resizer"
            onMouseDown={handleMouseDown}
          />
        )}

        {!sidebarCollapsed && (
          <div className="sidebar-footer">
            <div className="user-profile">
              <div className="user-avatar">
                <FiUser />
              </div>
              <div className="user-info">
                <span className="user-name">{currentUser?.username || "Admin User"}</span>
                <span className="user-role">
                  {currentUser?.role === "super_admin" ? "Super Admin" :
                    currentUser?.role === "admin" ? "Administrator" : "User"}
                </span>
              </div>
            </div>
            <button onClick={handleLogout} className="logout-btn">
              <FiLogOut /> <span>Logout</span>
            </button>
          </div>
        )}

        {sidebarCollapsed && (
          <div className="sidebar-footer-collapsed">
            <button onClick={handleLogout} className="logout-btn-icon" title="Logout">
              <FiLogOut />
            </button>
          </div>
        )}
      </aside>

      <div 
        className={`main-content ${sidebarCollapsed ? 'main-content-expanded' : ''}`}
        style={{ marginLeft: isMobile ? '0px' : sidebarCollapsed ? '72px' : `${sidebarWidth}px` }}
      >
        <div className={`page-header ${activeTab === 'emailDesigner' ? 'hidden' : ''}`}>
          <div className="header-content">
            <button
              className="mobile-menu-btn"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label="Toggle menu"
            >
              <FiMenu />
            </button>
            <div className="header-main">
              {activeTab !== 'emailDesigner' && (
                <>
                  <h1 className="page-title">
                    {activeTab === 'summary' && 'Performance Intelligence'}
                    {activeTab === 'intelligence' && 'Intelligence Dashboard'}
                    {activeTab === 'webscraping' && 'LinkedIn Lead Generator'}
                    {activeTab === 'worldwideEvents' && 'Worldwide Event Scraper'}
                    {activeTab === 'eventHashtag' && 'Event Hashtag Discovery'}
                    {activeTab === 'emailValidator' && 'Email Validator'}
                    {activeTab === 'googleScraper' && 'Google Maps Scraper'}
                    {activeTab === 'contentCreation' && 'AI Content Creation'}
                    {activeTab === 'autoEmail' && 'Bulk Mail'}
                    {activeTab === 'autoMail' && 'Auto Mail'}
                    {activeTab === 'followUp' && 'Follow Up'}
                    {activeTab === 'emailTracking' && 'Email Tracking & Analytics'}
                    {activeTab === 'zohoCRM' && 'Zoho CRM Integration'}
                    {activeTab === 'salesForce' && 'Salesforce Integration'}
                    {activeTab === 'admin' && 'Admin Panel'}
                  </h1>
                  
                  <p className="page-subtitle">
                    {activeTab === 'summary' && 'Real-time analytics across all your email intelligence'}
                    {activeTab === 'intelligence' && 'AI-assisted insights and generators'}
                    {activeTab === 'webscraping' && 'Find professional contacts with verified email addresses'}
                    {activeTab === 'worldwideEvents' && 'Discover events and extract attendee contacts worldwide'}
                    {activeTab === 'eventHashtag' && 'Discover high-intent leads from event hashtags and platforms'}
                    {activeTab === 'emailValidator' && 'Generate and validate email addresses from names and companies'}
                    {activeTab === 'googleScraper' && 'Extract business information, reviews, and contact details from Google Maps'}
                    {activeTab === 'contentCreation' && 'Generate personalized, spam-safe email content effortlessly'}
                    {activeTab === 'autoEmail' && 'Send personalized bulk emails with AI-generated content'}
                    {activeTab === 'autoMail' && 'Automate sending sequences with smart scheduling and rules'}
                    {activeTab === 'followUp' && 'Manage and trigger follow-up emails based on engagement'}
                    {activeTab === 'emailTracking' && 'View detailed hierarchical history of your campaigns with nested sender accounts and recipients'}
                    {activeTab === 'zohoCRM' && 'Manage leads and automate responses via Zoho CRM'}
                    {activeTab === 'salesForce' && 'Sync replied users and track engagement with Salesforce CRM'}
                    {activeTab === 'admin' && 'Manage users and permissions'}
                  </p>
                </>
              )}
            </div>
            {sidebarCollapsed && activeTab !== 'emailDesigner' && (
              <div className="header-user">
                <div className="user-avatar-small">
                  <FiUser />
                </div>
                <span>{currentUser?.username || "Admin"}</span>
              </div>
            )}
          </div>
        </div>

        <div className={`content-area ${activeTab === 'emailDesigner' ? 'expanded' : ''}`}>
          {renderActiveTab()}
        </div>
      </div>
    </div>
  );
}

export default App;
