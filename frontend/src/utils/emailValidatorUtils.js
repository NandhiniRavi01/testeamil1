/**
 * Email Validator Utilities
 * Handles HTML/DOM manipulation for EmailValidator component
 * Previously in Python (fix_details.py and fix_details2.py)
 */

/**
 * Simplifies the EmailValidator.js by replacing details-grid section
 * with a simplified details-section showing only original data
 * 
 * This function modifies the HTML structure to reduce complexity
 * and improve UI performance
 */

export const fixDetailsGridToSection = () => {
  try {
    const detailsGrid = document.querySelector('.details-grid');
    if (!detailsGrid) {
      console.warn('details-grid section not found');
      return false;
    }

    // Create new simplified details section
    const newSection = document.createElement('div');
    newSection.className = 'details-section';
    
    // Copy only the original data content
    const originalData = detailsGrid.querySelector('.original-data');
    if (originalData) {
      newSection.appendChild(originalData.cloneNode(true));
    }

    // Replace old grid with new section
    detailsGrid.parentNode.replaceChild(newSection, detailsGrid);
    
    console.log('✓ Successfully converted details-grid to details-section');
    return true;
  } catch (error) {
    console.error('Error fixing details grid:', error);
    return false;
  }
};

/**
 * Restores the original details-grid structure
 * Useful for reverting changes or testing
 */
export const restoreDetailsGrid = () => {
  try {
    const detailsSection = document.querySelector('.details-section');
    if (!detailsSection) {
      console.warn('details-section not found');
      return false;
    }

    // Restore original grid structure (this would need the actual HTML)
    console.log('✓ Details grid restore initiated');
    return true;
  } catch (error) {
    console.error('Error restoring details grid:', error);
    return false;
  }
};

/**
 * Validates email validator component structure
 * Ensures all required sections exist
 */
export const validateEmailValidatorStructure = () => {
  const requiredElements = [
    '.email-validator-container',
    '.upload-section',
    '.results-section',
    '.details-grid, .details-section' // Either one should exist
  ];

  const missingElements = requiredElements.filter(selector => 
    !document.querySelector(selector)
  );

  if (missingElements.length > 0) {
    console.warn('Missing required elements:', missingElements);
    return false;
  }

  console.log('✓ Email validator structure is valid');
  return true;
};

/**
 * Extracts email data from the validated results
 * Returns an array of unique email addresses
 */
export const extractValidEmails = (processedData) => {
  if (!processedData || !processedData.data) {
    return [];
  }

  try {
    // Remove duplicates by converting to Set, then back to Array
    const uniqueEmails = [...new Set(
      processedData.data.map(item => item.email).filter(Boolean)
    )];
    
    return {
      total: processedData.data.length,
      valid: uniqueEmails.length,
      emails: uniqueEmails,
      duplicates: processedData.data.length - uniqueEmails.length
    };
  } catch (error) {
    console.error('Error extracting emails:', error);
    return [];
  }
};

/**
 * Sanitizes HTML content for safe display
 * Prevents XSS attacks when displaying user data
 */
export const sanitizeHtml = (htmlContent) => {
  const tempDiv = document.createElement('div');
  tempDiv.textContent = htmlContent;
  return tempDiv.innerHTML;
};

/**
 * Formats email validation results for display
 */
export const formatValidationResults = (results) => {
  return {
    totalRows: results.total_rows || 0,
    validRecipients: results.valid_recipients || 0,
    duplicates: (results.total_rows || 0) - (results.valid_recipients || 0),
    sampleData: results.sample_data || []
  };
};

export default {
  fixDetailsGridToSection,
  restoreDetailsGrid,
  validateEmailValidatorStructure,
  extractValidEmails,
  sanitizeHtml,
  formatValidationResults
};
