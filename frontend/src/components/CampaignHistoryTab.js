import React, { useState, useEffect } from 'react';
import {
    FiPlus,
    FiMinus,
    FiClock,
    FiMail,
    FiUser,
    FiFileText,
    FiCheckCircle,
    FiAlertCircle,
    FiLoader,
    FiRefreshCw,
    FiMessageSquare,
    FiDownload,
    FiEye,
    FiChevronLeft,
    FiChevronRight,
    FiChevronDown,
    FiChevronUp,
    FiX,
    FiSearch
} from 'react-icons/fi';
import './CampaignHistoryTab.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const CampaignHistoryTab = () => {
    const [expandedCampaignId, setExpandedCampaignId] = useState(null);
    const [expandedSenderId, setExpandedSenderId] = useState(null);
    const [campaignData, setCampaignData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isCheckingBounces, setIsCheckingBounces] = useState(false);

    // IMAP Configuration State
    const [imapConfig, setImapConfig] = useState({
        server: 'imap.gmail.com',
        port: '993',
        email: '',
        password: ''
    });
    const [savedImapAccounts, setSavedImapAccounts] = useState([]);
    const [isEditingImap, setIsEditingImap] = useState(false);
    const [editingImapIndex, setEditingImapIndex] = useState(null);
    const [isImapExpanded, setIsImapExpanded] = useState(false);

    const [totalReplies, setTotalReplies] = useState(0);
    const [notification, setNotification] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Modal state
    const [recipientsModal, setRecipientsModal] = useState({
        open: false,
        loading: false,
        data: [],
        total: 0,
        page: 1,
        campaignId: null,
        senderEmail: null
    });
    const [contentModal, setContentModal] = useState({
        open: false,
        loading: false,
        subject: '',
        body: ''
    });
    const [replyModal, setReplyModal] = useState({
        open: false,
        recipient: '',
        replies: []
    });

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const campaignsPerPage = 10;

    const fetchCampaignHistory = async (isBackground = false) => {
        if (!isBackground) setLoading(true);
        if (isBackground) setIsRefreshing(true);
        try {
            const response = await fetch(`${API_BASE_URL}/tracking/campaign-history-nested`, {
                credentials: 'include'
            });
            const data = await response.json();
            if (response.ok) {
                // Check if there are new replies to show a notification
                const oldReplyCount = campaignData.reduce((acc, c) => acc + (c.repliedCount || 0), 0);
                const newReplyCount = data.reduce((acc, c) => acc + (c.repliedCount || 0), 0);

                if (newReplyCount > oldReplyCount && isBackground) {
                    const diff = newReplyCount - oldReplyCount;
                    setNotification({
                        count: diff,
                        message: `${diff} new repl${diff > 1 ? 'ies' : 'y'} detected across your campaigns!`
                    });
                    // Auto-hide after 10 seconds
                    setTimeout(() => setNotification(null), 10000);
                }

                setCampaignData(data);
                setError(null);
            } else {
                setError(data.error || 'Failed to fetch campaign history');
            }
        } catch (err) {
            setError('Connection error. Please check if backend is running.');
            console.error('Fetch error:', err);
        } finally {
            if (!isBackground) setLoading(false);
            if (isBackground) setIsRefreshing(false);
        }
    };

    // Load saved IMAP accounts from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('imapAccounts');
        if (saved) {
            setSavedImapAccounts(JSON.parse(saved));
        }
    }, []);

    const handleSaveImapAccount = () => {
        if (!imapConfig.email || !imapConfig.password) {
            setNotification({
                count: 0,
                message: 'Please enter email and password.',
                type: 'warning'
            });
            setTimeout(() => setNotification(null), 3000);
            return;
        }

        let updatedAccounts;
        if (editingImapIndex !== null) {
            // Update existing account
            updatedAccounts = [...savedImapAccounts];
            updatedAccounts[editingImapIndex] = { ...imapConfig };
        } else {
            // Add new account
            updatedAccounts = [...savedImapAccounts, { ...imapConfig }];
        }

        setSavedImapAccounts(updatedAccounts);
        localStorage.setItem('imapAccounts', JSON.stringify(updatedAccounts));
        
        // Reset form
        setImapConfig({ server: 'imap.gmail.com', port: '993', email: '', password: '' });
        setIsEditingImap(false);
        setEditingImapIndex(null);

        setNotification({
            count: 0,
            message: 'IMAP account saved successfully!',
            type: 'success'
        });
        setTimeout(() => setNotification(null), 3000);
    };

    const handleEditImapAccount = (index) => {
        setImapConfig({ ...savedImapAccounts[index] });
        setIsEditingImap(true);
        setEditingImapIndex(index);
    };

    const handleDeleteImapAccount = (index) => {
        const updatedAccounts = savedImapAccounts.filter((_, i) => i !== index);
        setSavedImapAccounts(updatedAccounts);
        localStorage.setItem('imapAccounts', JSON.stringify(updatedAccounts));
        
        setNotification({
            count: 0,
            message: 'IMAP account deleted.',
            type: 'success'
        });
        setTimeout(() => setNotification(null), 3000);
    };

    const handleCancelImapEdit = () => {
        setImapConfig({ server: 'imap.gmail.com', port: '993', email: '', password: '' });
        setIsEditingImap(false);
        setEditingImapIndex(null);
    };

    const checkBounces = async () => {
        // Use saved accounts or current form values
        const accountsToCheck = savedImapAccounts.length > 0 ? savedImapAccounts : 
            (imapConfig.email && imapConfig.password) ? [imapConfig] : [];

        if (accountsToCheck.length === 0) {
            setNotification({
                count: 0,
                message: 'Please save at least one IMAP account to check bounces.',
                type: 'warning'
            });
            setTimeout(() => setNotification(null), 5000);
            return;
        }

        setIsCheckingBounces(true);
        try {
            // Send all accounts in a single request
            const response = await fetch(`${API_BASE_URL}/tracking/check-bounces-detailed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ 
                    sender_accounts: accountsToCheck.map(account => ({
                        email: account.email,
                        password: account.password,
                        imap_server: account.server || 'imap.gmail.com',
                        imap_port: parseInt(account.port) || 993
                    }))
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to check bounces');
            }

            const totalBounces = data.bounced_emails?.length || 0;
            const hardBounces = data.bounce_summary?.hard_bounce || 0;
            const softBounces = data.bounce_summary?.soft_bounce || 0;
            const totalReplies = data.replied_emails?.length || 0;
            const repliesUpdated = data.reply_updated_count || 0;

            const parts = [];
            if (totalBounces > 0) {
                parts.push(`Bounces: ${totalBounces} (hard ${hardBounces}, soft ${softBounces})`);
            }
            if (totalReplies > 0) {
                parts.push(`Customer replies: ${totalReplies}${repliesUpdated ? ` (updated ${repliesUpdated})` : ''}`);
            }

            if (parts.length === 0) {
                setNotification({
                    count: 0,
                    message: 'No bounced emails or new replies found. Mailbox is clear.',
                    type: 'success'
                });
            } else {
                setNotification({
                    count: totalBounces + totalReplies,
                    message: parts.join(' | '),
                    type: totalBounces > 0 ? 'warning' : 'info'
                });
            }
            setTimeout(() => setNotification(null), 10000);

            // Refresh campaign data to show updated bounce/reply counts
            fetchCampaignHistory(true);
        } catch (err) {
            console.error('Bounce check error:', err);
            setNotification({
                count: 0,
                message: `Error checking bounces: ${err.message}`,
                type: 'error'
            });
            setTimeout(() => setNotification(null), 8000);
        } finally {
            setIsCheckingBounces(false);
        }
    };

    useEffect(() => {
        fetchCampaignHistory();
    }, []);

    // Filter campaigns based on search
    const filteredCampaigns = campaignData.filter(campaign =>
        (campaign.campaignName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (campaign.fileName || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Track total replies to show notifications
    useEffect(() => {
        if (campaignData.length === 0) return;

        const currentTotal = campaignData.reduce((acc, c) => acc + (c.repliedCount || 0), 0);

        // Only show notification if totalReplies was already set (not first load)
        if (totalReplies > 0 && currentTotal > totalReplies) {
            const diff = currentTotal - totalReplies;
            setNotification({
                message: `You received ${diff} new repl${diff > 1 ? 'ies' : 'y'}!`,
                count: diff
            });

            // Play a subtle sound if possible or just show the toast
            // Auto hide after 10 seconds
            const timer = setTimeout(() => setNotification(null), 10000);
            return () => clearTimeout(timer);
        }

        if (currentTotal !== totalReplies) {
            setTotalReplies(currentTotal);
        }
    }, [campaignData, totalReplies]);

    const toggleCampaign = (campaignId) => {
        if (expandedCampaignId === campaignId) {
            setExpandedCampaignId(null);
            setExpandedSenderId(null);
        } else {
            setExpandedCampaignId(campaignId);
            setExpandedSenderId(null);
        }
    };

    const toggleSender = (senderId) => {
        if (expandedSenderId === senderId) {
            setExpandedSenderId(null);
        } else {
            setExpandedSenderId(senderId);
        }
    };

    const fetchRecipients = async (campaignId, senderEmail, page = 1) => {
        setRecipientsModal(prev => ({ ...prev, open: true, loading: true, page, campaignId, senderEmail }));
        try {
            const queryParams = new URLSearchParams({
                campaignId,
                page,
                pageSize: 10
            });
            if (senderEmail) queryParams.append('senderEmail', senderEmail);

            const response = await fetch(`${API_BASE_URL}/tracking/campaign-recipients?${queryParams}`, {
                credentials: 'include'
            });

            if (!response.ok) throw new Error('Failed to fetch recipients');
            const data = await response.json();
            setRecipientsModal(prev => ({
                ...prev,
                loading: false,
                data: data.recipients || [],
                total: data.totalCount || 0
            }));
        } catch (err) {
            console.error('Error fetching recipients:', err);
            setRecipientsModal(prev => ({ ...prev, loading: false }));
        }
    };

    const fetchEmailContent = async (campaignId) => {
        setContentModal(prev => ({ ...prev, open: true, loading: true }));
        try {
            const response = await fetch(`${API_BASE_URL}/tracking/campaign-email-content?campaignId=${campaignId}`, {
                credentials: 'include'
            });
            if (!response.ok) throw new Error('Failed to fetch email content');
            const data = await response.json();
            setContentModal(prev => ({
                ...prev,
                loading: false,
                subject: data.subject,
                body: data.body
            }));
        } catch (err) {
            console.error('Error fetching content:', err);
            setContentModal(prev => ({ ...prev, loading: false }));
        }
    };

    const downloadCSV = (campaignId, senderEmail = null) => {
        const queryParams = new URLSearchParams({ campaignId });
        if (senderEmail) queryParams.append('senderEmail', senderEmail);
        window.location.href = `${API_BASE_URL}/tracking/download-recipients?${queryParams}`;
    };

    const getStatusIcon = (status) => {
        const s = status ? status.toLowerCase() : '';
        if (s === 'completed') return <FiCheckCircle className="status-icon completed" />;
        if (s === 'pending' || s === 'running') return <FiLoader className="status-icon pending spinning" />;
        if (s === 'failed') return <FiAlertCircle className="status-icon failed" />;
        return null;
    };

    const parseReplyMessage = (message) => {
        if (!message) return 'No reply content available.';
        
        // Split message into lines
        const lines = message.split('\n');
        const customerReply = [];
        
        let inQuotedSection = false;
        
        for (let line of lines) {
            const trimmedLine = line.trim();
            
            // Skip email header lines (On ... wrote:)
            if (trimmedLine.match(/^On .+wrote:$/)) {
                inQuotedSection = true;
                continue;
            }
            
            // Count the number of > symbols at the start
            const quoteMatch = trimmedLine.match(/^(>+)\s*/);
            const quoteLevel = quoteMatch ? quoteMatch[1].length : 0;
            
            // Only include customer's reply (no quotes or single > quote)
            // Skip our original email (>> or more)
            if (quoteLevel >= 2) {
                // This is our original email or deeper quotes, skip it
                continue;
            }
            
            if (quoteLevel === 1) {
                // Single > means customer's quoted reply
                const quotedText = trimmedLine.replace(/^>\s*/, '').trim();
                if (quotedText && !quotedText.match(/^On .+wrote:$/)) {
                    customerReply.push(quotedText);
                }
            } else if (!inQuotedSection && trimmedLine) {
                // Direct reply from customer (before any quoted sections)
                customerReply.push(trimmedLine);
            }
        }
        
        // Combine all customer replies
        const cleanReply = customerReply.join('\n').trim();
        
        return cleanReply || 'No content';
    };
    
    const formatReplyTime = (timeString) => {
        if (!timeString) return 'N/A';
        try {
            const date = new Date(timeString);
            return date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        } catch {
            return timeString;
        }
    };

    const formatCampaignDate = (dateString) => {
        if (!dateString) return 'N/A';
        try {
            const date = new Date(dateString);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = String(date.getFullYear()).slice(-2);
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${day}-${month}-${year} ${hours}:${minutes}`;
        } catch {
            return dateString;
        }
    };

    const handleViewReply = async (recipient) => {
        try {
            // Get campaign ID from the recipients modal context
            const campaignId = recipientsModal.campaignId;
            
            if (!campaignId) {
                throw new Error('Campaign ID not found');
            }
            
            // Fetch all replies for this recipient
            const response = await fetch(
                `${API_BASE_URL}/tracking/recipient-replies?campaignId=${campaignId}&recipientEmail=${recipient.recipient_email}`,
                { credentials: 'include' }
            );
            
            if (!response.ok) {
                throw new Error('Failed to fetch replies');
            }
            
            const data = await response.json();
            const replies = data.replies || [];
            
            // Parse each reply message
            const parsedReplies = replies.map(reply => ({
                message: parseReplyMessage(reply.reply_message),
                time: formatReplyTime(reply.reply_time),
                subject: reply.reply_subject
            }));
            
            // Fallback to single reply from tracking if no replied_users data
            if (parsedReplies.length === 0 && recipient.reply_message) {
                parsedReplies.push({
                    message: parseReplyMessage(recipient.reply_message),
                    time: formatReplyTime(recipient.reply_time),
                    subject: null
                });
            }
            
            setReplyModal({
                open: true,
                recipient: recipient.recipient_email,
                replies: parsedReplies
            });
        } catch (error) {
            console.error('Error fetching replies:', error);
            // Fallback to single reply from recipient data
            const parsedMessage = parseReplyMessage(recipient.reply_message);
            setReplyModal({
                open: true,
                recipient: recipient.recipient_email,
                replies: [{
                    message: parsedMessage,
                    time: formatReplyTime(recipient.reply_time),
                    subject: null
                }]
            });
        }
    };

    // Reset page when search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    return (
        <div className="campaign-history-container">
            {/* New Reply Notification Pop-up */}
            {notification && (
                <div className="reply-notification-popup">
                    <div className="notif-icon-wrapper">
                        <FiMessageSquare />
                        <span className="notif-badge">{notification.count}</span>
                    </div>
                    <div className="notif-content">
                        <h4>New Interaction!</h4>
                        <p>{notification.message}</p>
                    </div>
                    <button className="notif-close-btn" onClick={() => setNotification(null)}>
                        <FiX />
                    </button>
                </div>
            )}

            {/* IMAP Configuration Form */}
            <div className="imap-config-card">
                <div className="imap-header" onClick={() => setIsImapExpanded(!isImapExpanded)} style={{ cursor: 'pointer' }}>
                    <div className="imap-title">
                        <FiMail className="imap-icon" />
                        <h3>IMAP Configuration for Bounce Checking</h3>
                    </div>
                    <div className="imap-expand-icon">
                        {isImapExpanded ? <FiChevronUp size={20} /> : <FiChevronDown size={20} />}
                    </div>
                </div>
                
                {isImapExpanded && (
                <div className="imap-form">
                    {/* Saved IMAP Accounts List */}
                    {savedImapAccounts.length > 0 && (
                        <div className="saved-accounts-section">
                            <h4>Saved IMAP Accounts</h4>
                            <div className="saved-accounts-list">
                                {savedImapAccounts.map((account, index) => (
                                    <div key={index} className="saved-account-item">
                                        <div className="account-info">
                                            <FiMail className="account-icon" />
                                            <span className="account-email">{account.email}</span>
                                        </div>
                                        <div className="account-actions">
                                            <button 
                                                className="account-action-btn edit"
                                                onClick={() => handleEditImapAccount(index)}
                                                title="Edit"
                                            >
                                                <FiFileText />
                                            </button>
                                            <button 
                                                className="account-action-btn delete"
                                                onClick={() => handleDeleteImapAccount(index)}
                                                title="Delete"
                                            >
                                                <FiX />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Add/Edit Form */}
                    <div className="imap-form-fields">
                        <h4>{isEditingImap ? 'Edit IMAP Account' : 'Add IMAP Account'}</h4>
                        <div className="imap-row">
                            <div className="imap-field">
                                <label>Email Address</label>
                                <input
                                    type="email"
                                    placeholder="your-email@gmail.com"
                                    value={imapConfig.email}
                                    onChange={(e) => setImapConfig({ ...imapConfig, email: e.target.value })}
                                />
                            </div>
                            <div className="imap-field">
                                <label>App Password</label>
                                <input
                                    type="password"
                                    placeholder="Enter app password"
                                    value={imapConfig.password}
                                    onChange={(e) => setImapConfig({ ...imapConfig, password: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="imap-helper-text">
                            <FiAlertCircle /> 
                            <span>For Gmail, use an App Password. Go to Google Account → Security → 2-Step Verification → App Passwords</span>
                        </div>
                        <div className="imap-form-buttons">
                            <button 
                                className="imap-save-btn"
                                onClick={handleSaveImapAccount}
                            >
                                <FiCheckCircle /> {isEditingImap ? 'Update Account' : 'Save Account'}
                            </button>
                            {isEditingImap && (
                                <button 
                                    className="imap-cancel-btn"
                                    onClick={handleCancelImapEdit}
                                >
                                    <FiX /> Cancel
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                )}
            </div>

            <div className="history-header">
                <div>
                    <h2>Campaign History</h2>
                    <p style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        Track your email campaign performance
                        <span className="total-campaigns-pill">
                            Total Brands/Campaigns: <strong>{campaignData.length}</strong>
                        </span>
                    </p>
                </div>
                <div className="header-actions">
                    <div className="search-wrapper">
                        <FiSearch className="search-icon" />
                        <input
                            type="text"
                            placeholder="Search by name or file..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="campaign-search-input"
                        />
                        {searchQuery && (
                            <button className="clear-search" onClick={() => setSearchQuery('')}>
                                <FiX />
                            </button>
                        )}
                    </div>
                    <button
                        className={`bounce-check-btn ${isCheckingBounces ? 'checking' : ''}`}
                        onClick={checkBounces}
                        disabled={loading || isCheckingBounces}
                        title="Check for bounced emails"
                    >
                        <FiAlertCircle className={isCheckingBounces ? 'spinning' : ''} />
                        <span>{isCheckingBounces ? 'Checking...' : 'Check Bounces'}</span>
                    </button>
                    <button
                        className={`refresh-btn ${isRefreshing ? 'spinning' : ''}`}
                        onClick={() => fetchCampaignHistory(true)}
                        disabled={loading || isRefreshing}
                        title="Refresh Data"
                    >
                        <FiRefreshCw />
                        <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                    </button>
                </div>
            </div>

            <div className="history-card">
                {loading ? (
                    <div className="loading-state">
                        <FiLoader className="spinning" size={40} />
                        <p>Loading campaign history...</p>
                    </div>
                ) : error ? (
                    <div className="error-state">
                        <FiAlertCircle size={40} />
                        <p>{error}</p>
                        <button onClick={() => fetchCampaignHistory()} className="retry-btn">Try Again</button>
                    </div>
                ) : campaignData.length === 0 ? (
                    <div className="empty-state">
                        <FiClock size={48} />
                        <p>No campaign history found.</p>
                        <p className="sub-text">Start by sending emails to see your history here.</p>
                    </div>
                ) : filteredCampaigns.length === 0 ? (
                    <div className="empty-state">
                        <FiSearch size={48} />
                        <p>No campaigns match your search "{searchQuery}"</p>
                        <button onClick={() => setSearchQuery('')} className="retry-btn">Clear Search</button>
                    </div>
                ) : (
                    <div className="history-table-wrapper">
                        <table className="history-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '50px' }}></th>
                                    <th>Campaign Name</th>
                                    <th>User</th>
                                    <th>Status</th>
                                    <th>File Name</th>
                                    <th style={{ textAlign: 'center' }}>Total</th>
                                    <th style={{ textAlign: 'center' }}>Failed</th>
                                    <th style={{ textAlign: 'center' }}>Replied</th>
                                    <th style={{ textAlign: 'center' }}>Bounced</th>
                                    <th>Date & Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    // Calculate pagination based on filtered data
                                    const indexOfLastCampaign = currentPage * campaignsPerPage;
                                    const indexOfFirstCampaign = indexOfLastCampaign - campaignsPerPage;
                                    const currentCampaigns = filteredCampaigns.slice(indexOfFirstCampaign, indexOfLastCampaign);

                                    return currentCampaigns.map((campaign) => {
                                        const totalEmails = campaign.accounts?.reduce((acc, curr) => acc + (curr.sentCount || 0), 0) || 0;

                                        return (
                                            <React.Fragment key={campaign.campaignId}>
                                                <tr
                                                    className={`campaign-row ${expandedCampaignId === campaign.campaignId ? 'expanded' : ''}`}
                                                    onClick={() => toggleCampaign(campaign.campaignId)}
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    <td className="expand-cell">
                                                        <button
                                                            className="expand-btn"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleCampaign(campaign.campaignId);
                                                            }}
                                                        >
                                                            {expandedCampaignId === campaign.campaignId ? <FiMinus /> : <FiPlus />}
                                                        </button>
                                                    </td>
                                                    <td className="campaign-name-cell">
                                                       
                                                        {campaign.campaignName}
                                                    </td>
                                                    <td>
                                                        {campaign.userName ? (
                                                            <div className="user-info-cell">
                                                                <FiUser className="cell-icon" />
                                                                <span>{campaign.userName}</span>
                                                            </div>
                                                        ) : '-'}
                                                    </td>
                                                    <td>
                                                        <span className={`status-badge ${campaign.status?.toLowerCase()}`}
                                                            title={campaign.status}>
                                                            {getStatusIcon(campaign.status)}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div className="file-info">
                                                            <FiFileText className="cell-icon" />
                                                            {campaign.fileName}
                                                        </div>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <span className="stat-count total">{totalEmails}</span>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <span className="stat-count failed">{campaign.failedCount || 0}</span>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <span className="stat-count replied">{campaign.repliedCount || 0}</span>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <span className="stat-count bounced">{campaign.bouncedCount || 0}</span>
                                                    </td>
                                                    <td className="date-cell">{formatCampaignDate(campaign.dateTime)}</td>
                                                </tr>

                                                {/* First Level Expand: Sender Accounts */}
                                                {expandedCampaignId === campaign.campaignId && (
                                                    <tr className="sub-table-row">
                                                        <td colSpan="9">
                                                            <div className="sender-accounts-wrapper">
                                                                <div className="campaign-actions-bar">
                                                                    <button className="action-btn" onClick={() => fetchEmailContent(campaign.campaignId)}>
                                                                        <FiEye /> View Email Content
                                                                    </button>
                                                                    <button className="action-btn" onClick={() => downloadCSV(campaign.campaignId)}>
                                                                        <FiDownload /> Download All Recipients
                                                                    </button>
                                                                </div>
                                                                <table className="sender-table">
                                                                    <thead>
                                                                        <tr>
                                                                            <th style={{ width: '40px' }}></th>
                                                                            <th>Sender Email</th>
                                                                            <th>Sent Count</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {campaign.accounts && campaign.accounts.length > 0 ? (
                                                                            campaign.accounts.map((account) => (
                                                                                <React.Fragment key={account.accountId}>
                                                                                    <tr
                                                                                        className={`sender-row ${expandedSenderId === account.accountId ? 'expanded' : ''}`}
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            toggleSender(account.accountId);
                                                                                        }}
                                                                                        style={{ cursor: 'pointer' }}
                                                                                    >
                                                                                        <td className="expand-cell">
                                                                                            <button
                                                                                                className="expand-btn sub-expand"
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    toggleSender(account.accountId);
                                                                                                }}
                                                                                            >
                                                                                                {expandedSenderId === account.accountId ? <FiMinus /> : <FiPlus />}
                                                                                            </button>
                                                                                        </td>
                                                                                        <td>
                                                                                            <div className="sender-info">
                                                                                                <FiUser className="cell-icon" />
                                                                                                <span className="sender-email-text">{account.senderEmail}</span>
                                                                                                <div className="sender-inline-actions">
                                                                                                    <button
                                                                                                        className="btn btn-primary btn-sm"
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            fetchRecipients(campaign.campaignId, account.senderEmail);
                                                                                                        }}
                                                                                                    >
                                                                                                        <FiMail /> View Recipients
                                                                                                    </button>
                                                                                                    <button
                                                                                                        className="btn btn-secondary btn-sm"
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            downloadCSV(campaign.campaignId, account.senderEmail);
                                                                                                        }}
                                                                                                    >
                                                                                                        <FiDownload /> Download CSV
                                                                                                    </button>
                                                                                                </div>
                                                                                            </div>
                                                                                        </td>
                                                                                        <td className="sent-count">
                                                                                            <span className="count-badge">{account.sentCount || 0} emails</span>
                                                                                        </td>
                                                                                    </tr>

                                                                                    {/* Second Level Expand: Actions for Sender */}
                                                                                    {expandedSenderId === account.accountId && (
                                                                                        <tr className="recipient-row">
                                                                                            <td colSpan="3">
                                                                                                <div className="sender-actions-container">
                                                                                                    <button
                                                                                                        className="btn btn-primary btn-sm"
                                                                                                        onClick={() => fetchRecipients(campaign.campaignId, account.senderEmail)}
                                                                                                    >
                                                                                                        <FiMail /> View Recipients
                                                                                                    </button>
                                                                                                    <button
                                                                                                        className="btn btn-secondary btn-sm"
                                                                                                        onClick={() => downloadCSV(campaign.campaignId, account.senderEmail)}
                                                                                                    >
                                                                                                        <FiDownload /> Download CSV
                                                                                                    </button>
                                                                                                </div>
                                                                                            </td>
                                                                                        </tr>
                                                                                    )}
                                                                                </React.Fragment>
                                                                            ))
                                                                        ) : (
                                                                            <tr>
                                                                                <td colSpan="3" style={{ textAlign: 'center', padding: '12px' }}>
                                                                                    No sender accounts found for this campaign.
                                                                                </td>
                                                                            </tr>
                                                                        )}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    });
                                })()}
                            </tbody>
                        </table>

                        {/* Pagination Controls */}
                        {filteredCampaigns.length > campaignsPerPage && (
                            <div className="pagination-controls">
                                <button
                                    className="pagination-btn"
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                >
                                    <FiChevronLeft /> Previous
                                </button>
                                <span className="pagination-info">
                                    Page {currentPage} of {Math.ceil(filteredCampaigns.length / campaignsPerPage)}
                                </span>
                                <button
                                    className="pagination-btn"
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(filteredCampaigns.length / campaignsPerPage)))}
                                    disabled={currentPage >= Math.ceil(filteredCampaigns.length / campaignsPerPage)}
                                >
                                    Next <FiChevronRight />
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Recipients Modal */}
            {recipientsModal.open && (
                <div className="history-modal-overlay" onClick={() => setRecipientsModal(prev => ({ ...prev, open: false }))}>
                    <div className="history-modal-content" onClick={e => e.stopPropagation()}>
                        <div className="history-modal-header">
                            <h3>Recipients {recipientsModal.senderEmail && `(${recipientsModal.senderEmail})`}</h3>
                            <button className="close-modal-btn" onClick={() => setRecipientsModal(prev => ({ ...prev, open: false }))}>
                                <FiX />
                            </button>
                        </div>
                        <div className="history-modal-body">
                            {recipientsModal.loading ? (
                                <div className="modal-loading">
                                    <FiLoader className="spinning" size={32} />
                                    <p>Loading recipients...</p>
                                </div>
                            ) : (
                                <>
                                    <table className="modal-recipient-table">
                                        <thead>
                                            <tr>
                                                <th>Email Address</th>
                                                <th>Name</th>
                                                <th>Status</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {recipientsModal.data.map((r, idx) => (
                                                <tr key={idx}>
                                                    <td>{r.recipient_email}</td>
                                                    <td>{r.recipient_name || '-'}</td>
                                                    <td>
                                                        <span className={`status-tag ${r.status?.toLowerCase()}`}>
                                                            {r.status}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {r.status?.toLowerCase() === 'replied' && (
                                                            <button
                                                                className="view-reply-btn"
                                                                onClick={() => handleViewReply(r)}
                                                                title="View Reply Message"
                                                            >
                                                                <FiMessageSquare /> View Reply
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                            {recipientsModal.data.length === 0 && (
                                                <tr>
                                                    <td colSpan="3" style={{ textAlign: 'center', padding: '20px' }}>No recipients found.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>

                                    <div className="modal-pagination">
                                        <button
                                            disabled={recipientsModal.page <= 1}
                                            onClick={() => fetchRecipients(recipientsModal.campaignId, recipientsModal.senderEmail, recipientsModal.page - 1)}
                                        >
                                            <FiChevronLeft /> Previous
                                        </button>
                                        <span className="page-info">
                                            Page {recipientsModal.page} of {Math.ceil(recipientsModal.total / 10) || 1}
                                        </span>
                                        <button
                                            disabled={recipientsModal.page >= Math.ceil(recipientsModal.total / 10)}
                                            onClick={() => fetchRecipients(recipientsModal.campaignId, recipientsModal.senderEmail, recipientsModal.page + 1)}
                                        >
                                            Next <FiChevronRight />
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Email Content Modal */}
            {contentModal.open && (
                <div className="history-modal-overlay" onClick={() => setContentModal(prev => ({ ...prev, open: false }))}>
                    <div className="history-modal-content email-content-modal" onClick={e => e.stopPropagation()}>
                        <div className="history-modal-header">
                            <h3>Email Content</h3>
                            <button className="close-modal-btn" onClick={() => setContentModal(prev => ({ ...prev, open: false }))}>
                                <FiX />
                            </button>
                        </div>
                        <div className="history-modal-body">
                            {contentModal.loading ? (
                                <div className="modal-loading">
                                    <FiLoader className="spinning" size={32} />
                                    <p>Loading content...</p>
                                </div>
                            ) : (
                                <div className="email-preview">
                                    <div className="preview-field">
                                        <label>Subject:</label>
                                        <div className="field-value">{contentModal.subject}</div>
                                    </div>
                                    <div className="preview-field">
                                        <label>Body:</label>
                                        <div className="field-value body-content">
                                            {contentModal.body}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {/* Reply Content Modal */}
            {replyModal.open && (
                <div className="history-modal-overlay" onClick={() => setReplyModal(prev => ({ ...prev, open: false }))}>
                    <div className="history-modal-content reply-content-modal" onClick={e => e.stopPropagation()}>
                        <div className="history-modal-header">
                            <h3>Reply from {replyModal.recipient}</h3>
                            <button className="close-modal-btn" onClick={() => setReplyModal(prev => ({ ...prev, open: false }))}>
                                <FiX />
                            </button>
                        </div>
                        <div className="history-modal-body">
                            <div className="reply-preview">
                                {replyModal.replies && replyModal.replies.length > 0 ? (
                                    replyModal.replies.map((reply, index) => (
                                        <div key={index} className="reply-item">
                                            <div className="reply-time-badge">
                                                <FiClock size={14} />
                                                <span>{reply.time}</span>
                                            </div>
                                            <div className="reply-section">
                                                <div className="reply-direct-content">
                                                    {typeof reply.message === 'string' 
                                                        ? reply.message 
                                                        : reply.message?.direct || 'No content'}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="no-replies-message">No replies available</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CampaignHistoryTab;
    