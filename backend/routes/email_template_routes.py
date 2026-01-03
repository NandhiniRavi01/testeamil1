from flask import Blueprint, request, jsonify, send_file
import pandas as pd
import io
import threading
import time
import os
import re
import json
from datetime import datetime
from config import app_state
from database import db
from services.service import send_email_with_provider, detect_email_provider, get_provider_settings
from utils.helpers import extract_name_from_email
from routes.auth_routes import login_required
# Import zoho_handler for lead integration
try:
    from routes.zoho_routes import zoho_handler
except ImportError:
    zoho_handler = None

email_template_bp = Blueprint('email_template', __name__)

def run_template_campaign(user_id, subject_template, body_template, sender_data, recipients, email_col, campaign_id):
    """Background thread to send emails for template campaign"""
    try:
        app_state.progress["status"] = "running"
        sender_email = sender_data.get('email')
        app_password = sender_data.get('password')
        sender_name = sender_data.get('name')
        sender_phone = sender_data.get('phone')
        # Normalize provider names to known keys
        raw_provider = (sender_data.get('provider') or 'gmail').strip().lower()
        if raw_provider in ['google', 'gmail', 'g suite', 'gsuite']:
            email_provider = 'gmail'
        elif raw_provider in ['zoho', 'zoho mail', 'zoho-mail', 'zohomail']:
            email_provider = 'zoho'
        elif raw_provider in ['outlook', 'office365', 'o365', 'hotmail']:
            email_provider = 'outlook'
        else:
            email_provider = raw_provider or 'gmail'
        
        # Use specified provider or detect from email
        if email_provider == 'gmail':
            provider_info = get_provider_settings('gmail')
        elif email_provider == 'zoho':
            provider_info = get_provider_settings('zoho')
        else:
            provider_info = detect_email_provider(sender_email)

        print(f"📧 Provider: {email_provider} | Sender: {sender_email}")

        # Compute send delay from configured send rate (emails per minute) with provider-safe caps
        # Defaults to 120/min but capped per provider to avoid throttling/blocks
        safe_rate_caps = {
            'gmail': 120,
            'zoho': 100,
            'outlook': 100,
            'default': 120
        }
        try:
            requested_rate_pm = int(sender_data.get('send_rate', os.getenv('EMAIL_RATE_PER_MINUTE', '120')))
        except Exception:
            requested_rate_pm = 120
        rate_pm = min(requested_rate_pm, safe_rate_caps.get(email_provider, safe_rate_caps['default']))

        # Delay between sends; min 0.4s to stay under common provider burst limits
        send_delay = max(60.0 / max(rate_pm, 1), 0.4)
        
        for recipient in recipients:
            try:
                r_email = recipient.get(email_col, '')
                if not r_email or '@' not in str(r_email): 
                    continue
                
                # Create a context dictionary for placeholders
                context = {str(k).lower().strip().replace(' ', '_'): v for k, v in recipient.items()}
                
                # Add friendly aliases for recipient data
                r_name = context.get('name') or context.get('recipient_name') or context.get('recipient') or ""
                if not r_name:
                    r_name = extract_name_from_email(str(r_email))[0] or "there"
                
                # Map common recipient aliases
                context.update({
                    'name': r_name,
                    'recipient_name': r_name,
                    'email': r_email,
                })
                
                # Map position variants
                r_pos = context.get('position') or context.get('job_title') or context.get('role') or context.get('designation') or "professional"
                context.update({'position': r_pos, 'job_title': r_pos, 'role': r_pos, 'designation': r_pos})
                
                # Map company variants
                r_comp = context.get('company') or context.get('company_name') or context.get('organization') or context.get('business') or "your company"
                context.update({'company': r_comp, 'company_name': r_comp, 'organization': r_comp, 'business': r_comp})

                # Map SENDER info variants
                context.update({
                    'sender_name': sender_name,
                    'my_name': sender_name,
                    'sender_phone': sender_phone,
                    'my_phone': sender_phone,
                    'phone_number': sender_phone,
                    'sender_email': sender_email,
                    'my_email': sender_email
                })
                
                # Clean strings for replacement
                def clean_val(v):
                    return str(v) if not pd.isna(v) else ""

                # Robust Placeholder Replacement
                def smart_replace(text, ctx):
                    if not text: return ""
                    pattern = re.compile(r'\{\{\s*(.*?)\s*\}\}', re.IGNORECASE)
                    
                    def replace_match(match):
                        key = match.group(1).lower().replace(' ', '_')
                        return clean_val(ctx.get(key, match.group(0))) 
                    
                    return pattern.sub(replace_match, text)

                p_subject = smart_replace(subject_template, context)
                p_body = smart_replace(body_template, context)
                
                # Send email
                success, error = send_email_with_provider(
                    sender_email=sender_email,
                    password=app_password,
                    recipient_email=r_email,
                    subject=p_subject,
                    body=p_body,
                    sender_name=sender_name,
                    provider_info=provider_info
                )
                
                if success:
                    app_state.progress["sent"] += 1
                    # Save success to database
                    if campaign_id:
                        db.save_sent_email(
                            campaign_id=campaign_id,
                            recipient_email=r_email,
                            recipient_name=r_name,
                            recipient_position=r_pos,
                            sender_email=sender_email,
                            sender_name=sender_name,
                            subject=p_subject,
                            body=p_body,
                            template_used="Custom Template",
                            status='sent'
                        )
                        # ALSO save to tracking for analytics
                        try:
                            db.save_email_tracking(
                                campaign_id=campaign_id,
                                recipient_email=r_email,
                                recipient_name=r_name,
                                sender_email=sender_email,
                                status='sent'
                            )
                        except Exception as te:
                            print(f"Warning: tracking save skipped for {r_email}: {te}")
                        
                        # INTEGRATE WITH ZOHO CRM
                        if zoho_handler:
                            try:
                                lead_data = {
                                    'first_name': r_name.split()[0] if r_name else 'Lead',
                                    'last_name': ' '.join(r_name.split()[1:]) if len(r_name.split()) > 1 else 'Contact',
                                    'email': r_email,
                                    'company': r_comp,
                                    'description': f"Sent email: {p_subject}\n\nPosition: {r_pos}",
                                    'phone': recipient.get('phone') or recipient.get('phone_number') or ''
                                }
                                # Fallback for user_id
                                try:
                                    z_user_id = int(user_id) if str(user_id).isdigit() else 1
                                except:
                                    z_user_id = 1
                                    
                                z_success, z_msg = zoho_handler.create_lead_in_zoho(user_id=z_user_id, lead_data=lead_data)
                                if z_success:
                                    print(f"Lead added to Zoho for {r_email}")
                                else:
                                    print(f"Failed to add lead to Zoho for {r_email}: {z_msg}")
                            except Exception as ze:
                                print(f"Zoho integration error for {r_email}: {ze}")

                        db.update_campaign_status(campaign_id, 'running', app_state.progress["sent"], app_state.progress["failed"])
                else:
                    app_state.progress["failed"] += 1
                    print(f"Failed to send to {r_email}: {error}")
                    if campaign_id:
                        try:
                            db.save_email_tracking(
                                campaign_id=campaign_id,
                                recipient_email=r_email,
                                recipient_name=r_name,
                                sender_email=sender_email,
                                status='failed'
                            )
                        except Exception as te:
                            print(f"Warning: tracking save skipped for {r_email}: {te}")
                        db.update_campaign_status(campaign_id, 'running', app_state.progress["sent"], app_state.progress["failed"])
                    
            except Exception as e:
                print(f"Error in recipient loop for {recipient.get(email_col)}: {e}")
                app_state.progress["failed"] += 1
            
            # Rate control to balance speed and deliverability
            time.sleep(send_delay)
            
        # Completion is handled by the orchestrator thread once all send threads finish
            
    except Exception as e:
        print(f"CRITICAL ERROR in template campaign thread: {e}")
        app_state.progress["status"] = f"error: {str(e)}"


def monitor_campaign_completion(threads, campaign_id):
    """Wait for all sender threads then mark campaign as completed."""
    for t in threads:
        t.join()

    # Avoid overwriting error state if a worker failed critically
    status = str(app_state.progress.get("status", "")).lower()
    if status.startswith("error"):
        return

    started_at = app_state.progress.get("started_at")
    duration_minutes = app_state.progress.get("duration_minutes", 0)
    if started_at:
        try:
            duration_minutes = round((time.time() - started_at) / 60, 2)
        except Exception:
            pass

    app_state.progress["duration_minutes"] = duration_minutes
    app_state.progress["ended_at"] = time.time()
    app_state.progress["status"] = "completed"
    if campaign_id:
        db.update_campaign_status(campaign_id, 'completed', app_state.progress["sent"], app_state.progress["failed"])

@email_template_bp.route("/validate-template", methods=["POST"])
@login_required
def validate_template():
    try:
        data = request.json
        subject = data.get('subject', '')
        body = data.get('body', '')
        if not subject or not body:
            return jsonify({"valid": False, "error": "Subject and Body are required"})
        return jsonify({"valid": True})
    except Exception as e:
        return jsonify({"valid": False, "error": str(e)})

@email_template_bp.route("/validate-excel", methods=["POST"])
@login_required
def validate_excel():
    try:
        if 'file' not in request.files:
            return jsonify({"valid": False, "error": "No file provided"})
        file = request.files['file']
        if file.filename == '':
            return jsonify({"valid": False, "error": "Empty filename"})
        if file.filename.endswith('.csv'):
            df = pd.read_csv(file)
        else:
            df = pd.read_excel(file)
        
        # Remove unnamed columns (from extra delimiters or empty columns)
        unnamed_cols = [col for col in df.columns if 'Unnamed' in str(col)]
        if unnamed_cols:
            df = df.drop(columns=unnamed_cols)
            print(f"🗑️ Removed unnamed columns: {unnamed_cols}")
        
        possible_email_cols = ['email', 'e-mail', 'mail', 'email address', 'contact email']
        email_col = next((col for col in df.columns if col.lower().strip() in possible_email_cols), None)
        if not email_col:
            for col in df.columns:
                if df[col].astype(str).str.contains('@').any():
                    email_col = col
                    break
        if not email_col:
            return jsonify({"valid": False, "error": "Email column not found"})
            
        total_rows = len(df)
        valid_recipients = df[email_col].dropna().nunique()
        sample = df.iloc[0].to_dict() if not df.empty else {}
        
        # Filter out empty/null values and unnamed columns from sample
        sample = {k: v for k, v in sample.items() 
                  if pd.notna(v) and str(v).strip() != '' and 'Unnamed' not in str(k)}
            
        return jsonify({
            "valid": True,
            "total_rows": total_rows,
            "valid_recipients": valid_recipients,
            "sample_recipient": sample,
            "email_column": email_col
        })
    except Exception as e:
        return jsonify({"valid": False, "error": str(e)})

@email_template_bp.route("/download-example", methods=["GET"])
@login_required
def download_example():
    try:
        df = pd.DataFrame(columns=['name', 'email', 'job_title', 'company_name'])
        df.loc[0] = ['John Doe', 'john@example.com', 'Senior Developer', 'Global Tech']
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Recipients')
        output.seek(0)
        return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', as_attachment=True, download_name='example_recipients.xlsx')
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@email_template_bp.route("/progress", methods=["GET"])
@login_required
def get_progress():
    started_at = app_state.progress.get("started_at")
    ended_at = app_state.progress.get("ended_at")

    # Always compute duration using ended_at when available; otherwise, use now if running
    duration_seconds = app_state.progress.get("duration_minutes", 0) * 60
    try:
        if started_at:
            if ended_at:
                duration_seconds = max(0, ended_at - started_at)
            else:
                duration_seconds = max(0, time.time() - started_at)
    except Exception:
        pass

    duration_minutes = round(duration_seconds / 60, 2) if duration_seconds else 0

    started_iso = None
    ended_iso = None
    try:
        if started_at:
            started_iso = datetime.fromtimestamp(started_at).isoformat()
        if ended_at:
            ended_iso = datetime.fromtimestamp(ended_at).isoformat()
    except Exception:
        pass

    return jsonify({
        "sent": app_state.progress.get("sent", 0),
        "failed": app_state.progress.get("failed", 0),
        "total": app_state.progress.get("total", 0),
        "status": app_state.progress.get("status", "idle"),
        "duplicates": app_state.progress.get("duplicates", 0),
        "invalid": app_state.progress.get("invalid", 0),
        "duration_minutes": duration_minutes,
        "duration_seconds": round(duration_seconds, 2) if duration_seconds else 0,
        "started_at": started_at,
        "ended_at": ended_at,
        "started_at_iso": started_iso,
        "ended_at_iso": ended_iso
    })

@email_template_bp.route("/send-campaign", methods=["POST"])
@login_required
def send_campaign():
    user_id = request.user["id"]
    try:
        campaign_title = request.form.get('campaign_title', '').strip()
        subject_template = request.form.get('subject_template')
        body_template = request.form.get('body_template')
        # Optional send rate (emails per minute). Fallback to env EMAIL_RATE_PER_MINUTE or 90.
        send_rate = request.form.get('send_rate', os.getenv('EMAIL_RATE_PER_MINUTE', '90'))

        # NEW: Support multiple sender accounts from frontend
        sender_accounts_raw = request.form.get('sender_accounts')
        accounts = []
        if sender_accounts_raw:
            try:
                parsed = json.loads(sender_accounts_raw)
                if isinstance(parsed, list):
                    for acc in parsed:
                        # Normalize provider per account
                        _raw_provider = (acc.get('emailProvider') or acc.get('provider') or 'gmail')
                        _raw_provider = str(_raw_provider).strip().lower()
                        if _raw_provider in ['google', 'gmail', 'g suite', 'gsuite']:
                            _provider = 'gmail'
                        elif _raw_provider in ['zoho', 'zoho mail', 'zoho-mail', 'zohomail']:
                            _provider = 'zoho'
                        elif _raw_provider in ['outlook', 'office365', 'o365', 'hotmail']:
                            _provider = 'outlook'
                        else:
                            _provider = _raw_provider or 'gmail'

                        accounts.append({
                            'name': acc.get('senderName') or acc.get('name') or '',
                            'phone': acc.get('senderPhone') or acc.get('phone') or '',
                            'email': acc.get('senderEmail') or acc.get('email') or '',
                            'password': acc.get('appPassword') or acc.get('password') or '',
                            'provider': _provider,
                            'daily_limit': int(acc.get('dailyLimit') or acc.get('daily_limit') or 0),
                            'send_rate': send_rate
                        })
                else:
                    # Single object fallback
                    _raw_provider = (parsed.get('emailProvider') or parsed.get('provider') or 'gmail')
                    _raw_provider = str(_raw_provider).strip().lower()
                    if _raw_provider in ['google', 'gmail', 'g suite', 'gsuite']:
                        _provider = 'gmail'
                    elif _raw_provider in ['zoho', 'zoho mail', 'zoho-mail', 'zohomail']:
                        _provider = 'zoho'
                    elif _raw_provider in ['outlook', 'office365', 'o365', 'hotmail']:
                        _provider = 'outlook'
                    else:
                        _provider = _raw_provider or 'gmail'

                    accounts.append({
                        'name': parsed.get('senderName') or parsed.get('name') or '',
                        'phone': parsed.get('senderPhone') or parsed.get('phone') or '',
                        'email': parsed.get('senderEmail') or parsed.get('email') or '',
                        'password': parsed.get('appPassword') or parsed.get('password') or '',
                        'provider': _provider,
                        'daily_limit': int(parsed.get('dailyLimit') or parsed.get('daily_limit') or 0),
                        'send_rate': send_rate
                    })
            except Exception as je:
                print(f"Failed to parse sender_accounts: {je}")

        # LEGACY: Fallback to single account fields for backward compatibility
        if not accounts:
            # Legacy single-account fields
            _raw_provider = request.form.get('email_provider', 'gmail')
            _raw_provider = str(_raw_provider).strip().lower()
            if _raw_provider in ['google', 'gmail', 'g suite', 'gsuite']:
                email_provider = 'gmail'
            elif _raw_provider in ['zoho', 'zoho mail', 'zoho-mail', 'zohomail']:
                email_provider = 'zoho'
            elif _raw_provider in ['outlook', 'office365', 'o365', 'hotmail']:
                email_provider = 'outlook'
            else:
                email_provider = _raw_provider or 'gmail'
            accounts = [{
                'name': request.form.get('sender_name') or '',
                'phone': request.form.get('sender_phone') or '',
                'email': request.form.get('sender_email') or '',
                'password': request.form.get('app_password') or '',
                'provider': email_provider,
                'daily_limit': int(request.form.get('daily_limit') or 0),
                'send_rate': send_rate
            }]
        file = request.files.get('file')
        
        if file.filename.endswith('.csv'):
            df = pd.read_csv(file)
        else:
            df = pd.read_excel(file)
        
        # Remove unnamed columns (from extra delimiters or empty columns)
        unnamed_cols = [col for col in df.columns if 'Unnamed' in str(col)]
        if unnamed_cols:
            df = df.drop(columns=unnamed_cols)
            print(f"🗑️ Removed unnamed columns: {unnamed_cols}")
            
        email_col = next((col for col in df.columns if col.lower().strip() in ['email', 'mail', 'e-mail']), None)
        if not email_col:
            for col in df.columns:
                if df[col].astype(str).str.contains('@').any():
                    email_col = col
                    break
        
        # Deduplicate and validate recipients
        recipients_raw = df.to_dict('records')
        seen_emails = set()
        unique_recipients = []
        duplicates_count = 0
        invalid_count = 0

        for rec in recipients_raw:
            email_val = rec.get(email_col, '')
            if not email_val or '@' not in str(email_val):
                invalid_count += 1
                continue

            normalized_email = str(email_val).strip().lower()
            if normalized_email in seen_emails:
                duplicates_count += 1
                continue

            seen_emails.add(normalized_email)
            unique_recipients.append(rec)

        recipients = unique_recipients

        now_ts = time.time()
        app_state.progress = {
            "sent": 0,
            "failed": 0,
            "total": len(recipients),
            "status": "initializing",
            "duplicates": duplicates_count,
            "invalid": invalid_count,
            "duration_minutes": 0,
            "started_at": now_ts,
            "ended_at": None
        }
        
        # IMPROVED: Name campaign after filename and subject
        display_filename = file.filename if file else "recipients.csv"
        
        # Use campaign_title if provided, otherwise fallback to filename + subject
        if campaign_title:
            campaign_name = campaign_title
        else:
            campaign_name = f"{display_filename} | {subject_template[:30]}"
            if len(subject_template) > 30: campaign_name += "..."
            if not subject_template.strip():
                campaign_name = f"{display_filename} | {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        
        batch_size = int(request.form.get('batch_size', 250))
        
        # Save file info to database so it shows in campaign history
        file_id = None
        if file:
            try:
                file_id = db.save_uploaded_file(
                    user_id=user_id,
                    filename=file.filename,
                    original_filename=file.filename,
                    file_size=0,  # Approximate
                    file_type="text/csv" if file.filename.endswith('.csv') else "spreadsheet",
                    total_records=len(recipients),
                    column_count=len(df.columns),
                    row_count=len(df),
                    file_data=None
                )
            except Exception as fe:
                print(f"Error saving file info: {fe}")

        campaign_id = db.create_email_campaign(user_id, file_id, campaign_name, len(recipients), batch_size, True)
        
        # Distribute recipients across accounts based on daily limits
        # If no limits provided, use a simple round-robin across accounts
        remaining = list(recipients)
        start_idx = 0
        threads = []

        # Compute per-account allocation counts
        if any(acc.get('daily_limit', 0) > 0 for acc in accounts):
            for acc in accounts:
                quota = acc.get('daily_limit', 0)
                if quota <= 0:
                    continue
                if start_idx >= len(remaining):
                    break
                assigned = remaining[start_idx:start_idx + quota]
                start_idx += quota
                if not assigned:
                    continue
                t = threading.Thread(
                    target=run_template_campaign,
                    args=(user_id, subject_template, body_template, acc, assigned, email_col, campaign_id)
                )
                t.daemon = True
                t.start()
                threads.append(t)
        else:
            # Round-robin with equal split
            if not accounts:
                return jsonify({"success": False, "error": "No sender accounts provided"})
            acc_index = 0
            buckets = [[] for _ in accounts]
            for r in remaining:
                buckets[acc_index].append(r)
                acc_index = (acc_index + 1) % len(accounts)
            for acc, bucket in zip(accounts, buckets):
                if not bucket:
                    continue
                t = threading.Thread(
                    target=run_template_campaign,
                    args=(user_id, subject_template, body_template, acc, bucket, email_col, campaign_id)
                )
                t.daemon = True
                t.start()
                threads.append(t)

        # Mark completion only after all worker threads have finished
        if threads:
            monitor = threading.Thread(target=monitor_campaign_completion, args=(threads, campaign_id))
            monitor.daemon = True
            monitor.start()
        
        return jsonify({"success": True, "message": "Campaign started", "campaign_id": campaign_id, "accounts_used": len(accounts)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})
