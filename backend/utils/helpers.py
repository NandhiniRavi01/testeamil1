import re
import email
from email.header import decode_header
from datetime import datetime
import pandas as pd
import os

def extract_phone_number(text):
    """Extract valid phone number from email body text"""
    if not text:
        return ""
    
    # More specific phone patterns with validation
    phone_patterns = [
        r'\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b',                    # US: 123-456-7890
        r'\b\(\d{3}\)\s*\d{3}[-.\s]?\d{4}\b',                    # US: (123) 456-7890
        r'\b\d{3}[-.\s]?\d{4}[-.\s]?\d{4}\b',                    # International: 123-4567-8901
        r'\b\+?\d{1,3}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b',  # With country code
        r'\b\d{10}\b',                                           # Just 10 digits
        r'\b\d{4}[-.\s]?\d{3}[-.\s]?\d{3}\b',                    # 11 digits with formatting
        r'\b\d{3}[-.\s]?\d{4}\b'                                 # 7 digits (local)
    ]
    
    for pattern in phone_patterns:
        matches = re.findall(pattern, text)
        for match in matches:
            # Clean the phone number
            clean_number = re.sub(r'[^\d+]', '', match)
            
            # Validate phone number length and format
            if len(clean_number) >= 7:  # Minimum valid phone number length
                # Remove country code if it's just +1 (US) for simplicity
                if clean_number.startswith('+1') and len(clean_number) == 12:
                    clean_number = clean_number[2:]  # Remove +1
                
                # Format the number nicely
                if len(clean_number) == 10:
                    return f"({clean_number[:3]}) {clean_number[3:6]}-{clean_number[6:]}"
                elif len(clean_number) == 7:
                    return f"{clean_number[:3]}-{clean_number[3:]}"
                else:
                    return clean_number
    
    return ""

def is_valid_phone_number(phone):
    """Validate if a string is a valid phone number"""
    if not phone:
        return False
    
    # Remove all non-digit characters except +
    clean_phone = re.sub(r'[^\d+]', '', phone)
    
    # Check if it's just random numbers (like years)
    if clean_phone.isdigit():
        # Avoid storing years or short numbers that look like years
        if len(clean_phone) <= 4:
            return False
        
        # Check if it looks like a year (1900-2099)
        if len(clean_phone) == 4 and clean_phone.isdigit():
            year = int(clean_phone)
            if 1900 <= year <= 2099:
                return False
    
    # Valid phone number should have at least 7 digits
    digit_count = len(re.sub(r'[^\d]', '', phone))
    if digit_count < 7:
        return False
    
    # Additional validation patterns
    valid_patterns = [
        r'^\+?[\d\s\-\(\)]{10,}$',  # International format
        r'^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$',  # US format
        r'^\d{7,15}$'  # Plain digits
    ]
    
    for pattern in valid_patterns:
        if re.match(pattern, phone):
            return True
    
    return False    

def extract_name_from_email(email_address):
    """Extract a name from an email address - handle various formats"""
    if not email_address:
        return "", ""
    
    # Try to extract name from "Name <email@example.com>" format
    name_match = re.match(r'^"?([^"<]+)"?\s*<', email_address)
    if name_match:
        full_name = name_match.group(1).strip()
        name_parts = full_name.split()
        if len(name_parts) >= 2:
            return name_parts[0], " ".join(name_parts[1:])
        elif len(name_parts) == 1:
            return name_parts[0], ""
    
    # Try to extract from email username (before @)
    email_only_match = re.search(r'([^@]+)@', email_address)
    if email_only_match:
        username = email_only_match.group(1)
        
        # Remove numbers and special characters, replace with spaces
        clean_name = re.sub(r'[^a-zA-Z]+', ' ', username).title().strip()
        
        # Handle common separators
        for separator in ['.', '_', '-']:
            if separator in clean_name:
                parts = clean_name.split(separator)
                if len(parts) >= 2:
                    return parts[0], " ".join(parts[1:])
        
        # If no separators found, try to split camelCase
        if re.search(r'[a-z][A-Z]', clean_name):
            parts = re.findall(r'[A-Z][a-z]*', clean_name)
            if len(parts) >= 2:
                return parts[0], " ".join(parts[1:])
        
        name_parts = clean_name.split()
        if len(name_parts) >= 2:
            return name_parts[0], " ".join(name_parts[1:])
        elif len(name_parts) == 1:
            return name_parts[0], ""
    
    return "", ""

def extract_company_from_email(email_address):
    """Extract company name from email domain"""
    if not email_address:
        return "Unknown Company"
    
    domain_match = re.search(r'@([a-zA-Z0-9.-]+)', email_address)
    if domain_match:
        domain = domain_match.group(1)
        company_name = re.sub(r'\.[a-z]{2,3}$', '', domain)
        return company_name.title()
    
    return "Unknown Company"

def replace_placeholders(text, name, position="", company="", phone="", sender_name="", sender_email="", sender_phone=""):
    """
    Replace placeholders in text with actual values.
    Supports: name, position, company, phone (recipient), sender details
    """
    if not text:
        return ""

    # Handle name placeholders
    name_placeholder_map = {
        "{{name}}": name,
        "{name}": name,
        "[Name]": name,
        "[Candidate Name]": name,
        "[Client Name]": name,
        "[name]": name,
        "[client name]": name
    }
    for placeholder, value in name_placeholder_map.items():
        text = text.replace(placeholder, value)

    # Handle position placeholders
    position_placeholder_map = {
        "{{position}}": position,
        "{position}": position,
        "[Position]": position,
        "[position]": position,
        "[Job Title]": position,
        "[job title]": position,
        "[Role]": position,
        "[role]": position
    }
    for placeholder, value in position_placeholder_map.items():
        text = text.replace(placeholder, value)

    # Handle company placeholders
    company_placeholder_map = {
        "{{company}}": company,
        "{company}": company,
        "[Company]": company,
        "[company]": company,
        "[Organization]": company,
        "[organization]": company,
        "[Business]": company,
        "[business]": company
    }
    for placeholder, value in company_placeholder_map.items():
        text = text.replace(placeholder, value)

    # Handle recipient phone placeholders
    phone_placeholder_map = {
        "{{phone}}": phone,
        "{phone}": phone,
        "[Phone]": phone,
        "[phone]": phone,
        "[Mobile]": phone,
        "[mobile]": phone
    }
    for placeholder, value in phone_placeholder_map.items():
        text = text.replace(placeholder, value)

    # Dynamic catch-all for names like [something name]
    text = re.sub(r"\[(.*?name.*?)\]", name, text, flags=re.IGNORECASE)
    # Dynamic catch-all for positions like [something position] or [something title]
    text = re.sub(r"\[(.*?position.*?)\]", position, text, flags=re.IGNORECASE)
    text = re.sub(r"\[(.*?title.*?)\]", position, text, flags=re.IGNORECASE)

    # Add Sender Details
    if sender_name:
        text = text.replace("{{sender_name}}", sender_name)
    if sender_email:
        text = text.replace("{{sender_email}}", sender_email)
    if sender_phone:
        text = text.replace("{{sender_phone}}", sender_phone)
        text = text.replace("{{phone_number}}", sender_phone)

    # Fallback to app_state for sender info if not provided
    try:
        from config import app_state
        if not sender_name:
            sender_name = app_state.email_content.get("sender_name", "")
            text = text.replace("{{sender_name}}", sender_name)
        if not sender_email:
            sender_email = app_state.email_content.get("sender_email", "")
            text = text.replace("{{sender_email}}", sender_email)
            text = text.replace("[Sender Email]", sender_email)
        if not sender_phone:
            sender_phone = app_state.email_content.get("phone_number", "")
            text = text.replace("{{sender_phone}}", sender_phone)
            text = text.replace("[Sender Phone]", sender_phone)
            text = text.replace("{{phone_number}}", sender_phone)
            text = text.replace("[Phone Number]", sender_phone)
    except Exception:
        pass

    return text

def replace_name_placeholders(text, name):
    """Fallback for backward compatibility"""
    return replace_placeholders(text, name, "")

def save_to_excel(data):
    """Save reply data to Excel file with comprehensive lead information"""
    filename = "email_replies.xlsx"
    
    try:
        if os.path.exists(filename):
            df = pd.read_excel(filename)
        else:
            df = pd.DataFrame(columns=[
                "timestamp", "sender_email", "recipient_email", 
                "subject", "body", "first_name", "last_name",
                "company", "phone", "converted_to_lead", "zoho_lead_id"
            ])
        
        new_row = pd.DataFrame([data])
        df = pd.concat([df, new_row], ignore_index=True)
        df.to_excel(filename, index=False)
        return True
    except Exception as e:
        print(f"Error saving to Excel: {e}")
        return False

def is_auto_response(email_data):
    """Check if an email is an auto-response"""
    body = email_data.get("body", "").lower()
    subject = email_data.get("subject", "").lower()
    
    # Common auto-response indicators
    auto_response_indicators = [
        "out of office", "ooo", "vacation", "away from my email",
        "auto-reply", "autoreply", "automatic reply",
        "this is an automated response", "no-reply",
        "do not reply to this email", "delivery receipt",
        "read receipt", "acknowledgement", "confirmation of receipt"
    ]
    
    # Check if any indicator appears in subject or body
    for indicator in auto_response_indicators:
        if indicator in subject or indicator in body:
            return True
    
    # Check for short messages typical of auto-responses
    if len(body.split()) < 20 and any(phrase in body for phrase in ["thank you", "received", "confirm"]):
        return True
        
    return False

def save_sent_email(data):
    """Save sent email data to a separate Excel file"""
    filename = "sent_emails.xlsx"
    
    try:
        if os.path.exists(filename):
            df = pd.read_excel(filename)
        else:
            df = pd.DataFrame(columns=[
                "timestamp", "sender_email", "recipient_email", 
                "subject", "body", "first_name", "last_name",
                "company", "phone"
            ])
        
        new_row = pd.DataFrame([data])
        df = pd.concat([df, new_row], ignore_index=True)
        df.to_excel(filename, index=False)
        return True
    except Exception as e:
        print(f"Error saving sent email to Excel: {e}")
        return False
    
    # Add to helpers.py

def extract_zoho_field_info(fields_data):
    """Extract field information in a more usable format"""
    field_info = []
    for field in fields_data.get('fields', []):
        field_info.append({
            "api_name": field.get('api_name'),
            "field_label": field.get('field_label'),
            "data_type": field.get('data_type'),
            "mandatory": field.get('mandatory', False),
            "length": field.get('length'),
            "custom_field": field.get('custom_field', False)
        })
    return field_info

def classify_bounce_type(subject, body):
    """
    Classify bounce emails into different types based on content analysis
    Returns: bounce_type, bounce_reason
    """
    subject_lower = subject.lower() if subject else ""
    body_lower = body.lower() if body else ""
    
    # 1. HARD BOUNCES (Permanent failures)
    
    # Email address not found/don't exist
    if any(term in subject_lower or term in body_lower for term in [
        "user unknown", "recipient not found", "no such user", 
        "invalid recipient", "mailbox not found", "address not found",
        "does not exist", "550 5.1.1", "550-5.1.1", "550.5.1.1"
    ]):
        return "hard_bounce", "Email address does not exist"
    
    # Domain not found
    if any(term in subject_lower or term in body_lower for term in [
        "domain not found", "no such domain", "host not found",
        "unknown host", "domain does not exist", "mx record not found",
        "550 5.1.2", "550-5.1.2"
    ]):
        return "hard_bounce", "Domain does not exist"
    
    # Mailbox full (treated as hard bounce after multiple attempts)
    if "mailbox full" in subject_lower or "mailbox full" in body_lower:
        return "hard_bounce", "Mailbox is full"
    
    # Blocked by recipient server
    if any(term in subject_lower or term in body_lower for term in [
        "rejected", "blocked", "spam", "blacklisted", "policy rejection",
        "spamhaus", "barracuda", "spam filter", "554", "553"
    ]):
        return "hard_bounce", "Blocked by recipient server"
    
    # 2. SOFT BOUNCES (Temporary failures)
    
    # Mailbox full (first occurrence)
    if "quota exceeded" in subject_lower or "quota exceeded" in body_lower:
        return "soft_bounce", "Mailbox quota exceeded"
    
    # Message too large
    if any(term in subject_lower or term in body_lower for term in [
        "message too large", "size limit", "552", "exceeds size limit"
    ]):
        return "soft_bounce", "Message size too large"
    
    # Connection/timeout issues
    if any(term in subject_lower or term in body_lower for term in [
        "timeout", "connection refused", "connection timeout",
        "temporarily unavailable", "try again later", "421", "451"
    ]):
        return "soft_bounce", "Temporary delivery failure"
    
    # Greylisting
    if any(term in subject_lower or term in body_lower for term in [
        "greylist", "grey list", "try again", "temporary failure",
        "4.2.0", "4.2.1"
    ]):
        return "soft_bounce", "Greylisted - try again later"
    
    # 3. OTHER TYPES
    
    # Auto-reply/Out of Office (not a bounce, but worth tracking)
    if any(term in subject_lower or term in body_lower for term in [
        "out of office", "ooo", "vacation", "auto-reply", "autoreply",
        "automatic reply", "away from"
    ]):
        return "auto_reply", "Auto-reply message"
    
    # Challenge-response (verification required)
    if any(term in subject_lower or term in body_lower for term in [
        "challenge", "verification required", "confirm you are human"
    ]):
        return "challenge_response", "Challenge-response required"
    
    # Content rejection
    if any(term in subject_lower or term in body_lower for term in [
        "content rejected", "message content", "attachment rejected"
    ]):
        return "content_rejection", "Content rejected by server"
    
    # Generic bounce - if we can't classify it
    return "unknown_bounce", "Unknown bounce reason"

def extract_original_message_id(body, headers):
    """Extract original message ID from bounce message"""
    # Check headers first
    if 'message-id' in headers:
        return headers['message-id']
    
    # Search in body
    message_id_patterns = [
        r'Message-ID:\s*<([^>]+)>',
        r'Original-Message-ID:\s*<([^>]+)>',
        r'References:\s*<([^>]+)>'
    ]
    
    for pattern in message_id_patterns:
        match = re.search(pattern, body, re.IGNORECASE)
        if match:
            return match.group(1)
    
    return None

def extract_bounce_details(body):
    """Extract detailed bounce information from bounce message"""
    details = {}
    
    # Extract error codes
    error_code_patterns = [
        r'(\d{3}\s+\d\.\d\.\d+)',  # RFC 3463 error codes like 550 5.1.1
        r'Status:\s*(\d\.\d\.\d)',  # DSN status
        r'Diagnostic-Code:\s*(.+)',  # Diagnostic code
    ]
    
    for pattern in error_code_patterns:
        matches = re.findall(pattern, body, re.IGNORECASE)
        if matches:
            details['error_codes'] = matches
    
    # Extract reporting MTA
    mta_match = re.search(r'Reporting-MTA:\s*dns;\s*(.+)', body, re.IGNORECASE)
    if mta_match:
        details['reporting_mta'] = mta_match.group(1)
    
    # Extract action
    action_match = re.search(r'Action:\s*(.+)', body, re.IGNORECASE)
    if action_match:
        details['action'] = action_match.group(1)
    
    return details

def extract_email_from_text(text):
    """Extract email address from text"""
    if not text:
        return None
    
    email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', text)
    return email_match.group(0).lower() if email_match else None


def get_provider_config(provider_name=None, email=None):
    """Get provider configuration for display purposes"""
    if provider_name and provider_name != 'auto' and provider_name != 'custom':
        # Return hardcoded config for known providers
        providers = {
            'gmail': {
                'name': 'Gmail',
                'smtp': 'smtp.gmail.com:587',
                'imap': 'imap.gmail.com:993',
                'help': 'Requires app password. Enable 2FA and generate app password.',
                'icon': 'G'
            },
            'outlook': {
                'name': 'Outlook/Hotmail',
                'smtp': 'smtp-mail.outlook.com:587',
                'imap': 'outlook.office365.com:993',
                'help': 'Use your Microsoft account password.',
                'icon': 'O'
            },
            'yahoo': {
                'name': 'Yahoo Mail',
                'smtp': 'smtp.mail.yahoo.com:465 (SSL)',
                'imap': 'imap.mail.yahoo.com:993',
                'help': 'Requires app-specific password.',
                'icon': 'Y'
            },
            'icloud': {
                'name': 'iCloud',
                'smtp': 'smtp.mail.me.com:587',
                'imap': 'imap.mail.me.com:993',
                'help': 'Requires app-specific password.',
                'icon': 'I'
            },
            'aol': {
                'name': 'AOL Mail',
                'smtp': 'smtp.aol.com:587',
                'imap': 'imap.aol.com:993',
                'help': 'Requires app-specific password.',
                'icon': 'A'
            },
            'zoho': {
                'name': 'Zoho Mail',
                'smtp': 'smtp.zoho.com:587',
                'imap': 'imap.zoho.com:993',
                'help': 'Use your Zoho account password.',
                'icon': 'Z'
            },
            'protonmail': {
                'name': 'ProtonMail',
                'smtp': 'smtp.protonmail.ch:587',
                'imap': 'imap.protonmail.ch:993',
                'help': 'Requires app-specific password.',
                'icon': 'P'
            },
            'office365': {
                'name': 'Office 365',
                'smtp': 'smtp.office365.com:587',
                'imap': 'outlook.office365.com:993',
                'help': 'Use your Microsoft 365 password.',
                'icon': 'O365'
            }
        }
        return providers.get(provider_name, {
            'name': 'Custom',
            'smtp': 'Enter custom SMTP server',
            'imap': 'Enter custom IMAP server',
            'help': 'Contact your email provider for settings.',
            'icon': 'C'
        })
    
    elif email:
        # Auto-detect from email
        provider_info = detect_email_provider(email)
        return {
            'name': provider_info.get('name', 'custom').title(),
            'smtp': f"{provider_info['smtp_server']}:{provider_info['smtp_port']}",
            'imap': f"{provider_info['imap_server']}:{provider_info['imap_port']}",
            'help': provider_info.get('help', 'Use your email password.'),
            'icon': provider_info.get('name', 'C')[0].upper()
        }
    
    else:
        return {
            'name': 'Auto-detect',
            'smtp': 'Will auto-detect from email',
            'imap': 'Will auto-detect from email',
            'help': 'System will detect provider from email domain.',
            'icon': 'A'
        }