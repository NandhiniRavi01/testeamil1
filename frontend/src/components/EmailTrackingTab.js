import React, { useState, useEffect, useCallback } from "react";
import {
  FiMail, FiRefreshCw,
  FiCheckCircle, FiServer, FiDatabase,
  FiBarChart2, FiFileText,
  FiFilter, FiX, FiPlay, FiPause,
  FiSend, FiSettings, FiAlertCircle, FiList,
  FiMessageSquare, FiCheckSquare, 
  FiHardDrive, FiAlertTriangle, FiInfo, FiDownload,
  FiUpload, FiCalendar, FiTrash2
} from "react-icons/fi";
import "./EmailTrackingTab.css";

import * as XLSX from 'xlsx';

// Import AutoReplyTab component
import AutoReplyTab from "./AutoReplyTab";

// Auth helper function
const makeAuthenticatedRequest = async (url, options = {}) => {
  const defaultOptions = {
    credentials: 'include', // This sends cookies with the request
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, { ...defaultOptions, ...options });

    if (response.status === 401) {
      console.error('Authentication required. Please log in.');
      // Clear any stored auth data
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');

      // Redirect to login page
      window.location.href = '/';
      throw new Error('Authentication required');
    }

    return response;
  } catch (error) {
    console.error('Request failed:', error);
    if (error.message.includes('Failed to fetch')) {
      alert('Cannot connect to server. Please make sure the backend is running on localhost:5000');
    }
    throw error;
  }
};

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://emailagent.cubegtp.com';

function EmailTrackingTab() {
  const [imapConfig, setImapConfig] = useState({
    gmail_address: "",
    app_password: "",
    imap_server: "imap.gmail.com",
    smtp_server: "smtp.gmail.com",
    no_reply_days: 7
  });

  const [trackingData, setTrackingData] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [followUpCampaigns, setFollowUpCampaigns] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    sent: 0,
    replied: 0,
    auto_reply: 0,
    bounced: 0,
    hard_bounce: 0,
    soft_bounce: 0,
    no_reply: 0
  });
  const [loading, setLoading] = useState({
    tracking: false,
    campaigns: false,
    checking: false,
    followUp: false,
    classifying: false
  });
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [checkResults, setCheckResults] = useState(null);
  const [showResultsModal, setShowResultsModal] = useState(false);

  // Follow-up campaign creation
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [followUpData, setFollowUpData] = useState({
    name: "",
    subject: "",
    body: "",
    sender_name: "",
    delay_days: 3,
    max_follow_ups: 3
  });

  // Immediate follow-up states
  const [showImmediateFollowUpModal, setShowImmediateFollowUpModal] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [immediateFollowUpData, setImmediateFollowUpData] = useState({
    subject: "",
    body: "",
    sender_name: "",
  });

  // Subtab state
  const [activeSubTab, setActiveSubTab] = useState("tracking"); // "tracking" or "auto-reply"

  // Tab Button Component
  const TabButton = ({ active, onClick, icon: Icon, title, subtitle }) => (
    <button
      className={`custom-tab-btn ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <div className="tab-btn-content">
        <div className="tab-icon-wrapper">
          <Icon className="tab-icon" />
        </div>
        <div className="tab-text">
          <span className="tab-title">{title}</span>
          <span className="tab-subtitle">{subtitle}</span>
        </div>
      </div>
    </button>
  );



  const downloadTrackingData = () => {
    const filteredData = getFilteredTrackingData();

    if (filteredData.length === 0) {
      alert("No data to download");
      return;
    }

    // Define CSV headers
    const headers = [
      'Recipient Email',
      'Recipient Name',
      'Campaign',
      'Sent Time',
      'Status',
      'Reply Time',
      'Last Checked',
      'Bounce Reason'
    ];

    // Convert data to CSV rows
    const csvRows = filteredData.map(item => [
      item.recipient_email,
      item.recipient_name || 'N/A',
      item.campaign_name || 'N/A',
      formatDate(item.sent_time),
      item.status,
      formatDate(item.reply_time),
      formatDate(item.last_checked),
      item.bounce_reason || 'N/A'
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...csvRows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().split('T')[0];
    const campaignName = selectedCampaign ? selectedCampaign.campaign_name.replace(/\s+/g, '_') : 'all_campaigns';

    a.href = url;
    a.download = `email_tracking_${campaignName}_${timestamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const downloadTrackingDataExcel = () => {
    const filteredData = getFilteredTrackingData();

    if (filteredData.length === 0) {
      alert("No data to download");
      return;
    }

    try {
      // Prepare data for Excel
      const excelData = filteredData.map(item => ({
        'Recipient Email': item.recipient_email,
        'Recipient Name': item.recipient_name || 'N/A',
        'Campaign': item.campaign_name || 'N/A',
        'Sent Time': formatDate(item.sent_time),
        'Status': item.status,
        'Reply Time': formatDate(item.reply_time),
        'Last Checked': formatDate(item.last_checked),
        'Bounce Reason': item.bounce_reason || 'N/A'
      }));

      // Create worksheet from data
      const worksheet = XLSX.utils.json_to_sheet(excelData);

      // Create workbook and add worksheet
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Email Tracking');

      // Generate file
      const timestamp = new Date().toISOString().split('T')[0];
      const campaignName = selectedCampaign ? selectedCampaign.campaign_name.replace(/\s+/g, '_') : 'all_campaigns';
      XLSX.writeFile(workbook, `email_tracking_${campaignName}_${timestamp}.xlsx`);

    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Error exporting to Excel. Please try CSV format instead.');
    }
  };


  // Add session validation on component mount
  useEffect(() => {
    const validateSession = async () => {
      try {
        const res = await makeAuthenticatedRequest(`https://emailagent.cubegtp.com/auth/check-auth`);
        const data = await res.json();
        if (!data.authenticated) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('user');
          window.location.href = '/';
        }
      } catch (error) {
        console.error('Session validation failed:', error);
        // Error is already handled by makeAuthenticatedRequest
      }
    };

    validateSession();
  }, []);

  // (moved below) Load saved IMAP config and trigger fetches when activeSubTab changes

  const saveImapConfig = () => {
    localStorage.setItem('imapConfig', JSON.stringify(imapConfig));
    alert("IMAP configuration saved!");
  };

  const fetchTrackingData = useCallback(async () => {
    setLoading(prev => ({ ...prev, tracking: true }));
    try {
      console.log("Fetching tracking data...");
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/tracking/emails`);

      const data = await res.json();
      console.log("Tracking data response:", data);

      if (res.ok) {
        setTrackingData(data.tracking_data || []);
        calculateStats(data.tracking_data || []);
      } else {
        console.error("Error in tracking data response:", data.error);
      }
    } catch (err) {
      console.error("Error fetching tracking data:", err);
      // Set empty data on error
      setTrackingData([]);
      calculateStats([]);
    } finally {
      setLoading(prev => ({ ...prev, tracking: false }));
    }
  }, []);

  React.useEffect(() => {
    fetchTrackingData();
  }, [fetchTrackingData]);

  const fetchCampaigns = useCallback(async () => {
    setLoading(prev => ({ ...prev, campaigns: true }));
    try {
      console.log("Fetching campaigns...");
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/tracking/campaigns`);

      const data = await res.json();
      console.log("Campaigns data:", data);

      if (data.campaigns) {
        setCampaigns(data.campaigns);
      } else {
        console.error("No campaigns data in response:", data);
        setCampaigns([]);
      }
    } catch (err) {
      console.error("Error fetching campaigns:", err);
      setCampaigns([]);
    } finally {
      setLoading(prev => ({ ...prev, campaigns: false }));
    }
  }, []);

  const fetchFollowUpCampaigns = useCallback(async () => {
    setLoading(prev => ({ ...prev, followUp: true }));
    try {
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/tracking/follow-up-campaigns`);
      const data = await res.json();
      setFollowUpCampaigns(data.follow_up_campaigns || []);
    } catch (err) {
      console.error("Error fetching follow-up campaigns:", err);
    } finally {
      setLoading(prev => ({ ...prev, followUp: false }));
    }
  }, []);

  // Load saved IMAP config from localStorage and trigger data fetches
  useEffect(() => {
    const savedConfig = localStorage.getItem('imapConfig');
    if (savedConfig) {
      setImapConfig(JSON.parse(savedConfig));
    }
    if (activeSubTab === "tracking") {
      fetchTrackingData();
      fetchCampaigns();
      fetchFollowUpCampaigns();
    }
  }, [activeSubTab, fetchTrackingData, fetchCampaigns, fetchFollowUpCampaigns]);

  const calculateStats = (data) => {
    const stats = {
      total: data.length,
      sent: data.filter(item => item.status === 'sent').length,
      replied: data.filter(item => item.status === 'replied').length,
      auto_reply: data.filter(item => item.status === 'auto_reply').length,
      bounced: data.filter(item => item.status === 'bounced').length,
      hard_bounce: data.filter(item => item.bounce_type === 'hard_bounce').length,
      soft_bounce: data.filter(item => item.bounce_type === 'soft_bounce').length,
      no_reply: data.filter(item => item.status === 'no_reply').length
    };
    setStats(stats);
  };

  const checkEmails = async () => {
    if (!imapConfig.gmail_address || !imapConfig.app_password) {
      alert("Please enter Gmail address and App Password");
      return;
    }

    setLoading(prev => ({ ...prev, checking: true }));
    try {
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/tracking/check-emails`, {
        method: "POST",
        body: JSON.stringify({
          gmail_address: imapConfig.gmail_address,
          app_password: imapConfig.app_password,
          no_reply_days: imapConfig.no_reply_days
        })
      });

      const data = await res.json();
      if (res.ok) {
        setCheckResults(data);
        setShowResultsModal(true);
        fetchTrackingData(); // Refresh data
        fetchCampaigns(); // Refresh campaigns
      } else {
        // Handle 400 or 401 (IMAP failures)
        const errorMsg = data.error || "Unknown error";
        if (res.status === 401 || res.status === 400) {
          alert("❌ Authentication Failed!\n\nIf you're using Gmail, please ensure:\n1. You are using an 'App Password', NOT your regular password.\n2. IMAP is enabled in your Gmail settings.\n\nError: " + errorMsg);
        } else {
          alert("Error checking emails: " + errorMsg);
        }
      }
    } catch (err) {
      if (err.message !== 'Authentication required') {
        alert("Error checking emails: " + err.message);
      } else {
        alert("❌ Authentication Required! Please check your IMAP settings or log in again.");
      }
    } finally {
      setLoading(prev => ({ ...prev, checking: false }));
    }
  };

  const clearCredentials = () => {
    setImapConfig({
      ...imapConfig,
      gmail_address: "",
      app_password: ""
    });
    localStorage.removeItem('imapConfig');
    alert("IMAP credentials cleared!");
  };

  const downloadEmailResults = (format) => {
    if (!checkResults || !checkResults.email_results) {
      alert("No email results to download");
      return;
    }

    const data = checkResults.email_results.map(result => ({
      Email: result.recipient_email || result.email || 'N/A',
      Status: result.status ? result.status.charAt(0).toUpperCase() + result.status.slice(1).replace('_', ' ') : 'Sent',
      'Bounce Type': result.bounce_type || 'N/A',
      'Bounce Reason': result.bounce_reason || 'N/A',
      'Last Checked': result.last_checked ? new Date(result.last_checked).toLocaleString() : 'N/A',
      'Replies': result.reply_count || result.replies || 0
    }));

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `email_check_results_${timestamp}`;

    if (format === 'csv') {
      // Generate CSV
      const headers = Object.keys(data[0]);
      const csvContent = [
        headers.join(','),
        ...data.map(row =>
          headers.map(header => {
            const value = row[header];
            // Escape commas and quotes in CSV
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          }).join(',')
        )
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${filename}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    else if (format === 'excel') {
      // Generate Excel
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Email Results");

      // Auto-size columns
      const columnWidths = Object.keys(data[0]).map(header => ({
        wch: Math.max(header.length + 2, 15)
      }));
      worksheet['!cols'] = columnWidths;

      XLSX.writeFile(workbook, `${filename}.xlsx`);
    }
    else if (format === 'json') {
      // Generate JSON with summary
      const exportData = {
        exportDate: new Date().toISOString(),
        summary: checkResults.summary,
        stats: checkResults.stats,
        emailResults: data
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${filename}.json`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const classifyEmails = async () => {
    setLoading(prev => ({ ...prev, classifying: true }));
    try {
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/tracking/classify-emails`, {
        method: "POST"
      });

      const data = await res.json();
      if (res.ok) {
        alert(`Classification completed: ${data.message}\n\nStats:\nTotal: ${data.stats?.total}\nSent: ${data.stats?.sent}\nReplied: ${data.stats?.replied}\nBounced: ${data.stats?.bounced}\nNo Reply: ${data.stats?.no_reply}`);
        fetchTrackingData();
      } else {
        alert("Error classifying emails: " + data.error);
      }
    } catch (err) {
      alert("Error classifying emails: " + err.message);
    } finally {
      setLoading(prev => ({ ...prev, classifying: false }));
    }
  };

  // Test classification function
  const testClassification = async () => {
    setLoading(prev => ({ ...prev, classifying: true }));
    try {
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/tracking/classify-emails`, {
        method: "POST"
      });

      const data = await res.json();
      if (res.ok) {
        alert(`Classification result: ${data.message}\nStats: ${JSON.stringify(data.stats)}`);
        fetchTrackingData(); // Refresh data
      } else {
        alert("Error classifying emails: " + data.error);
      }
    } catch (err) {
      alert("Error classifying emails: " + err.message);
    } finally {
      setLoading(prev => ({ ...prev, classifying: false }));
    }
  };

  const createFollowUpCampaign = async () => {
    if (!selectedCampaign) {
      alert("Please select a campaign first");
      return;
    }

    if (!followUpData.subject || !followUpData.body) {
      alert("Please enter subject and body for the follow-up email");
      return;
    }

    try {
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/tracking/schedule-follow-up`, {
        method: "POST",
        body: JSON.stringify({
          campaign_id: selectedCampaign.campaign_id,
          follow_up_data: followUpData
        })
      });

      const data = await res.json();
      if (res.ok) {
        alert(`Follow-up campaign created! ${data.message}`);
        setShowFollowUpModal(false);
        setFollowUpData({
          name: "",
          subject: "",
          body: "",
          sender_name: "",
          delay_days: 3,
          max_follow_ups: 3
        });
        fetchFollowUpCampaigns();
      } else {
        alert("Error creating follow-up campaign: " + data.error);
      }
    } catch (err) {
      alert("Error creating follow-up campaign: " + err.message);
    }
  };

  // Immediate follow-up functions
  const handleRowSelection = (recipientEmail) => {
    setSelectedRecipients(prev => {
      const isSelected = prev.includes(recipientEmail);
      if (isSelected) {
        return prev.filter(email => email !== recipientEmail);
      } else {
        return [...prev, recipientEmail];
      }
    });
  };

  const sendImmediateFollowUp = async () => {
    if (selectedRecipients.length === 0) {
      alert("Please select at least one recipient");
      return;
    }

    if (!immediateFollowUpData.subject || !immediateFollowUpData.body) {
      alert("Please enter subject and body for the follow-up email");
      return;
    }

    try {
      // Get sender accounts
      const senderAccounts = [
        {
          email: imapConfig.gmail_address,
          password: imapConfig.app_password,
          sender_name: immediateFollowUpData.sender_name
        }
      ];

      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/tracking/send-immediate-follow-up`, {
        method: "POST",
        body: JSON.stringify({
          campaign_id: selectedCampaign?.campaign_id,
          recipient_emails: selectedRecipients,
          subject: immediateFollowUpData.subject,
          body: immediateFollowUpData.body,
          sender_name: immediateFollowUpData.sender_name,
          sender_accounts: senderAccounts
        })
      });

      const data = await res.json();
      if (res.ok) {
        alert(`Immediate follow-up sent to ${selectedRecipients.length} recipients!`);
        setShowImmediateFollowUpModal(false);
        setSelectedRecipients([]);
        setImmediateFollowUpData({
          subject: "",
          body: "",
          sender_name: "",
        });
        // Refresh data to see updates
        fetchTrackingData();
      } else {
        alert("Error sending immediate follow-up: " + data.error);
      }
    } catch (err) {
      alert("Error sending immediate follow-up: " + err.message);
    }
  };

  const selectAllNoReply = () => {
    const noReplyEmails = trackingData
      .filter(item => item.status === 'no_reply')
      .map(item => item.recipient_email);
    setSelectedRecipients(noReplyEmails);
  };

  const selectAllFiltered = () => {
    const filteredEmails = getFilteredTrackingData().map(item => item.recipient_email);
    setSelectedRecipients(filteredEmails);
  };

  const clearSelection = () => {
    setSelectedRecipients([]);
  };

  const viewCampaignDetails = async (campaign) => {
    setSelectedCampaign(campaign);
    setSelectedRecipients([]); // Clear selection when changing campaign
    setLoading(prev => ({ ...prev, tracking: true }));

    try {
      // Fetch tracking data for this specific campaign
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/tracking/campaign/${campaign.campaign_id}`);

      if (res.ok) {
        const data = await res.json();
        setTrackingData(data.tracking_data || []);
        calculateStats(data.tracking_data || []);
      } else {
        // Fallback: filter existing data by campaign
        const campaignTrackingData = trackingData.filter(item => item.campaign_id === campaign.campaign_id);
        setTrackingData(campaignTrackingData);
        calculateStats(campaignTrackingData);
      }
    } catch (err) {
      console.error("Error fetching campaign details:", err);
      // Fallback: filter existing data by campaign
      const campaignTrackingData = trackingData.filter(item => item.campaign_id === campaign.campaign_id);
      setTrackingData(campaignTrackingData);
      calculateStats(campaignTrackingData);
    } finally {
      setLoading(prev => ({ ...prev, tracking: false }));
    }
  };

  const viewAllTracking = () => {
    setSelectedCampaign(null);
    setSelectedRecipients([]); // Clear selection
    setFilterStatus("all");
    fetchTrackingData(); // Reload all tracking data
  };

  const filterTrackingData = (status) => {
    setFilterStatus(status);
    setSelectedRecipients([]); // Clear selection when filtering
    if (status === "all") {
      if (selectedCampaign) {
        // Show all data for selected campaign
        const campaignTrackingData = trackingData.filter(item => item.campaign_id === selectedCampaign.campaign_id);
        setTrackingData(campaignTrackingData);
      } else {
        // Show all data
        fetchTrackingData();
      }
    } else {
      // Filter by status
      let filteredData;
      if (selectedCampaign) {
        filteredData = trackingData.filter(item =>
          item.campaign_id === selectedCampaign.campaign_id && item.status === status
        );
      } else {
        filteredData = trackingData.filter(item => item.status === status);
      }
      setTrackingData(filteredData);
      calculateStats(filteredData);
    }
  };

  const StatusBadge = ({ status, bounce_type }) => {
    const statusConfig = {
      sent: { class: "badge-sent", label: "Sent", icon: "📩", color: "#3b82f6" },
      replied: { class: "badge-replied", label: "Replied", icon: "↩️", color: "#10b981" },
      auto_reply: { class: "badge-auto_reply", label: "Auto-Reply", icon: "🤖", color: "#8b5cf6" },
      bounced: {
        class: bounce_type === 'hard_bounce' ? "badge-hard_bounce" : "badge-soft_bounce",
        label: bounce_type === 'hard_bounce' ? "Hard Bounce" : "Soft Bounce",
        icon: bounce_type === 'hard_bounce' ? "❌" : "⚠️",
        color: bounce_type === 'hard_bounce' ? "#ef4444" : "#f59e0b"
      },
      no_reply: { class: "badge-no_reply", label: "No Reply", icon: "⏰", color: "#6b7280" }
    };

    const config = statusConfig[status] || statusConfig.sent;

    return (
      <span
        className={`status-badge ${config.class}`}
        style={{ backgroundColor: config.color }}
        title={bounce_type === 'hard_bounce' ? 'Email address does not exist' : bounce_type === 'soft_bounce' ? 'Temporary delivery issue' : ''}
      >
        <span className="status-icon">{config.icon}</span>
        {config.label}
      </span>
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleString();
    } catch (e) {
      return "Invalid Date";
    }
  };

  const getCampaignStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed': return '#10b981';
      case 'running': return '#3b82f6';
      case 'failed': return '#ef4444';
      case 'pending': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const getFilteredTrackingData = () => {
    if (filterStatus === "all") {
      return trackingData;
    }
    return trackingData.filter(item => item.status === filterStatus);
  };

  const refreshAllData = () => {
    setSelectedRecipients([]); // Clear selection on refresh
    fetchTrackingData();
    fetchCampaigns();
    fetchFollowUpCampaigns();
  };

  const isAllSelected = () => {
    const filteredData = getFilteredTrackingData();
    return filteredData.length > 0 && selectedRecipients.length === filteredData.length;
  };

  const toggleSelectAll = () => {
    const filteredData = getFilteredTrackingData();
    if (isAllSelected()) {
      setSelectedRecipients([]);
    } else {
      setSelectedRecipients(filteredData.map(item => item.recipient_email));
    }
  };

  // Process follow-ups immediately
  const processFollowUpsNow = async () => {
    try {
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/tracking/process-follow-ups`, {
        method: "POST"
      });

      const data = await res.json();
      if (res.ok) {
        alert(`Follow-ups processed!\nClassification: ${data.classification?.message}\nFollow-ups: ${data.follow_up_processing?.message}`);
        fetchTrackingData();
        fetchFollowUpCampaigns();
      } else {
        alert("Error processing follow-ups: " + data.error);
      }
    } catch (err) {
      alert("Error processing follow-ups: " + err.message);
    }
  };

  // Enhanced bounce checking
  const checkBouncesEnhanced = async () => {
    if (!imapConfig.gmail_address || !imapConfig.app_password) {
      alert("Please enter Gmail address and App Password");
      return;
    }

    setLoading(prev => ({ ...prev, checking: true }));
    try {
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/tracking/check-bounces-enhanced`, {
        method: "POST",
        body: JSON.stringify({
          gmail_address: imapConfig.gmail_address,
          app_password: imapConfig.app_password
        })
      });

      const data = await res.json();
      if (res.ok) {
        let alertMessage = data.message;
        if (data.recommendations && data.recommendations.length > 0) {
          alertMessage += "\n\nRecommendations:";
          data.recommendations.forEach(rec => {
            alertMessage += `\n\n${rec.type === 'warning' ? '⚠️' : 'ℹ️'} ${rec.message}\nAction: ${rec.action}`;
          });
        }

        alert(alertMessage);

        // Use the new results modal if we have consistent data
        if (data.total_bounces !== undefined) {
          setCheckResults({
            ...data,
            summary: {
              replies_found: 0,
              bounces_found: data.total_bounces,
              hard_bounces: data.hard_bounces,
              soft_bounces: data.soft_bounces,
              no_reply_updated: 0
            },
            stats: {
              total: data.total_checked || 0,
              bounced: data.total_bounces || 0,
              replied: 0
            }
          });
          setShowResultsModal(true);
        }

        fetchTrackingData(); // Refresh data
      } else {
        const errorMsg = data.error || "Unknown error";
        if (res.status === 401 || res.status === 400) {
          alert("❌ Authentication Failed!\n\nPlease ensure you are using a 16-digit Gmail App Password.\n\nError: " + errorMsg);
        } else {
          alert("Error checking bounces: " + errorMsg);
        }
      }
    } catch (err) {
      if (err.message !== 'Authentication required') {
        alert("Error checking bounces: " + err.message);
      }
    } finally {
      setLoading(prev => ({ ...prev, checking: false }));
    }
  };

  const sendTrackingToZoho = async (recipientEmail, emailSubject, trackingData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/zoho/store-tracking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          recipient_email: recipientEmail,
          email_subject: emailSubject,
          tracking_data: trackingData
        })
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error sending tracking to Zoho:', error);
      return { success: false, message: error.message };
    }
  };

  // Function to send batch tracking data
  const sendBatchTrackingToZoho = async (trackingRecords) => {
    try {
      const response = await fetch(`${API_BASE_URL}/zoho/batch-store-tracking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          tracking_records: trackingRecords
        })
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error sending batch tracking to Zoho:', error);
      return { success: false, message: error.message };
    }
  };

  // Function to calculate engagement score
  const calculateEngagementScore = (trackingItem) => {
    let score = 0;
    if (trackingItem.status === 'replied') score += 40;
    if (trackingItem.open_count > 0) score += 30;
    if (trackingItem.click_count > 0) score += 20;
    if (trackingItem.read_duration > 30) score += 10;
    return Math.min(score, 100);
  };

  // Function to generate activity log
  const generateActivityLog = (trackingItem) => {
    const activities = [];
    if (trackingItem.sent_time) {
      activities.push(`Email sent: ${formatDate(trackingItem.sent_time)}`);
    }
    if (trackingItem.first_opened) {
      activities.push(`First opened: ${formatDate(trackingItem.first_opened)}`);
    }
    if (trackingItem.last_opened) {
      activities.push(`Last opened: ${formatDate(trackingItem.last_opened)}`);
    }
    if (trackingItem.click_count > 0) {
      activities.push(`Clicked ${trackingItem.click_count} link(s)`);
    }
    return activities;
  };

  // Function to send single tracking item to Zoho
  const sendSingleTrackingToZoho = async (trackingItem) => {
    const trackingData = {
      opened: trackingItem.status === 'replied' || trackingItem.open_count > 0,
      open_count: trackingItem.open_count || 0,
      clicked: trackingItem.click_count > 0,
      click_count: trackingItem.click_count || 0,
      read_duration: trackingItem.read_duration || 0,
      engagement_score: calculateEngagementScore(trackingItem),
      device_type: trackingItem.device || 'Unknown',
      last_activity: trackingItem.last_checked || new Date().toISOString(),
      activity_log: generateActivityLog(trackingItem)
    };

    const result = await sendTrackingToZoho(
      trackingItem.recipient_email,
      trackingItem.email_subject || 'Email Campaign',
      trackingData
    );

    if (result.success) {
      alert('Tracking data stored in Zoho CRM successfully!');
    } else {
      alert(`Failed to store in Zoho: ${result.message}`);
    }
  };

  // Function to send all tracking data to Zoho
  const sendAllTrackingToZoho = async () => {
    const filteredData = getFilteredTrackingData();
    const trackingRecords = filteredData.map(item => ({
      recipient_email: item.recipient_email,
      email_subject: item.email_subject || 'Email Campaign',
      tracking_data: {
        opened: item.status === 'replied' || item.open_count > 0,
        open_count: item.open_count || 0,
        clicked: item.click_count > 0,
        click_count: item.click_count || 0,
        read_duration: item.read_duration || 0,
        engagement_score: calculateEngagementScore(item),
        device_type: item.device || 'Unknown',
        last_activity: item.last_checked || new Date().toISOString()
      }
    }));

    if (trackingRecords.length === 0) {
      alert("No tracking data to send to Zoho");
      return;
    }

    if (!window.confirm(`Send ${trackingRecords.length} tracking records to Zoho CRM?`)) {
      return;
    }

    const result = await sendBatchTrackingToZoho(trackingRecords);

    if (result.success) {
      alert(`Successfully stored ${result.results?.successful || 0} records in Zoho CRM`);
    } else {
      alert(`Failed to store some records. Check console for details.`);
      console.error('Batch store errors:', result.errors);
    }
  };


  const testZohoTrackingIntegration = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/zoho/test-tracking-integration`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });

      const data = await response.json();

      if (data.success) {
        alert(`✅ Zoho tracking integration test successful!\n\nTest result: ${data.message}`);
        console.log('Test result details:', data.test_result);
      } else {
        alert(`❌ Zoho tracking test failed: ${data.message}`);
      }
    } catch (error) {
      console.error('Error testing Zoho integration:', error);
      alert('Error testing Zoho integration. Check console for details.');
    }
  };

  // Get tracking summary from Zoho
  const getZohoTrackingSummary = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/zoho/get-tracking-summary`, {
        method: 'GET',
        credentials: 'include'
      });

      const data = await response.json();

      if (data.success) {
        const summary = data.summary;
        let alertMessage = `📊 Zoho Tracking Summary\n\n`;
        alertMessage += `Total Tracked Leads: ${summary.total_tracked_leads}\n\n`;
        alertMessage += `Leads by Status:\n`;
        Object.entries(summary.leads_by_status).forEach(([status, count]) => {
          alertMessage += `• ${status}: ${count}\n`;
        });

        alert(alertMessage);
        return data;
      } else {
        alert(`Failed to get tracking summary: ${data.message}`);
        return null;
      }
    } catch (error) {
      console.error('Error getting tracking summary:', error);
      alert('Error getting tracking summary. Check console for details.');
      return null;
    }
  };

  // Check if emails already exist as leads in Zoho
  const checkEmailsInZoho = async (emails) => {
    try {
      const response = await fetch(`${API_BASE_URL}/zoho/get-leads-by-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ emails })
      });

      const data = await response.json();

      if (data.success) {
        console.log('Leads found in Zoho:', data);
        return data;
      } else {
        console.error('Error checking emails in Zoho:', data.message);
        return null;
      }
    } catch (error) {
      console.error('Error checking emails in Zoho:', error);
      return null;
    }
  };


  return (
    <div className="email-tracking-tab">
      {/* Header */}
      <div className="tab-header">
        <h1>Email Tracking & Automated Follow-ups</h1>
        <p>Monitor email responses and automate follow-up campaigns for non-responders</p>
      </div>

      {/* Custom Tab Navigation */}
      <div className="custom-tab-navigation">
        <TabButton
          active={activeSubTab === "tracking"}
          onClick={() => setActiveSubTab("tracking")}
          icon={FiBarChart2}
          title="Email Tracking"
          subtitle="Monitor responses & follow-ups"
        />
        <TabButton
          active={activeSubTab === "auto-reply"}
          onClick={() => setActiveSubTab("auto-reply")}
          icon={FiMessageSquare}
          title="Auto Reply"
          subtitle="AI-powered responses"
        />
      </div>

      {/* Conditionally render content based on active subtab */}
      {activeSubTab === "tracking" ? (
        <>
          {/* ========== CAMPAIGN HISTORY - FIRST CARD ========== */}
          <div className="card">
            <div className="card-header">
              <div className="card-icon-wrapper">
                <FiDatabase className="card-main-icon" />
              </div>
              <h3>Campaign History</h3>
              <button
                onClick={fetchCampaigns}
                className="btn btn-secondary"
                disabled={loading.campaigns}
              >
                {loading.campaigns ? (
                  <div className="loading-spinner"></div>
                ) : (
                  <FiRefreshCw />
                )}
                Refresh
              </button>
            </div>
            <div className="card-content">
              {loading.campaigns ? (
                <div className="loading-state">
                  <div className="loading-spinner"></div>
                  <p>Loading campaigns...</p>
                </div>
              ) : campaigns.length === 0 ? (
                <div className="empty-state">
                  <FiFileText size={48} style={{ marginBottom: '10px', opacity: 0.5 }} />
                  <p>No campaigns found. Send some emails first!</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="tracking-table">
                    <thead>
                      <tr>
                        <th>Campaign Name</th>
                        <th>Status</th>
                        <th>File</th>
                        <th>Total</th>
                        <th>Replied</th>
                        <th>Bounced</th>
                        <th>Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((campaign) => (
                        <tr
                          key={campaign.campaign_id || campaign.id}
                          className={selectedCampaign?.campaign_id === campaign.campaign_id ? 'selected-row' : ''}
                        >
                          <td>
                            <strong>{campaign.campaign_name || 'Unnamed Campaign'}</strong>
                          </td>
                          <td>
                            <span
                              className="campaign-status"
                              style={{ backgroundColor: getCampaignStatusColor(campaign.status) }}
                            >
                              {campaign.status || 'unknown'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <FiFileText size={14} />
                              {campaign.recipient_file || campaign.original_filename || campaign.file_name || (campaign.campaign_name ? (campaign.campaign_name.includes(' | ') ? campaign.campaign_name.split(' | ')[0] : (campaign.campaign_name.toLowerCase().includes('.csv') ? campaign.campaign_name.split('_')[0] : 'recipients.csv')) : 'recipients.csv')}
                            </div>
                          </td>
                          <td>
                            <strong>{campaign.total_recipients || campaign.tracked_emails || 0}</strong>
                          </td>
                          <td>
                            <span style={{ color: '#10b981', fontWeight: '700' }}>
                              {campaign.replied_count || 0}
                            </span>
                          </td>
                          <td>
                            <span style={{ color: '#ef4444', fontWeight: '700' }}>
                              {campaign.bounced_count || 0}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <FiCalendar size={14} />
                              {formatDate(campaign.started_at || campaign.created_at)}
                            </div>
                          </td>
                          <td>
                            <button
                              onClick={() => viewCampaignDetails(campaign)}
                              className="btn btn-secondary"
                              style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedCampaign && (
                <div className="selected-campaign-actions">
                  <button onClick={viewAllTracking} className="btn btn-secondary">
                    <FiX /> View All Campaigns
                  </button>
                  <span>Viewing: <strong>{selectedCampaign.campaign_name}</strong></span>
                </div>
              )}
            </div>
          </div>

          {/* ========== IMAP CONFIGURATION - SECOND CARD ========== */}
          <div className="card">
            <div className="card-header">
              <div className="card-icon-wrapper">
                <FiSettings className="card-main-icon" />
              </div>
              <h3>IMAP Configuration</h3>
            </div>
            <div className="card-content">
              <div className="form-grid">
                <div className="form-group">
                  <label>Gmail Address:</label>
                  <input
                    type="email"
                    value={imapConfig.gmail_address}
                    onChange={(e) => setImapConfig({ ...imapConfig, gmail_address: e.target.value })}
                    placeholder="your.email@gmail.com"
                  />
                </div>

                <div className="form-group">
                  <label>App Password:</label>
                  <input
                    type="password"
                    value={imapConfig.app_password}
                    onChange={(e) => setImapConfig({ ...imapConfig, app_password: e.target.value })}
                    placeholder="16-digit app password"
                  />
                </div>

                <div className="form-group">
                  <label>No-Reply Threshold (days):</label>
                  <input
                    type="number"
                    value={imapConfig.no_reply_days}
                    onChange={(e) => setImapConfig({ ...imapConfig, no_reply_days: parseInt(e.target.value) || 7 })}
                    min="1"
                    max="30"
                  />
                </div>
              </div>

              <div className="actions-grid enhanced-actions">
                <button onClick={saveImapConfig} className="btn btn-secondary">
                  <FiCheckCircle /> Save Configuration
                </button>

                <button onClick={clearCredentials} className="btn btn-secondary" title="Clear saved email credentials">
                  <FiTrash2 /> Clear Credentials
                </button>

                <button
                  onClick={checkEmails}
                  disabled={loading.checking || !imapConfig.gmail_address || !imapConfig.app_password}
                  className="btn btn-primary"
                  title="Check for replies, bounces, and auto-responses"
                >
                  {loading.checking ? (
                    <>
                      <div className="loading-spinner"></div>
                      Checking Emails...
                    </>
                  ) : (
                    <>
                      <FiMail /> Check Emails Now
                    </>
                  )}
                </button>

                <button
                  onClick={classifyEmails}
                  disabled={loading.classifying}
                  className="btn btn-secondary"
                  title="Classify emails into categories"
                >
                  {loading.classifying ? (
                    <div className="loading-spinner"></div>
                  ) : (
                    <FiFilter />
                  )}
                  Classify Emails
                </button>

                <button
                  onClick={checkBouncesEnhanced}
                  disabled={loading.checking || !imapConfig.gmail_address || !imapConfig.app_password}
                  className="btn btn-warning"
                  title="Enhanced bounce detection with recommendations"
                >
                  {loading.checking ? (
                    <div className="loading-spinner"></div>
                  ) : (
                    <FiAlertTriangle />
                  )}
                  Check Bounces
                </button>

                <button
                  onClick={refreshAllData}
                  disabled={loading.tracking || loading.campaigns}
                  className="btn btn-secondary"
                >
                  {loading.tracking || loading.campaigns ? (
                    <>
                      <div className="loading-spinner"></div>
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <FiRefreshCw /> Refresh All
                    </>
                  )}
                </button>

                <button
                  onClick={processFollowUpsNow}
                  className="btn btn-info"
                  title="Process follow-ups immediately"
                >
                  <FiPlay /> Process Follow-ups
                </button>
              </div>
            </div>
          </div>

          {/* ========== FOLLOW-UP CAMPAIGNS - THIRD CARD ========== */}
          {followUpCampaigns.length > 0 && (
            <div className="card">
              <div className="card-header">
                <div className="card-icon-wrapper">
                  <FiSend className="card-main-icon" />
                </div>
                <h3>Follow-up Campaigns</h3>
                <button
                  onClick={fetchFollowUpCampaigns}
                  className="btn btn-secondary"
                  disabled={loading.followUp}
                >
                  {loading.followUp ? (
                    <div className="loading-spinner"></div>
                  ) : (
                    <FiRefreshCw />
                  )}
                  Refresh
                </button>
              </div>
              <div className="card-content">
                <div className="campaigns-grid">
                  {followUpCampaigns.map((campaign) => (
                    <div key={campaign.id} className="campaign-card">
                      <div className="campaign-header">
                        <h4>{campaign.follow_up_name}</h4>
                        <span
                          className="campaign-status"
                          style={{ backgroundColor: getCampaignStatusColor(campaign.status) }}
                        >
                          {campaign.status || 'scheduled'}
                        </span>
                      </div>

                      <div className="campaign-file">
                        <FiFileText size={14} />
                        Original: {campaign.original_campaign_name || 'N/A'}
                      </div>

                      <div className="campaign-stats">
                        <div className="stat">
                          <span className="stat-value">{campaign.total_follow_ups || 0}</span>
                          <span className="stat-label">Total</span>
                        </div>
                        <div className="stat">
                          <span className="stat-value" style={{ color: '#10b981' }}>
                            {campaign.sent_count || 0}
                          </span>
                          <span className="stat-label">Sent</span>
                        </div>
                        <div className="stat">
                          <span className="stat-value" style={{ color: '#ef4444' }}>
                            {campaign.failed_count || 0}
                          </span>
                          <span className="stat-label">Failed</span>
                        </div>
                      </div>

                      <div className="campaign-date">
                        <FiCalendar size={14} />
                        {formatDate(campaign.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========== STATISTICS - FOURTH CARD ========== */}
          <div className="card">
            <div className="card-header">
              <div className="card-icon-wrapper">
                <FiBarChart2 className="card-main-icon" />
              </div>
              <h3>
                Email Statistics
                {selectedCampaign && ` - ${selectedCampaign.campaign_name}`}
              </h3>
              <button
                onClick={fetchTrackingData}
                className="btn btn-secondary"
                disabled={loading.tracking}
              >
                {loading.tracking ? (
                  <div className="loading-spinner"></div>
                ) : (
                  <FiRefreshCw />
                )}
                Refresh
              </button>
            </div>
            <div className="card-content">
              <div className="stats-grid">
                <div className="stats-card total-stats">
                  <div className="stats-value">{stats.total}</div>
                  <div className="stats-label">Total Emails</div>
                </div>
                <div className="stats-card status-sent">
                  <div className="stats-value">{stats.sent}</div>
                  <div className="stats-label">Sent</div>
                </div>
                <div className="stats-card status-replied">
                  <div className="stats-value">{stats.replied}</div>
                  <div className="stats-label">Replied</div>
                </div>
                <div className="stats-card status-auto_reply">
                  <div className="stats-value">{stats.auto_reply}</div>
                  <div className="stats-label">Auto-Reply</div>
                </div>
                <div className="stats-card status-hard_bounce">
                  <div className="stats-value">{stats.hard_bounce}</div>
                  <div className="stats-label">Hard Bounce</div>
                </div>
                <div className="stats-card status-soft_bounce">
                  <div className="stats-value">{stats.soft_bounce}</div>
                  <div className="stats-label">Soft Bounce</div>
                </div>
                <div className="stats-card status-no_reply">
                  <div className="stats-value">{stats.no_reply}</div>
                  <div className="stats-label">No Reply</div>
                </div>
              </div>

              {/* Bounce Summary */}
              {(stats.hard_bounce > 0 || stats.soft_bounce > 0) && (
                <div className="bounce-summary">
                  <h4>Bounce Summary</h4>
                  <div className="bounce-details">
                    {stats.hard_bounce > 0 && (
                      <div className="bounce-item hard-bounce">
                        <FiAlertTriangle /> {stats.hard_bounce} Hard Bounces (email doesn't exist)
                      </div>
                    )}
                    {stats.soft_bounce > 0 && (
                      <div className="bounce-item soft-bounce">
                        <FiInfo /> {stats.soft_bounce} Soft Bounces (temporary issues)
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ========== TRACKING DATA TABLE - FIFTH CARD ========== */}
          <div className="card">
            <div className="card-header">
              <div className="card-icon-wrapper">
                <FiMail className="card-main-icon" />
              </div>
              <h3>
                Email Tracking Details
                {selectedCampaign && ` - ${selectedCampaign.campaign_name}`}
              </h3>
              <div className="header-actions">
                <div className="filter-controls">
                  <FiFilter size={16} />
                  <select
                    value={filterStatus}
                    onChange={(e) => filterTrackingData(e.target.value)}
                    className="status-filter"
                  >
                    <option value="all">All Status</option>
                    <option value="sent">Sent</option>
                    <option value="replied">Replied</option>
                    <option value="auto_reply">Auto-Reply</option>
                    <option value="bounced">Bounced</option>
                    <option value="no_reply">No Reply</option>
                  </select>
                </div>

                {getFilteredTrackingData().length > 0 && (
                  <div className="download-actions">
                    <button
                      onClick={downloadTrackingData}
                      className="btn btn-secondary"
                      title="Download as CSV"
                    >
                      <FiDownload /> CSV
                    </button>
                    <button
                      onClick={downloadTrackingDataExcel}
                      className="btn btn-secondary"
                      title="Download as Excel XLSX"
                    >
                      <FiDownload /> XLSX
                    </button>
                    <button
                      onClick={sendAllTrackingToZoho}
                      className="btn btn-primary"
                      title="Send all tracking data to Zoho CRM"
                    >
                      <FiUpload /> Send All to Zoho
                    </button>
                  </div>
                )}

                {selectedRecipients.length > 0 && (
                  <div className="selection-actions">
                    <span className="selection-count">{selectedRecipients.length} selected</span>
                    <button
                      onClick={() => setShowImmediateFollowUpModal(true)}
                      className="btn btn-primary"
                    >
                      <FiSend /> Send Immediate Follow-up
                    </button>
                    <button onClick={clearSelection} className="btn btn-secondary">
                      <FiX /> Clear
                    </button>
                  </div>
                )}

                {getFilteredTrackingData().length > 0 && selectedRecipients.length === 0 && (
                  <div className="selection-actions">
                    <button onClick={selectAllFiltered} className="btn btn-secondary">
                      <FiCheckSquare /> Select All {filterStatus !== 'all' ? filterStatus : 'Filtered'}
                    </button>
                    {filterStatus === 'no_reply' && (
                      <button onClick={selectAllNoReply} className="btn btn-secondary">
                        <FiCheckSquare /> Select All No-Reply
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="card-content">
              {loading.tracking ? (
                <div className="loading-state">
                  <div className="loading-spinner"></div>
                  <p>Loading tracking data...</p>
                </div>
              ) : getFilteredTrackingData().length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="tracking-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>
                          <input
                            type="checkbox"
                            checked={isAllSelected()}
                            onChange={toggleSelectAll}
                          />
                        </th>
                        <th>Recipient Email</th>
                        <th>Recipient Name</th>
                        <th>Sender Email</th>
                        <th>Campaign</th>
                        <th>Sent Time</th>
                        <th>Status</th>
                        <th>Reply Time</th>
                        <th>Last Checked</th>
                        <th>Bounce Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getFilteredTrackingData().map((item) => (
                        <tr
                          key={item.id}
                          className={selectedRecipients.includes(item.recipient_email) ? 'selected-row' : ''}
                          onClick={() => handleRowSelection(item.recipient_email)}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedRecipients.includes(item.recipient_email)}
                              onChange={() => handleRowSelection(item.recipient_email)}
                            />
                          </td>
                          <td>{item.recipient_email}</td>
                          <td>{item.recipient_name || "N/A"}</td>
                          <td>{item.sender_email || "N/A"}</td>
                          <td>{item.campaign_name || "N/A"}</td>
                          <td>{formatDate(item.sent_time)}</td>
                          <td><StatusBadge status={item.status} bounce_type={item.bounce_type} /></td>
                          <td>{formatDate(item.reply_time)}</td>
                          <td>{formatDate(item.last_checked)}</td>
                          <td className="bounce-reason">
                            {item.bounce_reason || "N/A"}
                            {item.bounce_type === 'hard_bounce' && (
                              <span className="bounce-type-tag hard-bounce-tag">Hard Bounce</span>
                            )}
                            {item.bounce_type === 'soft_bounce' && (
                              <span className="bounce-type-tag soft-bounce-tag">Soft Bounce</span>
                            )}
                          </td>
                          <td>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                sendSingleTrackingToZoho(item);
                              }}
                              className="btn btn-primary btn-sm"
                              title="Store tracking in Zoho CRM"
                            >
                              <FiUpload /> Store in Zoho
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <p>
                    {filterStatus !== "all"
                      ? `No emails with status "${filterStatus}" found.`
                      : selectedCampaign
                        ? 'This campaign has no tracking data yet.'
                        : 'No email tracking data available. Send some emails first!'
                    }
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Follow-up Campaign Modal */}
          {showFollowUpModal && (
            <div className="modal-overlay">
              <div className="modal-content">
                <div className="modal-header">
                  <h3>Create Follow-up Campaign</h3>
                  <button onClick={() => setShowFollowUpModal(false)} className="btn btn-secondary">
                    <FiX />
                  </button>
                </div>
                <div className="modal-body">
                  <div className="form-group">
                    <label>Campaign Name:</label>
                    <input
                      type="text"
                      value={followUpData.name}
                      onChange={(e) => setFollowUpData({ ...followUpData, name: e.target.value })}
                      placeholder={`Follow-up for ${selectedCampaign?.campaign_name}`}
                    />
                  </div>

                  <div className="form-group">
                    <label>Subject:</label>
                    <input
                      type="text"
                      value={followUpData.subject}
                      onChange={(e) => setFollowUpData({ ...followUpData, subject: e.target.value })}
                      placeholder="Follow-up email subject"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Email Body:</label>
                    <textarea
                      value={followUpData.body}
                      onChange={(e) => setFollowUpData({ ...followUpData, body: e.target.value })}
                      placeholder="Follow-up email content"
                      rows="6"
                      required
                    />
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label>Sender Name:</label>
                      <input
                        type="text"
                        value={followUpData.sender_name}
                        onChange={(e) => setFollowUpData({ ...followUpData, sender_name: e.target.value })}
                        placeholder="Your Name"
                      />
                    </div>

                    <div className="form-group">
                      <label>Delay (days):</label>
                      <input
                        type="number"
                        value={followUpData.delay_days}
                        onChange={(e) => setFollowUpData({ ...followUpData, delay_days: parseInt(e.target.value) || 3 })}
                        min="1"
                        max="30"
                      />
                    </div>

                    <div className="form-group">
                      <label>Max Follow-ups:</label>
                      <input
                        type="number"
                        value={followUpData.max_follow_ups}
                        onChange={(e) => setFollowUpData({ ...followUpData, max_follow_ups: parseInt(e.target.value) || 3 })}
                        min="1"
                        max="10"
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button onClick={() => setShowFollowUpModal(false)} className="btn btn-secondary">
                    Cancel
                  </button>
                  <button onClick={createFollowUpCampaign} className="btn btn-primary">
                    <FiSend /> Create Follow-up Campaign
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Immediate Follow-up Modal */}
          {showImmediateFollowUpModal && (
            <div className="modal-overlay">
              <div className="modal-content">
                <div className="modal-header">
                  <h3>Send Immediate Follow-up</h3>
                  <button onClick={() => setShowImmediateFollowUpModal(false)} className="btn btn-secondary">
                    <FiX />
                  </button>
                </div>
                <div className="modal-body">
                  <div className="recipient-summary">
                    <strong>Sending to {selectedRecipients.length} recipients:</strong>
                    <div className="recipient-list">
                      {selectedRecipients.slice(0, 5).map(email => (
                        <span key={email} className="recipient-tag">{email}</span>
                      ))}
                      {selectedRecipients.length > 5 && (
                        <span className="recipient-tag">+{selectedRecipients.length - 5} more</span>
                      )}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Subject:</label>
                    <input
                      type="text"
                      value={immediateFollowUpData.subject}
                      onChange={(e) => setImmediateFollowUpData({ ...immediateFollowUpData, subject: e.target.value })}
                      placeholder="Follow-up email subject"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Email Body:</label>
                    <textarea
                      value={immediateFollowUpData.body}
                      onChange={(e) => setImmediateFollowUpData({ ...immediateFollowUpData, body: e.target.value })}
                      placeholder="Follow-up email content"
                      rows="6"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Sender Name:</label>
                    <input
                      type="text"
                      value={immediateFollowUpData.sender_name}
                      onChange={(e) => setImmediateFollowUpData({ ...immediateFollowUpData, sender_name: e.target.value })}
                      placeholder="Your Name"
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button onClick={() => setShowImmediateFollowUpModal(false)} className="btn btn-secondary">
                    Cancel
                  </button>
                  <button onClick={sendImmediateFollowUp} className="btn btn-primary">
                    <FiSend /> Send Immediate Follow-up
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Check Results Modal */}
          {showResultsModal && checkResults && (
            <div className="modal-overlay">
              <div className="modal-content results-modal" style={{ maxHeight: '90vh', overflowY: 'auto', maxWidth: '1200px' }}>
                <div className="modal-header" style={{ borderBottom: '2px solid #e5e7eb', paddingBottom: '15px' }}>
                  <h3 style={{ margin: '0', fontSize: '1.5rem', fontWeight: '600', color: '#1f2937' }}>Email Check Results</h3>
                  <button onClick={() => setShowResultsModal(false)} className="btn btn-secondary">
                    <FiX />
                  </button>
                </div>
                <div className="modal-body" style={{ padding: '25px' }}>
                  {/* Summary Cards */}
                  <div className="results-summary" style={{ marginBottom: '30px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <h4 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#111827', margin: 0 }}>Campaign Intelligence Summary</h4>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => downloadEmailResults('csv')} className="btn btn-secondary btn-sm"><FiDownload /> CSV</button>
                        <button onClick={() => downloadEmailResults('excel')} className="btn btn-secondary btn-sm"><FiDownload /> Excel</button>
                        <button onClick={() => downloadEmailResults('json')} className="btn btn-secondary btn-sm"><FiDownload /> JSON</button>
                      </div>
                    </div>

                    <p style={{ color: '#4b5563', marginBottom: '20px', fontSize: '0.95rem' }}>{checkResults.message}</p>

                    <div className="summary-grid" style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '20px',
                      marginBottom: '30px'
                    }}>
                      {/* Overall Campaign Stats */}
                      <div className="summary-stat-box" style={{ padding: '20px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <div style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', marginBottom: '10px' }}>Total Sent</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#0f172a' }}>{checkResults.stats?.total || 0}</div>
                      </div>

                      <div className="summary-stat-box" style={{ padding: '20px', borderRadius: '12px', background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                        <div style={{ color: '#059669', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', marginBottom: '10px' }}>Replies Received</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#065f46' }}>{checkResults.stats?.replied || 0}</div>
                        <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '5px' }}>+{checkResults.summary?.replies_found || 0} new</div>
                      </div>

                      <div className="summary-stat-box" style={{ padding: '20px', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca' }}>
                        <div style={{ color: '#dc2626', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', marginBottom: '10px' }}>Total Bounces</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#991b1b' }}>{checkResults.stats?.bounced || 0}</div>
                        <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '5px' }}>+{checkResults.summary?.bounces_found || 0} new ({checkResults.summary?.hard_bounces} hard)</div>
                      </div>

                      <div className="summary-stat-box" style={{ padding: '20px', borderRadius: '12px', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                        <div style={{ color: '#2563eb', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', marginBottom: '10px' }}>Auto-Replies</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#1e40af' }}>{checkResults.stats?.auto_reply || 0}</div>
                      </div>
                    </div>
                  </div>

                  {/* Detailed Email Results Table - Outlook Style */}
                  {checkResults.email_results && checkResults.email_results.length > 0 && (
                    <div className="results-table-section" style={{ marginBottom: '30px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <h4 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1f2937', margin: '0' }}>
                          Detailed Email Results ({checkResults.email_results.length})
                        </h4>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button
                            onClick={() => downloadEmailResults('csv')}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#10b981',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: '500',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                            title="Download as CSV"
                          >
                            <FiDownload /> CSV
                          </button>
                          <button
                            onClick={() => downloadEmailResults('excel')}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#3b82f6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: '500',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                            title="Download as Excel"
                          >
                            <FiDownload /> Excel
                          </button>
                          <button
                            onClick={() => downloadEmailResults('json')}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#8b5cf6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: '500',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                            title="Download as JSON"
                          >
                            <FiDownload /> JSON
                          </button>
                        </div>
                      </div>

                      {/* Outlook-Style Email List */}
                      <div style={{
                        backgroundColor: 'white',
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        overflow: 'hidden',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                      }}>
                        {checkResults.email_results.map((result, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: '16px',
                              borderBottom: idx < checkResults.email_results.length - 1 ? '1px solid #e5e7eb' : 'none',
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr 1fr',
                              gap: '16px',
                              alignItems: 'center',
                              backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb',
                              transition: 'backgroundColor 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#ffffff' : '#f9fafb'}
                          >
                            {/* Email Column */}
                            <div>
                              <div style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '500', marginBottom: '4px' }}>EMAIL</div>
                              <div style={{ fontSize: '14px', fontWeight: '500', color: '#1f2937', wordBreak: 'break-word' }}>
                                {result.recipient_email || result.email || 'N/A'}
                              </div>
                            </div>

                            {/* Status Column */}
                            <div>
                              <div style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '500', marginBottom: '4px' }}>STATUS</div>
                              <div>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  backgroundColor: result.status === 'replied' ? '#d1fae5' :
                                    result.status === 'bounced' ? '#fee2e2' :
                                      result.status === 'no_reply' ? '#fef3c7' : '#dbeafe',
                                  color: result.status === 'replied' ? '#065f46' :
                                    result.status === 'bounced' ? '#991b1b' :
                                      result.status === 'no_reply' ? '#92400e' : '#0c4a6e'
                                }}>
                                  {result.status ? result.status.charAt(0).toUpperCase() + result.status.slice(1).replace('_', ' ') : 'Sent'}
                                </span>
                              </div>
                            </div>

                            {/* Details Column */}
                            <div>
                              <div style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '500', marginBottom: '4px' }}>DETAILS</div>
                              <div style={{ fontSize: '13px', color: '#4b5563', lineHeight: '1.4' }}>
                                {result.bounce_type && (
                                  <div>🔴 Type: {result.bounce_type.replace('_', ' ')}</div>
                                )}
                                {result.bounce_reason && (
                                  <div style={{ marginTop: '4px' }}>📝 {result.bounce_reason.substring(0, 50)}</div>
                                )}
                                {result.last_checked && (
                                  <div style={{ marginTop: '4px', color: '#9ca3af', fontSize: '12px' }}>
                                    🕐 {new Date(result.last_checked).toLocaleDateString()} {new Date(result.last_checked).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommendations */}
                  {checkResults.recommendations && checkResults.recommendations.length > 0 && (
                    <div className="results-recommendations" style={{ marginBottom: '30px' }}>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1f2937', marginBottom: '15px' }}>Recommendations</h4>
                      {checkResults.recommendations.map((rec, index) => (
                        <div
                          key={index}
                          style={{
                            padding: '15px',
                            marginBottom: '10px',
                            borderRadius: '8px',
                            backgroundColor: rec.type === 'warning' ? '#fef3c7' : rec.type === 'error' ? '#fee2e2' : '#dbeafe',
                            borderLeft: `4px solid ${rec.type === 'warning' ? '#f59e0b' : rec.type === 'error' ? '#ef4444' : '#3b82f6'}`,
                            display: 'flex',
                            gap: '12px'
                          }}
                        >
                          <div style={{ fontSize: '20px', marginTop: '2px' }}>
                            {rec.type === 'warning' ? '⚠️' : rec.type === 'error' ? '❌' : 'ℹ️'}
                          </div>
                          <div>
                            <div style={{ fontWeight: '600', color: '#1f2937', marginBottom: '4px' }}>{rec.message}</div>
                            <div style={{ fontSize: '13px', color: '#6b7280' }}>→ {rec.action}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Statistics */}
                  {checkResults.stats && (
                    <div className="results-stats" style={{ backgroundColor: '#f9fafb', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1f2937', marginBottom: '15px', margin: '0 0 15px 0' }}>
                        Overall Statistics
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
                        {[
                          { label: 'Total', value: checkResults.stats.total, color: '#6b7280' },
                          { label: 'Sent', value: checkResults.stats.sent, color: '#3b82f6' },
                          { label: 'Replied', value: checkResults.stats.replied, color: '#10b981' },
                          { label: 'Auto-Reply', value: checkResults.stats.auto_reply, color: '#f59e0b' },
                          { label: 'Bounced', value: checkResults.stats.bounced, color: '#ef4444' },
                          { label: 'No Reply', value: checkResults.stats.no_reply, color: '#eab308' }
                        ].map((stat, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: '12px',
                              backgroundColor: 'white',
                              borderRadius: '6px',
                              border: '1px solid #e5e7eb',
                              textAlign: 'center'
                            }}
                          >
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: stat.color }}>
                              {stat.value}
                            </div>
                            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                              {stat.label}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="modal-footer" style={{ borderTop: '1px solid #e5e7eb', padding: '15px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button onClick={() => setShowResultsModal(false)} className="btn btn-primary" style={{
                    padding: '10px 20px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <AutoReplyTab />
      )}
    </div>
  );
}


export default EmailTrackingTab;




