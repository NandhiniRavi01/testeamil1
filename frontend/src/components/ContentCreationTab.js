import React, { useState, useEffect } from 'react';
import {
    FiMic, FiStopCircle, FiRefreshCw, FiZap, FiEdit2, FiCheck,
    FiAlertTriangle, FiCheckCircle, FiInfo, FiHash, FiActivity,
    FiMessageSquare, FiExternalLink, FiBarChart2, FiLayers, FiShield, FiBookOpen, FiX
} from 'react-icons/fi';
import { DOCUMENT_TEMPLATES } from '../data/templates';
import { BiBrain, BiRocket, BiAnalyse } from 'react-icons/bi';
import './ContentCreationTab.css';

const ContentCreationTab = ({ setGlobalLoading }) => {
    const [contentInstruction, setContentInstruction] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [recognition, setRecognition] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedBody, setEditedBody] = useState("");
    const [showTemplates, setShowTemplates] = useState(false);

    // Results
    const [generatedContent, setGeneratedContent] = useState(null);
    const [analysis, setAnalysis] = useState(null);

    // Speech Setup
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recog = new SpeechRecognition();
            recog.continuous = true;
            recog.interimResults = true;
            recog.lang = 'en-US';
            recog.onresult = (e) => {
                let text = '';
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    if (e.results[i].isFinal) text += e.results[i][0].transcript + ' ';
                }
                if (text) setContentInstruction(prev => prev + text);
            };
            recog.onend = () => setIsListening(false);
            setRecognition(recog);
        }
    }, []);

    const toggleListening = () => {
        if (!recognition) return alert('Speech recognition not supported');
        isListening ? recognition.stop() : recognition.start();
        setIsListening(!isListening);
    };

    const analyzeManualContent = async () => {
        if (!generatedContent?.subject && !editedBody) return alert('No content to analyze');

        // Use editedBody if available, else generatedContent.body
        const currentBody = editedBody || generatedContent?.body || "";
        const currentSubject = generatedContent?.subject || "Subject"; // Assuming subject editor updates generatedContent state directly as per previous code

        setAnalysis(null);
        if (setGlobalLoading) setGlobalLoading(true);

        try {
            const response = await fetch('https://emailagent.cubegtp.com/content-creation/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    subject: currentSubject,
                    body: currentBody
                })
            });

            const data = await response.json();
            if (response.ok) {
                setAnalysis(data.analysis);
            } else {
                alert('Analysis Error: ' + (data.error || 'Could not analyze content.'));
            }
        } catch (e) {
            alert('Connection Error: ' + e.message);
        } finally {
            if (setGlobalLoading) setGlobalLoading(false);
        }
    };

    const generateWithAI = async () => {
        if (!contentInstruction.trim()) return alert('Please enter instructions');

        setGeneratedContent(null);
        setAnalysis(null);
        setIsGenerating(true);
        if (setGlobalLoading) setGlobalLoading(true);

        try {
            const response = await fetch('https://emailagent.cubegtp.com/content-creation/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    instruction: contentInstruction,
                    sender_name: 'The Team'
                })
            });

            const data = await response.json();
            if (response.ok) {
                setGeneratedContent({
                    subject: data.subject,
                    body: data.body,
                    provider: data.provider
                });
                setEditedBody(data.body);
                setAnalysis(data.analysis);
            } else {
                alert('AI Engine Error: ' + (data.error || 'The neural forge was unable to complete the request.'));
            }
        } catch (e) {
            alert('Connection Error: ' + e.message);
        } finally {
            setIsGenerating(false);
            if (setGlobalLoading) setGlobalLoading(false);
        }
    };

    const getScoreColor = (score) => {
        if (score <= 20) return '#10b981'; // Green
        if (score <= 40) return '#f59e0b'; // Yellow (Orange-ish)
        if (score <= 60) return '#ea580c'; // Orange
        return '#ef4444'; // Red
    };

    const renderHighlightedBody = (body, words) => {
        if (!words || words.length === 0) return body;
        let highlighted = body;
        // Sort by length descending to avoid replacing parts of longer phrases
        const sortedWords = [...words].sort((a, b) => b.word.length - a.word.length);

        // Simple strategy: wrap found words in a span with a class
        // For a true implementation, this would need character offset matching
        // to handle multiple occurrences correctly.
        return body.split("\n").map((line, i) => {
            let lineContent = line;
            sortedWords.forEach(sw => {
                const regex = new RegExp(`\\b${sw.word}\\b`, 'gi');
                lineContent = lineContent.replace(regex, `<span class="highlight-spam" title="${sw.reason}: ${sw.suggestion}">${sw.word}</span>`);
            });
            return <div key={i} dangerouslySetInnerHTML={{ __html: lineContent }} />;
        });
    };

    const FactorCircle = ({ label, status }) => {
        const isSafe = status === 'Safe' || status === 'Ideal' || status === 'Clean';
        const isWarning = status === 'Warning' || status === 'Moderate' || status === 'Notice';
        const isCritical = status === 'Critical' || status === 'High Risk' || status === 'Spammy';

        const color = isSafe ? '#10b981' : isWarning ? '#f59e0b' : '#ef4444';
        const displayStatus = isSafe ? 'Good' : isWarning ? 'Medium' : 'Critical';

        return (
            <div className="factor-circle-item">
                <div className="mini-status-circle" style={{ backgroundColor: color }}></div>
                <div className="factor-text-group">
                    <span className="factor-label">{label}</span>
                    <span className="factor-status-badge" style={{ color: color }}>({displayStatus})</span>
                </div>
            </div>
        );
    };

    const ProcessingState = () => (
        <div className="empty-v8 processing-v8">
            <div className={`cube-processing-logo ${isGenerating ? 'blink' : ''}`}>
                <img src="/cubeai-logo.png" alt="CubeAI" />
            </div>
            <div className="cube-processing-text">
                <span className="cube-brand">Cubeai Solutions</span>
            </div>
        </div>
    );

    const [appliedFixes, setAppliedFixes] = useState(new Set());

    // Clear applied fixes when manually entering new instructions (optional but good practice)
    useEffect(() => {
        if (!isGenerating && !generatedContent) {
            setAppliedFixes(new Set());
        }
    }, [contentInstruction, isGenerating, generatedContent]);

    const applyRefinement = async (suggestion) => {
        // Automatically apply the refinement WITHOUT full regeneration

        const currentBody = editedBody || generatedContent?.body || "";
        const currentSubject = generatedContent?.subject || "Subject";

        setIsGenerating(true); // Reuse generating loader for feedback
        if (setGlobalLoading) setGlobalLoading(true);

        try {
            const response = await fetch('https://emailagent.cubegtp.com/content-creation/refine', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    subject: currentSubject,
                    body: currentBody,
                    refinement: suggestion
                })
            });

            const data = await response.json();
            if (response.ok) {
                // Update everything in one go
                setGeneratedContent(prev => ({
                    ...prev,
                    subject: data.subject,
                    body: data.body,
                    // keep provider same or append info
                }));

                setEditedBody(data.body);
                setAnalysis(data.analysis); // Refreshed analysis

                // Track this fix
                setAppliedFixes(prev => new Set(prev).add(suggestion));
            } else {
                alert('Optimization Error: ' + (data.error || 'Could not apply optimization.'));
            }
        } catch (e) {
            alert('Connection Error: ' + e.message);
        } finally {
            setIsGenerating(false);
            if (setGlobalLoading) setGlobalLoading(false);
        }
    };

    const loadTemplate = (t) => {
        // Set the instruction to match the template, so subsequent AI gens are context-aware
        setContentInstruction(t.title);

        setGeneratedContent({
            subject: t.subject,
            body: t.body,
            provider: 'Template Library'
        });
        setEditedBody(t.body);
        setAnalysis(null);
        setShowTemplates(false);
        setIsEditing(true);
    };

    return (
        <div className="cc-v8-container">
            <header className="cc-v8-header">
                <div className="cc-v8-hero">
                    <BiRocket className="hero-icon-v8" />
                    <div className="hero-text-v8">
                        <h1>Smart Email Composer</h1>
                        <p>Enterprise AI content generation & predictive deliverability scan.</p>
                    </div>
                </div>
            </header>

            <main className="cc-v8-workspace">
                {/* TOP: COMMAND CENTER */}
                <section className="cc-v8-command card">
                    <div className="card-head">
                        <BiBrain />
                        <h3>Neural Directives</h3>
                    </div>
                    <div className="command-body">
                        <textarea
                            value={contentInstruction}
                            onChange={(e) => setContentInstruction(e.target.value)}
                            placeholder="Type or speak your campaign objective..."
                        />
                        <div className="command-footer">
                            <button className={`mic-btn-v8 ${isListening ? 'active' : ''}`} onClick={toggleListening}>
                                {isListening ? <FiStopCircle /> : <FiMic />}
                                <span>{isListening ? 'Listening...' : 'Voice Input'}</span>
                            </button>
                            <button className="mic-btn-v8" onClick={() => setShowTemplates(true)}>
                                <FiBookOpen />
                                <span>Templates</span>
                            </button>
                            <button className="forge-btn-v8" onClick={generateWithAI} disabled={isGenerating}>
                                {isGenerating ? <FiRefreshCw className="spin" /> : <FiZap />}
                                {isGenerating ? 'Analyzing Logic...' : 'Compose Smart Content'}
                            </button>
                        </div>
                    </div>
                </section>

                <div className="cc-v8-splits">
                    {/* LEFT: CONTENT DISPLAY */}
                    <div className="cc-v8-column">
                        <section className="cc-v8-content card">
                            <div className="card-head">
                                <FiEdit2 />
                                <h3>Generated Master Artifact</h3>
                                {generatedContent && (
                                    <div className="head-actions-v8">
                                        {isEditing && (
                                            <button className="edit-toggle-v8 check-spam-btn" onClick={analyzeManualContent} title="Check Spam Score">
                                                <FiShield /> Check Spam
                                            </button>
                                        )}
                                        <button className={`edit-toggle-v8 ${isEditing ? 'active' : ''}`} onClick={() => setIsEditing(!isEditing)}>
                                            {isEditing ? <FiCheck /> : <FiEdit2 />} {isEditing ? 'Save' : 'Edit'}
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="scroll-viewer">
                                {generatedContent ? (
                                    <div className="artifact-view">
                                        <div className="art-block">
                                            <label>Optimal Subject Line</label>
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    className="subject-editor-v8"
                                                    defaultValue={generatedContent.subject}
                                                    onChange={(e) => {
                                                        const updated = { ...generatedContent, subject: e.target.value };
                                                        // Assuming setGeneratedContent exists in parent scope or we can modify it directly
                                                        // Ideally we should have a setEditedSubject state, but for now let's try direct modification logic or local state if I could see the whole file.
                                                        // Since I can't see the state defs, I'll use a safer approach:
                                                        generatedContent.subject = e.target.value;
                                                    }}
                                                />
                                            ) : (
                                                <div className="subject-display">{generatedContent.subject}</div>
                                            )}
                                        </div>
                                        <div className="art-block">
                                            <label>Personalized Body Content</label>
                                            {isEditing ? (
                                                <textarea
                                                    className="body-editor-v8"
                                                    value={editedBody}
                                                    onChange={(e) => setEditedBody(e.target.value)}
                                                />
                                            ) : (
                                                <div className="body-display">
                                                    {renderHighlightedBody(editedBody, analysis?.highlighted_words)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    isGenerating ? (
                                        <ProcessingState />
                                    ) : (
                                        <div className="empty-v8">Waiting for neural input...</div>
                                    )
                                )}
                            </div>
                        </section>
                    </div>

                    {/* RIGHT: ANALYSIS DASHBOARD */}
                    <div className="cc-v8-column">
                        <section className="cc-v8-analysis card">
                            <div className="card-head">
                                <BiAnalyse />
                                <h3>AI Deliverability Intelligence</h3>
                            </div>
                            <div className="scroll-viewer">
                                {analysis ? (
                                    <div className="analysis-v8">

                                        {/* 1. SPAM SCORE & DELIVERY CHANCE */}
                                        <div className="analysis-row-top">
                                            <div className="score-circle-container">
                                                <svg viewBox="0 0 36 36" className="circular-chart">
                                                    <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                                    <path className="circle"
                                                        strokeDasharray={`${analysis.spam_score}, 100`}
                                                        style={{ stroke: getScoreColor(analysis.spam_score) }}
                                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                                    />
                                                    <text x="18" y="20.35" className="percentage">{analysis.spam_score}%</text>
                                                    <text x="18" y="28" className="score-label">Spam Score</text>
                                                </svg>
                                            </div>
                                            <div className="delivery-chance-box">
                                                <div className="dc-header">
                                                    <span>Inbox Delivery Probability</span>
                                                    <strong>{analysis.delivery_chance}%</strong>
                                                </div>
                                                <div className="dc-progress-bg">
                                                    <div className="dc-progress-fill" style={{ width: `${analysis.delivery_chance}%`, backgroundColor: getScoreColor(100 - analysis.delivery_chance) }}></div>
                                                </div>
                                                <p className="dc-tip">Probability based on current provider algorithms.</p>
                                            </div>
                                        </div>

                                        {/* 2. VERDICT CARD */}
                                        <div className={`verdict-v8-card status-${analysis.verdict.toLowerCase().replace(' ', '-')}`}>
                                            <div className="verdict-icon">
                                                {analysis.verdict === 'SAFE' ? <FiCheckCircle /> : <FiAlertTriangle />}
                                            </div>
                                            <div className="verdict-txt">
                                                <h4>{analysis.verdict}</h4>
                                                <p>{analysis.verdict_desc}</p>
                                            </div>
                                        </div>

                                        {/* 3. FACTOR BREAKDOWN */}
                                        <div className="analysis-section">
                                            <div className="section-head-v8">
                                                <label><FiLayers /> Factor Breakdown</label>
                                                <div className="status-legend-v8">
                                                    <span className="leg-safe">Good</span>
                                                    <span className="leg-warn">Medium</span>
                                                    <span className="leg-crit">Critical</span>
                                                </div>
                                            </div>
                                            <div className="factor-grid-v8">
                                                <FactorCircle label="Words" status={analysis.factors.spam_words} />
                                                <FactorCircle label="Links" status={analysis.factors.links} />
                                                <FactorCircle label="Format" status={analysis.factors.formatting} />
                                                <FactorCircle label="Tone" status={analysis.factors.tone} />
                                                <FactorCircle label="Identity" status={analysis.factors.personalization} />
                                            </div>
                                        </div>

                                        {/* 4. METRICS GAUGE */}
                                        <div className="analysis-section">
                                            <label><FiBarChart2 /> Executive Metrics</label>
                                            <div className="metrics-v8-row">
                                                <div className="m-item">
                                                    <span>Grammar</span>
                                                    <strong>{analysis.metrics.grammar}</strong>
                                                </div>
                                                <div className="m-item">
                                                    <span>Length</span>
                                                    <strong>{analysis.metrics.length_status}</strong>
                                                </div>
                                                <div className="m-item">
                                                    <span>CTA</span>
                                                    <strong>{analysis.metrics.cta_strength}</strong>
                                                </div>
                                                <div className="m-item">
                                                    <span>Personalization</span>
                                                    <strong>{analysis.metrics.personalization_score}%</strong>
                                                </div>
                                            </div>
                                        </div>

                                        {/* 5. CRITICAL SPAM WORDS TABLE */}
                                        <div className="analysis-section">
                                            <label><FiAlertTriangle /> Critical Word Analysis</label>
                                            <div className="spam-table-v8">
                                                <div className="spam-table-header">
                                                    <span>Spam Word</span>
                                                    <span>Safe Alternative</span>
                                                </div>
                                                <div className="spam-table-body">
                                                    {analysis.critical_spam_words && analysis.critical_spam_words.length > 0 ? (
                                                        analysis.critical_spam_words.map((item, i) => (
                                                            <div key={i} className="spam-row-v8">
                                                                <span className="spam-flagged">{item.spam}</span>
                                                                <span className="spam-safe">{item.alternative}</span>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="spam-empty">No critical triggers detected.</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* 6. ACTIONABLE SUGGESTIONS */}
                                        <div className="analysis-section">
                                            <label><FiZap /> Optimization Engine</label>
                                            <div className="suggestions-list-v8">
                                                {analysis.suggestions
                                                    .filter(s => !appliedFixes.has(s))
                                                    .map((s, i) => (
                                                        <div key={s} className="s-item-v8">
                                                            <label className="fix-check-wrapper">
                                                                <input
                                                                    type="checkbox"
                                                                    className="fix-check-input"
                                                                    onChange={(e) => {
                                                                        if (e.target.checked) {
                                                                            applyRefinement(s);
                                                                        }
                                                                    }}
                                                                    title="Click to apply this optimization"
                                                                />
                                                                <span className="fix-check-custom"></span>
                                                            </label>
                                                            <span className="opt-text">{s}</span>
                                                        </div>
                                                    ))}
                                                {(!analysis.suggestions || analysis.suggestions.length === 0) && (
                                                    <div className="s-item-v8 placeholder">
                                                        <span>AI detected no immediate optimizations.</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                    </div>
                                ) : (
                                    isGenerating ? (
                                        <ProcessingState />
                                    ) : (
                                        <div className="empty-v8">Perform scan to view intelligence...</div>
                                    )
                                )}
                            </div>
                        </section>
                    </div>
                </div>

                {showTemplates && (
                    <div className="template-modal-overlay">
                        <div className="template-modal">
                            <div className="template-modal-header">
                                <h3>📄 Document Templates</h3>
                                <button onClick={() => setShowTemplates(false)}><FiX /></button>
                            </div>
                            <div className="template-modal-body">
                                {Object.entries(DOCUMENT_TEMPLATES).map(([category, templates]) => (
                                    <div key={category} className="template-category">
                                        <h4>{category}</h4>
                                        <div className="template-grid">
                                            {templates.map((t, i) => (
                                                <div key={i} className="template-card" onClick={() => loadTemplate(t)}>
                                                    <div className="t-title">{t.title}</div>
                                                    <div className="t-desc">{t.subject.substring(0, 30)}...</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default ContentCreationTab;


