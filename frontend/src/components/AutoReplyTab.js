// AutoReplyTab.js
import React, { useState, useEffect, useCallback } from "react";
import { 
  FiMail, FiRefreshCw, FiSend, FiCheckCircle, 
  FiX, FiClock, FiUser, FiMessageSquare,
  FiSave, FiEye, FiCopy, FiZap,
  FiAtSign, FiKey, FiUserPlus
} from "react-icons/fi";
import "./AutoReplyTab.css";

// ADD THIS CONSTANT
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://65.1.129.37:5000';

function AutoReplyTab() {
  const [repliedEmails, setRepliedEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [aiReply, setAiReply] = useState("");
  const [loading, setLoading] = useState({
    replies: false,
    generating: false,
    sending: false,
    generatingAll: false
  });
  const [showReplyModal, setShowReplyModal] = useState(false);
  
  // Single sender configuration
  const [senderConfig, setSenderConfig] = useState({
    email: "",
    password: "",
    name: ""
  });
  
  const [customReply, setCustomReply] = useState("");

  // Authentication helper function
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
        if (window.confirm('Your session has expired. Please log in again.')) {
          window.location.href = '/';
        }
        return { error: 'Authentication required', status: 401 };
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

  // Load replied emails on component mount
  useEffect(() => {
    fetchRepliedEmails();
    // Load saved sender config from localStorage
    const savedConfig = localStorage.getItem('autoReplySenderConfig');
    if (savedConfig) {
      setSenderConfig(JSON.parse(savedConfig));
    }
  }, []);

  const fetchRepliedEmails = useCallback(async () => {
    setLoading(prev => ({ ...prev, replies: true }));
    try {
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/tracking/auto-reply/list`);
      
      if (res.error) {
        alert("Authentication error: " + res.error);
        return;
      }
      
      if (res.ok) {
        const data = await res.json();
        setRepliedEmails(data.replied_emails || []);
      } else {
        console.error("Error fetching replied emails");
        alert("Failed to load replied emails. Please check if the backend is running.");
      }
    } catch (err) {
      console.error("Error fetching replied emails:", err);
      alert("Error fetching replied emails: " + err.message);
    } finally {
      setLoading(prev => ({ ...prev, replies: false }));
    }
  }, []);
  

  const saveSenderConfig = () => {
    localStorage.setItem('autoReplySenderConfig', JSON.stringify(senderConfig));
    alert("Sender configuration saved successfully!");
  };

  // Generate AI reply for a specific email
  const generateAIReply = async (email) => {
    setLoading(prev => ({ ...prev, generating: true }));
    try {
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/generate-professional-reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          original_email: email.reply_message || email.body
        })
      });
      
      if (res.error) {
        alert("Authentication error: " + res.error);
        return;
      }
      
      if (res.ok) {
        const data = await res.json();
        setAiReply(data.reply);
        setCustomReply(data.reply); // Pre-fill custom reply with AI suggestion
      } else {
        const errorData = await res.json();
        alert("Error generating AI reply: " + (errorData.error || "Unknown error"));
      }
    } catch (err) {
      alert("Error generating AI reply: " + err.message);
    } finally {
      setLoading(prev => ({ ...prev, generating: false }));
    }
  };

  // Generate AI replies for all pending emails
  const generateAllAIReplys = async () => {
    const pendingEmails = repliedEmails.filter(email => !email.auto_replied);
    if (pendingEmails.length === 0) {
      alert("No pending emails to generate replies for!");
      return;
    }

    setLoading(prev => ({ ...prev, generatingAll: true }));
    try {
      // For demo, we'll generate for the first pending email
      // In a real implementation, you might want to generate for all or batch them
      const firstPending = pendingEmails[0];
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/generate-professional-reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          original_email: firstPending.reply_message || firstPending.body
        })
      });
      
      if (res.error) {
        alert("Authentication error: " + res.error);
        return;
      }
      
      if (res.ok) {
        const data = await res.json();
        setAiReply(data.reply);
        setCustomReply(data.reply);
        setSelectedEmail(firstPending);
        setShowReplyModal(true);
        alert(`AI reply generated for ${firstPending.recipient_email}. Check other emails individually.`);
      } else {
        const errorData = await res.json();
        alert("Error generating AI reply: " + (errorData.error || "Unknown error"));
      }
    } catch (err) {
      alert("Error generating AI replies: " + err.message);
    } finally {
      setLoading(prev => ({ ...prev, generatingAll: false }));
    }
  };

  const sendAutoReply = async () => {
    if (!selectedEmail || !senderConfig.email || !senderConfig.password || !customReply) {
      alert("Please fill in all required fields: sender email, app password, and reply content");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(senderConfig.email)) {
      alert("Please enter a valid email address");
      return;
    }

    setLoading(prev => ({ ...prev, sending: true }));
    try {
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/tracking/auto-reply/send-reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient_email: selectedEmail.recipient_email,
          recipient_name: selectedEmail.recipient_name,
          original_subject: selectedEmail.subject,
          original_message: selectedEmail.reply_message || selectedEmail.body,
          reply_subject: `Re: ${selectedEmail.subject}`,
          reply_body: customReply,
          sender_email: senderConfig.email,
          sender_password: senderConfig.password,
          sender_name: senderConfig.name || "Auto Reply System"
        })
      });
      
      if (res.error) {
        alert("Authentication error: " + res.error);
        return;
      }
      
      const data = await res.json();
      if (res.ok) {
        alert("Auto-reply sent successfully!");
        setShowReplyModal(false);
        setSelectedEmail(null);
        setAiReply("");
        setCustomReply("");
        fetchRepliedEmails(); // Refresh the list
      } else {
        alert("Error sending auto-reply: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      alert("Error sending auto-reply: " + err.message);
    } finally {
      setLoading(prev => ({ ...prev, sending: false }));
    }
  };

  const viewReplyDetails = (email) => {
    setSelectedEmail(email);
    setCustomReply("");
    setAiReply("");
    setShowReplyModal(true);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleString();
    } catch (e) {
      return "Invalid Date";
    }
  };

  const resetModal = () => {
    setShowReplyModal(false);
    setSelectedEmail(null);
    setAiReply("");
    setCustomReply("");
  };

  const handleSenderConfigChange = (field, value) => {
    setSenderConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="auto-reply-tab">
      {/* Header */}
      <div className="tab-header">
        <h1>Auto Reply Management</h1>
        <p>Generate and send professional AI-powered replies to email responses</p>
      </div>

      {/* Sender Configuration Card */}
      <div className="card">
        <div className="card-header">
          <FiUserPlus className="card-icon" />
          <h3>Sender Configuration</h3>
          <button 
            onClick={saveSenderConfig} 
            className="btn btn-primary"
          >
            <FiSave /> Save Configuration
          </button>
        </div>
        <div className="card-content">
          <div className="sender-config-grid">
            <div className="form-group">
              <label>
                <FiAtSign className="input-icon" />
                Sender Email Address: *
              </label>
              <input
                type="email"
                value={senderConfig.email}
                onChange={(e) => handleSenderConfigChange('email', e.target.value)}
                placeholder="your.email@gmail.com"
                className="form-input"
                required
              />
            </div>
            
            <div className="form-group">
              <label>
                <FiKey className="input-icon" />
                Gmail App Password: *
              </label>
              <input
                type="password"
                value={senderConfig.password}
                onChange={(e) => handleSenderConfigChange('password', e.target.value)}
                placeholder="16-digit app password"
                className="form-input"
                required
              />
              <small className="help-text">
                Use Gmail App Password, not your regular password. 
                <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noopener noreferrer">
                  Learn how to create an App Password
                </a>
              </small>
            </div>
            
            <div className="form-group">
              <label>
                <FiUser className="input-icon" />
                Sender Name (Optional):
              </label>
              <input
                type="text"
                value={senderConfig.name}
                onChange={(e) => handleSenderConfigChange('name', e.target.value)}
                placeholder="Your Name or Company"
                className="form-input"
              />
              <small className="help-text">
                This will appear as the sender name in the recipient's inbox
              </small>
            </div>
          </div>
          
          {senderConfig.email && senderConfig.password && (
            <div className="config-status">
              <FiCheckCircle className="status-icon" />
              <span>Sender configuration is ready. You can now send auto-replies.</span>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons Card */}
      <div className="card">
        <div className="card-header">
          <FiZap className="card-icon" />
          <h3>Quick Actions</h3>
        </div>
        <div className="card-content">
          <div className="action-buttons-grid">
            <button 
              onClick={generateAllAIReplys}
              disabled={loading.generatingAll || !senderConfig.email || !senderConfig.password}
              className="btn btn-primary btn-large"
            >
              {loading.generatingAll ? (
                <div className="loading-spinner"></div>
              ) : (
                <FiZap />
              )}
              Generate AI Replies for All Pending
            </button>
            
            <button 
              onClick={fetchRepliedEmails} 
              className="btn btn-secondary btn-large"
              disabled={loading.replies}
            >
              {loading.replies ? (
                <div className="loading-spinner"></div>
              ) : (
                <FiRefreshCw />
              )}
              Refresh Email List
            </button>
          </div>
        </div>
      </div>

      {/* Statistics Card */}
      <div className="card">
        <div className="card-header">
          <FiMessageSquare className="card-icon" />
          <h3>Reply Statistics</h3>
        </div>
        <div className="card-content">
          <div className="stats-grid">
            <div className="stats-card">
              <div className="stats-value">{repliedEmails.length}</div>
              <div className="stats-label">Total Replies</div>
            </div>
            <div className="stats-card">
              <div className="stats-value">
                {repliedEmails.filter(email => email.auto_replied).length}
              </div>
              <div className="stats-label">Auto Replied</div>
            </div>
            <div className="stats-card">
              <div className="stats-value">
                {repliedEmails.filter(email => !email.auto_replied).length}
              </div>
              <div className="stats-label">Pending Reply</div>
            </div>
          </div>
        </div>
      </div>

      {/* Replied Emails Table */}
      <div className="card">
        <div className="card-header">
          <FiMail className="card-icon" />
          <h3>Email Replies</h3>
        </div>
        <div className="card-content">
          {loading.replies ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading replied emails...</p>
            </div>
          ) : repliedEmails.length === 0 ? (
            <div className="empty-state">
              <FiMail size={48} style={{marginBottom: '10px', opacity: 0.5}} />
              <p>No email replies found yet. Check your inbox for replies.</p>
              <button onClick={fetchRepliedEmails} className="btn btn-primary">
                <FiRefreshCw /> Check Again
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="auto-reply-table">
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th>Campaign</th>
                    <th>Reply Received</th>
                    <th>Reply Preview</th>
                    <th>Auto Reply Status</th>
                    <th>Auto Reply Sent</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {repliedEmails.map((email) => (
                    <tr key={email.id} className={email.auto_replied ? 'replied' : 'pending'}>
                      <td>
                        <div className="recipient-info">
                          <strong>{email.recipient_name || "Unknown"}</strong>
                          <div className="email-address">{email.recipient_email}</div>
                        </div>
                      </td>
                      <td>{email.campaign_name || "N/A"}</td>
                      <td>{formatDate(email.reply_time)}</td>
                      <td>
                        <div className="reply-preview">
                          {email.reply_message ? 
                            (email.reply_message.length > 100 
                              ? email.reply_message.substring(0, 100) + "..." 
                              : email.reply_message
                            ) 
                            : "No message"
                          }
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge ${email.auto_replied ? 'replied' : 'pending'}`}>
                          {email.auto_replied ? (
                            <>
                              <FiCheckCircle /> Replied
                            </>
                          ) : (
                            <>
                              <FiClock /> Pending
                            </>
                          )}
                        </span>
                      </td>
                      <td>
                        {email.auto_reply_sent_at ? formatDate(email.auto_reply_sent_at) : "Not sent"}
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button 
                            onClick={() => viewReplyDetails(email)}
                            className="btn btn-secondary btn-sm"
                            title="View Details"
                          >
                            <FiEye />
                          </button>
                          {!email.auto_replied && (
                            <button 
                              onClick={() => {
                                setSelectedEmail(email);
                                setShowReplyModal(true);
                                generateAIReply(email);
                              }}
                              disabled={loading.generating || !senderConfig.email || !senderConfig.password}
                              className="btn btn-primary btn-sm"
                              title="Generate AI Reply"
                            >
                              {loading.generating ? (
                                <div className="loading-spinner"></div>
                              ) : (
                                <FiMessageSquare />
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

      {/* Reply Modal */}
      {showReplyModal && selectedEmail && (
        <div className="modal-overlay">
          <div className="modal-content large-modal">
            <div className="modal-header">
              <h3>Send Auto Reply to {selectedEmail.recipient_name || selectedEmail.recipient_email}</h3>
              <button onClick={resetModal} className="btn btn-secondary">
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              {/* Sender Info Preview */}
              {senderConfig.email && (
                <div className="sender-preview">
                  <h4>
                    <FiUserPlus /> Sending From
                  </h4>
                  <div className="sender-details">
                    <p><strong>Email:</strong> {senderConfig.email}</p>
                    <p><strong>Name:</strong> {senderConfig.name || "Not set"}</p>
                    <p><strong>Status:</strong> 
                      <span className={`config-status-badge ${senderConfig.password ? 'ready' : 'missing'}`}>
                        {senderConfig.password ? 'Ready to send' : 'Password missing'}
                      </span>
                    </p>
                  </div>
                </div>
              )}

              {/* Original Message */}
              <div className="message-section">
                <h4>Original Message</h4>
                <div className="message-details">
                  <p><strong>From:</strong> {selectedEmail.recipient_name} ({selectedEmail.recipient_email})</p>
                  <p><strong>Received:</strong> {formatDate(selectedEmail.reply_time)}</p>
                  <p><strong>Subject:</strong> {selectedEmail.subject}</p>
                </div>
                <div className="message-content">
                  {selectedEmail.reply_message || selectedEmail.body || "No message content"}
                </div>
              </div>

              {/* AI Generated Reply */}
              {aiReply && (
                <div className="ai-reply-section">
                  <div className="section-header">
                    <h4>AI Generated Reply</h4>
                    <button 
                      onClick={() => copyToClipboard(aiReply)}
                      className="btn btn-secondary btn-sm"
                    >
                      <FiCopy /> Copy
                    </button>
                  </div>
                  <div className="ai-reply-content">
                    {aiReply}
                  </div>
                </div>
              )}

              {/* Custom Reply Editor */}
              <div className="form-group">
                <label>Reply Content: *</label>
                <textarea
                  value={customReply}
                  onChange={(e) => setCustomReply(e.target.value)}
                  placeholder="Write or edit your reply here..."
                  rows="8"
                  className="reply-editor"
                  required
                />
              </div>

              {/* Quick Actions */}
              <div className="quick-actions">
                <button 
                  onClick={() => generateAIReply(selectedEmail)}
                  disabled={loading.generating || !senderConfig.email || !senderConfig.password}
                  className="btn btn-secondary"
                >
                  {loading.generating ? (
                    <>
                      <div className="loading-spinner"></div>
                      Generating...
                    </>
                  ) : (
                    <>
                      <FiRefreshCw /> Regenerate AI Reply
                    </>
                  )}
                </button>
                
                <button 
                  onClick={() => copyToClipboard(customReply)}
                  className="btn btn-secondary"
                >
                  <FiCopy /> Copy to Clipboard
                </button>
              </div>
            </div>
            
            {/* Modal Footer with Send Button */}
            <div className="modal-footer">
              <button 
                onClick={resetModal} 
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <div className="send-button-container">
                <button 
                  onClick={sendAutoReply}
                  disabled={loading.sending || !senderConfig.email || !senderConfig.password || !customReply}
                  className="btn btn-primary btn-large"
                >
                  {loading.sending ? (
                    <>
                      <div className="loading-spinner"></div>
                      Sending Reply...
                    </>
                  ) : (
                    <>
                      <FiSend /> Send Auto Reply
                    </>
                  )}
                </button>
                <small className="send-button-help">
                  This will send the reply to {selectedEmail.recipient_email}
                </small>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export default AutoReplyTab;
