from flask import Flask, request, jsonify, send_file, Blueprint
import pandas as pd
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from itertools import cycle
import threading
from flask_cors import CORS
import google.generativeai as genai
import os
import re
import time
from datetime import datetime, timedelta  
import json
import imaplib
import email
from email.header import decode_header
import requests
import io
from config import app_state  # Import the shared state object
from database import db  # Import the database instance

# Import service functions
# In content_routes.py, update the import section:
from services.service import (
    generate_email_content,
    send_bulk_emails,
    check_email_replies,
    save_to_excel,
    mark_email_as_read,
    extract_name_from_email,
    extract_company_from_email,
    extract_phone_number,
    replace_placeholders,
    is_valid_phone_number,
    send_bulk_emails_with_templates, 
    is_auto_response,
    classify_email_responses,
    get_emails_for_follow_up,
    schedule_follow_up_emails,
    process_scheduled_follow_ups,
    start_automated_follow_up_service,
    update_email_status,
    check_email_bounces,
    get_campaign_email_status,
    send_follow_up_emails,
    send_immediate_follow_up_emails,
    send_immediate_follow_up_emails,
    extract_recipient_from_bounce,
    detect_email_provider,
    get_provider_settings
)

# Add this import from helpers if extract_email_from_text is there
from utils.helpers import extract_email_from_text  # Add this line

# Import login_required decorator
from .auth_routes import login_required

content_bp = Blueprint("content", __name__)


def _maybe_send_auto_reply(user_id, tracking_id, campaign_id, recipient_email, smtp_sender_email, smtp_password):
    """Send an auto-reply using campaign-specific template or default if available.
    Avoid duplicate sends by checking email_auto_replies for the tracking_id.
    """
    try:
        connection = db.get_connection()
        if not connection:
            return False
        cursor = connection.cursor()

        # Avoid duplicate auto-replies for the same tracking
        cursor.execute("SELECT id FROM email_auto_replies WHERE tracking_id = ? LIMIT 1", (tracking_id,))
        if cursor.fetchone():
            connection.close()
            return False

        # Get template: campaign-specific, else default
        tpl = db.get_auto_reply_template_for_campaign(user_id, campaign_id)
        if not tpl:
            tpl = db.get_default_auto_reply_template(user_id)
        if not tpl:
            connection.close()
            return False

        subject = tpl.get("subject") or "Thank you for your reply"
        body = tpl.get("body") or "Thank you for getting back to us. We'll follow up soon."

        # Personalize
        recipient_name = "there"
        cursor.execute("SELECT recipient_name FROM email_tracking WHERE id = ?", (tracking_id,))
        row = cursor.fetchone()
        if row and row[0]:
            recipient_name = row[0]

        personalized_subject = replace_placeholders(subject, recipient_name)
        personalized_body = replace_placeholders(body, recipient_name)

        # Send using provider detection
        from services.service import send_email_with_provider
        provider_info = detect_email_provider(smtp_sender_email)
        success, error = send_email_with_provider(
            sender_email=smtp_sender_email,
            password=smtp_password,
            recipient_email=recipient_email,
            subject=personalized_subject,
            body=personalized_body,
            sender_name="",  # keep existing sender name associated with account if applicable
            provider_info=provider_info,
            custom_smtp=None
        )

        if success:
            cursor.execute(
                """
                INSERT INTO email_auto_replies (tracking_id, auto_reply_subject, auto_reply_body, auto_reply_sent_at, status, sender_email)
                VALUES (?, ?, ?, ?, 'sent', ?)
                """,
                (
                    tracking_id,
                    personalized_subject,
                    personalized_body,
                    datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    smtp_sender_email,
                ),
            )
            connection.commit()
            connection.close()
            return True
        else:
            print(f"Auto-reply send failed: {error}")
            connection.close()
            return False
    except Exception as e:
        try:
            if connection:
                connection.close()
        except Exception:
            pass
        print(f"_maybe_send_auto_reply error: {e}")
        return False

@content_bp.route("/generate-professional-reply", methods=["POST"])
@login_required
def generate_professional_reply():
    """Generate a single professional AI reply for a received email"""
    user_id = request.user["id"]
    data = request.json
    original_email = data.get("original_email")
    
    if not original_email:
        return jsonify({"error": "Missing email content"}), 400
    
    try:
        # Use Gemini to generate a professional reply
        model = genai.GenerativeModel('gemini-2.5-pro')
        prompt = f"""
        Write a professional email reply to this message. 
        Make it concise, polite, and business-appropriate.
        Write only one reply in plain text format.
        
        Email to reply to: {original_email}
        
        Professional reply:
        """
        
        response = model.generate_content(prompt)
        
        # Get the response and clean it
        reply_text = response.text.strip()
        
        # Simple cleaning - remove any markdown formatting
        reply_text = re.sub(r'\*\*(.*?)\*\*', r'\1', reply_text)  # Remove bold
        reply_text = re.sub(r'\*(.*?)\*', r'\1', reply_text)  # Remove italic
        
        return jsonify({"reply": reply_text})
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Error generating reply: {error_msg}")
        
        # Fallback: Generate a basic professional reply if API fails
        if "quota" in error_msg.lower() or "429" in error_msg or "503" in error_msg:
            print("⚠️ API quota exceeded or service unavailable. Using template reply.")
            fallback_reply = """Thank you for your email. I appreciate you reaching out to me. I will review your message and get back to you as soon as possible. If you have any urgent matters, please feel free to follow up.

Best regards"""
            return jsonify({"reply": fallback_reply, "is_template": True})
        
        return jsonify({"error": str(e), "is_template": True}), 500

@content_bp.route("/generate-content", methods=["POST"])
@login_required
def generate_content():
    user_id = request.user["id"]
    data = request.json
    prompt = data.get("prompt", "")

    if not prompt:
        return jsonify({"error": "No prompt provided"}), 400

    content = generate_email_content(prompt)

    if "error" in content:
        return jsonify({"error": content["error"]}), 500

    # Use app_state instead of global email_content
    app_state.email_content = content

    return jsonify(content)

@content_bp.route("/get-content", methods=["GET"])
@login_required
def get_content():
    user_id = request.user["id"]
    # Use app_state instead of global email_content
    return jsonify(app_state.email_content)

@content_bp.route("/update-content", methods=["POST"])
@login_required
def update_content():
    user_id = request.user["id"]
    data = request.json

    if "subject" in data:
        app_state.email_content["subject"] = data["subject"]
    if "body" in data:
        app_state.email_content["body"] = data["body"]
    if "sender_name" in data:
        app_state.email_content["sender_name"] = data["sender_name"]
    if "sender_email" in data:
        app_state.email_content["sender_email"] = data["sender_email"]
    if "phone_number" in data:
        app_state.email_content["phone_number"] = data["phone_number"]

    return jsonify({"message": "Content updated successfully", "content": app_state.email_content})

@content_bp.route("/get-settings", methods=["GET"])
@login_required
def get_settings():
    user_id = request.user["id"]
    sender_accounts = db.get_sender_accounts(user_id)
    # Mask passwords
    for acc in sender_accounts:
        if acc.get('password'):
            acc['password'] = "●●●●●●"
    
    settings = db.get_user_settings(user_id)
    return jsonify({
        "sender_accounts": sender_accounts,
        "batch_size": settings.get("batch_size", 250)
    })

@content_bp.route("/save-settings", methods=["POST"])
@login_required
def save_settings():
    user_id = request.user["id"]
    data = request.json
    
    sender_accounts = data.get("sender_accounts", [])
    batch_size = data.get("batch_size", 250)
    
    # Save sender accounts
    acc_success = db.save_sender_accounts(user_id, sender_accounts)
    
    # Save general settings
    settings_success = db.update_user_settings(user_id, {"batch_size": batch_size})
    
    if acc_success and settings_success:
        return jsonify({"message": "Sender details saved successfully"})
    else:
        return jsonify({"error": "Failed to save some settings"}), 500

@content_bp.route("/upload-templates", methods=["POST"])
@login_required
def upload_templates():
    """Upload Excel file with email templates for different positions"""
    user_id = request.user["id"]
    file = request.files["file"]
    
    if not file:
        return jsonify({"error": "No file provided"}), 400

    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(file)
        else:
            df = pd.read_excel(file)

        # NO VALIDATION - Accept ANY columns!
        # Automatically detect which columns are present
        available_columns = df.columns.tolist()
        print(f"📋 Template file has columns: {available_columns}")
        
        # Store templates in app_state
        templates = {}
        template_details = []
        
        # Try to find a position/key column (first column if no 'position' column exists)
        position_col = None
        for col in ['position', 'Position', 'POSITION', 'role', 'Role', 'title', 'Title']:
            if col in df.columns:
                position_col = col
                break
        
        # If no position column found, use the first column as the key
        if position_col is None and len(df.columns) > 0:
            position_col = df.columns[0]
            print(f"⚠️ No 'position' column found, using '{position_col}' as the key column")
        
        # Find subject and body columns (or use defaults)
        subject_col = None
        body_col = None
        sender_name_col = None
        
        for col in ['subject', 'Subject', 'SUBJECT', 'email_subject', 'Email Subject']:
            if col in df.columns:
                subject_col = col
                break
        
        for col in ['body', 'Body', 'BODY', 'message', 'Message', 'email_body', 'Email Body', 'content', 'Content']:
            if col in df.columns:
                body_col = col
                break
        
        for col in ['sender_name', 'Sender Name', 'sender', 'Sender', 'from_name', 'From Name']:
            if col in df.columns:
                sender_name_col = col
                break
        
        # Process each row
        for idx, row in df.iterrows():
            # Get position/key (use first column value if no position column)
            if position_col:
                position = str(row[position_col]).strip().lower()
            else:
                position = f"template_{idx}"  # Generate a key if no suitable column
            
            # Get subject (use professional default if column not found)
            if subject_col and pd.notna(row.get(subject_col)):
                subject = str(row[subject_col])
            else:
                position_upper = position.upper()
                subject = f"Job Opportunity - {position_upper} at {{{{company}}}}"
            
            # Get body (use LONG professional default if column not found)
            if body_col and pd.notna(row.get(body_col)):
                body = str(row[body_col])
            else:
                # Generate LONG professional format email
                position_upper = position.upper()  # Role in CAPS
                body = f"""Dear {{{{name}}}},

I hope this email finds you well.

I am reaching out to you today from {{{{company}}}} because your profile on LinkedIn caught my attention. We are currently seeking a talented and experienced individual to join our team as a {position_upper}.

{{{{company}}}} is a rapidly growing company focused on innovation and excellence. This {position_upper} role offers a unique opportunity to work with cutting-edge technology, drive our initiatives, and contribute to exciting projects.

I would be delighted to share more details about this exciting opportunity and learn more about your career interests. Would you be open to a brief introductory call sometime next week? Please let me know what day and time works best for you, or if you prefer, I am open to sending over the full job description for your review.

Thank you for your time and consideration. I look forward to hearing from you soon.

Best regards,

{{{{sender_name}}}}
Senior Recruiter
{{{{company}}}}"""
            
            # Get sender name (optional)
            sender_name = str(row[sender_name_col]) if sender_name_col and pd.notna(row.get(sender_name_col)) else ""
            
            template_data = {
                'subject': subject,
                'body': body,
                'sender_name': sender_name
            }
            templates[position] = template_data
            
            # Store template details for frontend display
            template_details.append({
                'position': position,
                'subject': template_data['subject'],
                'body': template_data['body'],
                'sender_name': template_data['sender_name']
            })

        app_state.email_templates = templates
        app_state.default_template = templates.get('general', templates.get('default', next(iter(templates.values())) if templates else None))
        app_state.template_details = template_details  # Store for frontend access

        return jsonify({
            "message": f"Successfully loaded {len(templates)} templates from file with columns: {', '.join(available_columns)}",
            "positions": list(templates.keys()),
            "templates": template_details,
            "templates_with_sender_names": [pos for pos, template in templates.items() if template.get('sender_name')],
            "detected_columns": {
                "position": position_col,
                "subject": subject_col,
                "body": body_col,
                "sender_name": sender_name_col
            }
        })

    except Exception as e:
        return jsonify({"error": f"Error processing template file: {str(e)}"}), 500

@content_bp.route("/templates", methods=["GET"])
@login_required
def get_user_templates():
    """Fetch all saved templates for the current user"""
    user_id = request.user["id"]
    try:
        templates = db.get_templates(user_id)
        return jsonify({"templates": templates})
    except Exception as e:
        print(f"Error fetching templates: {e}")
        return jsonify({"error": str(e)}), 500

@content_bp.route("/save-template", methods=["POST"])
@login_required
def save_user_template():
    """Save or update a manual email template"""
    user_id = request.user["id"]
    data = request.json
    
    # Validation
    required_fields = ["subject", "body"]
    for field in required_fields:
        if not data.get(field):
            return jsonify({"error": f"Field '{field}' is required"}), 400
            
    try:
        template_id = db.save_template(user_id, data)
        if template_id:
            return jsonify({"message": "Template saved successfully", "id": template_id})
        else:
            return jsonify({"error": "Failed to save template"}), 500
    except Exception as e:
        print(f"Error saving template: {e}")
        return jsonify({"error": str(e)}), 500

@content_bp.route("/api/templates/<int:template_id>", methods=["DELETE"])
@login_required
def delete_user_template(template_id):
    """Delete an email template"""
    user_id = request.user["id"]
    try:
        success = db.delete_template(template_id, user_id)
        if success:
            return jsonify({"message": "Template deleted successfully"})
        else:
            return jsonify({"error": "Failed to delete template"}), 500
    except Exception as e:
        print(f"Error deleting template: {e}")
        return jsonify({"error": str(e)}), 500

@content_bp.route("/download-template-format", methods=["GET"])
@login_required
def download_template_format():
    """Download a sample CSV format for bulk templates"""
    try:
        # Create a sample dataframe
        data = {
            'sender_name': ['John Doe'],
            'sender_email': ['john@example.com'],
            'phone_number': ['+1234567890'],
            'subject': ['Special Offer for {{name}}'],
            'body': ['Hi {{name}},\n\nWe have a special position for you as {{position}}...'],
            'position': ['Developer']
        }
        df = pd.DataFrame(data)
        
        # Save to bytes
        output = io.BytesIO()
        df.to_csv(output, index=False)
        output.seek(0)
        
        return send_file(
            output,
            mimetype='text/csv',
            as_attachment=True,
            download_name='email_template_format.csv'
        )
    except Exception as e:
        print(f"Error generating template format: {e}")
        return jsonify({"error": str(e)}), 500

@content_bp.route("/upload", methods=["POST"])
@login_required
def upload_file():
    user_id = request.user["id"]
    
    
    try:
        # Enhanced file checking with detailed debugging
        print(f"=== UPLOAD REQUEST DEBUG ===")
        print(f"User ID: {user_id}")
        print(f"Request files: {request.files}")
        print(f"Request form: {request.form}")
        print(f"Request headers: {dict(request.headers)}")
        
        # Check if file exists in request
        if 'file' not in request.files:
            print("ERROR: No 'file' field in request.files")
            return jsonify({"error": "No file provided in the request"}), 400
        
        file = request.files["file"]
        print(f"File object: {file}")
        print(f"File filename: {file.filename}")
        print(f"File content type: {file.content_type}")
        print(f"File content length: {file.content_length if hasattr(file, 'content_length') else 'N/A'}")
        
        # Check if file was actually selected
        if file.filename == '' or file.filename is None:
            print("ERROR: Empty filename")
            return jsonify({"error": "No file selected"}), 400
        
        # Check if file has allowed extension
        allowed_extensions = {'.csv', '.xlsx', '.xls'}
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in allowed_extensions:
            print(f"ERROR: Invalid file extension: {file_ext}")
            return jsonify({"error": f"Invalid file type. Allowed: {', '.join(allowed_extensions)}"}), 400

        # Get form data with defaults
        batch_size = int(request.form.get("batch_size", 250))
        use_templates = request.form.get("use_templates", "false").lower() == "true"
        position_column = request.form.get("position_column", "position")
        
        sender_emails = request.form.getlist("sender_emails[]")
        sender_passwords = request.form.getlist("sender_passwords[]")
        sender_names = request.form.getlist("sender_names[]")
        sender_providers = request.form.getlist("sender_providers[]")
        custom_smtp = request.form.getlist("custom_smtp[]")
        custom_imap = request.form.getlist("custom_imap[]")

        print(f"Form data received:")
        print(f"  - Batch size: {batch_size}")
        print(f"  - Use templates: {use_templates}")
        print(f"  - Position column: {position_column}")
        print(f"  - Sender emails: {sender_emails}")
        print(f"  - Sender passwords: {len(sender_passwords)} passwords")
        print(f"  - Sender names: {sender_names}")

        if not sender_emails or not sender_passwords:
            return jsonify({"error": "No sender accounts provided!"}), 400

        if len(sender_emails) != len(sender_passwords):
            return jsonify({"error": "Mismatch between number of emails and passwords!"}), 400

        # Create sender accounts with names
        sender_accounts = []
        for i in range(len(sender_emails)):
            sender_name = sender_names[i] if i < len(sender_names) else ""
            provider = sender_providers[i] if i < len(sender_providers) else "gmail"
            
            account_data = {
                'email': sender_emails[i],
                'password': sender_passwords[i],
                'sender_name': sender_name,
                'provider': provider
            }
            
            # Add custom settings if provided
            if provider == 'custom' and i < len(custom_smtp):
                account_data['custom_smtp'] = custom_smtp[i]
            if provider == 'custom' and i < len(custom_imap):
                account_data['custom_imap'] = custom_imap[i]
                
            sender_accounts.append(account_data)

        print(f"Created {len(sender_accounts)} sender accounts")

        # Read file - with enhanced error handling for Windows
        try:
            # Create temp directory if it doesn't exist (Windows compatible)
            temp_dir = os.path.join(os.path.expanduser("~"), "temp", "email_uploads")
            os.makedirs(temp_dir, exist_ok=True)
            
            # Create temp file path
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            temp_filename = f"upload_debug_{user_id}_{timestamp}{file_ext}"
            temp_path = os.path.join(temp_dir, temp_filename)
            
            print(f"Saving file to temporary location: {temp_path}")
            file.save(temp_path)
            print(f"File saved successfully to: {temp_path}")
            
            # Read the file
            if file.filename.endswith(".csv"):
                df = pd.read_csv(temp_path)
                file_type = "text/csv"
                print("Successfully read CSV file")
            else:
                df = pd.read_excel(temp_path)
                file_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                print("Successfully read Excel file")
            
            # Get file size for database
            file_size = os.path.getsize(temp_path)
            print(f"File size: {file_size} bytes")
            
            # Clean up temp file after reading
            try:
                os.remove(temp_path)
                print("Temporary file cleaned up")
            except Exception as cleanup_error:
                print(f"Warning: Could not clean up temp file: {cleanup_error}")
            
        except Exception as e:
            print(f"ERROR reading file: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({"error": f"Error reading file: {str(e)}"}), 400

        # Get file statistics for database
        column_count = len(df.columns)
        row_count = len(df)  # Total rows in the file

        print(f"File parsed successfully: {column_count} columns, {row_count} rows")

        # Enhanced email column detection
        possible_email_cols = ['email', 'Email', 'EMAIL', 'email_id', 'Email ID', 'EMAIL_ID', 
                              'email_address', 'Email Address', 'EMAIL_ADDRESS', 'recipient_email',
                              'Recipient Email', 'RECIPIENT_EMAIL', 'mail', 'Mail', 'MAIL', 'Validated Emails',
                              'e-mail', 'E-mail', 'E-MAIL', 'contact_email', 'Contact Email']
        
        # Enhanced name column detection
        possible_name_cols = ['name', 'Name', 'NAME', 'full_name', 'Full Name', 'FULL_NAME',
                             'first_name', 'First Name', 'FIRST_NAME', 'last_name', 'Last Name',
                             'LAST_NAME', 'contact_name', 'Contact Name', 'CONTACT_NAME',
                             'candidate_name', 'Candidate Name', 'CANDIDATE_NAME']
        
        # Position column detection
        possible_position_cols = ['position', 'Position', 'POSITION', 'job_title', 'Job Title', 
                                 'JOB_TITLE', 'role', 'Role', 'ROLE', 'title', 'Title', 'TITLE']

        email_col = None
        name_col = None
        position_col = None

        print("Available columns:", df.columns.tolist())

        # Find email column
        for col in df.columns:
            col_lower = col.lower().strip()
            for possible in possible_email_cols:
                if col_lower == possible.lower():
                    email_col = col
                    break
            if email_col:
                break

        if not email_col:
            # Try pattern matching
            for col in df.columns:
                col_lower = col.lower().strip()
                if 'email' in col_lower or 'mail' in col_lower:
                    email_col = col
                    break

        if not email_col:
            # Try data content detection
            for col in df.columns:
                sample_values = df[col].dropna().head(5)
                if len(sample_values) > 0 and any('@' in str(val) for val in sample_values):
                    email_col = col
                    break

        if not email_col:
            print("ERROR: No email column found after all detection methods")
            return jsonify({"error": "No email column found in the uploaded file! Please ensure your file has an email column."}), 400

        print(f"Found email column: {email_col}")

        # Find name column
        for col in df.columns:
            col_lower = col.lower().strip()
            for possible in possible_name_cols:
                if col_lower == possible.lower():
                    name_col = col
                    break
            if name_col:
                break

        if name_col:
            print(f"Found name column: {name_col}")
        else:
            print("No name column found, will extract from email")

        # Find position column if using templates
        if use_templates:
            for col in df.columns:
                col_lower = col.lower().strip()
                for possible in possible_position_cols:
                    if col_lower == possible.lower():
                        position_col = col
                        break
                if position_col:
                    break
            
            if not position_col:
                return jsonify({"error": "No position column found for template matching! Please check your file or change the position column name."}), 400
            print(f"Found position column: {position_col}")

        # Company column detection
        possible_company_cols = ['company', 'Company', 'COMPANY', 'organization', 'Organization', 
                                'ORGANIZATION', 'business', 'Business', 'BUSINESS', 'firm', 'Firm']
        company_col = None
        for col in df.columns:
            col_lower = col.lower().strip()
            for possible in possible_company_cols:
                if col_lower == possible.lower():
                    company_col = col
                    break
            if company_col:
                break
        
        # Phone column detection
        possible_phone_cols = ['phone', 'Phone', 'PHONE', 'mobile', 'Mobile', 'MOBILE',
                              'contact_number', 'Contact Number', 'cell', 'Cell', 'number', 'Number']
        phone_col = None
        for col in df.columns:
            col_lower = col.lower().strip()
            for possible in possible_phone_cols:
                if col_lower == possible.lower():
                    phone_col = col
                    break
            if phone_col:
                break
                
        print(f"Column Mapping - Email: {email_col}, Name: {name_col}, Position: {position_col}, Company: {company_col}, Phone: {phone_col}")

        # Initialize recipients list
        recipients = []
        
        for index, row in df.iterrows():
            email_value = row[email_col]
            if pd.isna(email_value) or not isinstance(email_value, str):
                continue
                
            # Split multiple emails using comma, semicolon, or space
            email_list = []
            if email_value:
                # First split by semicolon, then by comma, then by space
                for separator in [';', ',', ' ']:
                    if separator in email_value:
                        # Split and clean each email
                        split_emails = [email.strip() for email in email_value.split(separator) if email.strip()]
                        email_list.extend(split_emails)
                        break
                else:
                    # No separators found, treat as single email
                    email_list = [email_value.strip()]
            
            # Filter valid emails and remove duplicates
            valid_emails = []
            seen_emails = set()
            for email_str in email_list:
                if email_str and '@' in email_str and email_str not in seen_emails:
                    valid_emails.append(email_str)
                    seen_emails.add(email_str)
            
            if not valid_emails:
                continue
                
            name_value = ""
            if name_col and name_col in df.columns and not pd.isna(row[name_col]):
                name_value = str(row[name_col])
            
            position_value = ""
            if position_col:
                 # If explicit position column exists, use it
                 if position_col in df.columns and not pd.isna(row[position_col]):
                     position_value = str(row[position_col]).strip().lower()
            elif use_templates:
                 # If templates are enabled but no position column, look for one again locally or warn
                 pass
            else:
                 # If templates NOT enabled, we might still want position for replacement? 
                 # Let's try to extract it if available for placeholders even if not used for template selection
                 # Re-using the detection logic from above (which only runs if use_templates is true usually? No, let's make it general)
                 pass

            # Improved Position Extraction for Placeholders
            if not position_value:
                # Try to find a position value even if templates aren't used, for placeholder replacement
                 for col in df.columns:
                    col_lower = col.lower().strip()
                    if col_lower in ['position', 'job title', 'role', 'title']:
                        if not pd.isna(row[col]):
                            position_value = str(row[col]).strip()
                        break
            
            company_value = ""
            if company_col and company_col in df.columns and not pd.isna(row[company_col]):
                company_value = str(row[company_col]).strip()
                
            phone_value = ""
            if phone_col and phone_col in df.columns and not pd.isna(row[phone_col]):
                phone_value = str(row[phone_col]).strip()
            
            # Create a recipient entry for each valid email
            for email_str in valid_emails:
                # Extract name from email if name column is empty
                final_name = name_value
                if not final_name:
                    final_name = extract_name_from_email(email_str)[0] or ""
                
                recipients.append({
                    "email": email_str,
                    "name": final_name,
                    "position": position_value,
                    "company": company_value,
                    "phone": phone_value
                })

        if len(recipients) == 0:
            return jsonify({"error": "No valid email addresses found in the uploaded file!"}), 400

        print(f"Found {len(recipients)} valid recipients after processing")

        try:
            # Check for existing file with same name and user
            existing_file = db.check_existing_file(user_id, file.filename)
            
            # Get confirmation flag from request
            replace_existing = request.form.get("replace_existing", "false").lower() == "true"
            
            print(f"Duplicate check - Existing file: {existing_file}, Replace existing: {replace_existing}")
            
            if existing_file and not replace_existing:
                # Return information about existing file and ask for confirmation
                print(f"Duplicate file detected: {existing_file}")
                response_data = {
                    "duplicate": True,
                    "existing_file": {
                        "id": existing_file["id"],
                        "filename": existing_file["original_filename"],
                        "uploaded_at": existing_file["uploaded_at"],
                        "total_records": existing_file["total_records"]
                    },
                    "message": f"A file with name '{file.filename}' already exists. Do you want to replace it?"
                }
                print(f"Returning duplicate response: {response_data}")
                return jsonify(response_data), 409  # 409 Conflict status code
            
            # If replacing existing file, delete it first
            if existing_file and replace_existing:
                print(f"Replacing existing file with ID: {existing_file['id']}")
                db.delete_file(existing_file["id"], user_id)
                print(f"Replaced existing file with ID: {existing_file['id']}")
            
            # Save file information to database
            file_id = db.save_uploaded_file(
                user_id=user_id,
                filename=file.filename,
                original_filename=file.filename,
                file_size=file_size,
                file_type=file_type,
                total_records=len(recipients),
                column_count=column_count,
                row_count=row_count,
                file_data=None  # We don't need to store the actual file content in database
            )
            
            if not file_id:
                return jsonify({"error": "Failed to save file information to database"}), 500

            # Create campaign record
            campaign_name = f"Campaign {datetime.now().strftime('%Y-%m-%d %H:%M')}"
            campaign_id = db.create_email_campaign(
                user_id=user_id,
                file_id=file_id,
                campaign_name=campaign_name,
                total_recipients=len(recipients),
                batch_size=batch_size,
                use_templates=use_templates
            )
            
            if not campaign_id:
                return jsonify({"error": "Failed to create campaign record in database"}), 500

            # Create email tracking records for all recipients
            for recipient in recipients:
                db.save_email_tracking(
                    campaign_id=campaign_id,
                    recipient_email=recipient["email"],
                    recipient_name=recipient["name"],
                    status='ready'
                )

            # Determine email content source
            if use_templates:
                # Check if templates are loaded
                if not hasattr(app_state, 'email_templates') or not app_state.email_templates:
                    return jsonify({"error": "No email templates loaded! Please upload template file first."}), 400
                
                # Use template-based content
                template_data = {
                    'templates': app_state.email_templates,
                    'default_template': app_state.default_template
                }
                print("Starting template-based email sending...")
                def run_template_sending():
                    try:
                        send_bulk_emails_with_templates(recipients, batch_size, sender_accounts, template_data, user_id, campaign_id)
                    except Exception as e:
                        print(f"❌ CRITICAL ERROR in template email sending thread: {e}")
                        import traceback
                        traceback.print_exc()
                        app_state.progress["status"] = f"error: {e}"
                
                threading.Thread(target=run_template_sending).start()
            else:
                # Use regular email content
                template_data = None
                subject = request.form.get("subject", "")
                body = request.form.get("body", "")
                sender_name = request.form.get("sender_name", "")
                
                # Validate regular email content
                if not subject or not body or not sender_name:
                    return jsonify({"error": "Email content is incomplete! Please generate or enter subject, body, and sender name."}), 400

                print("Starting regular email sending...")
                def run_bulk_sending():
                    try:
                        send_bulk_emails(recipients, batch_size, sender_accounts, subject, body, sender_name, user_id, campaign_id)
                    except Exception as e:
                        print(f"❌ CRITICAL ERROR in bulk email sending thread: {e}")
                        import traceback
                        traceback.print_exc()
                        app_state.progress["status"] = f"error: {e}"
                
                threading.Thread(target=run_bulk_sending).start()

            print("=== UPLOAD COMPLETED SUCCESSFULLY ===")
            return jsonify({
                "message": f"Started sending {len(recipients)} personalized emails.",
                "campaign_id": campaign_id,
                "file_id": file_id,  # Return file ID for deletion tracking
                "total_recipients": len(recipients),
                "campaign_name": campaign_name,
                "replaced_existing": existing_file is not None
            })
            
        except Exception as e:
            print(f"Database error in upload route: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({"error": f"Database operation failed: {str(e)}"}), 500

    except Exception as e:
        print(f"Unexpected error in upload route: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500

@content_bp.route("/preview", methods=["POST"])
@login_required
def preview_file():
    user_id = request.user["id"]
    file = request.files["file"]

    if file.filename.endswith(".csv"):
        df = pd.read_csv(file)
    else:
        df = pd.read_excel(file)

    # Remove empty rows (where all columns are NaN)
    df = df.dropna(how='all')
    
    # Get total count (excluding empty rows)
    total_count = len(df)
    
    preview_data = df.head(5).to_dict(orient="records")
    columns = df.columns.tolist()

    return jsonify({
        "columns": columns, 
        "data": preview_data,
        "total_count": total_count  # Add total count for distribution
    })

@content_bp.route("/progress", methods=["GET"])
@login_required
def get_progress():
    user_id = request.user["id"]
    # Use app_state instead of global progress
    current_progress = app_state.progress.copy()
    print(f"📊 /progress endpoint called - Current state: {current_progress}")
    return jsonify(current_progress)

@content_bp.route("/check-replies", methods=["POST"])
@login_required
def check_replies():
    """Check unread replies"""
    user_id = request.user["id"]
    data = request.json
    sender_email = data.get("sender_email")
    sender_password = data.get("sender_password")

    if not sender_email or not sender_password:
        return jsonify({"error": "Missing sender email or password"}), 400

    try:
        # Fetch replies from Gmail IMAP (excluding auto-responses)
        replies = check_email_replies(sender_email, sender_password)

        return jsonify({
            "message": f"Found {len(replies)} replies.",
            "replies": replies
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@content_bp.route("/generate-reply", methods=["POST"])
@login_required
def generate_reply():
    """Generate an AI reply for a received email"""
    user_id = request.user["id"]
    data = request.json
    original_email = data.get("original_email")
    reply_content = data.get("reply_content")
    
    if not original_email or not reply_content:
        return jsonify({"error": "Missing email or content"}), 400
    
    try:
        # Use Gemini to generate a reply
        model = genai.GenerativeModel('gemini-2.5-pro')
        prompt = f"""
        Generate a professional reply to this email:
        
        Original email content: {original_email}
        
        Context for reply: {reply_content}
        
        Please provide a polite, professional response that addresses the sender's message.
        Keep it concise and appropriate for a business context.
        """
        
        response = model.generate_content(prompt)
        return jsonify({"reply": response.text})
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Error generating reply: {error_msg}")
        
        # Fallback: Generate a basic professional reply if API fails
        if "quota" in error_msg.lower() or "429" in error_msg or "503" in error_msg:
            print("⚠️ API quota exceeded or service unavailable. Using template reply.")
            fallback_reply = """Thank you for your email. I appreciate you reaching out to me. I will review your message and get back to you as soon as possible. If you have any urgent matters, please feel free to follow up.

Best regards"""
            return jsonify({"reply": fallback_reply, "is_template": True})
        
        return jsonify({"error": str(e), "is_template": True}), 500

@content_bp.route("/send-reply", methods=["POST"])
@login_required
def send_reply():
    """Send a reply"""
    user_id = request.user["id"]
    data = request.json
    sender_email = data.get("sender_email")
    sender_password = data.get("sender_password")
    recipient_email = data.get("recipient_email")
    subject = data.get("subject")
    body = data.get("body")
    email_id = data.get("email_id")
    
    if not all([sender_email, sender_password, recipient_email, subject, body]):
        return jsonify({"error": "Missing required fields"}), 400
    
    try:
        # Send the email
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(sender_email, sender_password)
            
            msg = MIMEMultipart()
            msg['From'] = sender_email
            msg['To'] = recipient_email
            msg['Subject'] = subject
            msg.attach(MIMEText(body, 'plain'))
            server.send_message(msg)
        
        # Mark email as read if email_id is provided
        if email_id:
            mark_email_as_read(sender_email, sender_password, email_id)
        
        # Extract name from email - handle single names
        first_name, last_name = extract_name_from_email(recipient_email)
        
        # Use any additional lead data provided
        company = extract_company_from_email(recipient_email)
        phone = extract_phone_number(body)
        
        # Save to Excel file
        excel_success = save_to_excel({
            "timestamp": datetime.now().isoformat(),
            "sender_email": sender_email,
            "recipient_email": recipient_email,
            "subject": subject,
            "body": body,
            "first_name": first_name,
            "last_name": last_name,
            "company": company,
            "phone": phone,
            "converted_to_lead": False,
            "zoho_lead_id": "N/A"
        })
        
        return jsonify({
            "message": "Reply sent successfully",
            "excel_saved": excel_success
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@content_bp.route("/download-replies", methods=["GET"])
@login_required
def download_replies():
    """Download the Excel file with all captured replies"""
    user_id = request.user["id"]
    filename = "email_replies.xlsx"
    
    if not os.path.exists(filename):
        return jsonify({"error": "No replies data available"}), 404
    
    try:
        return send_file(
            filename,
            as_attachment=True,
            download_name=f"email_replies_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx",
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@content_bp.route("/campaigns", methods=["GET"])
@login_required
def get_user_campaigns():
    """Get email campaigns for the current user"""
    user_id = request.user["id"]
    
    try:
        campaigns = db.get_user_campaigns(user_id)
        return jsonify({"campaigns": campaigns})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# In your routes, always get user_id from session
@content_bp.route("/campaigns/<int:campaign_id>/emails", methods=["GET"])
@login_required
def get_campaign_emails(campaign_id):
    """Get all emails sent in a campaign"""
    user_id = request.user["id"]
    
    try:
        emails = db.get_campaign_emails(campaign_id, user_id)
        return jsonify({"emails": emails})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@content_bp.route("/delete-file/<int:file_id>", methods=["DELETE"])
@login_required
def delete_file(file_id):
    """Delete an uploaded file from the database"""
    user_id = request.user["id"]
    
    try:
        success = db.delete_file(file_id, user_id)
        if success:
            return jsonify({"message": "File deleted successfully"})
        else:
            return jsonify({"error": "File not found or access denied"}), 404
    except Exception as e:
        return jsonify({"error": f"Failed to delete file: {str(e)}"}), 500

@content_bp.route("/delete-campaign/<int:campaign_id>", methods=["DELETE"])
@login_required
def delete_campaign(campaign_id):
    """Delete a campaign and its associated emails"""
    user_id = request.user["id"]
    
    try:
        success = db.delete_campaign(campaign_id, user_id)
        if success:
            return jsonify({"message": "Campaign deleted successfully"})
        else:
            return jsonify({"error": "Campaign not found or access denied"}), 404
    except Exception as e:
        return jsonify({"error": f"Failed to delete campaign: {str(e)}"}), 500
    
@content_bp.route("/check-email-status/<int:campaign_id>", methods=["GET"])
@login_required
def check_email_status(campaign_id):
    """Check email status for a campaign"""
    user_id = request.user["id"]
    
    try:
        # Verify the campaign belongs to the user
        campaigns = db.get_user_campaigns(user_id)
        campaign_ids = [camp['id'] for camp in campaigns]
        
        if campaign_id not in campaign_ids:
            return jsonify({"error": "Campaign not found"}), 404
            
        status_data = get_campaign_email_status(campaign_id, user_id)
        return jsonify(status_data)
        
    except Exception as e:
        print(f"Error in check_email_status: {e}")
        return jsonify({
            "stats": {'total': 0, 'sent': 0, 'bounced': 0, 'replied': 0, 'follow_up_sent': 0},
            "no_reply_emails": [],
            "bounced_emails": []
        }), 500
    
@content_bp.route("/check-bounced-emails", methods=["POST"])
@login_required
def check_bounced_emails():
    """Check for bounced emails across all sender accounts"""
    user_id = request.user["id"]
    data = request.json
    sender_accounts = data.get("sender_accounts", [])
    
    if not sender_accounts:
        return jsonify({"error": "No sender accounts provided"}), 400
    
    all_bounced_emails = []
    
    try:
        for account in sender_accounts:
            if account.get('email') and account.get('password'):
                bounced = check_email_bounces(account['email'], account['password'])
                all_bounced_emails.extend(bounced)
        
        # Update database with bounced emails
        for bounced_email in all_bounced_emails:
            # Find which campaign this email belongs to
            connection = db.get_connection()
            if connection:
                cursor = connection.cursor()
                cursor.execute("""
                    SELECT campaign_id FROM sent_emails 
                    WHERE recipient_email = ? 
                    ORDER BY sent_at DESC LIMIT 1
                """, (bounced_email['recipient_email'],))
                
                result = cursor.fetchone()
                if result:
                    campaign_id = result[0]
                    update_email_status(
                        campaign_id, 
                        bounced_email['recipient_email'], 
                        'bounced', 
                        bounced_email['bounce_reason']
                    )
                connection.close()
        
        return jsonify({
            "message": f"Found {len(all_bounced_emails)} bounced emails",
            "bounced_emails": all_bounced_emails
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@content_bp.route("/send-follow-up", methods=["POST"])
@login_required
def send_follow_up():
    """Send follow-up emails to non-responders"""
    user_id = request.user["id"]
    data = request.json
    campaign_id = data.get("campaign_id")
    subject = data.get("subject")
    body = data.get("body")
    sender_name = data.get("sender_name")
    sender_accounts = data.get("sender_accounts", [])
    
    if not all([campaign_id, subject, body, sender_name]):
        return jsonify({"error": "Missing required fields"}), 400
    
    if not sender_accounts:
        return jsonify({"error": "No sender accounts provided"}), 400
    
    try:
        # Get emails that haven't replied
        status_data = get_campaign_email_status(campaign_id)
        no_reply_emails = status_data.get('no_reply_emails', [])
        
        if not no_reply_emails:
            return jsonify({"error": "No emails available for follow-up"}), 400
        
        # Start follow-up sending in background thread
        threading.Thread(
            target=send_follow_up_emails,
            args=(campaign_id, no_reply_emails, sender_accounts, subject, body, sender_name, user_id)
        ).start()
        
        return jsonify({
            "message": f"Started sending follow-up emails to {len(no_reply_emails)} recipients",
            "total_recipients": len(no_reply_emails)
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@content_bp.route("/campaigns/<int:campaign_id>/email-stats", methods=["GET"])
@login_required
def get_campaign_email_stats(campaign_id):
    """Get detailed email statistics for a campaign"""
    user_id = request.user["id"]
    
    try:
        # Verify the campaign belongs to the user
        campaigns = db.get_user_campaigns(user_id)
        campaign_ids = [camp['id'] for camp in campaigns]
        
        if campaign_id not in campaign_ids:
            return jsonify({"error": "Campaign not found"}), 404
            
        status_data = db.get_campaign_email_stats(campaign_id, user_id)
        
        # Get campaign details
        campaign = next((camp for camp in campaigns if camp['id'] == campaign_id), None)
        
        return jsonify({
            "campaign": campaign,
            "email_stats": status_data
        })
        
    except Exception as e:
        print(f"Error in get_campaign_email_stats route: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "error": "Failed to get email statistics",
            "campaign": None,
            "email_stats": {
                "stats": {'total': 0, 'sent': 0, 'bounced': 0, 'replied': 0, 'failed': 0},
                "no_reply_emails": [],
                "bounced_emails": []
            }
        }), 500

# Email Tracking Routes
@content_bp.route("/tracking/emails", methods=["GET"])
@login_required
def get_tracking_emails():
    """Get all email tracking data"""
    user_id = request.user["id"]
    user_role = request.user.get("role")
    sender_email = request.args.get('sender_email')
    include_all = user_role == "super_admin"
    
    try:
        tracking_data = db.get_tracking_emails(user_id, sender_email, include_all=include_all)
        tracking_stats = db.get_tracking_stats(user_id, sender_email, include_all=include_all)
        
        return jsonify({
            "tracking_data": tracking_data,
            "stats": tracking_stats
        })
    except Exception as e:
        print(f"Error getting tracking emails: {e}")
        return jsonify({"error": str(e)}), 500

@content_bp.route("/tracking/check-emails", methods=["POST"])
@login_required
def check_emails():
    """Check for replies and bounces via IMAP with enhanced bounce detection"""
    user_id = request.user["id"]
    data = request.json
    
    print(f"=== CHECK EMAILS REQUEST ===")
    print(f"User ID: {user_id}")
    print(f"Request data: {data}")
    
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400
        
    gmail_address = data.get("gmail_address")
    app_password = data.get("app_password")
    no_reply_days = data.get("no_reply_days", 7)
    
    if not gmail_address or not app_password:
        return jsonify({"error": "Gmail address and app password are required"}), 400
    
    try:
        # Get sent emails from database that haven't been replied to or bounced
        connection = db.get_connection()
        if not connection:
            return jsonify({"error": "Database connection failed"}), 500
            
        cursor = connection.cursor()
        
        # Get user's actual ID
        actual_user_id = user_id
        
        # Get sent emails that are still in 'sent' status
        cursor.execute("""
            SELECT et.id, et.recipient_email, et.sent_time, et.campaign_id
            FROM email_tracking et
            LEFT JOIN email_campaigns ec ON et.campaign_id = ec.id
            WHERE ec.user_id = ? AND et.status = 'sent'
        """, (actual_user_id,))
        
        sent_emails = cursor.fetchall()
        # Normalize keys to lowercase so reply/bounce matching is case-insensitive
        sent_emails_dict = {}
        for row in sent_emails:
            recipient = (row['recipient_email'] or '').lower()
            if recipient:
                sent_emails_dict[recipient] = dict(row)
        
        print(f"Found {len(sent_emails)} sent emails to check")
        
        # Connect to IMAP and check for replies and bounces
        replies_found = 0
        bounces_found = 0
        hard_bounces = 0
        soft_bounces = 0
        
        try:
            # Connect to IMAP
            # Connect to IMAP
            print(f"Connecting to IMAP for {gmail_address}")
            
            # Detect provider
            provider_info = detect_email_provider(gmail_address)
            imap_server = provider_info['imap_server']
            # Default to 993/SSL for IMAP as it's standard
            imap_port = provider_info.get('imap_port', 993)
            use_ssl = provider_info.get('use_ssl', True)
            
            print(f"Using server: {imap_server}:{imap_port} (SSL: {use_ssl})")
            
            # Remove spaces from app password (Gmail adds spaces for readability)
            clean_password = app_password.replace(" ", "").replace("-", "")
            
            if use_ssl:
                mail = imaplib.IMAP4_SSL(imap_server, imap_port)
            else:
                mail = imaplib.IMAP4(imap_server, imap_port)
                mail.starttls()
                
            mail.login(gmail_address, clean_password)
            
            # First try standard inbox
            print("Selecting INBOX...")
            status = mail.select("INBOX")
            print(f"INBOX select status: {status}")
            
            if status[0] != "OK":
                print("Failed to select INBOX, trying without specifying folder...")
                status = mail.select()
                print(f"Default select status: {status}")
            
            # Search for UNREAD emails in inbox
            status, messages = mail.search(None, "UNSEEN")
            print(f"Search for UNSEEN status: {status}")
            
            if status != "OK":
                print("IMAP search failed")
                mail.close()
                mail.logout()
                return jsonify({"error": "IMAP search failed"}), 500
                
            email_ids = messages[0].split()
            print(f"Found {len(email_ids)} unread emails in INBOX")
            
            # If no unread emails, check ALL emails (not just unread)
            if len(email_ids) == 0:
                print("No unread emails, checking ALL emails in inbox...")
                status, messages = mail.search(None, "ALL")
                if status == "OK":
                    all_email_ids = messages[0].split()
                    print(f"Found {len(all_email_ids)} total emails in INBOX")
                    
                    # Take the most recent 50 emails
                    email_ids = all_email_ids[-50:] if len(all_email_ids) > 50 else all_email_ids
                    print(f"Checking {len(email_ids)} recent emails")
            
            for email_id in email_ids:
                try:
                    print(f"\n--- Processing email ID: {email_id} ---")
                    status, msg_data = mail.fetch(email_id, "(RFC822)")
                    if status != "OK":
                        print(f"Failed to fetch email {email_id}")
                        continue
                    
                    msg = email.message_from_bytes(msg_data[0][1])
                    subject = msg["Subject"] or ""
                    from_email = msg["From"] or ""
                    
                    print(f"Subject: {subject}")
                    print(f"From: {from_email}")
                    
                    # Extract email body
                    body = ""
                    if msg.is_multipart():
                        for part in msg.walk():
                            content_type = part.get_content_type()
                            if content_type == "text/plain":
                                try:
                                    body = part.get_payload(decode=True).decode(errors='ignore')
                                except:
                                    body = str(part.get_payload())
                                break
                    else:
                        try:
                            body = msg.get_payload(decode=True).decode(errors='ignore')
                        except:
                            body = str(msg.get_payload())
                    
                    # Take first 500 chars of body for logging
                    body_preview = body[:500] if body else ""
                    print(f"Body preview: {body_preview}")
                    
                    # Extract sender email for bounce/reply detection (case-insensitive)
                    sender_email = None
                    email_match = re.search(r'<(.+?)>', from_email)
                    if email_match:
                        sender_email = email_match.group(1)
                    else:
                        # Try to extract email from the from string
                        email_in_from = re.search(r'([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', from_email)
                        if email_in_from:
                            sender_email = email_in_from.group(1)
                        else:
                            sender_email = from_email

                    sender_email_lower = sender_email.lower() if sender_email else None
                    print(f"Sender email extracted: {sender_email_lower}")
                    
                    # Enhanced bounce detection with multiple methods
                    subject_lower = subject.lower()
                    body_lower = body.lower() if body else ""
                    from_lower = from_email.lower()
                    
                    # Method 1: Check for specific mailer daemon addresses
                    mailer_daemon_addresses = [
                        "mailer-daemon@googlemail.com",
                        "mailer-daemon@google.com",
                        "mailer-daemon@gmail.com",
                        "mailer-daemon@",
                        "mailer-daemon",
                        "mail delivery subsystem",
                        "mail delivery",
                        "postmaster@",
                        "postmaster",
                        "noreply@",
                        "no-reply@",
                        "noreply.bounces",
                        "bounces@",
                        "daemon@",
                        "mailer@",
                        "delivery@",
                        "delivery-system@",
                        "mail.system@",
                        "mailer.feedback"
                    ]
                    
                    # Method 2: Check for bounce keywords in subject/body
                    bounce_keywords = [
                        "address not found",  # Your specific bounce
                        "mail delivery failed", "undelivered mail", 
                        "message not delivered", "delivery status notification",
                        "returned mail", "failure delivery", "delivery has failed",
                        "recipient not found", "user unknown",
                        "mailbox not found", "no such user", "does not exist",
                        "550", "554", "553", "552", "550-5.1.1", "5.1.1",  # SMTP error codes
                        "permanent failure", "permanent delivery failure",
                        "cannot deliver", "could not be delivered",
                        "wasn't delivered", "couldn't be found", "unable to receive",
                        "delivery failure", "failure notice", "undeliverable",
                        "returned to sender", "non-delivery report",
                        "delayed mail", "temporarily deferred",
                        "over quota", "mailbox full", "quota exceeded",
                        "message too large", "size limit exceeded"
                    ]
                    
                    # Method 3: Check for bounce patterns in sender name
                    sender_name_patterns = [
                        "mail delivery subsystem",
                        "mail delivery system",
                        "mail delivery",
                        "mail system",
                        "mailer daemon",
                        "postmaster",
                        "mail administrator",
                        "mail server",
                        "delivery system",
                        "mail subsystem",
                        "mail service",
                        "email system",
                        "email delivery"
                    ]
                    
                    # Check all bounce detection methods
                    is_bounce = False
                    bounce_detected_by = ""
                    
                    # Check 1: Mailer daemon addresses
                    for daemon_address in mailer_daemon_addresses:
                        if daemon_address in from_lower:
                            is_bounce = True
                            bounce_detected_by = f"mailer-daemon address: {daemon_address}"
                            break
                    
                    # Check 2: Bounce keywords in subject/body
                    if not is_bounce:
                        for keyword in bounce_keywords:
                            if keyword in subject_lower:
                                is_bounce = True
                                bounce_detected_by = f"subject keyword: {keyword}"
                                break
                            elif keyword in body_lower:
                                is_bounce = True
                                bounce_detected_by = f"body keyword: {keyword}"
                                break
                    
                    # Check 3: Sender name patterns
                    if not is_bounce:
                        for pattern in sender_name_patterns:
                            if pattern.lower() in from_lower:
                                is_bounce = True
                                bounce_detected_by = f"sender name pattern: {pattern}"
                                break
                    
                    print(f"Is bounce: {is_bounce}, Detected by: {bounce_detected_by}")
                    
                    if is_bounce:
                        print(f"🚨 BOUNCE DETECTED! Reason: {bounce_detected_by}")
                        
                        # Extract recipient from bounce message with multiple methods
                        bounce_recipient = None
                        
                        # Method 1: Check for the specific email mentioned
                        if 'deepakghnnh@gmail.com' in body_lower:
                            bounce_recipient = 'deepakghnnh@gmail.com'
                            print(f"Found specific bounce recipient: {bounce_recipient}")
                        
                        # Method 2: Look for email patterns in body
                        email_patterns = [
                            r'to\s*:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})',
                            r'for\s*:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})',
                            r'address\s*:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})',
                            r'recipient\s*:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})',
                            r'failed\s+recipient\s*:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})',
                            r'unable\s+to\s+deliver\s+to\s*:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})',
                            r'([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})'  # Any email
                        ]
                        
                        if not bounce_recipient:
                            for pattern in email_patterns:
                                email_matches = re.findall(pattern, body, re.IGNORECASE)
                                if email_matches:
                                    print(f"Pattern '{pattern}' found matches: {email_matches}")
                                    for email_match in email_matches:
                                        email_match_lower = email_match.lower()
                                        if email_match_lower in sent_emails_dict:
                                            bounce_recipient = email_match_lower
                                            print(f"Found bounce recipient in sent emails: {bounce_recipient}")
                                            break
                                        else:
                                            # Check if it's similar to any sent email
                                            for sent_email in sent_emails_dict.keys():
                                                if email_match_lower in sent_email or sent_email in email_match_lower:
                                                    bounce_recipient = sent_email
                                                    print(f"Found similar bounce recipient: {bounce_recipient} (matched: {email_match})")
                                                    break
                                if bounce_recipient:
                                    break
                        
                        # Method 3: Use extract_recipient_from_bounce function
                        if not bounce_recipient:
                            bounce_recipient = extract_recipient_from_bounce(body, subject)
                            if bounce_recipient:
                                print(f"Found bounce recipient via function: {bounce_recipient}")
                        
                        # Method 4: Check if any sent email is mentioned in the body
                        if not bounce_recipient:
                            for sent_email in sent_emails_dict.keys():
                                if sent_email.lower() in body_lower:
                                    bounce_recipient = sent_email.lower()
                                    print(f"Found bounce recipient in body text: {bounce_recipient}")
                                    break
                        
                        if bounce_recipient:
                            bounce_recipient_lower = bounce_recipient.lower()
                            print(f"Bounce recipient identified: {bounce_recipient_lower}")
                            
                            # Enhanced bounce classification (do this regardless of whether in sent_emails_dict)
                            bounce_reason = subject[:200] if subject else "Delivery failure"
                            
                            # Check for hard bounce indicators
                            hard_bounce_keywords = [
                                "address not found", "user unknown", "recipient not found",
                                "no such user", "invalid recipient", "mailbox not found",
                                "does not exist", "550 5.1.1", "550-5.1.1", "550.5.1.1",
                                "permanent failure", "account disabled", "couldn't be found",
                                "unable to receive", "permanent delivery failure",
                                "no such mailbox", "invalid address", "user not found",
                                "recipient address rejected", "account does not exist",
                                "mailbox unavailable", "address invalid"
                            ]
                            
                            # Check for soft bounce indicators
                            soft_bounce_keywords = [
                                "mailbox full", "quota exceeded", "message too large",
                                "temporarily unavailable", "try again later", "greylist",
                                "421", "451", "4.2.0", "4.2.1", "temporary failure",
                                "delayed", "deferred", "temporarily deferred",
                                "server busy", "resource temporarily unavailable",
                                "over quota", "storage limit exceeded", "recipient over quota",
                                "temporary local problem", "could not be delivered temporarily"
                            ]
                            
                            # Determine bounce type
                            bounce_type_detected = "unknown"
                            
                            # Check subject and body for bounce type indicators
                            if any(keyword in subject_lower or keyword in body_lower for keyword in hard_bounce_keywords):
                                bounce_type_detected = "hard_bounce"
                                bounce_reason = "Email address does not exist (hard bounce)"
                                hard_bounces += 1
                                print(f"🔴 HARD BOUNCE detected for {bounce_recipient}")
                            elif any(keyword in subject_lower or keyword in body_lower for keyword in soft_bounce_keywords):
                                bounce_type_detected = "soft_bounce"
                                bounce_reason = "Temporary delivery failure (soft bounce)"
                                soft_bounces += 1
                                print(f"🟡 SOFT BOUNCE detected for {bounce_recipient}")
                            else:
                                # Default to hard bounce if from mailer-daemon
                                if any(daemon in from_lower for daemon in ["mailer-daemon", "postmaster", "mail delivery"]):
                                    bounce_type_detected = "hard_bounce"
                                    bounce_reason = f"Delivery failed - {subject}"
                                    hard_bounces += 1
                                    print(f"🔴 Default HARD BOUNCE (from mailer-daemon) for {bounce_recipient}")
                                else:
                                    bounce_type_detected = "unknown"
                                    print(f"⚫ UNKNOWN BOUNCE type for {bounce_recipient}")
                            
                            # Increment overall bounce counter
                            bounces_found += 1
                            
                            # Check if this recipient is in our sent emails - only update DB if found
                            if bounce_recipient_lower in sent_emails_dict:
                                tracking_id = sent_emails_dict[bounce_recipient_lower]['id']
                                campaign_id = sent_emails_dict[bounce_recipient_lower]['campaign_id']
                                
                                print(f"Updating bounce for: {bounce_recipient_lower}, tracking_id: {tracking_id}")
                                
                                # Store bounce reason and type
                                cursor.execute("""
                                    UPDATE email_tracking 
                                    SET status = 'bounced', 
                                        bounce_reason = ?,
                                        bounce_type = ?,
                                        last_checked = ?,
                                        updated_at = ?
                                    WHERE id = ?
                                """, (
                                    bounce_reason,
                                    bounce_type_detected,
                                    datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                                    datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                                    tracking_id
                                ))
                                
                                print(f"✅ Database updated for bounce: {bounce_recipient}")
                            else:
                                print(f"⚠️ Bounce recipient not in sent emails (tracking DB will not be updated): {bounce_recipient}")
                                print(f"Sent emails: {list(sent_emails_dict.keys())}")
                            
                            # Mark bounce email as read
                            try:
                                mail.store(email_id, '+FLAGS', '\\Seen')
                                print(f"📧 Marked bounce email as read")
                            except Exception as e:
                                print(f"Note: Could not mark email as read: {e}")
                            
                            continue  # Skip to next email - this was a bounce
                        else:
                            print("⚠️ Could not extract bounce recipient from email")
                    
                    # If not a bounce, check if this is a reply
                    # Check if sender email is in our sent emails
                    if sender_email_lower and sender_email_lower in sent_emails_dict:
                        print(f"🎯 Found potential reply from sent email: {sender_email_lower}")
                        
                        # Additional check: make sure this isn't an auto-response or bounce
                        is_auto_response = False
                        auto_response_patterns = [
                            "out of office", "ooo", "vacation", "auto-reply", 
                            "automatic reply", "away from", "auto response",
                            "automatic response", "out of the office",
                            "vacation auto-reply", "auto-response", "autoresponder",
                            "out of office reply", "vacation reply"
                        ]
                        
                        for pattern in auto_response_patterns:
                            if pattern in subject_lower or pattern in body_lower:
                                is_auto_response = True
                                print(f"🤖 Auto-response pattern detected: {pattern}")
                                break
                        
                        if not is_auto_response and not is_bounce:
                            print(f"✅ Valid reply from {sender_email_lower}")
                            
                            # Update database if sender is in sent emails
                            if sender_email_lower in sent_emails_dict:
                                tracking_id = sent_emails_dict[sender_email_lower]['id']
                                cursor.execute("""
                                    UPDATE email_tracking 
                                    SET status = 'replied', 
                                        reply_time = ?, 
                                        reply_message = ?,
                                        last_checked = ?,
                                        updated_at = ?
                                    WHERE id = ?
                                """, (
                                    datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                                    body[:1000],  # Store first 1000 chars
                                    datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                                    datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                                    tracking_id
                                ))
                                print(f"✅ Database updated for reply: {sender_email_lower}")

                                # Attempt to auto-reply using template (campaign-specific or default)
                                try:
                                    campaign_id = sent_emails_dict[sender_email_lower].get('campaign_id')
                                    _maybe_send_auto_reply(
                                        user_id=actual_user_id,
                                        tracking_id=tracking_id,
                                        campaign_id=campaign_id,
                                        recipient_email=sender_email_lower,
                                        smtp_sender_email=gmail_address,
                                        smtp_password=clean_password
                                    )
                                except Exception as e:
                                    print(f"Auto-reply attempt failed: {e}")
                            else:
                                print(f"⚠️ Reply detected from {sender_email_lower} but not in sent emails list")
                            
                            replies_found += 1
                            
                            # Mark email as read
                            try:
                                mail.store(email_id, '+FLAGS', '\\Seen')
                            except:
                                pass
                        elif is_auto_response:
                            print(f"🤖 Auto-reply from {sender_email_lower}")
                            
                            # Update database if sender is in sent emails
                            if sender_email_lower in sent_emails_dict:
                                tracking_id = sent_emails_dict[sender_email_lower]['id']
                                cursor.execute("""
                                    UPDATE email_tracking 
                                    SET status = 'auto_reply', 
                                        reply_time = ?, 
                                        reply_message = ?,
                                        last_checked = ?,
                                        updated_at = ?
                                    WHERE id = ?
                                """, (
                                    datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                                    body[:1000],
                                    datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                                    datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                                    tracking_id
                                ))
                                print(f"✅ Database updated for auto-reply: {sender_email_lower}")
                            else:
                                print(f"⚠️ Auto-reply detected from {sender_email_lower} but not in sent emails list")
                            
                            replies_found += 1
                            
                            # Mark email as read
                            try:
                                mail.store(email_id, '+FLAGS', '\\Seen')
                            except:
                                pass
                    else:
                        print(f"Sender not in sent emails or no sender extracted: {sender_email_lower} - but bounce detection still applied above")
                    
                except Exception as e:
                    print(f"❌ Error processing email {email_id}: {e}")
                    import traceback
                    traceback.print_exc()
                    continue
            
            mail.close()
            mail.logout()
            
        except imaplib.IMAP4.error as e:
            print(f"❌ IMAP authentication error: {e}")
            connection.close()
            return jsonify({"error": f"IMAP authentication failed: {str(e)}"}), 400
        except Exception as e:
            print(f"❌ IMAP error: {e}")
            import traceback
            traceback.print_exc()
            connection.close()
            return jsonify({"error": f"IMAP error: {str(e)}"}), 500
        
        # Check for no-reply emails (emails sent more than X days ago with no reply)
        no_reply_threshold = datetime.now() - timedelta(days=no_reply_days)
        cursor.execute("""
            UPDATE email_tracking 
            SET status = 'no_reply',
                last_checked = ?,
                updated_at = ?
            WHERE email_tracking.status = 'sent' 
            AND sent_time < ?
            AND campaign_id IN (SELECT id FROM email_campaigns WHERE user_id = ?)
        """, (
            datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            no_reply_threshold.strftime('%Y-%m-%d %H:%M:%S'),
            actual_user_id
        ))
        
        no_reply_updated = cursor.rowcount
        
        connection.commit()
        
        # Get updated statistics and detailed results
        try:
            cursor.execute("""
                SELECT 
                    et.id,
                    et.recipient_email,
                    et.status,
                    COALESCE(et.bounce_type, '') as bounce_type,
                    COALESCE(et.bounce_reason, '') as bounce_reason,
                    et.sent_time,
                    et.reply_time,
                    et.last_checked
                FROM email_tracking et
                LEFT JOIN email_campaigns ec ON et.campaign_id = ec.id
                WHERE ec.user_id = ?
                ORDER BY et.last_checked DESC
            """, (actual_user_id,))
            
            detailed_results = cursor.fetchall()
        except Exception as e:
            print(f"⚠️ Note: Could not fetch detailed results: {e}")
            detailed_results = []
        
        cursor.execute("""
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN et.status = 'sent' THEN 1 ELSE 0 END) as sent,
                SUM(CASE WHEN et.status = 'replied' THEN 1 ELSE 0 END) as replied,
                SUM(CASE WHEN et.status = 'auto_reply' THEN 1 ELSE 0 END) as auto_reply,
                SUM(CASE WHEN et.status = 'bounced' THEN 1 ELSE 0 END) as bounced,
                SUM(CASE WHEN et.status = 'no_reply' THEN 1 ELSE 0 END) as no_reply
            FROM email_tracking et
            LEFT JOIN email_campaigns ec ON et.campaign_id = ec.id
            WHERE ec.user_id = ?
        """, (actual_user_id,))
        
        stats_row = cursor.fetchone()
        stats = {
            'total': stats_row['total'] if stats_row else 0,
            'sent': stats_row['sent'] if stats_row else 0,
            'replied': stats_row['replied'] if stats_row else 0,
            'auto_reply': stats_row['auto_reply'] if stats_row else 0,
            'bounced': stats_row['bounced'] if stats_row else 0,
            'no_reply': stats_row['no_reply'] if stats_row else 0
        }
        
        connection.close()
        
        # Generate recommendations based on findings
        recommendations = []
        
        if hard_bounces > 0:
            recommendations.append({
                "type": "warning",
                "message": f"Found {hard_bounces} hard bounces (email addresses don't exist)",
                "action": "Remove these invalid addresses from your contact list"
            })
        
        if soft_bounces > 0:
            recommendations.append({
                "type": "info",
                "message": f"Found {soft_bounces} soft bounces (temporary issues)",
                "action": "These emails might work if retried later"
            })
        
        if no_reply_updated > 0:
            recommendations.append({
                "type": "info",
                "message": f"Marked {no_reply_updated} emails as no-reply (older than {no_reply_days} days)",
                "action": "Consider sending follow-ups to these recipients"
            })
        
        # Convert detailed results to list of dicts
        email_results = [dict(row) for row in detailed_results] if detailed_results else []
        
        return jsonify({
            "message": f"Email check completed. Found {replies_found} replies, {bounces_found} bounces ({hard_bounces} hard, {soft_bounces} soft), marked {no_reply_updated} as no-reply.",
            "summary": {
                "replies_found": replies_found,
                "bounces_found": bounces_found,
                "hard_bounces": hard_bounces,
                "soft_bounces": soft_bounces,
                "no_reply_updated": no_reply_updated
            },
            "stats": stats,
            "email_results": email_results,
            "recommendations": recommendations
        })
        
    except Exception as e:
        print(f"❌ Error checking emails: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500




def extract_recipient_from_bounce(body, subject):
    """Extract recipient email from bounce message with improved patterns"""
    patterns = [
        r'Original-Recipient:\s*rfc822;(.+)',
        r'Final-Recipient:\s*rfc822;(.+)',
        r'to=<(.+?)>',
        r'for\s+(.+?@.+?\..+?)\s*;',
        r'Address\s+not\s+found:\s*(.+)',  # Add this pattern
        r'recipient\s+address\s*[:\s]+(.+?@.+?\..+?)',  # Add this pattern
        r'failed\s+recipient:\s*(.+)',  # Add this pattern
        r'<(.+?@.+?\..+?)>\s+\(expanded from'  # Add this pattern for aliases
    ]
    
    combined_text = f"{subject} {body}"
    
    for pattern in patterns:
        match = re.search(pattern, combined_text, re.IGNORECASE)
        if match:
            # Try different extraction methods
            extracted_text = match.group(1)
            
            # Method 1: Direct email match
            email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', extracted_text)
            if email_match:
                return email_match.group(0).lower()
            
            # Method 2: Look for email in angle brackets
            angle_match = re.search(r'<(.+?@.+?\..+?)>', extracted_text)
            if angle_match:
                return angle_match.group(1).lower()
            
            # Method 3: Clean and extract
            clean_text = extracted_text.strip()
            if '@' in clean_text and '.' in clean_text:
                # Extract just the email part
                email_part = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', clean_text)
                if email_part:
                    return email_part.group(0).lower()
    
    return None

# Service functions for email tracking
def update_email_status(campaign_id, recipient_email, status, bounce_reason=None):
    """Update email status in the database"""
    try:
        connection = db.get_connection()
        if connection:
            cursor = connection.cursor()
            
            current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            if status == 'replied':
                cursor.execute("""
                    UPDATE email_tracking 
                    SET status = ?, reply_time = ?, updated_at = ?, last_checked = ?
                    WHERE campaign_id = ? AND recipient_email = ?
                """, (status, current_time, current_time, current_time, campaign_id, recipient_email))
            elif status == 'bounced':
                cursor.execute("""
                    UPDATE email_tracking 
                    SET status = ?, bounce_reason = ?, updated_at = ?, last_checked = ?
                    WHERE campaign_id = ? AND recipient_email = ?
                """, (status, bounce_reason, current_time, current_time, campaign_id, recipient_email))
            else:
                cursor.execute("""
                    UPDATE email_tracking 
                    SET status = ?, updated_at = ?, last_checked = ?
                    WHERE campaign_id = ? AND recipient_email = ?
                """, (status, current_time, current_time, campaign_id, recipient_email))
            
            connection.commit()
            return True
    except Exception as e:
        print(f"Error updating email status: {e}")
        return False
    finally:
        if connection:
            connection.close()

def get_campaign_email_status(campaign_id, user_id):
    """Get email status statistics for a campaign"""
    try:
        return db.get_campaign_email_stats(campaign_id, user_id)
    except Exception as e:
        print(f"Error in get_campaign_email_status: {e}")
        return {
            "stats": {'total': 0, 'sent': 0, 'bounced': 0, 'replied': 0, 'follow_up_sent': 0},
            "no_reply_emails": [],
            "bounced_emails": []
        }
    
@content_bp.route("/tracking/campaigns", methods=["GET", "OPTIONS"])
@login_required
def get_tracking_campaigns():
    """Get all campaigns with tracking data for the user"""
    user_id = request.user["id"]
    user_role = request.user.get("role")
    sender_email = request.args.get('sender_email')
    include_all = user_role == "super_admin"
    
    try:
        # Handle preflight request - return before auth check for OPTIONS
        if request.method == "OPTIONS":
            response = jsonify({"status": "ok"})
            return response, 200
            
        campaigns = db.get_campaigns_with_tracking(user_id, sender_email, include_all=include_all)
        return jsonify({"campaigns": campaigns})
    except Exception as e:
        print(f"Error getting tracking campaigns: {e}")
        return jsonify({"error": str(e)}), 500
    
@content_bp.route("/tracking/auto-reply/template", methods=["GET", "POST"])
@login_required
def manage_auto_reply_template():
    """Get or set a campaign-specific auto-reply template."""
    user_id = request.user["id"]
    if request.method == "GET":
        campaign_id = request.args.get("campaign_id", type=int)
        try:
            tpl = db.get_auto_reply_template_for_campaign(user_id, campaign_id) if campaign_id else None
            if tpl:
                return jsonify({
                    "subject": tpl.get("subject"),
                    "body": tpl.get("body"),
                    "source": "campaign",
                })
            # fallback to default
            dtpl = db.get_default_auto_reply_template(user_id)
            if dtpl:
                return jsonify({
                    "subject": dtpl.get("subject"),
                    "body": dtpl.get("body"),
                    "source": "default",
                })
            return jsonify({"subject": None, "body": None, "source": "none"})
        except Exception as e:
            print(f"Error getting auto-reply template: {e}")
            return jsonify({"error": str(e)}), 500
    else:
        data = request.json or {}
        campaign_id = data.get("campaign_id")
        subject = data.get("subject")
        body = data.get("body")
        if not subject or not body:
            return jsonify({"error": "subject and body are required"}), 400
        try:
            ok = db.upsert_auto_reply_template(user_id, subject, body, campaign_id=campaign_id, is_default=False)
            return jsonify({"success": bool(ok)}) if ok else (jsonify({"success": False}), 500)
        except Exception as e:
            print(f"Error setting auto-reply template: {e}")
            return jsonify({"error": str(e)}), 500

@content_bp.route("/tracking/auto-reply/template/default", methods=["GET", "POST"])
@login_required
def manage_default_auto_reply_template():
    """Get or set the default auto-reply template for the user."""
    user_id = request.user["id"]
    if request.method == "GET":
        try:
            tpl = db.get_default_auto_reply_template(user_id)
            if tpl:
                return jsonify({
                    "subject": tpl.get("subject"),
                    "body": tpl.get("body"),
                    "source": "default",
                })
            return jsonify({"subject": None, "body": None, "source": "none"})
        except Exception as e:
            print(f"Error getting default auto-reply template: {e}")
            return jsonify({"error": str(e)}), 500
    else:
        data = request.json or {}
        subject = data.get("subject")
        body = data.get("body")
        if not subject or not body:
            return jsonify({"error": "subject and body are required"}), 400
        try:
            ok = db.upsert_auto_reply_template(user_id, subject, body, campaign_id=0, is_default=True)
            return jsonify({"success": bool(ok)}) if ok else (jsonify({"success": False}), 500)
        except Exception as e:
            print(f"Error setting default auto-reply template: {e}")
            return jsonify({"error": str(e)}), 500

@content_bp.route("/tracking/campaign/<int:campaign_id>", methods=["GET"])
@login_required
def get_campaign_tracking(campaign_id):
    """Get tracking data for a specific campaign"""
    user_id = request.user["id"]
    
    try:
        # Verify the campaign belongs to the user
        campaigns = db.get_user_campaigns(user_id)
        campaign_ids = [camp['id'] for camp in campaigns]
        
        if campaign_id not in campaign_ids:
            return jsonify({"error": "Campaign not found"}), 404
            
        # Get tracking data for this campaign
        connection = db.get_connection()
        if connection:
            cursor = connection.cursor()
            cursor.execute("""
                SELECT et.*, ec.campaign_name 
                FROM email_tracking et
                LEFT JOIN email_campaigns ec ON et.campaign_id = ec.id
                WHERE et.campaign_id = ?
                ORDER BY et.sent_time DESC
            """, (campaign_id,))
            
            tracking_data = cursor.fetchall()
            connection.close()
            
            return jsonify({
                "tracking_data": [dict(row) for row in tracking_data],
                "campaign_id": campaign_id
            })
        else:
            return jsonify({"error": "Database connection failed"}), 500
            
    except Exception as e:
        print(f"Error getting campaign tracking: {e}")
        return jsonify({"error": str(e)}), 500

@content_bp.route("/tracking/campaign-history-nested", methods=["GET", "OPTIONS"])
@login_required
def get_campaign_history():
    """Get campaigns with nested sender and recipient data"""
    user_id = request.user["id"]
    user_role = request.user.get("role", "user")
    try:
        # Superadmin sees all campaigns, regular users see only their own
        campaigns = db.get_nested_campaign_history(user_id, is_superadmin=(user_role == "super_admin"))
        return jsonify(campaigns)
    except Exception as e:
        print(f"Error in get_campaign_history: {e}")
        return jsonify({"error": str(e)}), 500

@content_bp.route("/tracking/campaign-recipients", methods=["GET"])
@login_required
def get_campaign_recipients():
    """Get paginated recipients for a campaign or specific sender"""
    campaign_id = request.args.get("campaignId", type=int)
    sender_email = request.args.get("senderEmail")
    page = request.args.get("page", default=1, type=int)
    page_size = request.args.get("pageSize", default=10, type=int)
    
    if not campaign_id:
        return jsonify({"error": "campaignId is required"}), 400
        
    try:
        data = db.get_paginated_recipients(campaign_id, sender_email, page, page_size)
        return jsonify(data)
    except Exception as e:
        print(f"Error in get_campaign_recipients: {e}")
        return jsonify({"error": str(e)}), 500

@content_bp.route("/tracking/campaign-email-content", methods=["GET"])
@login_required
def get_campaign_email_content():
    """Get email subject and body for a campaign"""
    campaign_id = request.args.get("campaignId", type=int)
    
    if not campaign_id:
        return jsonify({"error": "campaignId is required"}), 400
        
    try:
        content = db.get_campaign_content(campaign_id)
        if content:
            return jsonify(content)
        return jsonify({"error": "Content not found"}), 404
    except Exception as e:
        print(f"Error in get_campaign_email_content: {e}")
        return jsonify({"error": str(e)}), 500

@content_bp.route("/tracking/recipient-replies", methods=["GET"])
@login_required
def get_recipient_replies():
    """Get all replies from a specific recipient"""
    campaign_id = request.args.get("campaignId", type=int)
    recipient_email = request.args.get("recipientEmail")
    
    if not campaign_id or not recipient_email:
        return jsonify({"error": "campaignId and recipientEmail are required"}), 400
        
    try:
        replies = db.get_recipient_replies(campaign_id, recipient_email)
        return jsonify({"replies": replies})
    except Exception as e:
        print(f"Error in get_recipient_replies: {e}")
        return jsonify({"error": str(e)}), 500

@content_bp.route("/tracking/download-recipients", methods=["GET"])
@login_required
def download_recipients_csv():
    """Download recipients for a campaign or sender as CSV"""
    campaign_id = request.args.get("campaignId", type=int)
    sender_email = request.args.get("senderEmail")
    
    if not campaign_id:
        return jsonify({"error": "campaignId is required"}), 400
        
    try:
        # Fetch all recipients for this filter (no pagination)
        data = db.get_paginated_recipients(campaign_id, sender_email, page=1, page_size=1000000)
        recipients = data.get("recipients", [])
        
        if not recipients:
            return jsonify({"error": "No recipients found"}), 404
            
        # Create CSV in memory and ensure sender_email column is present
        df = pd.DataFrame(recipients)
        # Ensure column exists even if data lacks it for some rows
        if 'sender_email' not in df.columns:
            df['sender_email'] = ''
        
        # Preferred column order with sender_email included
        preferred_cols = [
            'sender_email',
            'recipient_email',
            'recipient_name',
            'status',
            'sent_time',
            'reply_message',
            'reply_time'
        ]
        # Use intersection to avoid KeyErrors if some columns are missing
        cols_in_df = [c for c in preferred_cols if c in df.columns]
        # Place any extra columns at the end
        extra_cols = [c for c in df.columns if c not in cols_in_df]
        ordered_cols = cols_in_df + extra_cols
        
        writer = df[ordered_cols].to_csv(index=False)
        
        filename = f"campaign_{campaign_id}_recipients.csv"
        if sender_email:
            filename = f"campaign_{campaign_id}_{sender_email}_recipients.csv"
            
        return send_file(
            io.BytesIO(writer.encode()),
            mimetype='text/csv',
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        print(f"Error in download_recipients_csv: {e}")
        return jsonify({"error": str(e)}), 500

def send_follow_up_emails(campaign_id, recipient_emails, sender_accounts, subject, body, sender_name, user_id="default_user"):
    """Send follow-up emails to recipients who haven't replied"""
    # Use app_state for progress tracking
    app_state.progress["total"] = len(recipient_emails)
    app_state.progress["sent"] = 0
    app_state.progress["status"] = "running"

    sender_cycle = cycle(sender_accounts)
    
    try:
        for recipient in recipient_emails:
            sender_account = next(sender_cycle)
            sender_email = sender_account['email']
            password = sender_account['password']
            account_sender_name = sender_account.get('sender_name', '')
            
            with smtplib.SMTP("smtp.gmail.com", 587) as server:
                server.starttls()
                server.login(sender_email, password)
                
                display_sender_name = account_sender_name or sender_name
                name = recipient.get("recipient_name", "") or "there"
                
                personalized_body = replace_placeholders(body, name)
                personalized_subject = replace_placeholders(subject, name)
                
                msg = MIMEMultipart()
                msg['From'] = f"{display_sender_name} <{sender_email}>"
                msg['To'] = recipient["recipient_email"]
                msg['Subject'] = personalized_subject
                msg.attach(MIMEText(personalized_body, 'plain'))
                
                try:
                    server.send_message(msg)
                    
                    # Update email status
                    update_email_status(campaign_id, recipient["recipient_email"], "follow_up_sent")
                    
                    # Save to sent_emails table
                    db.save_sent_email(
                        campaign_id=campaign_id,
                        recipient_email=recipient["recipient_email"],
                        recipient_name=recipient.get("recipient_name", ""),
                        recipient_position=recipient.get("recipient_position", ""),
                        sender_email=sender_email,
                        sender_name=display_sender_name,
                        subject=personalized_subject,
                        body=personalized_body,
                        template_used="follow_up",
                        status='sent'
                    )
                    
                    print(f"Sent follow-up email to {recipient['recipient_email']}")
                    
                except Exception as e:
                    print(f"Failed to send follow-up email to {recipient['recipient_email']}: {e}")
                    # Update status as failed
                    db.save_sent_email(
                        campaign_id=campaign_id,
                        recipient_email=recipient["recipient_email"],
                        recipient_name=recipient.get("recipient_name", ""),
                        recipient_position=recipient.get("recipient_position", ""),
                        sender_email=sender_email,
                        sender_name=display_sender_name,
                        subject=personalized_subject,
                        body=personalized_body,
                        template_used="follow_up",
                        status='failed',
                        error_message=str(e)
                    )
                
                app_state.progress["sent"] += 1
                
                # Small delay to avoid rate limiting
                time.sleep(0.1)
                
    except Exception as e:
        app_state.progress["status"] = f"error: {e}"
        return
    
    app_state.progress["status"] = "completed"

# Add to content_routes.py

@content_bp.route("/tracking/update-settings", methods=["POST"])
@login_required
def update_tracking_settings():
    """Update automated follow-up settings"""
    user_id = request.user["id"]
    data = request.json
    
    try:
        connection = db.get_connection()
        if connection:
            cursor = connection.cursor()
            
            # Get user's actual ID
            actual_user_id = user_id
            
            # Check if settings exist
            cursor.execute(
                "SELECT id FROM automated_follow_up_settings WHERE user_id = ?",
                (actual_user_id,)
            )
            existing = cursor.fetchone()
            
            if existing:
                # Update existing settings
                cursor.execute("""
                    UPDATE automated_follow_up_settings 
                    SET enabled = ?, check_interval_hours = ?, default_delay_days = ?, 
                        max_follow_ups = ?, auto_stop_after_reply = ?, updated_at = ?
                    WHERE user_id = ?
                """, (
                    data.get('enabled', True),
                    data.get('check_interval_hours', 6),
                    data.get('default_delay_days', 3),
                    data.get('max_follow_ups', 3),
                    data.get('auto_stop_after_reply', True),
                    db.get_current_timestamp(),
                    actual_user_id
                ))
            else:
                # Insert new settings
                cursor.execute("""
                    INSERT INTO automated_follow_up_settings 
                    (user_id, enabled, check_interval_hours, default_delay_days, max_follow_ups, auto_stop_after_reply)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    actual_user_id,
                    data.get('enabled', True),
                    data.get('check_interval_hours', 6),
                    data.get('default_delay_days', 3),
                    data.get('max_follow_ups', 3),
                    data.get('auto_stop_after_reply', True)
                ))
            
            connection.commit()
            return jsonify({"message": "Settings updated successfully"})
        else:
            return jsonify({"error": "Database connection failed"}), 500
            
    except Exception as e:
        print(f"Error updating tracking settings: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if connection:
            connection.close()

@content_bp.route("/tracking/settings", methods=["GET"])
@login_required
def get_tracking_settings():
    """Get automated follow-up settings"""
    user_id = request.user["id"]
    
    try:
        connection = db.get_connection()
        if connection:
            cursor = connection.cursor()
            
            # Get user's actual ID
            actual_user_id = user_id
            
            cursor.execute(
                "SELECT * FROM automated_follow_up_settings WHERE user_id = ?",
                (actual_user_id,)
            )
            settings = cursor.fetchone()
            
            if settings:
                return jsonify(dict(settings))
            else:
                # Return default settings
                return jsonify({
                    "enabled": True,
                    "check_interval_hours": 6,
                    "default_delay_days": 3,
                    "max_follow_ups": 3,
                    "auto_stop_after_reply": True
                })
        else:
            return jsonify({"error": "Database connection failed"}), 500
            
    except Exception as e:
        print(f"Error getting tracking settings: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if connection:
            connection.close()

# Add to content_routes.py

@content_bp.route("/tracking/classify-emails", methods=["POST"])
@login_required
def classify_emails():
    """Classify emails into categories and update database"""
    user_id = request.user["id"]
    
    try:
        result = classify_email_responses(user_id)
        if "error" in result:
            return jsonify({"error": result["error"]}), 500
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@content_bp.route("/tracking/follow-up-emails", methods=["GET"])
@login_required
def get_follow_up_emails():
    """Get emails that need follow-up"""
    user_id = request.user["id"]
    campaign_id = request.args.get("campaign_id")
    
    try:
        emails = get_emails_for_follow_up(campaign_id, user_id)
        return jsonify({"follow_up_emails": emails})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@content_bp.route("/tracking/schedule-follow-up", methods=["POST"])
@login_required
def schedule_follow_up():
    """Schedule follow-up emails for non-responders"""
    user_id = request.user["id"]
    data = request.json
    
    campaign_id = data.get("campaign_id")
    follow_up_data = data.get("follow_up_data", {})
    
    if not campaign_id or not follow_up_data.get("subject") or not follow_up_data.get("body"):
        return jsonify({"error": "Missing required fields"}), 400
    
    try:
        result = schedule_follow_up_emails(campaign_id, follow_up_data, user_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@content_bp.route("/tracking/start-automated-service", methods=["POST"])
@login_required
def start_automated_service():
    """Start the automated follow-up service"""
    user_id = request.user["id"]
    
    try:
        result = start_automated_follow_up_service(user_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@content_bp.route("/tracking/follow-up-campaigns", methods=["GET"])
@login_required
def get_follow_up_campaigns():
    """Get all follow-up campaigns"""
    user_id = request.user["id"]
    
    try:
        connection = db.get_connection()
        if connection:
            cursor = connection.cursor()
            
            # Get user's actual ID
            actual_user_id = user_id
            
            # FIXED QUERY: Use proper table aliases and ensure user_id exists
            cursor.execute("""
                SELECT 
                    fc.*,
                    ec.campaign_name as original_campaign_name,
                    COUNT(fe.id) as total_follow_ups,
                    SUM(CASE WHEN fe.status = 'sent' THEN 1 ELSE 0 END) as sent_count,
                    SUM(CASE WHEN fe.status = 'failed' THEN 1 ELSE 0 END) as failed_count
                FROM follow_up_campaigns fc
                LEFT JOIN email_campaigns ec ON fc.original_campaign_id = ec.id
                LEFT JOIN follow_up_emails fe ON fc.id = fe.follow_up_campaign_id
                WHERE fc.user_id = ?
                GROUP BY fc.id
                ORDER BY fc.created_at DESC
            """, (actual_user_id,))
            
            campaigns = cursor.fetchall()
            connection.close()
            
            return jsonify({"follow_up_campaigns": [dict(camp) for camp in campaigns]})
        else:
            return jsonify({"error": "Database connection failed"}), 500
            
    except Exception as e:
        print(f"Error getting follow-up campaigns: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@content_bp.route("/tracking/auto-reply/emails", methods=["GET"])
@login_required
def get_replied_emails():
    """Get all emails that have been replied to"""
    user_id = request.user["id"]
    
    try:
        connection = db.get_connection()
        if connection:
            cursor = connection.cursor()
            
            # Get user's actual ID
            actual_user_id = user_id
            
            # Query to get replied emails with auto-reply status
            cursor.execute("""
                SELECT 
                    et.*,
                    ec.campaign_name,
                    era.id as auto_reply_id,
                    era.auto_reply_sent_at,
                    era.auto_reply_subject,
                    era.auto_reply_body,
                    era.status as auto_reply_status
                FROM email_tracking et
                LEFT JOIN email_campaigns ec ON et.campaign_id = ec.id
                LEFT JOIN email_auto_replies era ON et.id = era.tracking_id
                WHERE et.status = 'replied'
                AND ec.user_id = ?
                ORDER BY et.reply_time DESC
            """, (actual_user_id,))
            
            replied_emails = cursor.fetchall()
            connection.close()
            
            # Format the response
            formatted_emails = []
            for email in replied_emails:
                email_dict = dict(email)
                email_dict['auto_replied'] = email_dict['auto_reply_id'] is not None
                formatted_emails.append(email_dict)
            
            return jsonify({"replied_emails": formatted_emails})
        else:
            return jsonify({"error": "Database connection failed"}), 500
            
    except Exception as e:
        print(f"Error getting replied emails: {e}")
        return jsonify({"error": str(e)}), 500

# Add these routes to content_routes.py - WITH UNIQUE NAMES

@content_bp.route("/tracking/auto-reply/list", methods=["GET"])
@login_required
def get_auto_reply_emails():  # Changed function name
    """Get all emails that have been replied to"""
    user_id = request.user["id"]
    
    try:
        connection = db.get_connection()
        if connection:
            cursor = connection.cursor()
            
            # Get user's actual ID
            actual_user_id = user_id
            
            # Query to get replied emails with auto-reply status
            cursor.execute("""
                SELECT 
                    et.*,
                    ec.campaign_name,
                    era.id as auto_reply_id,
                    era.auto_reply_sent_at,
                    era.auto_reply_subject,
                    era.auto_reply_body,
                    era.status as auto_reply_status
                FROM email_tracking et
                LEFT JOIN email_campaigns ec ON et.campaign_id = ec.id
                LEFT JOIN email_auto_replies era ON et.id = era.tracking_id
                WHERE et.status = 'replied'
                AND ec.user_id = ?
                ORDER BY et.reply_time DESC
            """, (actual_user_id,))
            
            replied_emails = cursor.fetchall()
            connection.close()
            
            # Format the response
            formatted_emails = []
            for email in replied_emails:
                email_dict = dict(email)
                email_dict['auto_replied'] = email_dict['auto_reply_id'] is not None
                formatted_emails.append(email_dict)
            
            return jsonify({"replied_emails": formatted_emails})
        else:
            return jsonify({"error": "Database connection failed"}), 500
            
    except Exception as e:
        print(f"Error getting replied emails: {e}")
        return jsonify({"error": str(e)}), 500

@content_bp.route("/tracking/auto-reply/send-reply", methods=["POST"])  # Changed route
@login_required
def send_auto_reply_email():  # Changed function name
    """Send an auto-reply email and store the details"""
    user_id = request.user["id"]
    data = request.json
    
    required_fields = [
        'recipient_email', 'reply_subject', 'reply_body', 
        'sender_email', 'sender_password'
    ]
    
    for field in required_fields:
        if not data.get(field):
            return jsonify({"error": f"Missing required field: {field}"}), 400
    
    try:
        # Send the email
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(data['sender_email'], data['sender_password'])
            
            msg = MIMEMultipart()
            sender_name = data.get('sender_name', 'Auto Reply')
            msg['From'] = f"{sender_name} <{data['sender_email']}>"
            msg['To'] = data['recipient_email']
            msg['Subject'] = data['reply_subject']
            msg.attach(MIMEText(data['reply_body'], 'plain'))
            
            server.send_message(msg)
        
        # Store auto-reply details in database
        connection = db.get_connection()
        if connection:
            cursor = connection.cursor()
            
            # Get the tracking record ID
            cursor.execute("""
                SELECT id FROM email_tracking 
                WHERE recipient_email = ? AND status = 'replied'
                ORDER BY reply_time DESC LIMIT 1
            """, (data['recipient_email'],))
            
            tracking_record = cursor.fetchone()
            
            if tracking_record:
                tracking_id = tracking_record['id']
                
                # Insert auto-reply record
                cursor.execute("""
                    INSERT INTO email_auto_replies 
                    (tracking_id, auto_reply_subject, auto_reply_body, 
                     auto_reply_sent_at, status, sender_email)
                    VALUES (?, ?, ?, ?, 'sent', ?)
                """, (
                    tracking_id,
                    data['reply_subject'],
                    data['reply_body'],
                    db.get_current_timestamp(),
                    data['sender_email']
                ))
                
                connection.commit()
            
            connection.close()
        
        return jsonify({
            "message": "Auto-reply sent successfully",
            "recipient": data['recipient_email'],
            "sent_at": db.get_current_timestamp()
        })
        
    except smtplib.SMTPAuthenticationError as e:
        return jsonify({"error": f"SMTP Authentication failed: {str(e)}"}), 400
    except smtplib.SMTPException as e:
        return jsonify({"error": f"SMTP error: {str(e)}"}), 500
    except Exception as e:
        print(f"Error sending auto-reply: {e}")
        return jsonify({"error": str(e)}), 500

@content_bp.route("/tracking/auto-reply/senders", methods=["GET"])  # Changed route
@login_required
def get_auto_reply_sender_accounts():  # Changed function name
    """Get sender accounts; super_admin sees all active accounts"""
    user_id = request.user["id"]
    user_role = request.user.get("role")
    
    try:
        connection = db.get_connection()
        if connection:
            cursor = connection.cursor()
            
            if user_role == "super_admin":
                # Super admin can see all active sender accounts
                cursor.execute("""
                    SELECT email, password, sender_name, is_active, user_id 
                    FROM sender_accounts 
                    WHERE is_active = 1
                """)
            else:
                # Regular users only see their own active accounts
                cursor.execute("""
                    SELECT email, password, sender_name, is_active, user_id 
                    FROM sender_accounts 
                    WHERE user_id = ? AND is_active = 1
                """, (user_id,))
            
            accounts = cursor.fetchall()
            connection.close()
            
            return jsonify({"sender_accounts": [dict(account) for account in accounts]})
        else:
            return jsonify({"error": "Database connection failed"}), 500
            
    except Exception as e:
        print(f"Error getting sender accounts: {e}")
        return jsonify({"error": str(e)}), 500
    
@content_bp.route("/tracking/send-immediate-follow-up", methods=["POST"])
@login_required
def send_immediate_follow_up():
    """Send immediate follow-up emails to selected recipients"""
    user_id = request.user["id"]
    data = request.json
    
    campaign_id = data.get("campaign_id")
    recipient_emails = data.get("recipient_emails", [])
    subject = data.get("subject")
    body = data.get("body")
    sender_name = data.get("sender_name")
    sender_accounts = data.get("sender_accounts", [])
    
    if not all([campaign_id, subject, body, sender_name]) or not recipient_emails:
        return jsonify({"error": "Missing required fields"}), 400
    
    if not sender_accounts:
        return jsonify({"error": "No sender accounts provided"}), 400
    
    try:
        # Start immediate follow-up sending in background thread
        threading.Thread(
            target=send_immediate_follow_up_emails,
            args=(campaign_id, recipient_emails, sender_accounts, subject, body, sender_name, user_id)
        ).start()
        
        return jsonify({
            "message": f"Started sending immediate follow-up emails to {len(recipient_emails)} recipients",
            "total_recipients": len(recipient_emails)
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def send_immediate_follow_up_emails(campaign_id, recipient_emails, sender_accounts, subject, body, sender_name, user_id="default_user"):
    """Send immediate follow-up emails to specified recipients"""
    # Use app_state for progress tracking
    app_state.progress["total"] = len(recipient_emails)
    app_state.progress["sent"] = 0
    app_state.progress["status"] = "running"

    sender_cycle = cycle(sender_accounts)
    
    try:
        for recipient_email in recipient_emails:
            sender_account = next(sender_cycle)
            sender_email = sender_account['email']
            password = sender_account['password']
            account_sender_name = sender_account.get('sender_name', '')
            
            with smtplib.SMTP("smtp.gmail.com", 587) as server:
                server.starttls()
                server.login(sender_email, password)
                
                display_sender_name = account_sender_name or sender_name
                
                # Get recipient name from database if available
                recipient_name = "there"
                connection = db.get_connection()
                if connection:
                    cursor = connection.cursor()
                    cursor.execute(
                        "SELECT recipient_name FROM email_tracking WHERE campaign_id = ? AND recipient_email = ?",
                        (campaign_id, recipient_email)
                    )
                    result = cursor.fetchone()
                    if result and result['recipient_name']:
                        recipient_name = result['recipient_name']
                    connection.close()
                
                personalized_body = replace_placeholders(body, recipient_name)
                personalized_subject = replace_placeholders(subject, recipient_name)
                
                msg = MIMEMultipart()
                msg['From'] = f"{display_sender_name} <{sender_email}>"
                msg['To'] = recipient_email
                msg['Subject'] = personalized_subject
                msg.attach(MIMEText(personalized_body, 'plain'))
                
                try:
                    server.send_message(msg)
                    
                    # Update email status
                    update_email_status(campaign_id, recipient_email, "follow_up_sent")
                    
                    # Save to sent_emails table
                    db.save_sent_email(
                        campaign_id=campaign_id,
                        recipient_email=recipient_email,
                        recipient_name=recipient_name,
                        recipient_position="",  # You might want to get this from tracking data
                        sender_email=sender_email,
                        sender_name=display_sender_name,
                        subject=personalized_subject,
                        body=personalized_body,
                        template_used="immediate_follow_up",
                        status='sent'
                    )
                    
                    print(f"Sent immediate follow-up email to {recipient_email}")
                    
                except Exception as e:
                    print(f"Failed to send immediate follow-up email to {recipient_email}: {e}")
                    # Update status as failed
                    db.save_sent_email(
                        campaign_id=campaign_id,
                        recipient_email=recipient_email,
                        recipient_name=recipient_name,
                        recipient_position="",
                        sender_email=sender_email,
                        sender_name=display_sender_name,
                        subject=personalized_subject,
                        body=personalized_body,
                        template_used="immediate_follow_up",
                        status='failed',
                        error_message=str(e)
                    )
                
                app_state.progress["sent"] += 1
                
                # Small delay to avoid rate limiting
                time.sleep(0.1)
                
    except Exception as e:
        app_state.progress["status"] = f"error: {e}"
        return
    
    app_state.progress["status"] = "completed" 

@content_bp.route("/tracking/process-follow-ups", methods=["POST"])
@login_required
def process_follow_ups_now():
    """Manually process follow-ups immediately"""
    user_id = request.user["id"]
    
    try:
        # First classify emails to update statuses
        classify_result = classify_email_responses(user_id)
        
        # Then process scheduled follow-ups
        process_result = process_scheduled_follow_ups(user_id)
        
        return jsonify({
            "classification": classify_result,
            "follow_up_processing": process_result
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@content_bp.route("/tracking/check-bounces-detailed", methods=["POST"])
@login_required
def check_bounces_detailed():
    """Check for bounced emails with detailed classification"""
    user_id = request.user["id"]
    data = request.json
    
    print(f"Received bounce check request from user {user_id}")
    print(f"Request data: {data}")
    
    # Support both old sender_accounts format and new IMAP credentials format
    sender_accounts = data.get("sender_accounts", [])
    imap_email = data.get("imap_email")
    imap_password = data.get("imap_password")
    imap_server = data.get("imap_server", "imap.gmail.com")
    imap_port = data.get("imap_port", 993)
    
    # If IMAP credentials are provided directly, use them
    if imap_email and imap_password:
        sender_accounts = [{
            'email': imap_email,
            'password': imap_password,
            'imap_server': imap_server,
            'imap_port': imap_port
        }]
    
    if not sender_accounts:
        print("ERROR: No sender accounts or IMAP credentials provided")
        return jsonify({"error": "No sender accounts or IMAP credentials provided"}), 400
    
    print(f"Processing {len(sender_accounts)} account(s) for bounce checking")
    
    all_bounced_emails = []
    all_replied_emails = []
    bounce_summary = {}
    reply_update_count = 0
    
    try:
        for account in sender_accounts:
            email = account.get('email')
            password = account.get('password')
            
            if not email or not password:
                print(f"Skipping account - missing email or password")
                continue
                
            print(f"Checking bounces for: {email}")
            
            # Use custom IMAP settings if provided
            custom_imap_str = None
            if account.get('imap_server') and account.get('imap_port'):
                custom_imap_str = f"{account['imap_server']}:{account['imap_port']}:ssl"
                print(f"Using custom IMAP: {custom_imap_str}")
            
            bounced = check_email_bounces(
                email, 
                password,
                provider='custom' if custom_imap_str else None,
                custom_imap=custom_imap_str
            )
            
            print(f"Found {len(bounced)} bounced emails for {email}")
            all_bounced_emails.extend(bounced)

            # Also fetch replies so we can surface inbox messages separately
            replies = check_email_replies(
                email,
                password,
                provider='custom' if custom_imap_str else None,
                custom_imap=custom_imap_str
            )

            print(f"Found {len(replies)} replies for {email}")
            # Annotate which sender account saw the reply
            all_replied_emails.extend([{**reply, 'sender_account': email} for reply in replies])
        
        # Update database with bounced emails
        print(f"\\nUpdating database with {len(all_bounced_emails)} bounced emails...")
        updated_count = 0
        
        for bounced_email in all_bounced_emails:
            recipient = bounced_email.get('recipient_email')
            sender_account = (bounced_email.get('sender_email') or '').lower()

            if not recipient:
                continue
                
            # Find which campaign this email belongs to (match by recipient + sender + user)
            connection = db.get_connection()
            if connection:
                cursor = connection.cursor()

                # Prefer matching both recipient and sender for this user
                query = """
                    SELECT et.campaign_id, et.id
                    FROM email_tracking et
                    JOIN email_campaigns ec ON et.campaign_id = ec.id
                    WHERE ec.user_id = ?
                      AND LOWER(et.recipient_email) = LOWER(?)
                """
                params = [user_id, recipient]

                if sender_account:
                    query += " AND (LOWER(et.sender_email) = LOWER(?) OR et.sender_email IS NULL)"
                    params.append(sender_account)

                query += " ORDER BY et.sent_time DESC LIMIT 1"

                cursor.execute(query, tuple(params))
                result = cursor.fetchone()

                # Fallback: match by recipient only for this user if sender-specific lookup failed
                if not result:
                    cursor.execute(
                        """
                        SELECT et.campaign_id, et.id
                        FROM email_tracking et
                        JOIN email_campaigns ec ON et.campaign_id = ec.id
                        WHERE ec.user_id = ?
                          AND LOWER(et.recipient_email) = LOWER(?)
                        ORDER BY et.sent_time DESC LIMIT 1
                        """,
                        (user_id, recipient)
                    )
                    result = cursor.fetchone()
                
                if result:
                    campaign_id = result[0]
                    tracking_id = result[1]
                    
                    print(f"Updating bounce for {recipient} (sender {sender_account}) in campaign {campaign_id}")
                    
                    # Update email_tracking with bounce info
                    success = db.update_email_tracking_status(
                        campaign_id, 
                        recipient, 
                        'bounced',
                        None,  # reply_message
                        bounced_email.get('bounce_type'),
                        bounced_email.get('bounce_reason'),
                        bounced_email.get('bounce_details')
                    )
                    
                    if success:
                        updated_count += 1
                else:
                    print(f"No tracking record found for {recipient} (sender {sender_account})")
                    
                connection.close()
            
            # Update summary counts
            bounce_type = bounced_email.get('bounce_type', 'unknown')
            bounce_summary[bounce_type] = bounce_summary.get(bounce_type, 0) + 1
        
        print(f"Successfully updated {updated_count} email tracking records\n")

        # Update database with replied emails (customer inbox)
        print(f"Updating database with {len(all_replied_emails)} replied emails...")

        for replied_email in all_replied_emails:
            sender_email = (replied_email.get('from') or '').lower()
            reply_body = (replied_email.get('body') or '')[:1000]
            sender_account = (replied_email.get('sender_account') or '').lower()

            if not sender_email:
                continue

            connection = db.get_connection()
            if connection:
                cursor = connection.cursor()

                # Prefer matching both recipient and sender for this user
                query = """
                    SELECT et.campaign_id, et.id
                    FROM email_tracking et
                    JOIN email_campaigns ec ON et.campaign_id = ec.id
                    WHERE ec.user_id = ?
                      AND LOWER(et.recipient_email) = LOWER(?)
                """
                params = [user_id, sender_email]

                if sender_account:
                    query += " AND (LOWER(et.sender_email) = LOWER(?) OR et.sender_email IS NULL)"
                    params.append(sender_account)

                query += " ORDER BY et.sent_time DESC LIMIT 1"

                cursor.execute(query, tuple(params))
                result = cursor.fetchone()

                # Fallback: match by recipient only for this user if sender-specific lookup failed
                if not result:
                    cursor.execute(
                        """
                        SELECT et.campaign_id, et.id
                        FROM email_tracking et
                        JOIN email_campaigns ec ON et.campaign_id = ec.id
                        WHERE ec.user_id = ?
                          AND LOWER(et.recipient_email) = LOWER(?)
                        ORDER BY et.sent_time DESC LIMIT 1
                        """,
                        (user_id, sender_email)
                    )
                    result = cursor.fetchone()

                if result:
                    campaign_id = result[0]
                    tracking_id = result[1]

                    print(f"Updating reply for {sender_email} (sender {sender_account}) in campaign {campaign_id}")

                    # Update email_tracking status
                    success = db.update_email_tracking_status(
                        campaign_id,
                        sender_email,
                        'replied',
                        reply_message=reply_body
                    )
                    
                    # Also insert into replied_users table for multiple reply tracking
                    if success:
                        # Get recipient name from tracking
                        connection_inner = db.get_connection()
                        if connection_inner:
                            cursor_inner = connection_inner.cursor()
                            cursor_inner.execute(
                                "SELECT recipient_name FROM email_tracking WHERE id = ?",
                                (tracking_id,)
                            )
                            name_row = cursor_inner.fetchone()
                            recipient_name = name_row[0] if name_row else None
                            connection_inner.close()
                        else:
                            recipient_name = None
                        
                        # Insert reply record with date from email
                        db.insert_reply_record(
                            user_id=user_id,
                            tracking_id=tracking_id,
                            recipient_email=sender_email,
                            recipient_name=recipient_name,
                            reply_subject=reply_info.get('subject', ''),
                            reply_message=reply_body,
                            reply_time=reply_info.get('date', db.get_current_timestamp())
                        )
                        reply_update_count += 1
                else:
                    print(f"No tracking record found for reply from {sender_email} (sender {sender_account})")

                connection.close()
        
        return jsonify({
            "message": f"Found {len(all_bounced_emails)} bounced emails (updated {updated_count}) and {len(all_replied_emails)} replies (updated {reply_update_count})",
            "bounce_summary": bounce_summary,
            "bounced_emails": all_bounced_emails,
            "updated_count": updated_count,
            "replied_emails": all_replied_emails,
            "reply_updated_count": reply_update_count,
            "recommendations": generate_bounce_recommendations(bounce_summary)
        })
        
    except Exception as e:
        print(f"Error checking bounces: {str(e)}")
        return jsonify({"error": str(e)}), 500

def generate_bounce_recommendations(bounce_summary):
    """Generate recommendations based on bounce types"""
    recommendations = []
    
    if bounce_summary.get('hard_bounce', 0) > 0:
        recommendations.append({
            "type": "warning",
            "message": f"You have {bounce_summary['hard_bounce']} hard bounces. These emails should be removed from your list as they don't exist.",
            "action": "Remove hard bounced emails from your contact list"
        })
    
    if bounce_summary.get('soft_bounce', 0) > 0:
        recommendations.append({
            "type": "info",
            "message": f"You have {bounce_summary['soft_bounce']} soft bounces. These are temporary issues that might resolve.",
            "action": "Wait 24-48 hours before retrying these emails"
        })
    
    if bounce_summary.get('blocked', 0) > 0:
        recommendations.append({
            "type": "error",
            "message": f"You have {bounce_summary['blocked']} blocked emails. Your sending reputation might be affected.",
            "action": "Review your email content and sending frequency"
        })
    
    if bounce_summary.get('auto_reply', 0) > 0:
        recommendations.append({
            "type": "info",
            "message": f"You received {bounce_summary['auto_reply']} auto-replies (out of office).",
            "action": "Schedule follow-ups for when the recipient returns"
        })
    
    return recommendations    


@content_bp.route("/tracking/check-bounces-enhanced", methods=["POST"])
@login_required
def check_bounces_enhanced():
    """Enhanced bounce checking with better detection"""
    user_id = request.user["id"]
    data = request.json
    
    gmail_address = data.get("gmail_address")
    app_password = data.get("app_password")
    
    if not gmail_address or not app_password:
        return jsonify({"error": "Gmail address and app password are required"}), 400
    
    try:
        # Use the enhanced check_email_bounces function
        bounced_emails = check_email_bounces(gmail_address, app_password)
        
        # Update database with bounced emails
        for bounced in bounced_emails:
            recipient_email = bounced['recipient_email']
            
            # Find the campaign for this email
            connection = db.get_connection()
            if connection:
                cursor = connection.cursor()
                
                # Look for the most recent sent email to this recipient
                cursor.execute("""
                    SELECT et.id, et.campaign_id 
                    FROM email_tracking et
                    LEFT JOIN email_campaigns ec ON et.campaign_id = ec.id
                    WHERE et.recipient_email = ? 
                    AND ec.user_id = ?
                    AND et.status = 'sent'
                    ORDER BY et.sent_time DESC 
                    LIMIT 1
                """, (recipient_email, user_id))
                
                result = cursor.fetchone()
                if result:
                    tracking_id = result['id']
                    campaign_id = result['campaign_id']
                    
                    # Update the tracking record
                    cursor.execute("""
                        UPDATE email_tracking 
                        SET status = 'bounced',
                            bounce_reason = ?,
                            bounce_type = ?,
                            last_checked = ?,
                            updated_at = ?
                        WHERE id = ?
                    """, (
                        bounced['bounce_reason'],
                        bounced['bounce_type'],
                        datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                        datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                        tracking_id
                    ))
                    
                    print(f"Updated {recipient_email} as {bounced['bounce_type']}")
                
                connection.commit()
                connection.close()
        
        # Get bounce statistics
        hard_bounces = [b for b in bounced_emails if b['bounce_type'] == 'hard_bounce']
        soft_bounces = [b for b in bounced_emails if b['bounce_type'] == 'soft_bounce']
        
        return jsonify({
            "message": f"Found {len(bounced_emails)} bounced emails",
            "total_bounces": len(bounced_emails),
            "hard_bounces": len(hard_bounces),
            "soft_bounces": len(soft_bounces),
            "bounced_emails": bounced_emails,
            "recommendations": [
                {
                    "type": "warning" if hard_bounces else "success",
                    "message": f"Found {len(hard_bounces)} hard bounces. These email addresses don't exist and should be removed from your list.",
                    "action": "Remove hard bounced addresses from your contact list"
                } if hard_bounces else {
                    "type": "success",
                    "message": "No hard bounces found! All email addresses appear to be valid.",
                    "action": "None required"
                }
            ]
        })
        
    except Exception as e:
        print(f"Error in enhanced bounce checking: {e}")
        return jsonify({"error": str(e)}), 500
@content_bp.route("/send-single-email", methods=["POST"])
@login_required
def send_single_email():
    """Send a single personalized email"""
    data = request.json
    
    recipient_email = data.get("email")
    name = data.get("name")
    position = data.get("position")
    subject = data.get("subject")
    body = data.get("body")
    sender_name = data.get("sender_name")
    sender_account = data.get("sender_account")
    
    if not recipient_email or not subject or not body or not sender_account:
        return jsonify({"error": "Missing required fields"}), 400
        
    try:
        # Get provider settings
        provider = sender_account.get('provider', 'auto')
        sender_email = sender_account.get('email')
        password = sender_account.get('password')
        custom_smtp = sender_account.get('custom_smtp', '')
        
        provider_info = None
        if provider == 'custom' and custom_smtp:
            provider_info = {
                'is_custom': True,
                'smtp_server': custom_smtp.split(':')[0] if ':' in custom_smtp else custom_smtp,
                'smtp_port': int(custom_smtp.split(':')[1]) if ':' in custom_smtp else 587,
                'use_ssl': len(custom_smtp.split(':')) > 2 and custom_smtp.split(':')[2].lower() == 'ssl'
            }
        else:
            provider_info = get_provider_settings(provider) or detect_email_provider(sender_email)
            if provider != 'auto' and provider_info.get('name') != provider:
                 provider_info['name'] = provider

        # Send the email using the imported function
        from services.service import send_email_with_provider
        success, error = send_email_with_provider(
            sender_email=sender_email,
            password=password,
            recipient_email=recipient_email,
            subject=subject,
            body=body,
            sender_name=sender_name or sender_account.get('sender_name', ''),
            provider_info=provider_info,
            custom_smtp=custom_smtp
        )
        
        if success:
            # Track in specialized log if needed
            from utils.helpers import save_sent_email
            save_sent_email({
                "timestamp": datetime.now().isoformat(),
                "sender_email": sender_email,
                "sender_name": sender_name or sender_account.get('sender_name', ''),
                "recipient_email": recipient_email,
                "subject": subject,
                "body": body,
                "first_name": name.split()[0] if name else "",
                "last_name": " ".join(name.split()[1:]) if name else "",
                "company": "",
                "phone": ""
            })
            return jsonify({"message": f"Email sent successfully to {recipient_email}!"})
        else:
            return jsonify({"error": error}), 500
            
    except Exception as e:
        print(f"Error in send_single_email: {e}")
        return jsonify({"error": str(e)}), 500

@content_bp.route("/tracking/daily-stats", methods=["GET"])
@login_required
def get_daily_stats():
    user_id = request.user["id"]
    date_str = request.args.get('date')
    sender_email = request.args.get('sender_email')
    
    if not date_str:
        # Default to today
        date_str = datetime.now().strftime('%Y-%m-%d')
        
    stats = db.get_daily_email_stats(user_id, date_str, sender_email)
    
    if stats:
        return jsonify(stats)
    else:
        # Return empty stats instead of 500 error
        return jsonify({
            "sent": 0, "delivered": 0, "replied": 0, "bounced": 0, "no_reply": 0
        })

@content_bp.route("/tracking/historical-stats", methods=["GET"])
@login_required
def get_historical_stats():
    user_id = request.user["id"]
    user_role = request.user.get("role")
    days = request.args.get('days', 7, type=int)
    sender_email = request.args.get('sender_email')
    include_all = user_role == "super_admin"
    
    stats = db.get_historical_email_stats(user_id, days, sender_email, include_all=include_all)
    
    if stats:
        return jsonify(stats)
    else:
        return jsonify({"error": "Failed to fetch historical stats"}), 500
