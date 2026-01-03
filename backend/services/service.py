import os, re, smtplib, imaplib, email, json, requests, pandas as pd, random
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.header import decode_header
from itertools import cycle
import google.generativeai as genai
from datetime import datetime
from config import app_state
import time
from datetime import datetime, timedelta
from database import db
from itertools import cycle
from utils.helpers import (
    extract_name_from_email,
    extract_phone_number,
    extract_company_from_email,
    save_to_excel,
    save_sent_email,
    replace_placeholders,
    is_auto_response,
    is_valid_phone_number,
    get_provider_config
)

# Import zoho_handler for lead integration
try:
    from routes.zoho_routes import zoho_handler
except ImportError:
    zoho_handler = None

# Import shared config - ONLY import what you need
from config import (
    app_state  # Import the shared state object
)



# Provider Definitions
PROVIDER_CONFIGS = {
    'gmail': {
        'smtp_server': 'smtp.gmail.com',
        'smtp_port': 587,
        'imap_server': 'imap.gmail.com',
        'imap_port': 993,
        'use_ssl': False,  # 587 requires STARTTLS, not SSL
        'name': 'gmail',
        'requires_app_password': True,
        'help': 'Use Gmail app password (not your regular password)'
    },
    'outlook': {
        'smtp_server': 'smtp-mail.outlook.com',
        'smtp_port': 587,
        'imap_server': 'outlook.office365.com',
        'imap_port': 993,
        'use_ssl': False,  # 587 requires STARTTLS
        'name': 'outlook',
        'requires_app_password': False,
        'help': 'Use your Microsoft account password'
    },
    'yahoo': {
        'smtp_server': 'smtp.mail.yahoo.com',
        'smtp_port': 465,
        'imap_server': 'imap.mail.yahoo.com',
        'imap_port': 993,
        'use_ssl': True,  # 465 uses SSL
        'name': 'yahoo',
        'requires_app_password': True,
        'help': 'Requires app-specific password'
    },
    'icloud': {
        'smtp_server': 'smtp.mail.me.com',
        'smtp_port': 587,
        'imap_server': 'imap.mail.me.com',
        'imap_port': 993,
        'use_ssl': False,  # 587 requires STARTTLS
        'name': 'icloud',
        'requires_app_password': True,
        'help': 'Requires app-specific password'
    },
    'aol': {
        'smtp_server': 'smtp.aol.com',
        'smtp_port': 587,
        'imap_server': 'imap.aol.com',
        'imap_port': 993,
        'use_ssl': False,  # 587 requires STARTTLS
        'name': 'aol',
        'requires_app_password': True,
        'help': 'Requires app-specific password'
    },
    'zoho': {
        'smtp_server': 'smtp.zoho.com',
        'smtp_port': 587,
        'imap_server': 'imap.zoho.com',
        'imap_port': 993,
        'use_ssl': False,  # prefer STARTTLS on 587; will also try 465 SSL
        'name': 'zoho',
        'requires_app_password': True,
        'help': 'If Two-Factor Authentication is enabled, generate an Application Specific Password in Zoho Mail settings and use that here.'
    },
    'protonmail': {
        'smtp_server': 'smtp.protonmail.ch',
        'smtp_port': 587,
        'imap_server': 'imap.protonmail.ch',
        'imap_port': 993,
        'use_ssl': False,  # 587 requires STARTTLS
        'name': 'protonmail',
        'requires_app_password': True,
        'help': 'Requires app-specific password'
    }
}

PROVIDER_DOMAINS = {
    'gmail.com': PROVIDER_CONFIGS['gmail'],
    'googlemail.com': PROVIDER_CONFIGS['gmail'],
    'outlook.com': PROVIDER_CONFIGS['outlook'],
    'hotmail.com': PROVIDER_CONFIGS['outlook'],  # Map to outlook config
    'yahoo.com': PROVIDER_CONFIGS['yahoo'],
    'ymail.com': PROVIDER_CONFIGS['yahoo'],
    'icloud.com': PROVIDER_CONFIGS['icloud'],
    'me.com': PROVIDER_CONFIGS['icloud'],
    'aol.com': PROVIDER_CONFIGS['aol'],
    'zoho.com': PROVIDER_CONFIGS['zoho'],
    'zoho.in': PROVIDER_CONFIGS['zoho'],
    'zoho.eu': PROVIDER_CONFIGS['zoho'],
    'protonmail.com': PROVIDER_CONFIGS['protonmail'],
    'proton.me': PROVIDER_CONFIGS['protonmail']
}

def get_provider_settings(provider_name):
    """Get settings for a specific provider by name"""
    return PROVIDER_CONFIGS.get(provider_name)

def detect_email_provider(email):
    """Detect email provider from email address"""
    if not email or '@' not in email:
        return PROVIDER_CONFIGS['gmail']
    
    domain = email.split('@')[-1].lower().strip()
    
    # Check for custom domains
    if domain in PROVIDER_DOMAINS:
        return PROVIDER_DOMAINS[domain]
    
    # For custom domains, try to detect common patterns
    # Microsoft 365/O365 domains
    microsoft_domains = ['onmicrosoft.com', 'microsoft.com', 'msn.com']
    if any(domain.endswith(md) for md in microsoft_domains):
        return {
            'smtp_server': 'smtp.office365.com',
            'smtp_port': 587,
            'imap_server': 'outlook.office365.com',
            'imap_port': 993,
            'use_ssl': True,
            'name': 'office365',
            'requires_app_password': False,
            'help': 'Use your Microsoft 365 password'
        }
    
    # Google Workspace domains
    if domain.endswith('.gmail.com') or domain.endswith('.googlemail.com'):
        return PROVIDER_CONFIGS['gmail']
    
    # Default to Office 365 for business emails or provide custom option
    return {
        'smtp_server': 'smtp.office365.com',  # Common for business emails
        'smtp_port': 587,
        'imap_server': 'outlook.office365.com',
        'imap_port': 993,
        'use_ssl': True,
        'name': 'custom',
        'requires_app_password': False,
        'is_custom_domain': True,
        'help': 'Use your email account password. If this fails, contact your IT department for SMTP settings.'
    }

def generate_email_content(prompt):
    try:
        api_key = os.getenv("GEMINI_API_KEY")

        if api_key:
            print(f"✅ Gemini Key in use: {api_key[:6]}******{api_key[-4:]}")
        else:
            print("❌ GEMINI_API_KEY not found in environment")
        model = genai.GenerativeModel('gemini-2.5-flash')
        response = model.generate_content(f"""
        Create professional email content based on this specific user request: {prompt}
        
        IMPORTANT: 
        - Use ONLY plain text format
        - Do NOT use any markdown formatting like **bold**, *italic*, or any special characters
        - Make the content relevant and tailored to the user's specific request
        
        Please provide the response in this exact format:
        
        SUBJECT: [email subject here]
        SENDER_NAME: [sender name here]
        BODY: [email body here]
        """)

        lines = response.text.strip().split('\n')
        result = {"subject": "", "body": "", "sender_name": ""}
        body_lines = []
        is_body = False

        for line in lines:
            if line.startswith("SUBJECT:"):
                result["subject"] = line.replace("SUBJECT:", "").strip()
            elif line.startswith("SENDER_NAME:"):
                result["sender_name"] = line.replace("SENDER_NAME:", "").strip()
            elif line.startswith("BODY:"):
                is_body = True
                body_lines.append(line.replace("BODY:", "").strip())
            elif is_body:
                body_lines.append(line.strip())

        result["body"] = "\n".join(body_lines).strip()
        
        # Clean any remaining markdown formatting from all fields
        result["subject"] = clean_markdown(result["subject"])
        result["sender_name"] = clean_markdown(result["sender_name"])
        result["body"] = clean_markdown(result["body"])
        
        return result

    except Exception as e:
        return {"error": str(e)}

def clean_markdown(text):
    """Remove all markdown formatting from text"""
    if not text:
        return text
    
    # Remove bold: **text** or __text__
    text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
    text = re.sub(r'__(.*?)__', r'\1', text)
    
    # Remove italic: *text* or _text_
    text = re.sub(r'\*(.*?)\*', r'\1', text)
    text = re.sub(r'_(.*?)_', r'\1', text)
    
    # Remove strikethrough: ~~text~~
    text = re.sub(r'~~(.*?)~~', r'\1', text)
    
    # Remove code blocks: `text` or ```text```
    text = re.sub(r'`(.*?)`', r'\1', text)
    text = re.sub(r'```.*?\n(.*?)\n```', r'\1', text, flags=re.DOTALL)
    
    # Remove headers: # Header, ## Header, etc.
    text = re.sub(r'^#+\s*', '', text, flags=re.MULTILINE)
    
    # Remove links: [text](url)
    text = re.sub(r'\[(.*?)\]\(.*?\)', r'\1', text)
    
    # Remove blockquotes: > text
    text = re.sub(r'^>\s*', '', text, flags=re.MULTILINE)
    
    # Remove lists: - item, * item, 1. item
    text = re.sub(r'^[\s]*[-*•]\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'^[\s]*\d+\.\s*', '', text, flags=re.MULTILINE)
    
    return text.strip()



def send_bulk_emails(recipients, batch_size, sender_accounts, subject, body, sender_name, user_id="default_user", campaign_id=None):
    """Send bulk emails and track in database with smart rotation and limits."""
    # Use app_state instead of global progress
    from config import app_state
    from database import db
    
    print(f"\n🚀 STARTING send_bulk_emails: {len(recipients)} recipients")
    print(f"   Campaign ID: {campaign_id}")
    
    app_state.progress["total"] = len(recipients)
    app_state.progress["sent"] = 0
    app_state.progress["status"] = "running"
    
    # Track failed emails separately
    app_state.progress["failed"] = 0
    app_state.progress["failed_list"] = []
    
    print(f"   Initial progress: {app_state.progress}")

    # Prepare accounts: ensure limits and tracking fields exist
    today_str = datetime.now().strftime('%Y-%m-%d')
    for acc in sender_accounts:
        if 'daily_limit' not in acc: acc['daily_limit'] = 125
        if 'sent_today' not in acc: acc['sent_today'] = 0
        
        # Reset if new day
        if acc.get('last_reset_date') != today_str:
            acc['sent_today'] = 0
            acc['last_reset_date'] = today_str

    current_account_index = 0

    for i, recipient in enumerate(recipients):
        # 1. Check for available accounts (Round Robin)
        available_accounts = [acc for acc in sender_accounts if acc['sent_today'] < acc['daily_limit']]
        
        if not available_accounts:
            msg = "⛔ All sender accounts have reached their daily limit. Pausing sending until reset."
            print(msg)
            app_state.progress["status"] = "paused_limit_reached"
            # Log failure for remaining? Or just stop.
            # We'll just stop the loop.
            break

        # Simple Round Robin: pick next available
        # Find the next available account starting from current_account_index
        sender_account = None
        attempts = 0
        while attempts < len(sender_accounts):
            acc = sender_accounts[current_account_index % len(sender_accounts)]
            if acc['sent_today'] < acc['daily_limit']:
                sender_account = acc
                # Move index for next time
                current_account_index = (current_account_index + 1) % len(sender_accounts)
                break
            current_account_index = (current_account_index + 1) % len(sender_accounts)
            attempts += 1
            
        if not sender_account:
            # Should be caught by available_accounts check, but safety net
            break

        sender_email = sender_account['email']
        password = sender_account['password']
        account_sender_name = sender_account.get('sender_name', '')
        provider = sender_account.get('provider', 'auto')
        custom_smtp = sender_account.get('custom_smtp', '')

        # Get provider info
        provider_info = None
        if provider == 'custom' and custom_smtp:
            provider_info = {
                'is_custom': True,
                'smtp_server': custom_smtp.split(':')[0] if ':' in custom_smtp else custom_smtp,
                'smtp_port': int(custom_smtp.split(':')[1]) if ':' in custom_smtp else 587,
                'use_ssl': len(custom_smtp.split(':')) > 2 and custom_smtp.split(':')[2].lower() == 'ssl'
            }
        elif provider != 'auto':
            # Use specified provider
            provider_config = get_provider_settings(provider)
            if provider_config:
                provider_info = provider_config
            else:
                # Fallback to detection if name not found
                provider_info = detect_email_provider(sender_email)
                if provider != provider_info.get('name', 'custom'):
                    provider_info['name'] = provider
        else:
            # Auto-detect
            provider_info = detect_email_provider(sender_email)

        try:
            name = recipient.get("name", "") or extract_name_from_email(recipient["email"])[0] or "there"

            position = recipient.get("position", "")
            company = recipient.get("company", "")
            phone = recipient.get("phone", "")
            
            display_sender_name = account_sender_name or sender_name
            
            # Get sender details from app_state for current personalization session
            from config import app_state
            
            # Use current account's email for personalization
            s_name = display_sender_name
            s_email = sender_email 
            s_phone = app_state.email_content.get('phone_number', '')

            personalized_body = replace_placeholders(body, name, position, company, phone, s_name, s_email, s_phone)
            personalized_subject = replace_placeholders(subject, name, position, company, phone, s_name, s_email, s_phone)

            # Send email using provider-specific settings
            is_zoho = provider_info.get('name') == 'zoho' if provider_info else False
            success, error = send_email_with_provider(
                sender_email=sender_email,
                password=password,
                recipient_email=recipient["email"],
                subject=personalized_subject,
                body=personalized_body,
                sender_name=display_sender_name,
                provider_info=provider_info,
                custom_smtp=custom_smtp
            )
            
            if success:
                print(f"✓ Sent email to {recipient['email']} via {sender_email}")
                
                # Update account usage
                sender_account['sent_today'] += 1
                db.update_sender_usage(sender_email, 1)

                # Increment progress IMMEDIATELY upon success
                app_state.progress["sent"] += 1
                print(f"✅ PROGRESS UPDATE: {app_state.progress['sent']}/{app_state.progress['total']} sent")
                
                # Save to database if campaign_id is provided
                if campaign_id:
                    try:
                        db.save_sent_email(
                            campaign_id=campaign_id,
                            recipient_email=recipient["email"],
                            recipient_name=recipient.get("name", ""),
                            recipient_position=recipient.get("position", ""),
                            sender_email=sender_email,
                            sender_name=display_sender_name,
                            subject=personalized_subject,
                            body=personalized_body,
                            template_used="standard",
                            status='sent'
                        )
                        # Update tracking with sender email
                        db.save_email_tracking(
                            campaign_id=campaign_id,
                            recipient_email=recipient["email"],
                            recipient_name=recipient.get("name", ""),
                            status='sent',
                            sender_email=sender_email
                        )
                        # Update campaign progress in database
                        db.update_campaign_status(campaign_id, 'running', app_state.progress["sent"], app_state.progress.get("failed", 0))
                        
                        # INTEGRATE WITH ZOHO CRM
                        if zoho_handler:
                            try:
                                lead_data = {
                                    'first_name': name.split()[0] if name else 'Lead',
                                    'last_name': ' '.join(name.split()[1:]) if len(name.split()) > 1 else 'Contact',
                                    'email': recipient["email"],
                                    'company': company or 'No Company Provided',
                                    'description': f"Sent bulk email: {personalized_subject}\n\nPosition: {position}",
                                    'phone': phone or ''
                                }
                                # Fallback for user_id
                                try:
                                    z_user_id = int(user_id) if str(user_id).isdigit() else 1
                                except:
                                    z_user_id = 1
                                    
                                z_success, z_msg = zoho_handler.create_lead_in_zoho(user_id=z_user_id, lead_data=lead_data)
                            except Exception as ze:
                                print(f"Zoho integration error for {recipient['email']}: {ze}")
                    except Exception as db_e:
                        print(f"⚠️ Warning: Database save failed for {recipient['email']}: {db_e}")
                
                # Save sent email to separate file (optional logging)
                try:
                    first_name, last_name = extract_name_from_email(recipient["email"])
                    save_sent_email({
                        "timestamp": datetime.now().isoformat(),
                        "sender_email": sender_email,
                        "sender_name": display_sender_name,
                        "recipient_email": recipient["email"],
                        "subject": personalized_subject,
                        "body": personalized_body,
                        "first_name": first_name,
                        "last_name": last_name,
                        "company": extract_company_from_email(recipient["email"]),
                        "phone": ""
                    })
                except Exception: pass
                    
            else:
                print(f"✗ Failed to send to {recipient['email']}: {error}")
                app_state.progress["failed"] += 1
                app_state.progress["failed_list"].append({
                    "email": recipient["email"],
                    "reason": error,
                    "error": error
                })
                
                # Save failed email to database
                if campaign_id:
                    try:
                        db.save_sent_email(
                            campaign_id=campaign_id,
                            recipient_email=recipient["email"],
                            recipient_name=recipient.get("name", ""),
                            recipient_position=recipient.get("position", ""),
                            sender_email=sender_email,
                            sender_name=display_sender_name,
                            subject=personalized_subject,
                            body=personalized_body,
                            template_used="standard",
                            status='failed',
                            error_message=error
                        )
                    except Exception as db_e:
                        print(f"⚠️ Warning: partial DB save failed: {db_e}")

        except Exception as e:
            # Catch any other errors for this recipient
            print(f"✗ Error processing recipient {recipient['email']}: {e}")
            app_state.progress["failed"] += 1
            app_state.progress["failed_list"].append({
                "email": recipient["email"],
                "reason": "Processing error",
                "error": str(e)
            })
            continue  # Continue with next recipient
        
        # SMART DELAY (provider-aware)
        # If it's the last email, don't wait
        if i < len(recipients) - 1:
            if is_zoho:
                # Zoho: shorter steady delay + periodic cooldown to avoid 5.4.6 blocks
                delay = random.uniform(4, 8)
                print(f"⏳ [Zoho] Waiting {delay:.1f}s before next email...")
                time.sleep(delay)
                # Every 10 emails, add a cooldown
                if (i + 1) % 10 == 0:
                    cooldown = random.uniform(60, 120)
                    print(f"🧊 [Zoho] Cooldown {cooldown:.1f}s after {i+1} emails to reduce throttle risk")
                    time.sleep(cooldown)
            else:
                delay = random.uniform(30, 60)
                print(f"⏳ Waiting {delay:.1f}s before next email...")
                time.sleep(delay)

    app_state.progress["status"] = "completed"
    print(f"\n🎉 COMPLETED send_bulk_emails")
    print(f"   Final stats: {app_state.progress['sent']} sent, {app_state.progress.get('failed', 0)} failed")
    
    # Update campaign as completed in database
    if campaign_id:
        try:
            success_count = app_state.progress["sent"]
            failed_count = app_state.progress.get("failed", 0)
            status = 'completed' if app_state.progress["status"] != "paused_limit_reached" else 'paused'
            db.update_campaign_status(campaign_id, status, success_count, failed_count)
        except Exception as e:
            print(f"⚠️ Warning: Final DB update failed: {e}")
    
    if app_state.progress.get("failed", 0) > 0:
        print(f"⚠️ Failed emails: {app_state.progress.get('failed_list', [])}")

def send_bulk_emails_with_templates(recipients, batch_size, sender_accounts, template_data=None, user_id="default_user", campaign_id=None):
    """Send bulk emails with templates and smart rotation limits."""
    # Use app_state instead of global progress
    from config import app_state
    from database import db
    
    app_state.progress["total"] = len(recipients)
    app_state.progress["sent"] = 0
    app_state.progress["status"] = "running"
    
    # Track failed emails separately
    app_state.progress["failed"] = 0
    app_state.progress["failed_list"] = []
    
    print(f"🚀 STARTING send_bulk_emails_with_templates: {len(recipients)} recipients, campaign_id={campaign_id}")
    print(f"📊 Initial progress state: {app_state.progress}")

    # Prepare accounts: ensure limits and tracking fields exist
    today_str = datetime.now().strftime('%Y-%m-%d')
    for acc in sender_accounts:
        if 'daily_limit' not in acc: acc['daily_limit'] = 125
        if 'sent_today' not in acc: acc['sent_today'] = 0
        
        # Reset if new day
        if acc.get('last_reset_date') != today_str:
            acc['sent_today'] = 0
            acc['last_reset_date'] = today_str

    current_account_index = 0
    
    try:
        for i, recipient in enumerate(recipients):
            # 1. Check for available accounts (Round Robin)
            available_accounts = [acc for acc in sender_accounts if acc['sent_today'] < acc['daily_limit']]
            
            if not available_accounts:
                msg = "⛔ All sender accounts have reached their daily limit. Pausing sending until reset."
                print(msg)
                app_state.progress["status"] = "paused_limit_reached"
                break

            # Simple Round Robin: pick next available
            sender_account = None
            attempts = 0
            while attempts < len(sender_accounts):
                acc = sender_accounts[current_account_index % len(sender_accounts)]
                if acc['sent_today'] < acc['daily_limit']:
                    sender_account = acc
                    current_account_index = (current_account_index + 1) % len(sender_accounts)
                    break
                current_account_index = (current_account_index + 1) % len(sender_accounts)
                attempts += 1
                
            if not sender_account: break # Safety

            sender_email = sender_account['email']
            password = sender_account['password']
            account_sender_name = sender_account.get('sender_name', '')
            provider = sender_account.get('provider', 'auto')
            custom_smtp = sender_account.get('custom_smtp', '')
            custom_imap = sender_account.get('custom_imap', '')
            
            try:
                name = recipient.get("name", "") or extract_name_from_email(recipient["email"])[0] or "there"
                
                # Get the appropriate template
                template = None
                if template_data and template_data['templates']:
                    position = recipient.get("position", "").lower()
                    template = template_data['templates'].get(position, template_data['default_template'])
                
                # Determine content components
                if template:
                    subject = template['subject']
                    body = template['body']
                    if account_sender_name:
                        sender_name = account_sender_name
                    elif template.get('sender_name'):
                        sender_name = template['sender_name']
                    else:
                        sender_name, _ = extract_name_from_email(sender_email)
                        if not sender_name:
                             sender_name = sender_email.split('@')[0].replace('.', ' ').title()
                else:
                    # Fallback
                    subject = app_state.email_content.get("subject", "")
                    body = app_state.email_content.get("body", "")
                    sender_name = account_sender_name or app_state.email_content.get("sender_name", "")

                # Personalize content
                position = recipient.get("position", "")
                company = recipient.get("company", "")
                phone = recipient.get("phone", "")
                
                s_name = sender_name
                s_email = template.get('sender_email', '') if template else ''
                s_phone = template.get('phone_number', '') if template else ''
                
                from config import app_state
                if not s_email: s_email = sender_email # Use current sender email as fallback, not app_state default? Or app_state default? 
                # Better to use the actual sender email being used!
                if not s_email: s_email = sender_email # Correct fix
                if not s_phone: s_phone = app_state.email_content.get('phone_number', '')

                personalized_body = replace_placeholders(body, name, position, company, phone, s_name, s_email, s_phone)
                personalized_subject = replace_placeholders(subject, name, position, company, phone, s_name, s_email, s_phone)

                # Get provider info
                provider_info = None
                if provider == 'custom' and custom_smtp:
                    provider_info = {
                        'is_custom': True,
                        'smtp_server': custom_smtp.split(':')[0] if ':' in custom_smtp else custom_smtp,
                        'smtp_port': int(custom_smtp.split(':')[1]) if ':' in custom_smtp else 587,
                        'use_ssl': len(custom_smtp.split(':')) > 2 and custom_smtp.split(':')[2].lower() == 'ssl'
                    }
                elif provider != 'auto':
                    # Use specified provider
                    provider_config = get_provider_settings(provider)
                    if provider_config:
                        provider_info = provider_config
                    else:
                        provider_info = detect_email_provider(sender_email)
                        if provider != provider_info.get('name', 'custom'):
                            provider_info['name'] = provider
                else:
                    # Auto-detect
                    provider_info = detect_email_provider(sender_email)

                # Send email using provider-specific settings
                is_zoho = provider_info.get('name') == 'zoho' if provider_info else False
                success, error = send_email_with_provider(
                    sender_email=sender_email,
                    password=password,
                    recipient_email=recipient["email"],
                    subject=personalized_subject,
                    body=personalized_body,
                    sender_name=sender_name,
                    provider_info=provider_info,
                    custom_smtp=custom_smtp
                )
                
                if success:
                    print(f"✓ Sent template email to {recipient['email']} via {sender_email}")
                    
                    # Update usage
                    sender_account['sent_today'] += 1
                    db.update_sender_usage(sender_email, 1)

                    # Increment progress
                    app_state.progress["sent"] += 1

                    # Save to database
                    if campaign_id:
                        try:
                            db.save_sent_email(
                                campaign_id=campaign_id,
                                recipient_email=recipient["email"],
                                recipient_name=recipient.get("name", ""),
                                recipient_position=recipient.get("position", ""),
                                sender_email=sender_email,
                                sender_name=sender_name,
                                subject=personalized_subject,
                                body=personalized_body,
                                template_used=recipient.get("position", "default"),
                                status='sent'
                            )
                            db.save_email_tracking(
                                campaign_id=campaign_id,
                                recipient_email=recipient["email"],
                                recipient_name=recipient.get("name", ""),
                                status='sent',
                                sender_email=sender_email
                            )
                            db.update_campaign_status(campaign_id, 'running', app_state.progress["sent"], app_state.progress.get("failed", 0))

                            if zoho_handler:
                                try:
                                    lead_data = {
                                        'first_name': name.split()[0] if name else 'Lead',
                                        'last_name': ' '.join(name.split()[1:]) if len(name.split()) > 1 else 'Contact',
                                        'email': recipient["email"],
                                        'company': company or 'No Company Provided',
                                        'description': f"Sent template-based email: {personalized_subject}\n\nPosition: {position}",
                                        'phone': phone or ''
                                    }
                                    try: z_user_id = int(user_id) if str(user_id).isdigit() else 1
                                    except: z_user_id = 1
                                    zoho_handler.create_lead_in_zoho(user_id=z_user_id, lead_data=lead_data)
                                except Exception: pass
                        except Exception as db_e:
                            print(f"⚠️ Warning: Database save failed: {db_e}")
                    
                    # Log file
                    try:
                        save_sent_email({
                            "timestamp": datetime.now().isoformat(),
                            "sender_email": sender_email,
                            "sender_name": sender_name,
                            "recipient_email": recipient["email"],
                            "subject": personalized_subject,
                            "body": personalized_body,
                            "first_name": recipient.get("name", "").split()[0] if recipient.get("name") else "",
                            "last_name": " ".join(recipient.get("name", "").split()[1:]) if recipient.get("name") else "",
                            "company": extract_company_from_email(recipient["email"]),
                            "phone": "",
                            "position": recipient.get("position", ""),
                            "template_used": recipient.get("position", "default") if template_data else "standard",
                            "provider": provider_info.get('name', 'unknown')
                        })
                    except Exception: pass

                else:
                    print(f"✗ Failed to send to {recipient['email']}: {error}")
                    app_state.progress["failed"] += 1
                    app_state.progress["failed_list"].append({
                        "email": recipient["email"],
                        "reason": error,
                        "error": error
                    })
                    
                    if campaign_id:
                        try:
                            db.save_sent_email(
                                campaign_id=campaign_id,
                                recipient_email=recipient["email"],
                                recipient_name=recipient.get("name", ""),
                                recipient_position=recipient.get("position", ""),
                                sender_email=sender_email,
                                sender_name=sender_name,
                                subject=personalized_subject,
                                body=personalized_body,
                                template_used=recipient.get("position", "default"),
                                status='failed',
                                error_message=error
                            )
                        except Exception: pass
                    continue 
                
                # SMART DELAY (provider-aware)
                if i < len(recipients) - 1:
                    if is_zoho:
                        delay = random.uniform(4, 8)
                        print(f"⏳ [Zoho] Waiting {delay:.1f}s before next email...")
                        time.sleep(delay)
                        if (i + 1) % 10 == 0:
                            cooldown = random.uniform(60, 120)
                            print(f"🧊 [Zoho] Cooldown {cooldown:.1f}s after {i+1} emails to reduce throttle risk")
                            time.sleep(cooldown)
                    else:
                        delay = random.uniform(30, 60)
                        print(f"⏳ Waiting {delay:.1f}s before next email...")
                        time.sleep(delay)
                
            except Exception as e:
                print(f"✗ Error processing recipient {recipient['email']}: {e}")
                app_state.progress["failed"] += 1
                app_state.progress["failed_list"].append({
                    "email": recipient["email"],
                    "reason": "Processing error",
                    "error": str(e)
                })
                continue 
                
    except Exception as e:
        app_state.progress["status"] = f"error: {e}"
        if campaign_id:
            db.update_campaign_status(campaign_id, 'failed', app_state.progress["sent"], app_state.progress.get("failed", 0))
        return
    
    app_state.progress["status"] = "completed"
    if campaign_id:
        success_count = app_state.progress["sent"]
        failed_count = app_state.progress.get("failed", 0)
        status = 'completed' if app_state.progress["status"] != "paused_limit_reached" else 'paused'
        db.update_campaign_status(campaign_id, status, success_count, failed_count)
    
    print(f"🎉 Template email sending COMPLETED! Success: {app_state.progress['sent']}, Failed: {app_state.progress.get('failed', 0)}")
    if app_state.progress.get("failed", 0) > 0:
        print(f"Failed emails: {app_state.progress.get('failed_list', [])}")




def mark_email_as_read(sender_email, sender_password, email_id, provider=None, custom_imap=None):
    """Mark an email as read using appropriate IMAP server"""
    try:
        # Get provider configuration
        provider_info = None
        if provider == 'custom' and custom_imap:
            # Parse custom IMAP settings
            imap_parts = custom_imap.split(':')
            imap_server = imap_parts[0]
            imap_port = int(imap_parts[1]) if len(imap_parts) > 1 else 993
            use_ssl = len(imap_parts) > 2 and imap_parts[2].lower() == 'ssl'
        else:
            # Auto-detect or use specified provider
            provider_info = detect_email_provider(sender_email)
            imap_server = provider_info['imap_server']
            imap_port = provider_info['imap_port']
            use_ssl = provider_info.get('use_ssl', True)  # IMAP usually uses SSL
        
        # Connect to IMAP server
        if use_ssl:
            mail = imaplib.IMAP4_SSL(imap_server, imap_port)
        else:
            mail = imaplib.IMAP4(imap_server, imap_port)
            mail.starttls()
            
        mail.login(sender_email, sender_password)
        mail.select("inbox")
        
        # Mark email as read
        mail.store(email_id, '+FLAGS', '\\Seen')
        
        mail.close()
        mail.logout()
        return True
    except Exception as e:
        print(f"Error marking email as read for {sender_email}: {e}")
        return False


def check_email_replies(sender_email, sender_password, provider=None, custom_imap=None):
    """Check for UNREAD replies in the sender's inbox using appropriate IMAP server"""
    replies = []
    
    try:
        # Get provider configuration
        provider_info = None
        if provider == 'custom' and custom_imap:
            # Parse custom IMAP settings
            imap_parts = custom_imap.split(':')
            imap_server = imap_parts[0]
            imap_port = int(imap_parts[1]) if len(imap_parts) > 1 else 993
            use_ssl = len(imap_parts) > 2 and imap_parts[2].lower() == 'ssl'
        else:
            # Auto-detect or use specified provider
            provider_info = detect_email_provider(sender_email)
            imap_server = provider_info['imap_server']
            imap_port = provider_info['imap_port']
            use_ssl = provider_info.get('use_ssl', True)  # IMAP usually uses SSL
        
        print(f"Connecting to {imap_server}:{imap_port} for {sender_email}...")
        
        # Connect to IMAP server
        if use_ssl:
            mail = imaplib.IMAP4_SSL(imap_server, imap_port)
        else:
            mail = imaplib.IMAP4(imap_server, imap_port)
            mail.starttls()
        
        # Remove spaces from app password (Gmail adds spaces for readability)
        clean_password = sender_password.replace(" ", "").replace("-", "")
        
        mail.login(sender_email, clean_password)
        mail.select("inbox")
        
        # Search for UNREAD emails only
        status, messages = mail.search(None, "UNSEEN")
        email_ids = messages[0].split()
        
        print(f"Found {len(email_ids)} unread emails")
        
        # Get all unread emails
        for num in email_ids:
            status, data = mail.fetch(num, "(RFC822)")
            
            if status != "OK":
                continue
                
            msg = email.message_from_bytes(data[0][1])
            
            # Decode subject
            subject, encoding = decode_header(msg["Subject"])[0] if msg["Subject"] else ("", None)
            if isinstance(subject, bytes):
                subject = subject.decode(encoding if encoding else "utf-8")
            
            # Check if this is a reply (subject starts with "Re:") or related to our campaign
            is_reply = subject.lower().startswith("re:")
            
            # Check if this is a bounce message (common indicators)
            is_bounce = any(indicator in subject.lower() for indicator in [
                "delivery failure", "undeliverable", "returned mail", 
                "delivery status", "failure notice", "mailer-daemon"
            ])
            
            # Check if this is an auto-response (common indicators)
            is_auto_response = any(indicator in subject.lower() or 
                                  any(indicator in msg.get("Auto-Submitted", "").lower() or 
                                      indicator in msg.get("X-Auto-Response-Suppress", "").lower() 
                                      for indicator in ["auto", "automatic", "out of office", "ooo", "vacation"])
                                  for indicator in ["auto-reply", "autoreply", "automatic reply", "out of office", "vacation"])
            
            # Only process replies that aren't bounces and aren't auto-responses
            if (is_reply) and not is_bounce and not is_auto_response:
                # Get email body
                body = ""
                if msg.is_multipart():
                    for part in msg.walk():
                        content_type = part.get_content_type()
                        content_disposition = str(part.get("Content-Disposition"))
                        
                        if content_type == "text/plain" and "attachment" not in content_disposition:
                            body = part.get_payload(decode=True).decode(errors='ignore')
                            break
                else:
                    body = msg.get_payload(decode=True).decode(errors='ignore')
                
                # Get from address
                from_header = msg["From"]
                
                # Extract just the email address if it's in format "Name <email@example.com>"
                email_match = re.search(r'<(.+?)>', from_header)
                if email_match:
                    from_email = email_match.group(1)
                    from_name = from_header.split('<')[0].strip()
                else:
                    from_email = from_header
                    from_name = ""
                
                # Extract first and last name from the from header
                first_name, last_name = extract_name_from_email(from_header)
                
                # Extract phone number from body
                phone = extract_phone_number(body)
                
                # Extract company from email domain
                company = extract_company_from_email(from_email)
                
                replies.append({
                    "id": num.decode(),
                    "from": from_email,
                    "from_name": from_name,
                    "first_name": first_name,
                    "last_name": last_name,
                    "subject": subject,
                    "body": body,
                    "date": msg["Date"],
                    "phone": phone,
                    "company": company,
                    "provider": provider_info.get('name', 'unknown') if provider_info else 'unknown'
                })
        
        mail.close()
        mail.logout()
        
    except imaplib.IMAP4.error as e:
        print(f"IMAP authentication error for {sender_email}: {e}")
    except Exception as e:
        print(f"Error checking emails for {sender_email}: {e}")
    
    return replies









def update_email_status(campaign_id, recipient_email, status, bounce_reason=None):
    """Update email status in the database"""
    try:
        connection = db.get_connection()
        if connection:
            cursor = connection.cursor()
            
            # Check if record exists
            cursor.execute(
                "SELECT id FROM email_status WHERE campaign_id = ? AND recipient_email = ?",
                (campaign_id, recipient_email)
            )
            existing_record = cursor.fetchone()
            
            current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            if existing_record:
                # Update existing record
                if status == 'replied':
                    cursor.execute("""
                        UPDATE email_status 
                        SET email_replied = 1, reply_received_at = ?, status = 'replied', updated_at = ?
                        WHERE campaign_id = ? AND recipient_email = ?
                    """, (current_time, current_time, campaign_id, recipient_email))
                elif status == 'bounced':
                    cursor.execute("""
                        UPDATE email_status 
                        SET email_bounced = 1, bounce_reason = ?, status = 'bounced', updated_at = ?
                        WHERE campaign_id = ? AND recipient_email = ?
                    """, (bounce_reason, current_time, campaign_id, recipient_email))
                elif status == 'follow_up_sent':
                    cursor.execute("""
                        UPDATE email_status 
                        SET follow_up_sent = 1, follow_up_sent_at = ?, status = 'follow_up_sent', updated_at = ?
                        WHERE campaign_id = ? AND recipient_email = ?
                    """, (current_time, current_time, campaign_id, recipient_email))
            else:
                # Insert new record
                if status == 'sent':
                    cursor.execute("""
                        INSERT INTO email_status 
                        (campaign_id, recipient_email, email_sent, status)
                        VALUES (?, ?, 1, 'sent')
                    """, (campaign_id, recipient_email))
                elif status == 'replied':
                    cursor.execute("""
                        INSERT INTO email_status 
                        (campaign_id, recipient_email, email_sent, email_replied, reply_received_at, status)
                        VALUES (?, ?, 1, 1, ?, 'replied')
                    """, (campaign_id, recipient_email, current_time))
                elif status == 'bounced':
                    cursor.execute("""
                        INSERT INTO email_status 
                        (campaign_id, recipient_email, email_sent, email_bounced, bounce_reason, status)
                        VALUES (?, ?, 1, 1, ?, 'bounced')
                    """, (campaign_id, recipient_email, bounce_reason))
            
            connection.commit()
            return True
    except Exception as e:
        print(f"Error updating email status: {e}")
        return False
    finally:
        if connection:
            connection.close()

def check_email_bounces(sender_email, sender_password, provider=None, custom_imap=None):
    """Check for bounced emails in the sender's inbox with detailed classification"""
    bounced_emails = []
    
    try:
        # Get provider configuration
        provider_info = None
        if provider == 'custom' and custom_imap:
            # Parse custom IMAP settings
            imap_parts = custom_imap.split(':')
            imap_server = imap_parts[0]
            imap_port = int(imap_parts[1]) if len(imap_parts) > 1 else 993
            use_ssl = len(imap_parts) > 2 and imap_parts[2].lower() == 'ssl'
        else:
            # Check if provider name is given explicitly
            if provider and provider != 'auto':
                provider_config = get_provider_settings(provider)
                if provider_config:
                    provider_info = provider_config.copy()
            
            # Auto-detect if not found or auto
            if not provider_info:
                provider_info = detect_email_provider(sender_email)
                
            imap_server = provider_info['imap_server']
            imap_port = provider_info['imap_port']
            use_ssl = provider_info.get('use_ssl', True)

        print(f"Connecting to {imap_server}:{imap_port} for bounces check...")

        # Connect to IMAP server
        if use_ssl:
            mail = imaplib.IMAP4_SSL(imap_server, imap_port)
        else:
            mail = imaplib.IMAP4(imap_server, imap_port)
            mail.starttls()

        # Remove spaces from app password (Gmail adds spaces for readability)
        clean_password = sender_password.replace(" ", "").replace("-", "")
        
        mail.login(sender_email, clean_password)
        mail.select("inbox")
        
        # Search for all UNSEEN emails first, then filter for bounce patterns
        status, messages = mail.search(None, 'UNSEEN')
        email_ids = messages[0].split()
        
        print(f"Found {len(email_ids)} unread emails to check for bounces")
        
        for num in email_ids:
            status, data = mail.fetch(num, "(RFC822)")
            
            if status != "OK":
                continue
                
            msg = email.message_from_bytes(data[0][1])
            subject = msg["Subject"] or ""
            from_addr = msg.get("From", "").lower()
            body = ""
            html_body = ""
            
            # Extract email body (prefer text/plain, fallback to text/html stripped)
            if msg.is_multipart():
                for part in msg.walk():
                    content_type = part.get_content_type()
                    content_disposition = str(part.get("Content-Disposition"))
                    
                    if content_type == "text/plain" and "attachment" not in content_disposition:
                        body = part.get_payload(decode=True).decode(errors='ignore')
                        break
                    if content_type == "text/html" and "attachment" not in content_disposition and not html_body:
                        html_body = part.get_payload(decode=True).decode(errors='ignore')
            else:
                payload = msg.get_payload(decode=True)
                if payload:
                    body = payload.decode(errors='ignore')
            
            if not body and html_body:
                # crude HTML strip to get text
                body = re.sub(r'<[^>]+>', ' ', html_body)
            
            # Check if this is a bounce email
            subject_lower = subject.lower()
            body_lower = body.lower()
            
            # SKIP temporary delivery delays - these are NOT bounces
            if 'delay' in subject_lower or 'delayed' in subject_lower:
                print(f"Skipping temporary delay notification: {subject[:50]}...")
                continue
            
            # Only process failure and permanent error notifications
            if not ('failure' in subject_lower or 'failed' in subject_lower or 
                    'undeliverable' in subject_lower or 'undelivered' in subject_lower or
                    'returned' in subject_lower or 'error' in subject_lower):
                continue
            
            # Bounce email indicators - only for actual failures/bounces
            bounce_indicators = [
                'mailer-daemon' in from_addr,
                'postmaster' in from_addr,
                'delivery' in subject_lower and ('fail' in subject_lower or 'error' in subject_lower),
                'undeliverable' in subject_lower,
                'returned mail' in subject_lower,
                'failure notice' in subject_lower,
                'address not found' in body_lower,
                'user unknown' in body_lower,
                'recipient not found' in body_lower,
                'mailbox not found' in body_lower,
                'does not exist' in body_lower,
                'invalid recipient' in body_lower,
                '550 5.1.1' in body_lower,
                '550-5.1.1' in body_lower,
                'no such user' in body_lower,
                'mailbox unavailable' in body_lower
            ]
            
            # If this doesn't look like a bounce email, skip it
            if not any(bounce_indicators):
                continue
            
            print(f"Processing bounce email: {subject[:50]}...")
            
            # Use the improved extract_recipient_from_bounce function
            recipient_email = extract_recipient_from_bounce(body, subject)
            
            if recipient_email:
                # Classify the bounce type - only count HARD bounces (permanent failures)
                bounce_type = "unknown"
                bounce_reason = "Unknown bounce"
                
                # Hard bounce detection - permanent failures only
                hard_bounce_patterns = [
                    "user unknown", "recipient not found", "no such user", 
                    "invalid recipient", "mailbox not found", "address not found",
                    "does not exist", "550 5.1.1", "550-5.1.1", "550.5.1.1",
                    "invalid address", "bad destination", "unknown user",
                    "cannot route"
                ]
                
                is_hard_bounce = False
                for pattern in hard_bounce_patterns:
                    if pattern in subject_lower or pattern in body_lower:
                        bounce_type = "hard_bounce"
                        bounce_reason = "Email address does not exist"
                        is_hard_bounce = True
                        break
                
                # Only add if it's a confirmed hard bounce
                if is_hard_bounce:
                    bounced_emails.append({
                        "recipient_email": recipient_email.lower(),
                        "sender_email": sender_email.lower(),  # Track which sender account saw this bounce
                        "bounce_type": bounce_type,
                        "bounce_reason": bounce_reason,
                        "bounce_subject": subject,
                        "bounce_body_preview": body[:1000]
                    })
                    
                    print(f"Found {bounce_type} for {recipient_email}: {bounce_reason}")
                    
                    # Mark bounce email as read
                    mail.store(num, '+FLAGS', '\\Seen')
                else:
                    print(f"Bounce detected but not classified hard bounce: {subject} | {recipient_email}")
            else:
                print(f"Could not extract recipient from bounce: {subject[:80]}...")
        
        mail.close()
        mail.logout()
        
        # Log summary
        bounce_counts = {}
        for bounce in bounced_emails:
            bounce_type = bounce['bounce_type']
            bounce_counts[bounce_type] = bounce_counts.get(bounce_type, 0) + 1
        
        print(f"Bounce summary: {bounce_counts}")
        
    except Exception as e:
        print(f"Error checking email bounces: {e}")
        # import traceback
        # traceback.print_exc()
    
    return bounced_emails

def extract_recipient_from_bounce(body, subject):
    """Extract original recipient email from bounce message"""
    # Common patterns in bounce messages
    patterns = [
        r'Original-Recipient:\s*rfc822;\s*(.+)',
        r'Final-Recipient:\s*rfc822;\s*(.+)',
        r'to=<(.+?)>',
        r'for\s+<(.+?)>',
        r'for\s+(.+?@.+?\..+?)\s*[;,\n]',
        r'addressed to\s+(.+?@.+?\..+?)[\s<>]',
        r'recipient\s+address:\s*(.+?@.+?\..+?)[\s<>]',
        r'failed\s+recipient:\s*(.+?@.+?\..+?)[\s<>]',
        r'user\s+(.+?@.+?\..+?)\s+not',
        r'(.+?@.+?\..+?)\s+address not found',
        r'(.+?@.+?\..+?)\s+user unknown',
        r'<(.+?@.+?\..+?)>.*(?:not found|unknown|invalid)',
        r"wasn't delivered to\s+<?([^>\s]+@[^>\s]+)>?",
        r"couldn't be delivered to\s+<?([^>\s]+@[^>\s]+)>?",
        r"your message (?:couldn't|could not|wasn't) be delivered to\s+<?([^>\s]+@[^>\s]+)>?",
    ]
    
    combined_text = f"{subject} {body}"
    
    for pattern in patterns:
        match = re.search(pattern, combined_text, re.IGNORECASE)
        if match:
            email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', match.group(1))
            if email_match:
                return email_match.group(0).lower()
    
    return None

def get_campaign_email_status(campaign_id):
    """Get email status statistics for a campaign"""
    try:
        from database import db
        return db.get_campaign_email_stats(campaign_id)
    except Exception as e:
        print(f"Error in get_campaign_email_status: {e}")
        return {
            "stats": {'total': 0, 'sent': 0, 'bounced': 0, 'replied': 0, 'follow_up_sent': 0},
            "no_reply_emails": [],
            "bounced_emails": []
        }
    
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
            
            
            display_sender_name = account_sender_name or sender_name
            name = recipient.get("recipient_name", "") or "there"
            
            personalized_body = replace_name_placeholders(body, name)
            personalized_subject = replace_name_placeholders(subject, name)
            
            # Send follow-up email
            success, error = send_email_with_provider(
                sender_email=sender_email,
                password=password,
                recipient_email=recipient["recipient_email"],
                subject=personalized_subject,
                body=personalized_body,
                sender_name=display_sender_name
            )
            
            if not success:
               # Log failure but continue
               print(f"Failed to send follow-up email to {recipient['recipient_email']}: {error}")
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
                    error_message=str(error)
                )
            else:
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

                    
            
            app_state.progress["sent"] += 1
            
            # Small delay to avoid rate limiting
            time.sleep(0.1)
                
    except Exception as e:
        app_state.progress["status"] = f"error: {e}"
        return
    
    app_state.progress["status"] = "completed" 


def classify_email_responses(user_id="default_user"):
    """Classify emails into replies, non-replies, and bounces with better logic"""
    try:
        connection = db.get_connection()
        if not connection:
            return {"error": "Database connection failed"}
            
        cursor = connection.cursor()
        
        # Get user's actual ID
        if user_id == "default_user":
            actual_user_id = db.get_or_create_default_user()
        else:
            try:
                actual_user_id = int(user_id)
            except (ValueError, TypeError):
                actual_user_id = db.get_or_create_default_user()
        
        current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # First, check if we have any sent emails that need classification
        cursor.execute("""
            SELECT COUNT(*) as total_sent 
            FROM email_tracking et
            LEFT JOIN email_campaigns ec ON et.campaign_id = ec.id
            WHERE et.status = 'sent' 
            AND ec.user_id = ?
        """, (actual_user_id,))
        
        total_sent = cursor.fetchone()['total_sent']
        print(f"Found {total_sent} sent emails for user {actual_user_id}")
        
        # Get follow-up delay from settings
        settings = get_tracking_settings(user_id)
        follow_up_delay_days = settings.get('default_delay_days', 3)
        
        # Mark emails as no_reply if sent more than follow_up_delay_days ago with no response
        no_reply_threshold = (datetime.now() - timedelta(days=follow_up_delay_days)).strftime('%Y-%m-%d %H:%M:%S')
        
        print(f"No-reply threshold: {no_reply_threshold} (delay: {follow_up_delay_days} days)")
        
        # Check if classification_reason column exists
        cursor.execute("PRAGMA table_info(email_tracking)")
        columns = [column[1] for column in cursor.fetchall()]
        has_classification_reason = 'classification_reason' in columns
        
        # Update query to mark emails as no_reply
        if has_classification_reason:
            cursor.execute("""
                UPDATE email_tracking 
                SET status = 'no_reply', 
                    updated_at = ?, 
                    last_checked = ?,
                    classification_reason = 'No reply received within threshold period'
                WHERE status = 'sent' 
                AND sent_time < ?
                AND campaign_id IN (SELECT id FROM email_campaigns WHERE user_id = ?)
            """, (current_time, current_time, no_reply_threshold, actual_user_id))
        else:
            cursor.execute("""
                UPDATE email_tracking 
                SET status = 'no_reply', 
                    updated_at = ?, 
                    last_checked = ?
                WHERE status = 'sent' 
                AND sent_time < ?
                AND campaign_id IN (SELECT id FROM email_campaigns WHERE user_id = ?)
            """, (current_time, current_time, no_reply_threshold, actual_user_id))
        
        no_reply_updated = cursor.rowcount
        print(f"Marked {no_reply_updated} emails as no-reply")
        
        # Also check for any emails that should be considered for follow-up but aren't classified
        cursor.execute("""
            SELECT COUNT(*) as potential_followups
            FROM email_tracking et
            LEFT JOIN email_campaigns ec ON et.campaign_id = ec.id
            WHERE et.status IN ('sent', 'no_reply')
            AND et.reply_time IS NULL
            AND et.sent_time < ?
            AND ec.user_id = ?
        """, (no_reply_threshold, actual_user_id))
        
        potential_followups = cursor.fetchone()['potential_followups']
        print(f"Potential follow-up candidates: {potential_followups}")
        
        # Get classification statistics
        cursor.execute("""
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN et.status = 'sent' THEN 1 ELSE 0 END) as sent,
                SUM(CASE WHEN et.status = 'replied' THEN 1 ELSE 0 END) as replied,
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
            'bounced': stats_row['bounced'] if stats_row else 0,
            'no_reply': stats_row['no_reply'] if stats_row else 0
        }
        
        connection.commit()
        connection.close()
        
        return {
            "message": f"Email classification completed. Marked {no_reply_updated} as no-reply. Found {potential_followups} potential follow-up candidates.",
            "stats": stats,
            "no_reply_updated": no_reply_updated,
            "potential_followups": potential_followups
        }
        
    except Exception as e:
        print(f"Error in classify_email_responses: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}

def get_emails_for_follow_up(campaign_id=None, user_id="default_user"):
    """Get emails that need follow-up based on current time and settings"""
    try:
        connection = db.get_connection()
        if not connection:
            return []
            
        cursor = connection.cursor()
        
        # Get user's actual ID
        if user_id == "default_user":
            actual_user_id = db.get_or_create_default_user()
        else:
            try:
                actual_user_id = int(user_id)
            except (ValueError, TypeError):
                actual_user_id = db.get_or_create_default_user()
        
        # Get follow-up settings
        settings = get_tracking_settings(user_id)
        follow_up_delay_days = settings.get('default_delay_days', 3)
        max_follow_ups = settings.get('max_follow_ups', 3)
        
        # Calculate the threshold based on current time
        follow_up_threshold = (datetime.now() - timedelta(days=follow_up_delay_days)).strftime('%Y-%m-%d %H:%M:%S')
        
        print(f"Follow-up threshold: {follow_up_threshold} (delay: {follow_up_delay_days} days)")
        
        # Build query based on whether campaign_id is provided
        if campaign_id:
            query = """
                SELECT 
                    et.recipient_email,
                    et.recipient_name,
                    et.campaign_id,
                    ec.campaign_name,
                    et.sent_time,
                    et.status,
                    COUNT(fe.id) as follow_up_count
                FROM email_tracking et
                LEFT JOIN email_campaigns ec ON et.campaign_id = ec.id
                LEFT JOIN follow_up_emails fe ON et.recipient_email = fe.recipient_email 
                    AND fe.follow_up_campaign_id IN (
                        SELECT id FROM follow_up_campaigns 
                        WHERE original_campaign_id = et.campaign_id
                    )
                WHERE et.campaign_id = ? 
                AND et.status IN ('sent', 'no_reply')
                AND et.reply_time IS NULL
                AND et.sent_time < ?
                AND ec.user_id = ?
                GROUP BY et.recipient_email
                HAVING follow_up_count < ?
                ORDER BY et.sent_time ASC
            """
            params = (campaign_id, follow_up_threshold, actual_user_id, max_follow_ups)
        else:
            query = """
                SELECT 
                    et.recipient_email,
                    et.recipient_name,
                    et.campaign_id,
                    ec.campaign_name,
                    et.sent_time,
                    et.status,
                    COUNT(fe.id) as follow_up_count
                FROM email_tracking et
                LEFT JOIN email_campaigns ec ON et.campaign_id = ec.id
                LEFT JOIN follow_up_emails fe ON et.recipient_email = fe.recipient_email 
                    AND fe.follow_up_campaign_id IN (
                        SELECT id FROM follow_up_campaigns 
                        WHERE original_campaign_id = et.campaign_id
                    )
                WHERE et.status IN ('sent', 'no_reply')
                AND et.reply_time IS NULL
                AND et.sent_time < ?
                AND ec.user_id = ?
                GROUP BY et.recipient_email
                HAVING follow_up_count < ?
                ORDER BY et.sent_time ASC
            """
            params = (follow_up_threshold, actual_user_id, max_follow_ups)
        
        cursor.execute(query, params)
        emails = cursor.fetchall()
        connection.close()
        
        print(f"Found {len(emails)} emails for follow-up (threshold: {follow_up_threshold})")
        
        return [dict(email) for email in emails]
        
    except Exception as e:
        print(f"Error in get_emails_for_follow_up: {e}")
        return []

def schedule_follow_up_emails(campaign_id, follow_up_data, user_id="default_user"):
    """Schedule follow-up emails for non-responders"""
    try:
        connection = db.get_connection()
        if not connection:
            return {"success": False, "error": "Database connection failed"}
            
        cursor = connection.cursor()
        
        # Get user's actual ID
        if user_id == "default_user":
            actual_user_id = db.get_or_create_default_user()
        else:
            try:
                actual_user_id = int(user_id)
            except (ValueError, TypeError):
                actual_user_id = db.get_or_create_default_user()
        
        # Create follow-up campaign with user_id
        cursor.execute("""
            INSERT INTO follow_up_campaigns 
            (original_campaign_id, user_id, follow_up_name, follow_up_subject, 
             follow_up_body, sender_name, delay_days, max_follow_ups, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')
        """, (
            campaign_id,
            actual_user_id,  # ADDED: Include user_id
            follow_up_data.get('name', f"Follow-up for Campaign {campaign_id}"),
            follow_up_data['subject'],
            follow_up_data['body'],
            follow_up_data.get('sender_name', ''),
            follow_up_data.get('delay_days', 3),
            follow_up_data.get('max_follow_ups', 3)
        ))
        
        follow_up_campaign_id = cursor.lastrowid
        
        # Rest of the function remains the same...
        follow_up_emails = get_emails_for_follow_up(campaign_id, user_id)
        
        # Schedule follow-up emails
        scheduled_count = 0
        for email in follow_up_emails:
            scheduled_time = (datetime.now() + timedelta(days=follow_up_data.get('delay_days', 3))).strftime('%Y-%m-%d %H:%M:%S')
            
            cursor.execute("""
                INSERT INTO follow_up_emails 
                (follow_up_campaign_id, recipient_email, recipient_name, 
                 follow_up_number, scheduled_at, status)
                VALUES (?, ?, ?, 1, ?, 'scheduled')
            """, (
                follow_up_campaign_id,
                email['recipient_email'],
                email['recipient_name'],
                scheduled_time
            ))
            scheduled_count += 1
        
        # Update follow-up campaign status
        cursor.execute("""
            UPDATE follow_up_campaigns 
            SET status = 'scheduled' 
            WHERE id = ?
        """, (follow_up_campaign_id,))
        
        connection.commit()
        connection.close()
        
        return {
            "success": True,
            "follow_up_campaign_id": follow_up_campaign_id,
            "scheduled_count": scheduled_count,
            "message": f"Scheduled {scheduled_count} follow-up emails"
        }
        
    except Exception as e:
        print(f"Error in schedule_follow_up_emails: {e}")
        return {"success": False, "error": str(e)}

def process_scheduled_follow_ups(user_id="default_user"):
    """Process and send scheduled follow-up emails with current time checking"""
    try:
        connection = db.get_connection()
        if not connection:
            return {"error": "Database connection failed"}
            
        cursor = connection.cursor()
        
        # Get user's actual ID
        if user_id == "default_user":
            actual_user_id = db.get_or_create_default_user()
        else:
            try:
                actual_user_id = int(user_id)
            except (ValueError, TypeError):
                actual_user_id = db.get_or_create_default_user()
        
        # Get scheduled follow-ups that are due (using current time)
        current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        print(f"Checking for scheduled follow-ups at {current_time}")
        
        cursor.execute("""
            SELECT 
                fe.*,
                fc.follow_up_subject,
                fc.follow_up_body,
                fc.sender_name,
                fc.original_campaign_id,
                sa.email as sender_email,
                sa.password as sender_password
            FROM follow_up_emails fe
            JOIN follow_up_campaigns fc ON fe.follow_up_campaign_id = fc.id
            LEFT JOIN sender_accounts sa ON fc.user_id = sa.user_id
            WHERE fe.status = 'scheduled'
            AND fe.scheduled_at <= ?
            AND fc.user_id = ?
            LIMIT 50
        """, (current_time, actual_user_id))
        
        scheduled_follow_ups = cursor.fetchall()
        
        print(f"Found {len(scheduled_follow_ups)} scheduled follow-ups to process at {current_time}")
        
        sent_count = 0
        failed_count = 0
        
        for follow_up in scheduled_follow_ups:
            follow_up_dict = dict(follow_up)
            
            try:
                # Check if we have sender credentials
                if not follow_up_dict.get('sender_email') or not follow_up_dict.get('sender_password'):
                    print(f"No sender credentials for follow-up {follow_up_dict['id']}")
                    failed_count += 1
                    continue
                
                # Send follow-up email
                success, error = send_email_with_provider(
                    sender_email=follow_up_dict['sender_email'],
                    password=follow_up_dict['sender_password'],
                    recipient_email=follow_up_dict['recipient_email'],
                    subject=follow_up_dict['follow_up_subject'],
                    body=follow_up_dict['follow_up_body'],
                    sender_name=follow_up_dict.get('sender_name', 'Follow-up')
                )
                        
                if not success:
                    raise Exception(error)
                
                # Update status to sent with current time
                
                # Update status to sent with current time
                cursor.execute("""
                    UPDATE follow_up_emails 
                    SET status = 'sent', sent_at = ?
                    WHERE id = ?
                """, (current_time, follow_up_dict['id']))
                
                # Also update the main tracking status
                cursor.execute("""
                    UPDATE email_tracking 
                    SET status = 'follow_up_sent', 
                        last_checked = ?,
                        updated_at = ?
                    WHERE recipient_email = ? 
                    AND campaign_id = ?
                """, (current_time, current_time, follow_up_dict['recipient_email'], follow_up_dict['original_campaign_id']))
                
                sent_count += 1
                print(f"✓ Sent follow-up email to {follow_up_dict['recipient_email']} at {current_time}")
                
            except Exception as e:
                # Update status to failed
                cursor.execute("""
                    UPDATE follow_up_emails 
                    SET status = 'failed', error_message = ?
                    WHERE id = ?
                """, (str(e), follow_up_dict['id']))
                
                failed_count += 1
                print(f"✗ Failed to send follow-up to {follow_up_dict['recipient_email']}: {e}")
        
        connection.commit()
        connection.close()
        
        result_message = f"Processed {len(scheduled_follow_ups)} follow-ups at {current_time}: {sent_count} sent, {failed_count} failed"
        print(result_message)
        
        return {
            "success": True,
            "sent_count": sent_count,
            "failed_count": failed_count,
            "message": result_message
        }
        
    except Exception as e:
        print(f"Error in process_scheduled_follow_ups: {e}")
        return {"success": False, "error": str(e)}

def start_automated_follow_up_service(user_id="default_user"):
    """Start the automated follow-up service as a background thread"""
    def automated_service():
        while True:
            try:
                # Classify emails first
                classify_email_responses(user_id)
                
                # Process scheduled follow-ups
                result = process_scheduled_follow_ups(user_id)
                print(f"Automated follow-up service: {result.get('message', 'No action')}")
                
                # Get check interval from settings
                settings = get_tracking_settings(user_id)
                check_interval = settings.get('check_interval_hours', 6) * 3600  # Convert to seconds
                
                # Sleep for the check interval
                time.sleep(check_interval)
                
            except Exception as e:
                print(f"Error in automated follow-up service: {e}")
                time.sleep(300)  # Sleep 5 minutes on error
    
    # Start the service in a background thread
    import threading
    service_thread = threading.Thread(target=automated_service, daemon=True)
    service_thread.start()
    
    return {"message": "Automated follow-up service started"}   

def get_tracking_settings(user_id="default_user"):
    """Get automated follow-up settings from database"""
    try:
        connection = db.get_connection()
        if connection:
            cursor = connection.cursor()
            
            # Get user's actual ID
            if user_id == "default_user":
                actual_user_id = db.get_or_create_default_user()
            else:
                try:
                    actual_user_id = int(user_id)
                except (ValueError, TypeError):
                    actual_user_id = db.get_or_create_default_user()
            
            cursor.execute(
                "SELECT * FROM automated_follow_up_settings WHERE user_id = ?",
                (actual_user_id,)
            )
            settings = cursor.fetchone()
            
            if settings:
                return dict(settings)
            else:
                # Return default settings
                return {
                    "enabled": True,
                    "check_interval_hours": 6,
                    "default_delay_days": 3,
                    "max_follow_ups": 3,
                    "auto_stop_after_reply": True
                }
        else:
            return {
                "enabled": True,
                "check_interval_hours": 6,
                "default_delay_days": 3,
                "max_follow_ups": 3,
                "auto_stop_after_reply": True
            }
            
    except Exception as e:
        print(f"Error getting tracking settings: {e}")
        return {
            "enabled": True,
            "check_interval_hours": 6,
            "default_delay_days": 3,
            "max_follow_ups": 3,
            "auto_stop_after_reply": True
        }
    finally:
        if connection:
            connection.close() 

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
            
            
            display_sender_name = account_sender_name or sender_name
            name = "there"
            recipient_name = ""
            
            personalized_body = replace_name_placeholders(body, name)
            personalized_subject = replace_name_placeholders(subject, name)

            # Send email using provider-aware function
            success, error = send_email_with_provider(
                sender_email=sender_email,
                password=password,
                recipient_email=recipient_email,
                subject=personalized_subject,
                body=personalized_body,
                sender_name=display_sender_name
            )
            
            if not success:
                # Log failure
                print(f"Failed to send immediate follow-up email to {recipient_email}: {error}")
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
                    error_message=str(error)
                )
            else:
                # Update email status
                update_email_status(campaign_id, recipient_email, "follow_up_sent")
                
                # Save to sent_emails table
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
                    status='sent'
                )
                
                print(f"Sent immediate follow-up email to {recipient_email}")
                
            app_state.progress["sent"] += 1

            # Small delay to avoid rate limiting
            time.sleep(0.1)
                
    except Exception as e:
        app_state.progress["status"] = f"error: {e}"
        return
    
    app_state.progress["status"] = "completed"      

def extract_email_from_text(text):
    """Extract email address from text"""
    if not text:
        return None
    
    email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', text)
    return email_match.group(0).lower() if email_match else None                 


def send_email_with_provider(sender_email, password, recipient_email, subject, body, sender_name="", provider_info=None, custom_smtp=None, custom_imap=None):
    """Send email using the appropriate provider settings. Includes Zoho region/port fallbacks."""
    # Clean password (remove spaces/hyphens often found in app passwords)
    if password:
        password = password.replace(" ", "").replace("-", "")

    # Build candidate SMTP endpoints
    candidates = []
    try:
        if provider_info and provider_info.get('is_custom') and custom_smtp:
            # Custom provider settings
            smtp_parts = custom_smtp.split(':')
            host = smtp_parts[0]
            port = int(smtp_parts[1]) if len(smtp_parts) > 1 else 587
            ssl_flag = len(smtp_parts) > 2 and smtp_parts[2].lower() == 'ssl'
            candidates = [(host, port, ssl_flag)]
        else:
            # Use provided or detected provider settings
            if not provider_info:
                provider_info = detect_email_provider(sender_email)
            # Default candidate from provider
            candidates = [(provider_info.get('smtp_server'), provider_info.get('smtp_port'), provider_info.get('use_ssl', False))]

            # Special handling for Zoho: try multiple regional endpoints and ports
            if provider_info.get('name') == 'zoho':
                candidates = [
                    ('smtp.zoho.com', 587, False),
                    ('smtp.zoho.com', 465, True),
                    ('smtp.zoho.in', 587, False),
                    ('smtp.zoho.in', 465, True),
                    ('smtp.zoho.eu', 587, False),
                    ('smtp.zoho.eu', 465, True)
                ]
            elif provider_info.get('name') == 'gmail':
                # Ensure we try STARTTLS on 587 first, then SSL 465
                candidates = [
                    ('smtp.gmail.com', 587, False),
                    ('smtp.gmail.com', 465, True)
                ]

        # Prepare email message
        msg = MIMEMultipart()
        display_name = sender_name or sender_email.split('@')[0]
        msg['From'] = f"{display_name} <{sender_email}>"
        msg['To'] = recipient_email
        msg['Subject'] = subject
        html_body = body.replace('\n', '<br>\n')
        msg.attach(MIMEText(html_body, 'html'))

        last_error = None
        last_host = None
        last_port = None
        last_ssl = None
        for host, port, ssl_flag in candidates:
            try:
                if ssl_flag or port == 465:
                    server = smtplib.SMTP_SSL(host, port, timeout=30)
                else:
                    server = smtplib.SMTP(host, port, timeout=30)
                    try:
                        server.ehlo()
                        server.starttls()
                        server.ehlo()
                    except Exception:
                        pass

                server.login(sender_email, password)
                server.send_message(msg)
                server.quit()
                print(f"✅ Email sent to {recipient_email}")
                return True, None

            except smtplib.SMTPAuthenticationError as e:
                last_error = e
                last_host, last_port, last_ssl = host, port, ssl_flag
                try:
                    server.quit()
                except Exception:
                    pass
                continue
            except smtplib.SMTPException as e:
                last_error = e
                last_host, last_port, last_ssl = host, port, ssl_flag
                try:
                    server.quit()
                except Exception:
                    pass
                continue
            except Exception as e:
                last_error = e
                last_host, last_port, last_ssl = host, port, ssl_flag
                try:
                    server.quit()
                except Exception:
                    pass
                continue

        # If we reached here, all candidates failed
        if isinstance(last_error, smtplib.SMTPAuthenticationError):
            code = getattr(last_error, 'smtp_code', None)
            raw_err = getattr(last_error, 'smtp_error', b'')
            err_text = raw_err.decode('utf-8', errors='ignore') if isinstance(raw_err, (bytes, bytearray)) else str(raw_err)
            error_msg = f"Authentication failed for {sender_email}. "
            if provider_info and provider_info.get('requires_app_password'):
                error_msg += f"This provider requires an app-specific password. {provider_info.get('help', '')}"
            else:
                error_msg += "Please check your email and password."
            if code:
                error_msg += f" [code {code}]"
            if err_text:
                error_msg += f" - {err_text}"
            if last_host and last_port:
                proto = 'SSL' if last_ssl or last_port == 465 else 'STARTTLS'
                error_msg += f" (server {last_host}:{last_port} via {proto})"
            return False, error_msg
        elif isinstance(last_error, smtplib.SMTPException):
            details = f"SMTP error: {str(last_error)}"
            if last_host and last_port:
                proto = 'SSL' if last_ssl or last_port == 465 else 'STARTTLS'
                details += f" (server {last_host}:{last_port} via {proto})"
            return False, details
        else:
            details = f"Error sending email: {str(last_error) if last_error else 'Unknown error'}"
            if last_host and last_port:
                proto = 'SSL' if last_ssl or last_port == 465 else 'STARTTLS'
                details += f" (server {last_host}:{last_port} via {proto})"
            return False, details

    except Exception as outer_e:
        return False, f"Error preparing email: {str(outer_e)}"