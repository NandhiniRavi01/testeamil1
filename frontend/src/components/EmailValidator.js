import React, { useState, useRef } from 'react';
import axios from 'axios';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import './EmailValidator.css';
import SplashScreen from './SplashScreen';

// React Icons - Using the same icons as AutoEmailTab
import {
    FiUploadCloud,
    FiDownload,
    FiMail,
    FiRefreshCw,
    FiCheck,
    FiFile,
    FiUsers,
    FiBarChart2,
    FiTrash2,
    FiX
} from 'react-icons/fi';
import FileUploadBox from './common/FileUploadBox';

const EmailValidator = () => {
    const [file, setFile] = useState(null);
    const [processedData, setProcessedData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const fileInputRef = useRef(null);
    const [showSplash, setShowSplash] = useState(false);

    const API_BASE_URL = 'http://65.1.129.37:5000/api';

    const handleFileSelect = (selectedFile) => {
        setFile(selectedFile);
        setError('');
        setSuccess('');
        setProcessedData(null);
    };

    // Delete file function
    const handleDeleteFile = () => {
        setFile(null);
        setError('');
        setSuccess('');
        setProcessedData(null);
        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Clear results function
    const handleClearResults = () => {
        setProcessedData(null);
        setSuccess('');
    };

    const processFile = async () => {
        if (!file) {
            setError('Please select a file first');
            return;
        }

        setLoading(true);
        setShowSplash(true);
        setError('');
        setSuccess('');

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await axios.post(`${API_BASE_URL}/upload-file`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            if (response.data.status === 'success') {
                setProcessedData(response.data);
                setSuccess(`Successfully processed ${response.data.total_records_processed} records`);
            } else {
                throw new Error(response.data.error || 'Unknown error occurred');
            }
        } catch (error) {
            setError(`Error: ${error.response?.data?.error || error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const getScoreClass = (score) => {
        if (score >= 80) return 'score-high';
        if (score >= 60) return 'score-medium';
        return 'score-low';
    };

    const escapeCsvValue = (value) => {
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        return stringValue.replace(/"/g, '""').replace(/\n/g, ' ');
    };

    const extractValidationMethods = (result) => {
        const methods = result?.best_email?.validation_methods || result?.validation_results?.[0]?.validation_methods || {};
        return {
            regex: methods.regex || 'Unknown',
            dns: methods.dns || 'Unknown',
            mx_records: methods.mx_records || 'Unknown',
            smtp: methods.smtp || 'Unknown'
        };
    };

    const isValidationSuccess = (methods) => ['regex', 'dns', 'mx_records', 'smtp'].every(key => methods[key] === 'Success');

    const downloadCSV = () => {
        if (!processedData?.results?.length) return;

        const firstResult = processedData.results[0];
        const originalColumns = firstResult?.original_data ? Object.keys(firstResult.original_data) : [];
        const emailColumns = ['Domain', 'Best Email', 'Score'];
        const allHeaders = [...originalColumns, ...emailColumns];

        const csvContent = [
            allHeaders.join(','),
            ...processedData.results.map(result => {
                const originalValues = originalColumns.map(col => {
                    const value = result.original_data?.[col] || '';
                    return `"${escapeCsvValue(value)}"`;
                });

                const emailValues = [
                    `"${result.domain || ''}"`,
                    `"${result.best_email?.email || ''}"`,
                    result.best_email?.score || ''
                ];

                return [...originalValues, ...emailValues].join(',');
            })
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        saveAs(blob, 'enhanced_data.csv');
    };

    const downloadSuccessCSV = () => {
        if (!processedData?.results?.length) return;

        const firstResult = processedData.results[0];
        const originalColumns = firstResult?.original_data ? Object.keys(firstResult.original_data) : [];
        const headers = [...originalColumns];

        const rows = processedData.results
            .filter(result => {
                const methods = extractValidationMethods(result);
                return result?.best_email?.email && isValidationSuccess(methods);
            })
            .map(result => {
                const originalValues = originalColumns.map(col => {
                    const value = result.original_data?.[col] || '';
                    return `"${escapeCsvValue(value)}"`;
                });

                return originalValues.join(',');
            });

        if (!rows.length) return;

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        saveAs(blob, 'validated_success_emails.csv');
    };

    const downloadFailedCSV = () => {
        if (!processedData?.results?.length) return;

        const firstResult = processedData.results[0];
        const originalColumns = firstResult?.original_data ? Object.keys(firstResult.original_data) : [];
        const headers = [...originalColumns, 'Domain', 'Email', 'Regex', 'DNS', 'MX Records', 'SMTP', 'Score'];

        const rows = processedData.results
            .filter(result => {
                const methods = extractValidationMethods(result);
                return !isValidationSuccess(methods);
            })
            .map(result => {
                const methods = extractValidationMethods(result);

                const originalValues = originalColumns.map(col => {
                    const value = result.original_data?.[col] || '';
                    return `"${escapeCsvValue(value)}"`;
                });

                const validationValues = [
                    `"${escapeCsvValue(result.domain || '')}"`,
                    `"${escapeCsvValue(result.best_email?.email || '')}"`,
                    `"${escapeCsvValue(methods.regex)}"`,
                    `"${escapeCsvValue(methods.dns)}"`,
                    `"${escapeCsvValue(methods.mx_records)}"`,
                    `"${escapeCsvValue(methods.smtp)}"`,
                    result.best_email?.score ?? ''
                ];

                return [...originalValues, ...validationValues].join(',');
            });

        if (!rows.length) return;

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        saveAs(blob, 'failed_emails_with_validation.csv');
    };

    const downloadJSON = () => {
        if (!processedData) return;

        const enhancedData = processedData.results.map(result => {
            const enhanced = { ...result.original_data };
            enhanced.domain = result.domain;
            enhanced.best_email = result.best_email?.email;
            enhanced.email_score = result.best_email?.score;
            return enhanced;
        });

        const jsonContent = JSON.stringify(enhancedData, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        saveAs(blob, 'enhanced_data.json');
    };

    const downloadExcel = () => {
        if (!processedData?.results?.length) return;

        const firstResult = processedData.results[0];
        const originalColumns = firstResult?.original_data ? Object.keys(firstResult.original_data) : [];
        const emailColumns = ['Domain', 'Best Email', 'Score'];
        const allHeaders = [...originalColumns, ...emailColumns];

        const worksheetData = [
            allHeaders,
            ...processedData.results.map(result => {
                const originalValues = originalColumns.map(col => result.original_data?.[col] || '');
                const emailValues = [
                    result.domain || '',
                    result.best_email?.email || '',
                    result.best_email?.score || ''
                ];
                return [...originalValues, ...emailValues];
            })
        ];

        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Email Results');
        XLSX.writeFile(workbook, 'enhanced_data.xlsx');
    };

    return (
        <div className="email-validator-container">
            {showSplash && <SplashScreen message="Initializing Validation Engine..." onComplete={() => setShowSplash(false)} />}
            <div className="email-validator-wrapper">
                {/* Upload Card */}
                <div className="card">
                    <div className="card-header">
                        <div className="card-icon-wrapper">
                            <FiUploadCloud className="card-main-icon" style={{ color: 'white' }} />
                        </div>
                        <h3>Email Validator</h3>
                    </div>

                    <div className="card-section">
                        <h4 className="section-title">
                            <FiFile className="section-icon" style={{ color: 'white' }} />
                            Upload Your File
                        </h4>

                        <FileUploadBox
                            id="emailValidatorUpload"
                            accept=".csv,.xlsx,.xls,.txt"
                            hasFile={!!file}
                            mainText="Click to upload or drag and drop"
                            hintText="CSV, XLS, XLSX or TXT (Max 5MB)"
                            onSelect={(f) => handleFileSelect(f)}
                        />

                        {file && (
                            <div className="file-info">
                                <div className="file-info-header">
                                    <strong>Selected file:</strong> {file.name}
                                    <button
                                        className="btn-delete-file"
                                        onClick={handleDeleteFile}
                                        title="Delete file"
                                    >
                                        <FiTrash2 />
                                    </button>
                                </div>
                                <strong>Size:</strong> {(file.size / 1024).toFixed(2)} KB<br />
                                <strong>Type:</strong> {file.type || 'Unknown'}
                            </div>
                        )}

                        {error && (
                            <div className="error">
                                {error}
                            </div>
                        )}

                        {success && (
                            <div className="success">
                                {success}
                            </div>
                        )}

                        <div className="controls" style={{ marginTop: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <button
                                className="btn btn-primary"
                                onClick={processFile}
                                disabled={!file || loading}
                            >
                                {loading ? (
                                    <>
                                        <FiRefreshCw className="spinning" /> Processing...
                                    </>
                                ) : (
                                    <>
                                        <FiCheck /> Process File
                                    </>
                                )}
                            </button>

                            {file && (
                                <button
                                    className="btn btn-secondary"
                                    onClick={handleDeleteFile}
                                    disabled={loading}
                                >
                                    <FiTrash2 /> Delete File
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {loading && (
                    <div className="card">
                        <div className="loading">
                            <div className="spinner"></div>
                            <h3>Processing your file...</h3>
                            <p>This may take a few minutes depending on file size</p>
                        </div>
                    </div>
                )}

                {processedData && (
                    <>
                        {/* Results Summary Card */}
                        <div className="card">
                            <div className="card-header">
                                <div className="card-icon-wrapper">
                                    <FiBarChart2 className="card-main-icon" style={{ color: 'white' }} />
                                </div>
                                <div className="card-header-content">
                                    <h3>Validation Results</h3>
                                    <button
                                        className="btn-clear-results"
                                        onClick={handleClearResults}
                                        title="Clear all results"
                                    >
                                        <FiX /> Clear Results
                                    </button>
                                </div>
                            </div>

                            <div className="card-section">
                                <h4 className="section-title">
                                    <FiUsers className="section-icon" style={{ color: 'white' }} />
                                    Summary
                                </h4>

                                <div className="summary-cards">
                                    <div className="summary-card">
                                        <h3>Total Records</h3>
                                        <div className="number">{processedData.total_records_processed}</div>
                                    </div>
                                    <div className="summary-card">
                                        <h3>Valid Emails Found</h3>
                                        <div className="number">{processedData.summary.valid_emails_found}</div>
                                    </div>
                                    <div className="summary-card">
                                        <h3>Domains Found</h3>
                                        <div className="number">{processedData.summary.domains_found}</div>
                                    </div>
                                    <div className="summary-card">
                                        <h3>Success Rate</h3>
                                        <div className="number">{processedData.summary.success_rate}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Results Table Card */}
                        <div className="card">
                            <div className="card-section">
                                <h4 className="section-title">
                                    <FiMail className="section-icon" style={{ color: 'white' }} />
                                    Email Results
                                </h4>

                                <ResultsTable data={processedData} getScoreClass={getScoreClass} />
                            </div>
                        </div>

                        {/* Download Card */}
                        <div className="card">
                            <div className="card-section">
                                <h4 className="section-title">
                                    <FiDownload className="section-icon" style={{ color: 'white' }} />
                                    Download Results
                                </h4>

                                <div className="download-section">
                                    <button className="btn btn-primary download-btn" onClick={downloadCSV}>
                                        <FiDownload /> Download CSV
                                    </button>
                                    <button className="btn btn-primary download-btn" onClick={downloadJSON}>
                                        <FiDownload /> Download JSON
                                    </button>
                                    <button className="btn btn-primary download-btn" onClick={downloadExcel}>
                                        <FiDownload /> Download Excel
                                    </button>
                                    <button className="btn btn-primary download-btn" onClick={downloadSuccessCSV}>
                                        <FiDownload /> Success Emails (CSV)
                                    </button>
                                    <button className="btn btn-primary download-btn" onClick={downloadFailedCSV}>
                                        <FiDownload /> Failed Emails (CSV)
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

// Separate component for the results table
const ResultsTable = ({ data, getScoreClass }) => {
    const [expandedRows, setExpandedRows] = useState(new Set());

    const toggleDetails = (index) => {
        const newExpandedRows = new Set(expandedRows);
        if (newExpandedRows.has(index)) {
            newExpandedRows.delete(index);
        } else {
            newExpandedRows.add(index);
        }
        setExpandedRows(newExpandedRows);
    };

    if (!data?.results?.length) return null;

    const firstResult = data.results[0];
    const originalColumns = firstResult?.original_data ? Object.keys(firstResult.original_data) : [];
    const visibleHeaders = ['Email', 'Domain', 'Regex', 'DNS', 'MX Records', 'SMTP', 'Score', 'Details'];

    return (
        <div className="table-container">
            <table className="results-table">
                <thead>
                    <tr>
                        {visibleHeaders.map(header => (
                            <th key={header}>{header}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.results.map((result, index) => (
                        <React.Fragment key={index}>
                            <tr>
                                {/* Email column */}
                                <td>{result.best_email?.email || 'N/A'}</td>

                                {/* Email data cells */}
                                <td>{result.domain || 'N/A'}</td>
                                
                                {/* 4 Validation Method Columns with symbols */}
                                <td>
                                    <span className={`validation-badge ${
                                        (result.best_email?.validation_methods?.regex || result.validation_results?.[0]?.validation_methods?.regex) === 'Success' ? 'success' : 'failed'
                                    }`}>
                                        {(result.best_email?.validation_methods?.regex || result.validation_results?.[0]?.validation_methods?.regex) === 'Success' ? '✓' : '✗'}
                                    </span>
                                </td>
                                <td>
                                    <span className={`validation-badge ${
                                        (result.best_email?.validation_methods?.dns || result.validation_results?.[0]?.validation_methods?.dns) === 'Success' ? 'success' : 'failed'
                                    }`}>
                                        {(result.best_email?.validation_methods?.dns || result.validation_results?.[0]?.validation_methods?.dns) === 'Success' ? '✓' : '✗'}
                                    </span>
                                </td>
                                <td>
                                    <span className={`validation-badge ${
                                        (result.best_email?.validation_methods?.mx_records || result.validation_results?.[0]?.validation_methods?.mx_records) === 'Success' ? 'success' : 'failed'
                                    }`}>
                                        {(result.best_email?.validation_methods?.mx_records || result.validation_results?.[0]?.validation_methods?.mx_records) === 'Success' ? '✓' : '✗'}
                                    </span>
                                </td>
                                <td>
                                    <span className={`validation-badge ${
                                        (result.best_email?.validation_methods?.smtp || result.validation_results?.[0]?.validation_methods?.smtp) === 'Success' ? 'success' : 'failed'
                                    }`}>
                                        {(result.best_email?.validation_methods?.smtp || result.validation_results?.[0]?.validation_methods?.smtp) === 'Success' ? '✓' : '✗'}
                                    </span>
                                </td>
                                
                                <td>
                                    {result.best_email ? (
                                        <span className={`email-score ${getScoreClass(result.best_email.score)}`}>
                                            {result.best_email.score}
                                        </span>
                                    ) : (
                                        'N/A'
                                    )}
                                </td>
                                <td>
                                    <button
                                        className="toggle-details"
                                        onClick={() => toggleDetails(index)}
                                    >
                                        {expandedRows.has(index) ? 'Hide Details' : 'View Details'}
                                    </button>
                                </td>
                            </tr>

                            {/* Details row */}
                            {expandedRows.has(index) && (
                                <tr>
                                    <td colSpan={visibleHeaders.length}>
                                        <div className="email-details expanded">
                                            <div className="details-section">
                                                <h4>📋 Original Data</h4>
                                                {Object.entries(result.original_data || {}).map(([key, value]) => (
                                                    <p key={key}><strong>{key}:</strong> {value || 'N/A'}</p>
                                                ))}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default EmailValidator;

