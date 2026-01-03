import React, { useState, useEffect, useCallback } from "react";
import {
  FiFile, FiMail, FiSettings, FiEye, FiBarChart2,
  FiCheck, FiRefreshCw,
  FiX, FiPlus, FiSend, FiEdit, FiSave,
  FiChevronDown, FiChevronUp,
  FiTrash2, FiCpu, FiLayers, FiUsers,
  FiUploadCloud, FiMessageCircle, FiAward,
  FiDatabase, FiClock,
  FiAlertTriangle, FiDownload, FiFilter
} from "react-icons/fi";
import "./BulkMailTab.css";
import EmailTemplateTab from "./EmailTemplateTab";
import FileUploadBox from "./common/FileUploadBox";
import { getApiBaseUrl } from "../utils/api";

// Robust API base URL resolver (handles ":5000", "5000", etc.)
const API_BASE_URL = getApiBaseUrl();

function BulkMailTab() {
  // Tab state - ADD THIS
  const [activeSubTab, setActiveSubTab] = useState("email-templates");

  const [file, setFile] = useState(null);
  const [batchSize, setBatchSize] = useState(250);
  const [preview, setPreview] = useState({ columns: [], data: [] });
  const [totalEmailCount, setTotalEmailCount] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [progress, setProgress] = useState({ sent: 0, total: 0, status: "idle" });
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState({ preview: false, upload: false, generating: false, settings: false });
  const [saveMessage, setSaveMessage] = useState({ text: "", type: "" });
  const [senderAccounts, setSenderAccounts] = useState([{
    email: "",
    password: "",
    sender_name: "",
    provider: "gmail",
    custom_smtp: "",
    custom_imap: "",
    daily_limit: 125
  }]);

  // Email content state
  const [emailContent, setEmailContent] = useState({
    subject: "",
    body: "",
    sender_name: ""
  });

  const [emailProviders] = useState([
    { value: 'gmail', label: 'Gmail', icon: 'G' },
    { value: 'outlook', label: 'Outlook/Hotmail', icon: 'O' },
    { value: 'yahoo', label: 'Yahoo', icon: 'Y' },
    { value: 'icloud', label: 'iCloud', icon: 'I' },
    { value: 'aol', label: 'AOL', icon: 'A' },
    { value: 'zoho', label: 'Zoho', icon: 'Z' },
    { value: 'custom', label: 'Custom Domain', icon: 'C' }
  ]);

  // Add provider configuration guide
  const providerConfigs = {
    gmail: {
      smtp: "smtp.gmail.com:587",
      imap: "imap.gmail.com:993",
      help: "Use Gmail app password (not your regular password)"
    },
    outlook: {
      smtp: "smtp-mail.outlook.com:587",
      imap: "outlook.office365.com:993",
      help: "Use your Microsoft account password"
    },
    yahoo: {
      smtp: "smtp.mail.yahoo.com:465",
      imap: "imap.mail.yahoo.com:993",
      help: "Requires app-specific password"
    },
    zoho: {  // ADD THIS
      smtp: "smtppro.zoho.in:465",
      imap: "imappro.zoho.in:993",
      help: "Use your Zoho account password"
    },
    icloud: {  // ADD THIS (optional)
      smtp: "smtp.mail.me.com:587",
      imap: "imap.mail.me.com:993",
      help: "Requires app-specific password"
    },
    aol: {  // ADD THIS (optional)
      smtp: "smtp.aol.com:587",
      imap: "imap.aol.com:993",
      help: "Requires app-specific password"
    },
    custom: {
      smtp: "",
      imap: "",
      help: "Enter your custom SMTP/IMAP settings"
    }
  };

  const [prompt, setPrompt] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Template state
  const [templateFile, setTemplateFile] = useState(null);
  const [useTemplates, setUseTemplates] = useState(false);
  const [positionColumn, setPositionColumn] = useState("position");
  const [loadedTemplates, setLoadedTemplates] = useState([]);
  const [templateDetails, setTemplateDetails] = useState([]);

  // Campaign history state
  const [campaigns, setCampaigns] = useState([]);
  const [showCampaignHistory, setShowCampaignHistory] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [campaignEmails, setCampaignEmails] = useState([]);
  const [searchCampaign, setSearchCampaign] = useState("");

  const filteredCampaigns = campaigns.filter(c =>
    c.campaign_name?.toLowerCase().includes(searchCampaign.toLowerCase()) ||
    c.original_filename?.toLowerCase().includes(searchCampaign.toLowerCase())
  );

  // File tracking state
  const [currentFileId, setCurrentFileId] = useState(null);
  const [currentTemplateFileId, setCurrentTemplateFileId] = useState(null);

  // Duplicate file handling state
  const [duplicateFile, setDuplicateFile] = useState(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [pendingUploadData, setPendingUploadData] = useState(null);

  // Authentication helper function - FIXED FOR FILE UPLOADS
  const makeAuthenticatedRequest = async (url, options = {}) => {
    // For FormData requests, don't set Content-Type - let the browser set it
    const isFormData = options.body instanceof FormData;

    const defaultOptions = {
      credentials: 'include', // This sends cookies with the request
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
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
        localStorage.removeItem('emailContent');

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

  // Special function for file uploads that doesn't override Content-Type
  const makeFileUploadRequest = async (url, formData, options = {}) => {
    const defaultOptions = {
      method: 'POST',
      credentials: 'include',
      body: formData,
      // No Content-Type header - let browser set it automatically
    };

    try {
      const response = await fetch(url, { ...defaultOptions, ...options });

      if (response.status === 401) {
        console.error('Authentication required. Please log in.');
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        localStorage.removeItem('emailContent');
        window.location.href = '/';
        throw new Error('Authentication required');
      }

      return response;
    } catch (error) {
      console.error('File upload request failed:', error);
      if (error.message.includes('Failed to fetch')) {
        alert('Cannot connect to server. Please make sure the backend is running on localhost:5000');
      }
      throw error;
    }
  };

  // Add session validation on component mount
  useEffect(() => {
    const validateSession = async () => {
      try {
        const res = await makeAuthenticatedRequest(`${API_BASE_URL}/auth/check-auth`);
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

  // Debug file state
  useEffect(() => {
    if (file) {
      console.log('File state updated:', {
        name: file.name,
        size: file.size,
        type: file.type,
        isFile: file instanceof File
      });
    }
  }, [file]);

  // Handle file selection - IMPROVED VERSION
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    console.log('File selected:', {
      name: selectedFile?.name,
      size: selectedFile?.size,
      type: selectedFile?.type,
      isFile: selectedFile instanceof File
    });

    if (!selectedFile) {
      console.error('No file selected!');
      return;
    }

    setFile(selectedFile);
    setPreview({ columns: [], data: [] });
    setShowPreview(false);
    setCurrentFileId(null); // Reset file ID when new file is selected
    setDuplicateFile(null); // Reset duplicate file state
    setPendingUploadData(null); // Reset pending upload data
    
    // Auto-preview to get email count for distribution
    autoPreviewAndDistribute(selectedFile);
  };

  // Auto-preview file and distribute limits across sender accounts
  const autoPreviewAndDistribute = async (selectedFile) => {
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await makeFileUploadRequest(`${API_BASE_URL}/preview`, formData);
      const data = await res.json();

      if (res.ok) {
        // Use total_count from API if available, otherwise fall back to data.length
        const emailCount = data.total_count || data.data?.length || 0;
        console.log(`📊 File loaded: ${emailCount} emails found (total_count: ${data.total_count}, preview rows: ${data.data?.length})`);
        
        // Store the email count and preview data
        setTotalEmailCount(emailCount);
        setPreview(data);
        
        // Distribute limits across sender accounts
        if (emailCount > 0) {
          distributeEmailLimits(emailCount);
        }
      }
    } catch (err) {
      console.error("Error auto-previewing file:", err);
      setTotalEmailCount(0);
    }
  };

  // Distribute email count equally across sender accounts
  const distributeEmailLimits = (totalEmails) => {
    if (senderAccounts.length === 0 || totalEmails === 0) return;

    const emailsPerAccount = Math.ceil(totalEmails / senderAccounts.length);
    const limitPerAccount = Math.min(emailsPerAccount, 200); // Max 200
    const totalCapacity = limitPerAccount * senderAccounts.length;

    const updatedAccounts = senderAccounts.map(account => ({
      ...account,
      daily_limit: limitPerAccount
    }));

    setSenderAccounts(updatedAccounts);
    
    console.log(`📊 DISTRIBUTION DETAILS:`);
    console.log(`   Total Emails in File: ${totalEmails}`);
    console.log(`   Number of Sender Accounts: ${senderAccounts.length}`);
    console.log(`   Emails Per Account: ${emailsPerAccount}`);
    console.log(`   Limit Set Per Account: ${limitPerAccount}`);
    console.log(`   Total Capacity: ${totalCapacity}`);
    
    if (totalCapacity < totalEmails) {
      alert(`⚠️ WARNING: Insufficient capacity!\n\nYour file has ${totalEmails} emails, but your current sender accounts can only handle ${totalCapacity} emails.\n\nEmails that will be sent: ${totalCapacity}\nEmails that will be SKIPPED: ${totalEmails - totalCapacity}\n\nPlease add more sender accounts or increase limits.`);
    }
  };

  // Handle template file selection - FIXED FOR FILE UPLOADS
  const handleTemplateFileChange = async (selectedFile) => {
    setTemplateFile(selectedFile);
    setCurrentTemplateFileId(null); // Reset template file ID when new file is selected

    if (!selectedFile) {
      setLoadedTemplates([]);
      setTemplateDetails([]);
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await makeFileUploadRequest(`${API_BASE_URL}/upload-templates`, formData);

      const data = await res.json();

      if (res.ok) {
        setLoadedTemplates(data.positions || []);
        setTemplateDetails(data.templates || []);
        alert(`Successfully loaded ${data.positions.length} templates`);
      } else {
        alert("Error loading templates: " + data.error);
        setTemplateFile(null);
        setLoadedTemplates([]);
        setTemplateDetails([]);
      }
    } catch (err) {
      alert("Error loading templates: " + err.message);
      setTemplateFile(null);
      setLoadedTemplates([]);
      setTemplateDetails([]);
    }
  };

  // Delete uploaded file from backend
  const deleteFileFromBackend = async (fileId) => {
    try {
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/delete-file/${fileId}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (res.ok) {
        return { success: true, message: data.message };
      } else {
        return { success: false, message: data.error };
      }
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  // Delete campaign from backend
  const deleteCampaign = async (campaignId) => {
    try {
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/delete-campaign/${campaignId}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (res.ok) {
        return { success: true, message: data.message };
      } else {
        return { success: false, message: data.error };
      }
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  // Delete uploaded file
  const handleDeleteFile = async () => {
    if (window.confirm("Are you sure you want to remove the uploaded file? This action cannot be undone.")) {
      // If we have a file ID from backend, delete it from database
      if (currentFileId) {
        const result = await deleteFileFromBackend(currentFileId);
        if (!result.success) {
          alert(`Error deleting file from database: ${result.message}`);
        }
      }

      // Clear frontend state
      setFile(null);
      setPreview({ columns: [], data: [] });
      setShowPreview(false);
      setCurrentFileId(null);
      setDuplicateFile(null);
      setPendingUploadData(null);

      // Reset file input
      const fileInput = document.getElementById('fileInput');
      if (fileInput) fileInput.value = '';
    }
  };

  // Delete template file
  const handleDeleteTemplateFile = async () => {
    if (window.confirm("Are you sure you want to remove the template file? This action cannot be undone.")) {
      // If we have a template file ID from backend, delete it from database
      if (currentTemplateFileId) {
        const result = await deleteFileFromBackend(currentTemplateFileId);
        if (!result.success) {
          alert(`Error deleting template file from database: ${result.message}`);
        }
      }

      setTemplateFile(null);
      setLoadedTemplates([]);
      setTemplateDetails([]);
      setCurrentTemplateFileId(null);

      // Reset template file input
      const templateFileInput = document.getElementById('templateFileInput');
      if (templateFileInput) templateFileInput.value = '';
    }
  };

  // Delete campaign handler
  const handleDeleteCampaign = async (campaignId, campaignName) => {
    if (window.confirm(`Are you sure you want to delete campaign "${campaignName}"? This will also delete all associated sent emails and cannot be undone.`)) {
      const result = await deleteCampaign(campaignId);

      if (result.success) {
        alert(result.message);
        // Refresh the campaign list
        fetchCampaigns();
      } else {
        alert(`Error deleting campaign: ${result.message}`);
      }
    }
  };

  // Toggle preview dropdown
  const togglePreview = () => {
    if (!file) {
      alert("Please upload a file first!");
      return;
    }

    if (!showPreview && preview.data.length === 0) {
      handlePreview();
    } else {
      setShowPreview(!showPreview);
    }
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Add sender account field
  const addSenderAccount = () => {
    const newAccounts = [...senderAccounts, { email: "", password: "", sender_name: "", daily_limit: 125 }];
    
    // Redistribute limits if file is already uploaded
    if (totalEmailCount > 0) {
      const emailsPerAccount = Math.ceil(totalEmailCount / newAccounts.length);
      const limitPerAccount = Math.min(emailsPerAccount, 200);
      
      console.log(`➕ Added account. Redistributing ${totalEmailCount} emails across ${newAccounts.length} accounts = ${limitPerAccount} per account`);
      
      const updatedAccounts = newAccounts.map(account => ({
        ...account,
        daily_limit: limitPerAccount
      }));
      setSenderAccounts(updatedAccounts);
    } else {
      setSenderAccounts(newAccounts);
    }
  };

  // Remove sender account field
  const removeSenderAccount = (index) => {
    if (senderAccounts.length <= 1) return;
    const updatedAccounts = [...senderAccounts];
    updatedAccounts.splice(index, 1);
    
    // Redistribute limits if file is already uploaded
    if (totalEmailCount > 0) {
      const emailsPerAccount = Math.ceil(totalEmailCount / updatedAccounts.length);
      const limitPerAccount = Math.min(emailsPerAccount, 200);
      
      console.log(`➖ Removed account. Redistributing ${totalEmailCount} emails across ${updatedAccounts.length} accounts = ${limitPerAccount} per account`);
      
      const redistributedAccounts = updatedAccounts.map(account => ({
        ...account,
        daily_limit: limitPerAccount
      }));
      setSenderAccounts(redistributedAccounts);
    } else {
      setSenderAccounts(updatedAccounts);
    }
  };

  // Update sender account field
  const updateSenderAccount = (index, field, value) => {
    const updatedAccounts = [...senderAccounts];
    updatedAccounts[index][field] = value;
    setSenderAccounts(updatedAccounts);
  };

  // Generate email content using Gemini API
  const generateEmailContent = async () => {
    if (!prompt.trim()) {
      alert("Please enter a prompt to generate email content!");
      return;
    }

    setLoading({ ...loading, generating: true });
    try {
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/generate-content`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      const data = await res.json();

      if (res.ok) {
        setEmailContent(data);
        setIsEditing(false);
        localStorage.setItem('emailContent', JSON.stringify(data));
      } else {
        alert("Error generating content: " + data.error);
      }
    } catch (err) {
      alert("Error generating content: " + err.message);
    } finally {
      setLoading({ ...loading, generating: false });
    }
  };

  // Clear email content
  const clearEmailContent = async () => {
    if (window.confirm("Are you sure you want to clear all email content?")) {
      const clearedContent = {
        subject: "",
        body: "",
        sender_name: ""
      };

      setEmailContent(clearedContent);
      setIsEditing(false);
      localStorage.removeItem('emailContent');

      // Also clear on the backend
      try {
        await makeAuthenticatedRequest(`${API_BASE_URL}/update-content`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(clearedContent),
        });
      } catch (err) {
        console.error("Error clearing content on backend:", err);
      }
    }
  };

  // Update email content on the backend
  const updateEmailContent = async () => {
    try {
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/update-content`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emailContent),
      });

      const data = await res.json();

      if (res.ok) {
        setIsEditing(false);
        localStorage.setItem('emailContent', JSON.stringify(emailContent));
      } else {
        alert("Error updating content: " + data.error);
      }
    } catch (err) {
      alert("Error updating content: " + err.message);
    }
  };

  // Get stored email content - IMPROVED VERSION
  const getEmailContent = async () => {
    try {
      const savedContent = localStorage.getItem('emailContent');
      if (savedContent) {
        setEmailContent(JSON.parse(savedContent));
      }

      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/get-content`);
      const data = await res.json();

      if (res.ok && data.subject) {
        setEmailContent(data);
        localStorage.setItem('emailContent', JSON.stringify(data));
      }
    } catch (err) {
      console.error("Error fetching email content:", err);
    }
  };

  // Fetch settings from the database
  const getSettings = async () => {
    try {
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/get-settings`);
      if (res.ok) {
        const data = await res.json();
        if (data.sender_accounts && data.sender_accounts.length > 0) {
          setSenderAccounts(data.sender_accounts);
        }
        if (data.batch_size) {
          setBatchSize(data.batch_size);
        }
      }
    } catch (err) {
      console.error("Error fetching settings:", err);
    }
  };

  // Save settings to the database
  const saveSettings = async () => {
    setLoading(prev => ({ ...prev, settings: true }));
    setSaveMessage({ text: "", type: "" });

    try {
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/save-settings`, {
        method: 'POST',
        body: JSON.stringify({
          sender_accounts: senderAccounts,
          batch_size: batchSize
        })
      });
      const data = await res.json();

      if (res.ok) {
        setSaveMessage({ text: "Sender details saved successfully", type: "success" });
        setTimeout(() => setSaveMessage({ text: "", type: "" }), 5000);
      } else {
        setSaveMessage({ text: data.error || "Error saving settings", type: "error" });
      }
    } catch (err) {
      setSaveMessage({ text: "Connection error. Failed to save settings.", type: "error" });
    } finally {
      setLoading(prev => ({ ...prev, settings: false }));
    }
  };

  // Preview uploaded file - FIXED FOR FILE UPLOADS
  const handlePreview = async () => {
    if (!file) {
      alert("Please upload a file first!");
      return;
    }

    setLoading({ ...loading, preview: true });
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await makeFileUploadRequest(`${API_BASE_URL}/preview`, formData);

      const data = await res.json();

      if (res.ok) {
        setPreview(data);
        setShowPreview(true);
      } else {
        alert("Error fetching preview: " + data.error);
      }
    } catch (err) {
      alert("Error fetching preview: " + err.message);
    } finally {
      setLoading({ ...loading, preview: false });
    }
  };

  // Fetch campaign history - IMPROVED VERSION
  const fetchCampaigns = async () => {
    try {
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/campaigns`);
      const data = await res.json();
      if (res.ok) {
        setCampaigns(data.campaigns || []);
      } else {
        console.error("Error fetching campaigns:", data.error);
      }
    } catch (err) {
      console.error("Error fetching campaigns:", err);
    }
  };

  // Fetch campaign emails
  const fetchCampaignEmails = async (campaignId) => {
    try {
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/campaigns/${campaignId}/emails`);
      const data = await res.json();
      if (res.ok) {
        setCampaignEmails(data.emails || []);
      } else {
        console.error("Error fetching campaign emails:", data.error);
        alert("Error fetching campaign email details: " + data.error);
      }
    } catch (err) {
      console.error("Error fetching campaign emails:", err);
      alert("Error fetching campaign email details: " + err.message);
    }
  };

  // View campaign details
  const viewCampaignDetails = (campaign) => {
    setSelectedCampaign(campaign);
    fetchCampaignEmails(campaign.id);
  };

  // Close campaign details
  const closeCampaignDetails = () => {
    setSelectedCampaign(null);
    setCampaignEmails([]);
  };

  // Add this helper function to debug FormData
  const debugFormData = (formData) => {
    console.log('=== FormData Debug ===');
    for (let pair of formData.entries()) {
      const key = pair[0];
      const value = pair[1];
      if (key === 'file') {
        console.log('file:', value.name, value.size, value.type);
      } else {
        console.log(key + ':', value);
      }
    }
    console.log('=== End FormData Debug ===');
  };

  // Handle duplicate file confirmation - FIXED VERSION
  const handleDuplicateConfirmation = async (replace = false) => {
    setShowDuplicateModal(false);

    if (replace && pendingUploadData) {
      // User chose to replace the file, proceed with upload
      console.log('User chose to replace existing file, proceeding with upload...');
      await performUpload(pendingUploadData, true);
    } else {
      // User chose to keep both files, reset file state
      console.log('User chose to keep both files, resetting file state...');
      setFile(null);
      setDuplicateFile(null);
      setPendingUploadData(null);
      const fileInput = document.getElementById('fileInput');
      if (fileInput) fileInput.value = '';
      alert('Upload cancelled. Please rename your file if you want to keep both versions.');
    }

    // Reset pending data regardless of choice
    setPendingUploadData(null);
  };

  // Perform the actual upload - USING FILE UPLOAD FUNCTION
  const performUpload = async (originalFormData, replaceExisting = false) => {
    try {
      // Create a NEW FormData object to ensure clean state
      const uploadFormData = new FormData();

      // Copy all the data from the original formData
      for (let [key, value] of originalFormData.entries()) {
        uploadFormData.append(key, value);
      }

      // Add replace_existing flag if needed
      if (replaceExisting) {
        uploadFormData.append("replace_existing", "true");
        console.log('Setting replace_existing flag to true in NEW FormData');
      }

      // Debug: Log what's being sent
      console.log('FormData contents for upload:');
      debugFormData(uploadFormData);

      // Use the special file upload function
      const res = await makeFileUploadRequest(`${API_BASE_URL}/upload`, uploadFormData);

      // Store the response text first to handle different status codes
      const responseText = await res.text();
      let data;

      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        throw new Error('Invalid server response');
      }

      console.log('Upload response status:', res.status);
      console.log('Upload response data:', data);

      if (res.ok) {
        setSending(true);
        setProgress({ sent: 0, total: 0, status: "running" });
        // Store the file ID if returned by backend
        if (data.file_id) {
          setCurrentFileId(data.file_id);
        }
        // Refresh campaign list after starting new campaign
        setTimeout(fetchCampaigns, 2000);

        // Show success message with replacement info
        if (data.replaced_existing) {
          alert(`Successfully replaced existing file and started sending ${data.total_recipients} emails!`);
        } else {
          alert(`Successfully started sending ${data.total_recipients} emails!`);
        }

        // Clear duplicate file state on successful upload
        setDuplicateFile(null);
        setPendingUploadData(null);
      } else {
        // Handle duplicate file response
        if (res.status === 409 && data.duplicate) {
          console.log('Duplicate file detected, showing modal');
          console.log('Existing file:', data.existing_file);
          setDuplicateFile(data.existing_file);
          setPendingUploadData(originalFormData); // Store the ORIGINAL formData for retry
          setShowDuplicateModal(true);
          return; // Exit early to prevent showing error alert
        }

        // Show error for other cases
        alert("Error uploading file: " + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert("Error uploading file: " + err.message);
    } finally {
      setLoading({ ...loading, upload: false });
    }
  };

  // Upload file and start sending emails (with duplicate handling) - FIXED VERSION
  const handleUpload = async () => {
    if (!file) {
      alert("Please upload a file first!");
      return;
    }

    if (useTemplates && (!templateFile || loadedTemplates.length === 0)) {
      alert("Please upload a valid template file first!");
      return;
    }

    if (!useTemplates && (!emailContent.subject || !emailContent.body || !emailContent.sender_name)) {
      alert("Please generate or enter email content first!");
      return;
    }

    const validAccounts = senderAccounts.filter(acc => acc.email && acc.password);
    if (validAccounts.length === 0) {
      alert("Please add at least one valid sender email and password!");
      return;
    }

    setLoading({ ...loading, upload: true });

    // Prepare form data - FIXED VERSION
    const formData = new FormData();

    // CRITICAL: Append the file FIRST and make sure it's the actual file object
    // Use the exact same field name that Flask expects: 'file'
    console.log('Appending file to FormData:', file);
    formData.append("file", file);

    formData.append("batch_size", batchSize.toString());
    formData.append("use_templates", useTemplates.toString());
    formData.append("position_column", positionColumn);

    // Only include email content if not using templates
    if (!useTemplates) {
      formData.append("subject", emailContent.subject);
      formData.append("body", emailContent.body);
      formData.append("sender_name", emailContent.sender_name);
    }

    // In handleUpload function, update formData
    senderAccounts.forEach(account => {
      if (account.email && account.password) {
        formData.append("sender_emails[]", account.email);
        formData.append("sender_passwords[]", account.password);
        formData.append("sender_names[]", account.sender_name || "");
        formData.append("sender_providers[]", account.provider);

        if (account.provider === 'custom') {
          formData.append("custom_smtp[]", account.custom_smtp || "");
          formData.append("custom_imap[]", account.custom_imap || "");
        }
      }
    });

    // Debug: Log FormData contents to verify file is included
    console.log('FormData contents before upload:');
    debugFormData(formData);

    // Verify file is properly included
    const fileInFormData = formData.get('file');
    console.log('File in FormData verification:', {
      exists: !!fileInFormData,
      name: fileInFormData?.name,
      size: fileInFormData?.size,
      type: fileInFormData?.type
    });

    // Start the upload process
    await performUpload(formData, false);
  };

  // Poll backend for progress
  useEffect(() => {
    let interval;
    if (sending) {
      interval = setInterval(async () => {
        try {
          const res = await makeAuthenticatedRequest(`${API_BASE_URL}/progress`);
          const data = await res.json();
          setProgress(data);

          if (data.status === "completed" || data.status.startsWith("error")) {
            clearInterval(interval);
            setSending(false);
            // Refresh campaign list when sending completes
            fetchCampaigns();
          }
        } catch (err) {
          console.error("Error fetching progress:", err);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [sending]);

  const fetchCampaignsCallback = useCallback(fetchCampaigns, []);
  const getEmailContentCallback = useCallback(getEmailContent, []);
  const getSettingsCallback = useCallback(getSettings, []);

  // Get email content and campaigns on component mount
  useEffect(() => {
    getEmailContentCallback();
    fetchCampaignsCallback();
    getSettingsCallback();
  }, [getEmailContentCallback, fetchCampaignsCallback, getSettingsCallback]);

  // Calculate progress percentage
  const progressPercentage = progress.total > 0 ? (progress.sent / progress.total) * 100 : 0;

  // Get status badge color
  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'completed': return '#10b981';
      case 'running': return '#3b82f6';
      case 'failed': return '#ef4444';
      case 'pending': return '#6b7280';
      default: return '#6b7280';
    }
  };

  // Add logout function
  const handleLogout = async () => {
    try {
      await makeAuthenticatedRequest(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
      });
    } catch (error) {
      // Ignore errors during logout
    } finally {
      // Clear frontend storage
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      localStorage.removeItem('emailContent');
      // Redirect to login
      window.location.href = '/';
    }
  };

  return (
    <div className="auto-email-container">
      <EmailTemplateTab
        emailContent={emailContent}
        makeAuthenticatedRequest={makeAuthenticatedRequest}
        makeFileUploadRequest={makeFileUploadRequest}
        senderAccounts={senderAccounts}
        batchSize={batchSize}
        fetchCampaigns={fetchCampaigns}
        setProgress={setProgress}
        setSending={setSending}
      />
    </div>
  );
}

export default BulkMailTab;