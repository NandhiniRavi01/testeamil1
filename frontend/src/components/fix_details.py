import re

# Read the file
with open('EmailValidator.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find and replace the details section
# Pattern to match from details-grid to the end of the verification section
pattern = r'<div className="details-grid">.*?{result\.valid_emails_with_scores && \(.*?</div>\s*\)\s*}\s*</div>'

replacement = '''<div className="details-section">
                                                <h4>📋 Original Data</h4>
                                                {Object.entries(result.original_data || {}).map(([key, value]) => (
                                                    <p key={key}><strong>{key}:</strong> {value || 'N/A'}</p>
                                                ))}
                                            </div>
                                        </div>'''

# Replace with DOTALL flag to match across newlines
new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

# Write back
with open('EmailValidator.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("✅ Details section simplified successfully")
