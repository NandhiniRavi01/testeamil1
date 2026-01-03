import React, { useState, useRef } from 'react';
import { FiUploadCloud } from 'react-icons/fi';
import './FileUploadBox.css';

/**
 * Reusable drag-and-drop file upload box
 * Props:
 * - id?: string
 * - accept?: string (e.g., '.xlsx,.xls,.csv')
 * - hasFile?: boolean (toggles green success style)
 * - mainText?: string (headline text)
 * - hintText?: string (sub text)
 * - onSelect: (file: File) => void
 */
const FileUploadBox = ({
  id = 'fileUploadInput',
  accept = '.xlsx,.xls,.csv',
  hasFile = false,
  mainText = 'Click to upload or drag and drop',
  hintText = 'CSV, XLS, or XLSX (Max 5MB)',
  onSelect
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = (files) => {
    if (!files || files.length === 0) return;
    if (onSelect) onSelect(files[0]);
  };

  return (
    <div
      className={`file-upload-box ${hasFile ? 'has-file' : ''} ${isDragging ? 'dragging' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleFiles(e.dataTransfer.files);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <input
        id={id}
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(e) => handleFiles(e.target.files)}
        style={{ display: 'none' }}
      />
      <label className="file-upload-label" style={{ cursor: 'pointer' }}>
        <FiUploadCloud size={32} />
        <span>{mainText}</span>
        <small>{hintText}</small>
      </label>
    </div>
  );
};

export default FileUploadBox;
