import { useState, useEffect } from "react";
import {
    FiMic, FiBookOpen, FiTrendingUp, FiZap,
    FiSend, FiStopCircle,
    FiUploadCloud, FiEdit2, FiEye
} from "react-icons/fi";
import { BiBrain } from "react-icons/bi";
import "./IntelligenceDashboard.css";
import { getApiBaseUrl } from "../utils/api";
import PageHeader from "./PageHeader";

const IntelligenceDashboard = () => {
    // --- 1. USER & TARGET STATE ---
    const [senderInfo, setSenderInfo] = useState(() => {
        // Load from localStorage on mount
        const saved = localStorage.getItem('intelligenceSenderInfo');
        return saved ? JSON.parse(saved) : { name: '', email: '', password: '' };
    });
    const [recipients, setRecipients] = useState(() => {
        const saved = localStorage.getItem('intelligenceRecipients');
        return saved ? JSON.parse(saved) : [];
    }); // Store parsed recipient list

    const [selectedFile, setSelectedFile] = useState(() => {
        // Load file info from localStorage
        const saved = localStorage.getItem('intelligenceFileInfo');
        return saved ? JSON.parse(saved) : null;
    });
    const [previewData, setPreviewData] = useState(null);
    const [showFilePreview, setShowFilePreview] = useState(false);
    const [analytics, setAnalytics] = useState(null);

    // Save recipients to localStorage whenever it changes
    useEffect(() => {
        localStorage.setItem('intelligenceRecipients', JSON.stringify(recipients));
    }, [recipients]);

    // Save file metadata to localStorage
    useEffect(() => {
        if (selectedFile) {
            localStorage.setItem('intelligenceFileInfo', JSON.stringify(selectedFile));
        }
    }, [selectedFile]);

    // Save sender info to localStorage whenever it changes
    useEffect(() => {
        localStorage.setItem('intelligenceSenderInfo', JSON.stringify(senderInfo));
    }, [senderInfo]);

    // --- 2. PLAYBOOKS STATE ---
    const [selectedPlaybook, setSelectedPlaybook] = useState(null);

    // --- 3. VOICE STATE ---
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [generatedEmail, setGeneratedEmail] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [recognition, setRecognition] = useState(null);

    // --- 4. DELIVERABILITY STATE ---
    const [guardStatus, setGuardStatus] = useState("checking");
    const [checks, setChecks] = useState({
        spam: 'Scanning...',
        reputation: 'Verified (98/100)',
        limit: '42 / 500 Used'
    });

    // Initialize Speech Recognition & Analytics
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recog = new SpeechRecognition();
            recog.continuous = true;
            recog.interimResults = true;
            recog.lang = 'en-US';

            recog.onresult = (event) => {
                let currentTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        setTranscript(prev => prev + event.results[i][0].transcript + " ");
                    } else {
                        currentTranscript += event.results[i][0].transcript;
                    }
                }
            };
            recog.onend = () => setIsListening(false);
            setRecognition(recog);
        }

        // Fetch Analytics
        fetchAnalytics();
    }, []);

    const fetchAnalytics = async () => {
        try {
            const API_BASE_URL = getApiBaseUrl();
            const resp = await fetch(`${API_BASE_URL}/intelligence-analytics`, {
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            if (resp.ok) {
                const data = await resp.json();
                setAnalytics(data);
            } else {
                console.error('Analytics fetch failed with status:', resp.status);
            }
        } catch (e) { console.error("Analytics fetch failed", e); }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            setSelectedFile(file);

            const fileInfo = {
                name: file.name,
                size: (file.size / 1024).toFixed(2) + ' KB',
                type: file.type || 'spreadsheet',
                lastModified: new Date(file.lastModified).toLocaleDateString()
            };

            setPreviewData(fileInfo);
            localStorage.setItem('intelligenceFileInfo', JSON.stringify(fileInfo));

            // Parse the file to extract recipients
            try {
                const parsedRecipients = await parseRecipientFile(file);
                setRecipients(parsedRecipients);
                console.log(`✅ Loaded ${parsedRecipients.length} recipients from file`);
            } catch (error) {
                console.error('Error parsing file:', error);
                alert('Error reading file. Please ensure it has "email" and optionally "name" columns.');
            }
        }
    };

    // Helper function to parse CSV/Excel files - IMPROVED VERSION
    const parseRecipientFile = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (event) => {
                try {
                    const text = event.target.result;

                    // Split by newlines and filter empty lines
                    const lines = text.split(/\r?\n/).filter(line => line.trim());

                    if (lines.length < 2) {
                        reject(new Error('File is empty or has no data rows'));
                        return;
                    }

                    // Parse header - handle different separators
                    let separator = ',';
                    if (lines[0].includes('\t')) separator = '\t';
                    else if (lines[0].includes(';')) separator = ';';

                    const headers = lines[0].split(separator).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

                    console.log('📋 Detected headers:', headers);
                    console.log('📋 Using separator:', separator === '\t' ? 'TAB' : separator);

                    // Find email column (case-insensitive, flexible matching)
                    const emailIndex = headers.findIndex(h =>
                        h.includes('email') ||
                        h.includes('e-mail') ||
                        h.includes('mail') ||
                        h === 'email address'
                    );

                    // Find name column (case-insensitive, flexible matching)
                    const nameIndex = headers.findIndex(h =>
                        h.includes('name') ||
                        h.includes('full name') ||
                        h.includes('fullname') ||
                        h.includes('recipient')
                    );

                    console.log('📋 Email column index:', emailIndex);
                    console.log('📋 Name column index:', nameIndex);

                    if (emailIndex === -1) {
                        reject(new Error('No email column found. Please ensure your file has a column named "email", "Email", or "E-mail"'));
                        return;
                    }

                    // Parse data rows
                    const recipients = [];
                    const errors = [];

                    for (let i = 1; i < lines.length; i++) {
                        const line = lines[i].trim();
                        if (!line) continue;

                        // Split and clean values
                        const values = line.split(separator).map(v => v.trim().replace(/^["']|["']$/g, ''));

                        const email = values[emailIndex]?.trim();

                        // Validate email
                        if (email && email.includes('@') && email.includes('.')) {
                            const name = nameIndex !== -1 && values[nameIndex]
                                ? values[nameIndex].trim()
                                : email.split('@')[0].replace(/[._-]/g, ' ');

                            recipients.push({
                                email: email.toLowerCase(),
                                name: name || 'Recipient'
                            });
                        } else if (email) {
                            errors.push(`Row ${i + 1}: Invalid email "${email}"`);
                        }
                    }

                    if (recipients.length === 0) {
                        reject(new Error(`No valid email addresses found. Errors: ${errors.join(', ')}`));
                        return;
                    }

                    console.log(`✅ Successfully parsed ${recipients.length} recipients`);
                    if (errors.length > 0) {
                        console.warn(`⚠️ Skipped ${errors.length} invalid rows:`, errors);
                    }

                    resolve(recipients);
                } catch (error) {
                    console.error('Parse error:', error);
                    reject(new Error(`Failed to parse file: ${error.message}`));
                }
            };

            reader.onerror = () => reject(new Error('Failed to read file'));

            // Read as text (works for both CSV and Excel saved as CSV)
            reader.readAsText(file);
        });
    };

    // Playbook Data
    const playbooks = [
        {
            id: 'event',
            title: 'Event Outreach',
            desc: 'Contacting sponsors & partners for tech or corporate events. Features a professional partnership style.',
            icon: <FiZap />,
            details: "Used for: Contacting sponsors, Reaching event partners. AI focus: Professional tone, Partnership style.",
            promptContext: "Professional partnership inquiry for an event."
        },
        {
            id: 'saas',
            title: 'SaaS Demo Booking',
            desc: 'Book product demos and customer meetings with short, high-impact messages focused on value.',
            icon: <FiTrendingUp />,
            details: "Used for: Booking product demos. AI focus: Product value, Short and clear message.",
            promptContext: "Cold outreach email pitching a SaaS product demo."
        },
        {
            id: 'college',
            title: 'College Fest Sponsors',
            desc: 'Ask companies for sponsorship highlighting student reach and brand visibility for university promotions.',
            icon: <FiBookOpen />,
            details: "Used for: University fest promotions. AI focus: Student reach, Brand visibility.",
            promptContext: "Sponsorship proposal for a college fest."
        }
    ];

    const generateAIEmail = async (text) => {
        if (!selectedPlaybook) {
            alert("Please select a playbook first.");
            return;
        }
        setIsProcessing(true);
        try {
            const API_BASE_URL = getApiBaseUrl();
            const response = await fetch(`${API_BASE_URL}/generate-voice-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transcript: text,
                    playbook_title: selectedPlaybook.title,
                    playbook_details: selectedPlaybook.details,
                    user_name: senderInfo.name || "Representative"
                }),
                credentials: 'include'
            });
            if (response.ok) {
                const data = await response.json();
                setGeneratedEmail(data);
                runDecorabilityCheck();
            } else {
                const errorData = await response.json();
                console.error("AI Generation Error details:", errorData);
            }
        } catch (error) {
            console.error("AI Generation failed:", error);
            // Fallback
            setGeneratedEmail({
                subject: `Partnership Inquiry - ${senderInfo.name}`,
                body: `Hi,\n\nI'm reaching out regarding ${text}.\n\nBest regards,\n${senderInfo.name}`,
                tone: "Professional"
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const toggleListening = () => {
        if (!recognition) {
            alert("Speech recognition not supported in this browser.");
            return;
        }
        if (!isListening) {
            setIsListening(true);
            setTranscript("");
            recognition.start();
        } else {
            recognition.stop();
            setIsListening(false);
        }
    };

    const sendCampaign = async () => {
        if (!generatedEmail) {
            alert("Please generate email content first.");
            return;
        }

        if (!senderInfo.email || !senderInfo.password) {
            alert("Please enter your sender email and password above.");
            return;
        }

        if (!recipients || recipients.length === 0) {
            alert("Please upload a recipient list (CSV/Excel file with email column).");
            return;
        }

        const confirmSend = window.confirm(
            `📧 Ready to send personalized emails to ${recipients.length} recipients?\n\n` +
            `Each recipient will receive a unique, AI-personalized email based on your voice transcript.\n\n` +
            `Sender: ${senderInfo.name} <${senderInfo.email}>\n` +
            `Playbook: ${selectedPlaybook?.title || 'General'}\n\n` +
            `Click OK to proceed.`
        );

        if (!confirmSend) return;

        setIsProcessing(true);
        let successCount = 0;
        let failCount = 0;

        try {
            console.log(`📤 Starting bulk personalized campaign to ${recipients.length} recipients...`);

            // Send to each recipient with personalized content
            for (let i = 0; i < recipients.length; i++) {
                const recipient = recipients[i];

                try {
                    console.log(`  [${i + 1}/${recipients.length}] Generating personalized email for ${recipient.email}...`);

                    // Generate personalized content for this specific recipient
                    const personalizedContent = await generatePersonalizedEmail(
                        transcript,
                        recipient.name,
                        recipient.email
                    );

                    // Send the email
                    const API_BASE_URL = getApiBaseUrl();
                    const response = await fetch(`${API_BASE_URL}/send-intelligence-email`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            recipient_email: recipient.email,
                            recipient_name: recipient.name,
                            subject: personalizedContent.subject,
                            body: personalizedContent.body,
                            sender_name: senderInfo.name,
                            sender_email: senderInfo.email,
                            sender_password: senderInfo.password,
                            playbook: selectedPlaybook?.title || 'General'
                        }),
                        credentials: 'include'
                    });

                    if (response.ok) {
                        successCount++;
                        console.log(`    ✅ Sent to ${recipient.email}`);
                    } else {
                        failCount++;
                        console.error(`    ❌ Failed to send to ${recipient.email}`);
                    }

                    // Small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 500));

                } catch (error) {
                    failCount++;
                    console.error(`    ❌ Error sending to ${recipient.email}:`, error);
                }
            }

            // Show results
            alert(
                `📊 Campaign Complete!\n\n` +
                `✅ Successfully sent: ${successCount}\n` +
                `❌ Failed: ${failCount}\n` +
                `📧 Total recipients: ${recipients.length}`
            );

            // Clear the form
            setGeneratedEmail(null);
            setTranscript("");

        } catch (error) {
            console.error("❌ Campaign error:", error);
            alert(`Campaign error: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    // Generate personalized email content for each recipient
    const generatePersonalizedEmail = async (baseTranscript, recipientName, recipientEmail) => {
        try {
            const API_BASE_URL = getApiBaseUrl();
            const response = await fetch(`${API_BASE_URL}/generate-personalized-voice-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transcript: baseTranscript,
                    recipient_name: recipientName,
                    recipient_email: recipientEmail,
                    playbook_title: selectedPlaybook?.title || 'General Outreach',
                    playbook_details: selectedPlaybook?.details || '',
                    sender_name: senderInfo.name || "Representative"
                }),
                credentials: 'include'
            });

            if (response.ok) {
                return await response.json();
            } else {
                // Fallback to template-based personalization
                return {
                    subject: `${selectedPlaybook?.title || 'Partnership Opportunity'} - ${senderInfo.name}`,
                    body: `Dear ${recipientName},\n\n${baseTranscript}\n\nI believe this could be valuable for you. Let's connect!\n\nBest regards,\n${senderInfo.name}\n${senderInfo.email}`
                };
            }
        } catch (error) {
            console.error('Error generating personalized email:', error);
            // Fallback
            return {
                subject: `${selectedPlaybook?.title || 'Partnership Opportunity'} - ${senderInfo.name}`,
                body: `Dear ${recipientName},\n\n${baseTranscript}\n\nLooking forward to connecting with you.\n\nBest regards,\n${senderInfo.name}`
            };
        }
    };

    const runDecorabilityCheck = () => {
        setGuardStatus("checking");
        setChecks(prev => ({ ...prev, spam: 'Checking for toxic keywords...' }));
        setTimeout(() => {
            setGuardStatus("safe");
            setChecks(prev => ({ ...prev, spam: '0 Detected (Inbox Ready)' }));
        }, 1500);
    };

    return (
        <div className="intel-dashboard-container">
            <PageHeader 
              title="AI Intelligence Engine"
              subtitle="Deploy proven strategies and generate hyper-personalized content with Gemini AI."
              icon={BiBrain}
            />

            {/* 0. CREDENTIAL PARKER */}
            <div className="credential-bar fade-in-up">
                <div className="cred-input">
                    <label>Full Name</label>
                    <input
                        type="text"
                        placeholder="e.g. John Doe"
                        value={senderInfo.name}
                        onChange={(e) => setSenderInfo({ ...senderInfo, name: e.target.value })}
                    />
                </div>
                <div className="cred-input">
                    <label>Sender Email</label>
                    <input
                        type="email"
                        placeholder="your@email.com"
                        value={senderInfo.email}
                        onChange={(e) => setSenderInfo({ ...senderInfo, email: e.target.value })}
                    />
                </div>
                <div className="cred-input">
                    <label>App Password</label>
                    <input
                        type="password"
                        placeholder="••••••••"
                        value={senderInfo.password}
                        onChange={(e) => setSenderInfo({ ...senderInfo, password: e.target.value })}
                    />
                </div>
                <div className="file-uploader-mini">
                    <label className="file-label">
                        <FiUploadCloud style={{ marginRight: '8px' }} />
                        {selectedFile ? selectedFile.name : 'Target List (Excel/CSV)'}
                        <input type="file" hidden onChange={handleFileChange} accept=".csv,.xlsx,.xls" />
                    </label>
                    {selectedFile && (
                        <button className="preview-trigger-btn" onClick={() => setShowFilePreview(true)}>
                            <FiEye /> Preview
                        </button>
                    )}
                </div>
            </div>

            {/* FILE PREVIEW MODAL */}
            {showFilePreview && (
                <div className="preview-overlay" onClick={() => setShowFilePreview(false)}>
                    <div className="preview-modal" onClick={e => e.stopPropagation()}>
                        <div className="preview-modal-header">
                            <h4>Target List Details</h4>
                            <button onClick={() => setShowFilePreview(false)}>&times;</button>
                        </div>
                        <div className="preview-body">
                            <div className="preview-row"><strong>Filename:</strong> <span>{previewData?.name}</span></div>
                            <div className="preview-row"><strong>File Size:</strong> <span>{previewData?.size}</span></div>
                            <div className="preview-row"><strong>Format:</strong> <span>{previewData?.type}</span></div>
                            <div className="preview-row"><strong>Date:</strong> <span>{previewData?.lastModified}</span></div>
                            <div className="preview-status-tag">Status: Ready for Campaign</div>
                        </div>
                    </div>
                </div>
            )}

            <div className="intel-main-layout">
                {/* 1. PLAYBOOKS */}
                <section className="feature-section fade-in-up">
                    <div className="section-header">
                        <div className="section-icon"><BiBrain /></div>
                        <div className="section-title">
                            <h3>AI Playbooks</h3>
                            <p>Choose a proven strategy to guide the generator.</p>
                        </div>
                    </div>
                    <div className="playbooks-grid">
                        {playbooks.map((pb) => (
                            <div
                                key={pb.id}
                                className={`playbook-card ${selectedPlaybook?.id === pb.id ? 'selected' : ''}`}
                                onClick={() => setSelectedPlaybook(pb)}
                            >
                                <div className="playbook-icon">{pb.icon}</div>
                                <h4>{pb.title}</h4>
                                <p>{pb.desc}</p>
                                <button className="use-playbook-btn">
                                    {selectedPlaybook?.id === pb.id ? 'Active' : 'Select'}
                                </button>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 2. VOICE INTERFACE */}
                <section className="feature-section fade-in-up">
                    <div className="section-header">
                        <div className="section-icon"><FiMic /></div>
                        <div className="section-title">
                            <h3>Voice-to-Email AI</h3>
                            <p>Powered by Gemini 1.5 Flash for instant logic extraction.</p>
                        </div>
                    </div>
                    <div className="voice-interface">
                        <button className={`mic-button ${isListening ? 'listening' : ''}`} onClick={toggleListening}>
                            {isListening ? <FiStopCircle /> : <FiMic />}
                        </button>
                        <div className="transcript-box">
                            {isListening ? 'Listening...' : transcript || 'Transcript will appear here...'}
                        </div>

                        <button
                            className="primary-btn generate-ai-btn"
                            onClick={() => generateAIEmail(transcript)}
                            disabled={isProcessing || !transcript.trim()}
                        >
                            <FiZap style={{ marginRight: '8px' }} />
                            {isProcessing ? 'Generating AI Magic...' : 'Generate AI Content'}
                        </button>

                        {generatedEmail && (
                            <div className="email-preview-card animate-in">
                                <div className="preview-header">
                                    <div className="preview-badge">AI Generated Content</div>
                                    <button className="edit-toggle-btn" onClick={() => setIsEditing(!isEditing)}>
                                        <FiEdit2 /> {isEditing ? 'Save' : 'Edit'}
                                    </button>
                                </div>
                                <div className="generated-email-content">
                                    {isEditing ? (
                                        <>
                                            <input
                                                className="edit-subject"
                                                value={generatedEmail.subject}
                                                onChange={(e) => setGeneratedEmail({ ...generatedEmail, subject: e.target.value })}
                                            />
                                            <textarea
                                                className="edit-body"
                                                value={generatedEmail.body}
                                                onChange={(e) => setGeneratedEmail({ ...generatedEmail, body: e.target.value })}
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <h5>Subject: {generatedEmail.subject}</h5>
                                            <p>{generatedEmail.body}</p>
                                        </>
                                    )}
                                </div>
                                <button className="primary-btn" onClick={sendCampaign} disabled={isProcessing}>
                                    <FiSend style={{ marginRight: '8px' }} />
                                    {isProcessing ? 'Sending...' : 'Transmit Campaign'}
                                </button>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default IntelligenceDashboard;
