import React, { useState } from 'react';
import {
    Type,
    Image as ImageIcon,
    Square,
    Minus,
    Layout,
    Settings,
    Save,
    Trash2,
    Monitor,
    Smartphone,
    Code,
    Check,
    X
} from 'lucide-react';
import { motion, Reorder, AnimatePresence } from 'framer-motion';
import './EmailDesignerTab.css';

const EmailDesignerTab = () => {
    const [blocks, setBlocks] = useState([
        { id: '1', type: 'header', content: 'Welcome to Our Newsletter', style: { color: '#111827', fontSize: '24px', textAlign: 'center', fontWeight: 'bold' } },
        { id: '2', type: 'text', content: 'We are thrilled to have you here. Start building your perfect email by dragging blocks from the left panel.', style: { color: '#4b5563', fontSize: '16px', textAlign: 'left', lineHeight: '1.5' } },
        { id: '3', type: 'button', content: 'Get Started', style: { backgroundColor: '#3b82f6', color: '#ffffff', borderRadius: '8px', padding: '12px 24px', textAlign: 'center', display: 'inline-block' }, url: '#' }
    ]);

    const [selectedBlockId, setSelectedBlockId] = useState(null);
    const [previewMode, setPreviewMode] = useState('desktop');
    const [showExportModal, setShowExportModal] = useState(false);
    const [showProperties, setShowProperties] = useState(true);

    const blockTemplates = [
            { type: 'header', label: 'Heading', icon: <Type size={18} /> },
            { type: 'text', label: 'Text Block', icon: <Layout size={18} /> },
            { type: 'image', label: 'Image', icon: <ImageIcon size={18} /> },
            { type: 'button', label: 'Button', icon: <Square size={18} /> },
            { type: 'divider', label: 'Divider', icon: <Minus size={18} /> },
        ];

    const addBlock = (type) => {
        const newId = Math.random().toString(36).substr(2, 9);
        let newBlock = { id: newId, type, style: {} };

        switch (type) {
            case 'header':
                newBlock.content = 'New Heading';
                newBlock.style = { color: '#111827', fontSize: '24px', textAlign: 'center', fontWeight: 'bold', padding: '10px' };
                break;
            case 'text':
                newBlock.content = 'Enter your text here...';
                newBlock.style = { color: '#4b5563', fontSize: '16px', textAlign: 'left', lineHeight: '1.5', padding: '10px' };
                break;
            case 'button':
                newBlock.content = 'Click Me';
                newBlock.url = '#';
                newBlock.style = { backgroundColor: '#3b82f6', color: '#ffffff', borderRadius: '8px', padding: '12px 24px', textAlign: 'center', display: 'inline-block', margin: '10px auto' };
                break;
            case 'image':
                newBlock.url = 'https://via.placeholder.com/600x300?text=Your+Image+Here';
                newBlock.style = { width: '100%', borderRadius: '0px', margin: '10px auto', display: 'block' };
                break;
            case 'divider':
                newBlock.style = { borderTop: '1px solid #e5e7eb', margin: '20px 0' };
                break;
            default:
                break;
        }

        setBlocks([...blocks, newBlock]);
        setSelectedBlockId(newId);
    };

    const removeBlock = (id) => {
        setBlocks(blocks.filter(b => b.id !== id));
        if (selectedBlockId === id) setSelectedBlockId(null);
    };

    const updateBlock = (id, updates) => {
        setBlocks(blocks.map(b => b.id === id ? { ...b, ...updates } : b));
    };

    const updateBlockStyle = (id, styleUpdates) => {
        setBlocks(blocks.map(b => b.id === id ? { ...b, style: { ...b.style, ...styleUpdates } } : b));
    };

    const selectedBlock = blocks.find(b => b.id === selectedBlockId);

        const generateHTML = () => {
            let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; }
          .email-container { max-width: 800px; margin: 0 auto; background: #ffffff; padding: 0; border-radius: 8px; box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08); }
          .btn { text-decoration: none; display: inline-block; }
          .block { padding: 12px 48px; }
          .block:first-child { padding-top: 24px; }
          .block:last-child { padding-bottom: 24px; }
        </style></head><body><div class="email-container">`;

            blocks.forEach((block, index) => {
                const styleStr = Object.entries(block.style).map(([k, v]) => `${k.replace(/[A-Z]/g, m => "-" + m.toLowerCase())}:${v}`).join(';');
                const blockClass = index === 0 ? 'block' : index === blocks.length - 1 ? 'block' : 'block';

                if (block.type === 'header') html += `<div class="${blockClass}"><h1 style="${styleStr}; white-space: pre-wrap; margin: 0;">${block.content}</h1></div>`;
                if (block.type === 'text') html += `<div class="${blockClass}"><p style="${styleStr}; white-space: pre-wrap; margin: 0;">${block.content}</p></div>`;
                if (block.type === 'button') {
                    const buttonUrl = block.url && block.url !== '#' ? block.url : 'https://example.com';
                    html += `<div class="${blockClass}" style="text-align: ${block.style.textAlign || 'center'};"><a href="${buttonUrl}" target="_blank" rel="noopener noreferrer" class="btn" style="${styleStr}">${block.content}</a></div>`;
                }
                if (block.type === 'image') html += `<div class="${blockClass}" style="text-align: ${block.style.textAlign || 'center'};"><img src="${block.url}" style="${styleStr}" alt="email image" /></div>`;
                if (block.type === 'divider') html += `<div class="${blockClass}"><hr style="${styleStr}; margin: 0;" /></div>`;
            });

            html += `</div></body></html>`;
            return html;
        };

    const formatHTMLForView = (html) => html.replace(/></g, '>' + '\n' + '<');

    const copyCode = () => {
        const html = generateHTML();
        if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(html).catch(() => {});
        }
    };

    const handleExport = () => {
            const html = generateHTML();
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'email-template.html';
            a.click();
            setShowExportModal(true);
            setTimeout(() => setShowExportModal(false), 3000);
        };

    return (
            <div className={`designer-container ${showProperties ? '' : 'props-collapsed'}`}>
                <div className="designer-canvas-area">
                    <div className="component-strip" aria-label="Email components">
                        {blockTemplates.map((template) => (
                            <button
                                key={template.type}
                                className="strip-btn"
                                onClick={() => addBlock(template.type)}
                                title={template.label}
                                aria-label={template.label}
                            >
                                {template.icon}
                            </button>
                        ))}
                    </div>

                    <div className="canvas-header">
                        <div className="view-controls">
                            <button
                                className={`view-btn ${previewMode === 'desktop' ? 'active' : ''}`}
                                onClick={() => setPreviewMode('desktop')}
                            >
                                <Monitor size={18} /> <span>Desktop</span>
                            </button>
                            <button
                                className={`view-btn ${previewMode === 'mobile' ? 'active' : ''}`}
                                onClick={() => setPreviewMode('mobile')}
                            >
                                <Smartphone size={18} /> <span>Mobile</span>
                            </button>
                            <button
                                className={`view-btn ${previewMode === 'code' ? 'active' : ''}`}
                                onClick={() => setPreviewMode('code')}
                            >
                                <Code size={18} /> <span>Code</span>
                            </button>
                        </div>

                        <div className="action-controls">
                            <button className="secondary-btn" onClick={() => setBlocks([])}>
                                <Trash2 size={18} /> <span>Clear</span>
                            </button>
                            <button className="primary-btn" onClick={handleExport}>
                                <Save size={18} /> <span>Export HTML</span>
                            </button>
                        </div>
                    </div>

                    <div className={`canvas-scroll-container ${previewMode}`}>
                        {previewMode === 'code' ? (
                            <div className="code-view-card">
                                <div className="code-view-header">
                                    <span>Generated HTML</span>
                                    <button className="copy-btn" onClick={copyCode} aria-label="Copy HTML">Copy</button>
                                </div>
                                <pre className="code-viewer" aria-label="Generated HTML code">{formatHTMLForView(generateHTML())}</pre>
                            </div>
                        ) : (
                            <div className="email-canvas">
                                <Reorder.Group axis="y" values={blocks} onReorder={setBlocks} className="block-list">
                                    {blocks.length === 0 && (
                                        <div className="empty-canvas">
                                            <Layout size={48} />
                                            <p>Your canvas is empty</p>
                                            <span>Click components on the left to start designing</span>
                                        </div>
                                    )}

                                    {blocks.map((block) => (
                                        <Reorder.Item
                                            key={block.id}
                                            value={block}
                                            className={`canvas-block ${selectedBlockId === block.id ? 'selected' : ''}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedBlockId(block.id);
                                            }}
                                            onDoubleClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedBlockId(block.id);
                                                setShowProperties(true);
                                            }}
                                        >
                                            <div className="block-content-wrapper">
                                                {block.type === 'header' && (
                                                    <h1 style={{ ...block.style, whiteSpace: 'pre-wrap' }}>{block.content}</h1>
                                                )}
                                                {block.type === 'text' && (
                                                    <p style={{ ...block.style, whiteSpace: 'pre-wrap' }}>{block.content}</p>
                                                )}
                                                {block.type === 'button' && (
                                                    <div style={{ textAlign: block.style.textAlign }}>
                                                        <a href={block.url} className="preview-btn" style={block.style}>
                                                            {block.content}
                                                        </a>
                                                    </div>
                                                )}
                                                {block.type === 'image' && (
                                                    <div style={{ textAlign: block.style.textAlign || 'center' }}>
                                                        <img src={block.url} alt="User choice" style={block.style} />
                                                    </div>
                                                )}
                                                {block.type === 'divider' && (
                                                    <hr style={block.style} />
                                                )}
                                            </div>

                                            {selectedBlockId === block.id && (
                                                <div className="block-actions">
                                                    <button className="action-btn delete" onClick={() => removeBlock(block.id)}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </Reorder.Item>
                                    ))}
                                </Reorder.Group>
                            </div>
                        )}
                    </div>
                </div>

                {showProperties && (
                    <div className="designer-properties">
                        <div className="properties-header">
                            <h3 className="section-title">Properties</h3>
                            <button className="close-props-btn" onClick={() => setShowProperties(false)} aria-label="Close properties">
                                <X size={16} />
                            </button>
                        </div>

                        {selectedBlock ? (
                            <div className="properties-form">
                                <div className="prop-group">
                                    <label>Content</label>
                                    {(selectedBlock.type === 'header' || selectedBlock.type === 'text' || selectedBlock.type === 'button') && (
                                        <textarea
                                            value={selectedBlock.content}
                                            onChange={(e) => updateBlock(selectedBlock.id, { content: e.target.value })}
                                            rows={12}
                                            className="content-editor-textarea"
                                            placeholder="Type your email content here. Press Enter for new lines..."
                                        />
                                    )}
                                    {(selectedBlock.type === 'image' || selectedBlock.type === 'button') && (
                                        <>
                                            <label>{selectedBlock.type === 'image' ? 'Image URL' : 'Button Link'}</label>
                                            <input
                                                type="text"
                                                value={selectedBlock.url || ''}
                                                onChange={(e) => updateBlock(selectedBlock.id, { url: e.target.value })}
                                            />
                                        </>
                                    )}
                                </div>

                                <div className="prop-group">
                                    <label>Styling</label>

                                    <div className="control-row">
                                        <span>Text Align</span>
                                        <div className="align-buttons">
                                            {['left', 'center', 'right'].map(align => (
                                                <button
                                                    key={align}
                                                    className={selectedBlock.style.textAlign === align ? 'active' : ''}
                                                    onClick={() => updateBlockStyle(selectedBlock.id, { textAlign: align })}
                                                >
                                                    <Layout size={14} style={{ transform: align === 'right' ? 'scaleX(-1)' : 'none' }} />
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {selectedBlock.style.fontSize && (
                                        <div className="control-row">
                                            <span>Font Size</span>
                                            <select
                                                value={selectedBlock.style.fontSize}
                                                onChange={(e) => updateBlockStyle(selectedBlock.id, { fontSize: e.target.value })}
                                            >
                                                {['12px', '14px', '16px', '18px', '20px', '24px', '32px', '48px'].map(size => (
                                                    <option key={size} value={size}>{size}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {selectedBlock.style.backgroundColor && (
                                        <div className="control-row">
                                            <span>Background</span>
                                            <input
                                                type="color"
                                                value={selectedBlock.style.backgroundColor}
                                                onChange={(e) => updateBlockStyle(selectedBlock.id, { backgroundColor: e.target.value })}
                                            />
                                        </div>
                                    )}

                                    {selectedBlock.style.color && (
                                        <div className="control-row">
                                            <span>Text Color</span>
                                            <input
                                                type="color"
                                                value={selectedBlock.style.color}
                                                onChange={(e) => updateBlockStyle(selectedBlock.id, { color: e.target.value })}
                                            />
                                        </div>
                                    )}

                                    {selectedBlock.type === 'image' && (
                                        <>
                                            <div className="control-row-stack">
                                                <div className="label-row">
                                                    <span>Width (%)</span>
                                                    <span className="value-tag">{selectedBlock.style.width}</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="10"
                                                    max="100"
                                                    step="5"
                                                    value={parseInt(selectedBlock.style.width) || 100}
                                                    onChange={(e) => updateBlockStyle(selectedBlock.id, { width: `${e.target.value}%` })}
                                                />
                                            </div>
                                            <div className="control-row-stack">
                                                <div className="label-row">
                                                    <span>Corner Rounding (px)</span>
                                                    <span className="value-tag">{selectedBlock.style.borderRadius}</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="50"
                                                    step="2"
                                                    value={parseInt(selectedBlock.style.borderRadius) || 0}
                                                    onChange={(e) => updateBlockStyle(selectedBlock.id, { borderRadius: `${e.target.value}px` })}
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="no-selection">
                                <Settings size={32} />
                                <p>Select a block on the canvas to edit its properties</p>
                            </div>
                        )}
                    </div>
                )}

                {!showProperties && (
                    <button
                        className="props-reopen-fab"
                        onClick={() => setShowProperties(true)}
                        aria-label="Open properties"
                    >
                        Properties
                    </button>
                )}

                <AnimatePresence>
                    {showExportModal && (
                        <motion.div
                            initial={{ opacity: 0, y: 50 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 50 }}
                            className="toast-notification"
                        >
                            <div className="toast-icon"><Check size={18} /></div>
                            <p>Email Template Exported successfully!</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    };

    export default EmailDesignerTab;
