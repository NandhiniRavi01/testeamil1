import React, { useState, useEffect, useCallback } from 'react';
import './EmailTemplateTab.css';
import { FiDownload, FiCheck, FiAlertCircle, FiUploadCloud, FiLayers, FiInfo } from 'react-icons/fi';

const EmailTemplateTab = ({
    emailContent,
    makeAuthenticatedRequest,
    makeFileUploadRequest,
    senderAccounts,
    batchSize,
    fetchCampaigns,
    setProgress,
    setSending
}) => {
    // Template states
    const [campaignTitle, setCampaignTitle] = useState('');
    const [subject, setSubject] = useState('Hello {{name}} at {{company}} - {{my_name}} reaching out');
    const [body, setBody] = useState(`Dear {{name}},

I hope this message finds you well. I am {{my_name}}, and I represent a solution that could be valuable for {{position}}s at {{company}}.

Best regards,
{{my_name}}
{{my_phone}}`);

    // Sender accounts - converted to array for multiple accounts
    const [senderAccountsList, setSenderAccountsList] = useState([{
        senderName: '',
        senderPhone: '',
        senderEmail: '',
        appPassword: '',
        emailProvider: 'google',
        dailyLimit: 50
    }]);
    const [senderInfoLocked, setSenderInfoLocked] = useState(false);

    // Excel file state
    const [excelFile, setExcelFile] = useState(null);
    const [excelPreview, setExcelPreview] = useState(null);
    const [isDragging, setIsDragging] = useState(false);

    // UI states
    const [templateValid, setTemplateValid] = useState(false);
    const [excelValid, setExcelValid] = useState(false);
    const [loading, setLoading] = useState(false);
    const [campaignRunning, setCampaignRunning] = useState(false);
    const [campaignResult, setCampaignResult] = useState(null);
    const [errors, setErrors] = useState({});
    const [successMessage, setSuccessMessage] = useState('');

    // Campaign execution modal state
    const [showCampaignModal, setShowCampaignModal] = useState(false);
    const [campaignProgress, setCampaignProgress] = useState({
        sent: 0,
        failed: 0,
        total: 0,
        duplicates: 0,
        invalid: 0,
        duration_minutes: 0,
        duration_seconds: 0,
        started_at_iso: null,
        ended_at_iso: null
    });
    const [failedEmails, setFailedEmails] = useState([]);
    const [animatedCount, setAnimatedCount] = useState(0);
    const [pollInterval, setPollInterval] = useState(null);

    const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
    const API_BASE_URL = `${BASE_URL}/api/email-template`;

    // Load sender info from localStorage on mount
    useEffect(() => {
        const savedSenderInfo = localStorage.getItem('emailCampaignSenderInfo');
        if (savedSenderInfo) {
            try {
                const parsed = JSON.parse(savedSenderInfo);
                // Handle both old single account and new multiple accounts format
                if (Array.isArray(parsed)) {
                    setSenderAccountsList(parsed);
                } else {
                    // Convert old format to new array format
                    setSenderAccountsList([{
                        senderName: parsed.senderName || '',
                        senderPhone: parsed.senderPhone || '',
                        senderEmail: parsed.senderEmail || '',
                        appPassword: parsed.appPassword || '',
                        emailProvider: parsed.emailProvider || 'google',
                        dailyLimit: parsed.dailyLimit || 50
                    }]);
                }
                setSenderInfoLocked(true);
            } catch (e) {
                console.error('Error loading sender info:', e);
            }
        }
    }, []);

    // Save sender info to localStorage
    const saveSenderInfo = () => {
        localStorage.setItem('emailCampaignSenderInfo', JSON.stringify(senderAccountsList));
        setSenderInfoLocked(true);
    };

    // Clear sender info
    const clearSenderInfo = () => {
        localStorage.removeItem('emailCampaignSenderInfo');
        setSenderAccountsList([{
            senderName: '',
            senderPhone: '',
            senderEmail: '',
            appPassword: '',
            emailProvider: 'google',
            dailyLimit: 50
        }]);
        setSenderInfoLocked(false);
    };

    // Unlock for editing
    const unlockSenderInfo = () => {
        setSenderInfoLocked(false);
    };

    // Add new sender account
    const addSenderAccount = () => {
        setSenderAccountsList([...senderAccountsList, {
            senderName: '',
            senderPhone: '',
            senderEmail: '',
            appPassword: '',
            emailProvider: 'google',
            dailyLimit: 50
        }]);
    };

    // Remove sender account
    const removeSenderAccount = (index) => {
        if (senderAccountsList.length > 1) {
            const updated = senderAccountsList.filter((_, i) => i !== index);
            setSenderAccountsList(updated);
        }
    };

    // Update sender account field
    const updateSenderAccount = (index, field, value) => {
        const updated = [...senderAccountsList];
        updated[index][field] = value;
        setSenderAccountsList(updated);
    };

    // Validate template on change
    useEffect(() => {
        validateTemplate();
    }, [subject, body]);

    const validateTemplate = async () => {
        try {
            setLoading(true);
            const response = await makeAuthenticatedRequest(`${API_BASE_URL}/validate-template`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject, body })
            });

            const data = await response.json();
            setTemplateValid(data.valid);

            if (!data.valid) {
                setErrors(prev => ({ ...prev, template: data.error }));
            } else {
                setErrors(prev => ({ ...prev, template: null }));
            }
        } catch (error) {
            console.error('Template validation error:', error);
            setErrors(prev => ({ ...prev, template: 'Failed to validate template' }));
        } finally {
            setLoading(false);
        }
    };

    const handleExcelFileChange = async (file) => {
        if (!file) return;

        setExcelFile(file);
        setLoading(true);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await makeFileUploadRequest(`${API_BASE_URL}/validate-excel`, formData);

            const data = await response.json();

            if (data.valid) {
                setExcelValid(true);
                setExcelPreview(data);
                setErrors(prev => ({ ...prev, excel: null }));
            } else {
                setExcelValid(false);
                setErrors(prev => ({ ...prev, excel: data.error }));
            }
        } catch (error) {
            console.error('Excel validation error:', error);
            setExcelValid(false);
            setErrors(prev => ({ ...prev, excel: 'Failed to validate Excel file' }));
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveExcel = () => {
        setExcelFile(null);
        setExcelPreview(null);
        setExcelValid(false);
    };

    const downloadExampleTemplate = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/download-example`, {
                credentials: 'include'
            });
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'email_recipients_template.xlsx';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Download error:', error);
            alert('Failed to download example template');
        }
    };

    const validateBeforeSending = () => {
        const newErrors = {};

        if (!campaignTitle.trim()) newErrors.campaignTitle = 'Campaign Title is required';
        if (!subject.trim()) newErrors.subject = 'Subject is required';
        if (!body.trim()) newErrors.body = 'Body is required';
        
        // Validate all sender accounts
        senderAccountsList.forEach((account, index) => {
            // Sender name and phone are now optional
            if (!account.senderEmail.trim()) newErrors[`senderEmail_${index}`] = `Account ${index + 1}: Sender email is required`;
            if (!account.appPassword.trim()) newErrors[`appPassword_${index}`] = `Account ${index + 1}: App password is required`;
        });
        
        if (!excelFile) newErrors.excel = 'Excel file is required';
        if (!templateValid) newErrors.template = 'Template validation failed';
        if (!excelValid) newErrors.excelValidation = 'Excel validation failed';

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSendCampaign = async () => {
        if (!validateBeforeSending()) {
            alert('Please fix all errors before sending');
            return;
        }

        if (!window.confirm('This will send emails to all recipients. Continue?')) {
            return;
        }

        setCampaignRunning(true);
        setShowCampaignModal(true);
        if (setSending) setSending(true);

        const totalCount = excelPreview?.valid_recipients || 0;
        const initialProgress = {
            sent: 0,
            failed: 0,
            total: totalCount,
            status: 'running',
            duplicates: 0,
            invalid: 0,
            duration_minutes: 0,
            duration_seconds: 0,
            started_at_iso: null,
            ended_at_iso: null
        };
        setCampaignProgress(initialProgress);
        if (setProgress) setProgress(initialProgress);

        setAnimatedCount(0);
        setFailedEmails([]);
        setSuccessMessage('');
        setCampaignResult(null);

        try {
            const formData = new FormData();
            formData.append('campaign_title', campaignTitle);
            formData.append('subject_template', subject);
            formData.append('body_template', body);
            formData.append('sender_accounts', JSON.stringify(senderAccountsList));
            formData.append('file', excelFile);
            formData.append('batch_size', batchSize || 250);

            // Start polling for actual progress from backend (every 500ms for stability)
            const interval = setInterval(async () => {
                try {
                    const progressResponse = await makeAuthenticatedRequest(`${API_BASE_URL}/progress`);
                    const progressData = await progressResponse.json();

                    // Update counter with actual sent count from backend
                    const newProgress = {
                        sent: progressData.sent || 0,
                        failed: progressData.failed || 0,
                        total: progressData.total || totalCount,
                        status: progressData.status,
                        duplicates: progressData.duplicates || 0,
                        invalid: progressData.invalid || 0,
                        duration_minutes: progressData.duration_minutes || 0,
                        duration_seconds: progressData.duration_seconds || 0,
                        started_at_iso: progressData.started_at_iso || null,
                        ended_at_iso: progressData.ended_at_iso || null
                    };
                    setCampaignProgress(newProgress);
                    if (setProgress) setProgress(newProgress);

                    setAnimatedCount(progressData.sent || 0);

                    // Stop polling if completed or error
                    if (progressData.status === 'completed' || (progressData.status && progressData.status.startsWith('error'))) {
                        clearInterval(interval);
                        setPollInterval(null);
                        setCampaignRunning(false);
                        if (setSending) setSending(false);

                        // Calculate final results
                        const total = progressData.total || totalCount || 0;
                        const sent = progressData.sent || 0;
                        const failed = progressData.failed || 0;
                        const duplicates = progressData.duplicates || 0;
                        const invalid = progressData.invalid || 0;
                        const durationMinutes = Number(progressData.duration_minutes || 0);
                        const durationSeconds = Number(progressData.duration_seconds || 0);
                        const startedAtIso = progressData.started_at_iso || null;
                        const endedAtIso = progressData.ended_at_iso || null;
                        const successRate = total > 0 ? Math.round((sent / total) * 100) : 0;

                        const formatDuration = (seconds) => {
                            const secRounded = Math.max(1, Math.round(seconds || 0));
                            const h = Math.floor(secRounded / 3600).toString().padStart(2, '0');
                            const m = Math.floor((secRounded % 3600) / 60).toString().padStart(2, '0');
                            const s = Math.floor(secRounded % 60).toString().padStart(2, '0');
                            return `${h}:${m}:${s}`;
                        };

                        const durationLabel = durationSeconds > 0
                            ? `${formatDuration(durationSeconds)} (${durationMinutes.toFixed(2)} min)`
                            : `${durationMinutes.toFixed(2)} min`;

                        setCampaignResult({
                            success: progressData.status === 'completed',
                            sent: sent,
                            failed: failed,
                            total_recipients: total,
                            success_rate: `${successRate}%`,
                            duplicates: duplicates,
                            invalid: invalid,
                            duration: durationLabel,
                            started_at_iso: startedAtIso,
                            ended_at_iso: endedAtIso
                        });

                        setSuccessMessage('Campaign completed!');
                        if (fetchCampaigns) fetchCampaigns();
                    }
                } catch (err) {
                    console.error('Progress polling error:', err);
                }
            }, 500);
            setPollInterval(interval);

            // Start campaign in background
            const response = await makeFileUploadRequest(`${API_BASE_URL}/send-campaign`, formData);

            const data = await response.json();
            if (!data.success) {
                clearInterval(interval);
                setPollInterval(null);
                setErrors(prev => ({ ...prev, campaign: data.error }));
                setCampaignRunning(false);
                setShowCampaignModal(false);
            }
        } catch (error) {
            console.error('Campaign error:', error);
            setErrors(prev => ({ ...prev, campaign: 'Failed to initiate campaign' }));
            setCampaignRunning(false);
        }
    };

    const fetchFinalResults = async () => {
        try {
            // Optional: Fetch final log or summary from backend if needed
            // For now, the user just needs to see the final screen with success message
            setSuccessMessage('Campaign completed successfully!');
        } catch (e) {
            console.error("Error fetching final results:", e);
        }
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    const downloadFailedEmails = () => {
        if (failedEmails.length === 0) return;

        // Create CSV content
        let csv = 'Email,Recipient,Reason\n';
        failedEmails.forEach(email => {
            csv += `"${email.recipient || email.email}","${email.recipient_name || ''}","${email.reason || 'Unknown error'}"\n`;
        });

        // Download as file
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `failed_emails_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    };

    const closeCampaignModal = () => {
        setShowCampaignModal(false);
        if (pollInterval) {
            clearInterval(pollInterval);
            setPollInterval(null);
        }
    };

    return (
        <div className="email-template-container">
            <div className="template-card">
                <div className="card-header">
                    <h2>Email Template Campaign</h2>
                    <p>Create personalized emails with dynamic placeholders from Excel data</p>
                </div>

                {/* Template Section */}
                <div className="section">
                    <h3>📧 Email Template</h3>

                    <div className="form-group">
                        <label>Campaign Title *</label>
                        <input
                            type="text"
                            value={campaignTitle}
                            onChange={(e) => setCampaignTitle(e.target.value)}
                            placeholder="e.g., Q4 Enterprise Sales Outreach"
                            className="input-field"
                        />
                        <small>This title will appear in your Email Tracking module</small>
                        {errors.campaignTitle && <div className="error-message">{errors.campaignTitle}</div>}
                    </div>

                    <div className="form-group">
                        <label>Email Subject *</label>
                        <input
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="e.g., Hello {{name}} at {{company}}"
                            className="input-field"
                        />
                        <small>Use placeholders: {'{{name}}'}, {'{{position}}'}, {'{{company}}'}, {'{{my_name}}'}</small>
                        {errors.subject && <div className="error-message">{errors.subject}</div>}
                    </div>

                    <div className="form-group">
                        <label>Email Body *</label>
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder="Write your email body with placeholders..."
                            className="textarea-field"
                            rows={8}
                        />
                        <small>Use placeholders: {'{{name}}'}, {'{{position}}'}, {'{{company}}'}, {'{{my_name}}'}, {'{{my_phone}}'}</small>
                        {errors.body && <div className="error-message">{errors.body}</div>}
                    </div>

                    {templateValid && (
                        <div className="success-box">
                            <FiCheck className="icon" /> Template is valid!
                        </div>
                    )}
                </div>

                {/* Sender Information */}
                <div className="section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <h3>👤 Sender Information</h3>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            {senderInfoLocked ? (
                                <>
                                    <button
                                        onClick={unlockSenderInfo}
                                        className="btn-secondary"
                                        style={{ padding: '8px 16px', fontSize: '14px' }}
                                    >
                                        ✏️ Edit
                                    </button>
                                    <button
                                        onClick={clearSenderInfo}
                                        className="btn-danger"
                                        style={{ padding: '8px 16px', fontSize: '14px', backgroundColor: '#dc3545' }}
                                    >
                                        🗑️ Clear
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={addSenderAccount}
                                        className="btn-secondary"
                                        style={{ padding: '8px 16px', fontSize: '14px' }}
                                    >
                                        ➕ Add Account
                                    </button>
                                    <button
                                        onClick={saveSenderInfo}
                                        className="btn-primary"
                                        style={{ padding: '8px 16px', fontSize: '14px', backgroundColor: '#28a745' }}
                                        disabled={senderAccountsList.some(acc => !acc.senderEmail || !acc.appPassword)}
                                    >
                                        💾 Save Info
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {senderAccountsList.map((account, index) => (
                        <div key={index} style={{ 
                            marginBottom: '25px', 
                            padding: '20px', 
                            border: '2px solid #e0e0e0', 
                            borderRadius: '8px',
                            backgroundColor: '#f9f9f9',
                            position: 'relative'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                <h4 style={{ margin: 0, color: '#333' }}>Account {index + 1}</h4>
                                {!senderInfoLocked && senderAccountsList.length > 1 && (
                                    <button
                                        onClick={() => removeSenderAccount(index)}
                                        className="btn-danger"
                                        style={{ padding: '6px 12px', fontSize: '12px' }}
                                    >
                                        🗑️ Remove
                                    </button>
                                )}
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Email Provider *</label>
                                    <select
                                        value={account.emailProvider}
                                        onChange={(e) => updateSenderAccount(index, 'emailProvider', e.target.value)}
                                        className="input-field"
                                        disabled={senderInfoLocked}
                                        style={{ cursor: senderInfoLocked ? 'not-allowed' : 'pointer' }}
                                    >
                                        <option value="google">Google (Gmail)</option>
                                        <option value="zoho">Zoho Mail</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label>Daily Limit *</label>
                                    <input
                                        type="text"
                                        value={account.dailyLimit}
                                        onChange={(e) => updateSenderAccount(index, 'dailyLimit', e.target.value ? parseInt(e.target.value) : '')}
                                        placeholder="e.g., 125"
                                        className="input-field"
                                        disabled={senderInfoLocked}
                                    />
                                    <small style={{ color: '#666', fontSize: '0.85rem' }}>
                                        Max emails this account can send per day
                                    </small>
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Sender Name ({'{{my_name}}'})</label>
                                    <input
                                        type="text"
                                        value={account.senderName}
                                        onChange={(e) => updateSenderAccount(index, 'senderName', e.target.value)}
                                        placeholder="Your full name (optional)"
                                        className="input-field"
                                        disabled={senderInfoLocked}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Sender Phone ({'{{my_phone}}'})</label>
                                    <input
                                        type="tel"
                                        value={account.senderPhone}
                                        onChange={(e) => updateSenderAccount(index, 'senderPhone', e.target.value)}
                                        placeholder="+1 (555) 000-0000 (optional)"
                                        className="input-field"
                                        disabled={senderInfoLocked}
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Email Address * (Sender)</label>
                                    <input
                                        type="email"
                                        value={account.senderEmail}
                                        onChange={(e) => updateSenderAccount(index, 'senderEmail', e.target.value)}
                                        placeholder="your-email@example.com"
                                        className="input-field"
                                        disabled={senderInfoLocked}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>App Password *</label>
                                    <input
                                        type="password"
                                        value={account.appPassword}
                                        onChange={(e) => updateSenderAccount(index, 'appPassword', e.target.value)}
                                        disabled={senderInfoLocked}
                                        placeholder="16-character app password"
                                        className="input-field"
                                    />
                                    <small>
                                        {account.emailProvider === 'google' ? (
                                            <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noopener noreferrer">
                                                How to get Google App Password?
                                            </a>
                                        ) : (
                                            <a href="https://www.zoho.com/mail/help/adminconsole/two-factor-authentication.html" target="_blank" rel="noopener noreferrer">
                                                How to get Zoho App Password?
                                            </a>
                                        )}
                                    </small>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Excel Upload */}
                <div className="section">
                    <h3>📁 Upload Recipients List</h3>

                    <div
                        className={`file-upload-box ${excelFile ? 'has-file' : ''} ${isDragging ? 'dragging' : ''}`}
                        onClick={() => document.getElementById('excelInput').click()}
                        onDragOver={(e) => {
                            e.preventDefault();
                            setIsDragging(true);
                        }}
                        onDragLeave={(e) => {
                            e.preventDefault();
                            setIsDragging(false);
                        }}
                        onDrop={(e) => {
                            e.preventDefault();
                            setIsDragging(false);
                            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                handleExcelFileChange(e.dataTransfer.files[0]);
                            }
                        }}
                    >
                        <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={(e) => handleExcelFileChange(e.target.files[0])}
                            id="excelInput"
                            style={{ display: 'none' }}
                        />
                        <label className="file-upload-label" style={{ cursor: 'pointer' }}>
                            <FiUploadCloud size={32} />
                            <span>Click to upload or drag and drop</span>
                            <small>CSV, XLS, or XLSX (Max 5MB)</small>
                        </label>
                    </div>

                    {excelFile && (
                        <div className="file-info-box">
                            <div className="file-details">
                                <FiLayers size={20} />
                                <div>
                                    <div className="file-name">{excelFile.name}</div>
                                    <div className="file-size">{formatFileSize(excelFile.size)}</div>
                                </div>
                                <button onClick={handleRemoveExcel} className="btn-remove">×</button>
                            </div>
                        </div>
                    )}

                    {excelValid && excelPreview && (
                        <div className="excel-preview">
                            <div className="preview-item">
                                <span className="label">Total Rows:</span>
                                <span className="value">{excelPreview.total_rows}</span>
                            </div>
                            <div className="preview-item">
                                <span className="label">unique addresses:</span>
                                <span className="value">{excelPreview.valid_recipients}</span>
                            </div>
                            {excelPreview.sample_recipient && (
                                <div className="sample-recipient">
                                    <strong>Sample Data:</strong>
                                    <div className="sample-data">
                                        {Object.entries(excelPreview.sample_recipient).map(([key, value]) => (
                                            <div key={key}>
                                                <span>{key}:</span> {value}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <button onClick={downloadExampleTemplate} className="btn btn-secondary">
                        <FiDownload /> Download Example Template
                    </button>

                    {errors.excel && <div className="error-message">{errors.excel}</div>}
                    {errors.excelValidation && <div className="error-message">{errors.excelValidation}</div>}
                </div>

                {/* Required Columns Info */}
                <div className="info-box">
                    <FiInfo size={20} />
                    <div>
                        <strong>Required Excel Columns:</strong> name, email, position, company
                        <br />
                        <small>Column order doesn't matter. Headers are case-insensitive.</small>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="action-buttons">
                    <button
                        onClick={handleSendCampaign}
                        disabled={!templateValid || !excelValid || campaignRunning}
                        className="btn btn-primary"
                    >
                        {campaignRunning ? 'Sending Campaign...' : 'Send Campaign'}
                    </button>
                </div>

                {errors.campaign && (
                    <div className="error-message large">
                        <FiAlertCircle /> {errors.campaign}
                    </div>
                )}
            </div>

            {/* Campaign Execution Modal */}
            {showCampaignModal && (
                <div className="campaign-modal-overlay">
                    <div className="campaign-modal">
                        <div className="campaign-modal-header">
                            <h2>📧 Campaign Execution</h2>
                            {!campaignRunning && (
                                <button onClick={closeCampaignModal} className="modal-close-btn">✕</button>
                            )}
                        </div>

                        <div className="campaign-modal-content">
                            {campaignRunning ? (
                                // Loading State - Sending emails
                                <div className="campaign-loading">
                                    <div className="progress-section">
                                        <div className="large-counter">
                                            <span className="counter-current">{animatedCount}</span>
                                            <span className="counter-separator">/</span>
                                            <span className="counter-total">{campaignProgress.total}</span>
                                        </div>
                                        <p className="loading-text">📧 Sending emails, please wait...</p>
                                        <div className="loading-bar">
                                            <div
                                                className="loading-bar-fill"
                                                style={{
                                                    width: `${campaignProgress.total > 0 ? (animatedCount / campaignProgress.total) * 100 : 0}%`
                                                }}
                                            ></div>
                                        </div>
                                        <div className="progress-stats">
                                            <span className="stat-item">✓ Sent: {animatedCount}</span>
                                            <span className="stat-item">✗ Failed: {campaignProgress.failed}</span>
                                            <span className="stat-item">Duplicates skipped: {campaignProgress.duplicates}</span>
                                        </div>
                                    </div>
                                </div>
                            ) : campaignResult ? (
                                // Results State - Campaign completed
                                <div className="campaign-results">
                                    {/* Large Counter at Top */}
                                    <div className="results-header">
                                        <div className="large-counter-result">
                                            <span className="counter-current">{campaignProgress.sent}</span>
                                            <span className="counter-separator">/</span>
                                            <span className="counter-total">{campaignProgress.total}</span>
                                        </div>
                                        <p className="result-message">
                                            {campaignResult.success ? '✓ Campaign completed successfully!' : '✗ Campaign completed with errors'}
                                        </p>
                                    </div>

                                    {/* Stats Grid */}
                                    <div className="campaign-stats-grid">
                                        <div className="stat-card stat-total">
                                            <div className="stat-icon">📊</div>
                                            <div className="stat-value">{campaignProgress.total}</div>
                                            <div className="stat-label">Total Recipients</div>
                                        </div>
                                        <div className="stat-card stat-sent">
                                            <div className="stat-icon">✓</div>
                                            <div className="stat-value">{campaignProgress.sent}</div>
                                            <div className="stat-label">Successfully Sent</div>
                                        </div>
                                        <div className="stat-card stat-failed">
                                            <div className="stat-icon">✗</div>
                                            <div className="stat-value">{campaignProgress.failed}</div>
                                            <div className="stat-label">Failed</div>
                                        </div>
                                        <div className="stat-card stat-duplicates">
                                            <div className="stat-icon">♻️</div>
                                            <div className="stat-value">{campaignProgress.duplicates}</div>
                                            <div className="stat-label">Duplicates Skipped</div>
                                        </div>
                                    </div>

                                    {/* Success Rate Bar */}
                                    <div className="success-rate-section">
                                        <div className="rate-header">
                                            <span className="rate-label">Success Rate</span>
                                            <span className="rate-value">{campaignResult.success_rate || '0%'}</span>
                                        </div>
                                        <div className="progress-bar-container">
                                            <div
                                                className="progress-bar-fill"
                                                style={{
                                                    width: campaignProgress.total > 0
                                                        ? `${Math.round((campaignProgress.sent / campaignProgress.total) * 100)}%`
                                                        : '0%'
                                                }}
                                            ></div>
                                        </div>
                                    </div>

                                    {/* Timing */}
                                    {(campaignResult.duration || campaignResult.started_at_iso) && (
                                        <div className="duration-info">
                                            <span className="duration-icon">⏱️</span>
                                            <div className="duration-text">
                                                {campaignResult.started_at_iso && (
                                                    <div className="duration-row"><span>Started:</span><span>{new Date(campaignResult.started_at_iso).toLocaleString()}</span></div>
                                                )}
                                                {campaignResult.ended_at_iso && (
                                                    <div className="duration-row"><span>Ended:</span><span>{new Date(campaignResult.ended_at_iso).toLocaleString()}</span></div>
                                                )}
                                                {campaignResult.duration && (
                                                    <div className="duration-row"><span>Duration:</span><span>{campaignResult.duration}</span></div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Failed Emails Section */}
                                    {failedEmails.length > 0 && (
                                        <div className="failed-emails-section">
                                            <div className="failed-header">
                                                <h4>❌ Failed Emails ({failedEmails.length})</h4>
                                                <button onClick={downloadFailedEmails} className="btn-download-small">
                                                    <FiDownload /> Download CSV
                                                </button>
                                            </div>
                                            <div className="failed-emails-list">
                                                {failedEmails.slice(0, 5).map((email, idx) => (
                                                    <div key={idx} className="failed-email-item">
                                                        <div className="email-info">
                                                            <span className="email-address">{email.recipient || email.email}</span>
                                                            <span className="email-reason">{email.reason || 'Unknown error'}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                                {failedEmails.length > 5 && (
                                                    <div className="more-failed">
                                                        + {failedEmails.length - 5} more failed emails
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Close Button */}
                                    <div className="modal-actions">
                                        <button onClick={closeCampaignModal} className="btn-close-modal">
                                            Close
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                // Fallback - should never show
                                <div className="campaign-loading">
                                    <div className="large-counter">
                                        <span className="counter-current">0</span>
                                        <span className="counter-separator">/</span>
                                        <span className="counter-total">0</span>
                                    </div>
                                    <p className="loading-text">Initializing campaign...</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EmailTemplateTab;
