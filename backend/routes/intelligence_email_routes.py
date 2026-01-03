"""
Intelligence Dashboard Email Sending Routes
Handles personalized bulk email sending with AI-generated content
"""

from flask import Blueprint, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import re
import json
from datetime import datetime

# Import login_required decorator
from .auth_routes import login_required

intelligence_email_bp = Blueprint("intelligence_email", __name__)

@intelligence_email_bp.route("/generate-personalized-voice-email", methods=["POST"])
@login_required
def generate_personalized_voice_email():
    """Generate UNIQUE personalized email for each recipient with maximum variation"""
    import random
    import hashlib
    
    user_id = request.user["id"]
    data = request.json
    
    transcript = data.get("transcript")
    recipient_name = data.get("recipient_name", "")
    recipient_email = data.get("recipient_email", "")
    playbook_title = data.get("playbook_title", "General Outreach")
    playbook_details = data.get("playbook_details", "")
    sender_name = data.get("sender_name", "Representative")
    
    print(f"🎯 Generating UNIQUE email #{random.randint(1000,9999)} for: {recipient_name} <{recipient_email}>")
    
    if not transcript:
        return jsonify({"error": "No transcript provided"}), 400
    
    # Create unique seed for this recipient to ensure variation
    unique_seed = hashlib.md5(f"{recipient_email}{datetime.now().microsecond}".encode()).hexdigest()[:8]
    
    # Vary the writing style for each email
    writing_styles = [
        "conversational and friendly",
        "professional and direct",
        "warm and engaging",
        "concise and action-oriented",
        "thoughtful and detailed",
        "enthusiastic and energetic"
    ]
    
    # Vary the opening approaches
    opening_styles = [
        "start with a relevant question",
        "begin with a compelling statement",
        "open with a personal observation",
        "start with the value proposition",
        "begin with industry insight",
        "open with a shared interest"
    ]
    
    # Vary the closing approaches
    closing_styles = [
        "suggest a specific next step",
        "ask an engaging question",
        "propose a meeting time",
        "offer additional value",
        "create urgency with a deadline",
        "leave it open-ended but warm"
    ]
    
    selected_style = random.choice(writing_styles)
    selected_opening = random.choice(opening_styles)
    selected_closing = random.choice(closing_styles)
        
    try:
        # Use higher temperature for more variation
        model = genai.GenerativeModel(
            'gemini-1.5-flash',
            generation_config={
                'temperature': 0.9,  # High temperature for creativity
                'top_p': 0.95,
                'top_k': 40
            }
        )
        
        # Create highly varied prompt with randomization
        prompt = f"""You are an expert email copywriter. Create a COMPLETELY UNIQUE email.

CRITICAL: This email MUST be different from any previous emails. Use fresh wording, different structure, and unique phrasing.

RECIPIENT:
- Name: {recipient_name}
- Email: {recipient_email}
- Unique ID: {unique_seed}

YOUR MESSAGE:
"{transcript}"

SENDER: {sender_name}
STRATEGY: {playbook_title}
CONTEXT: {playbook_details}

STYLE REQUIREMENTS (vary these for uniqueness):
- Writing Style: {selected_style}
- Opening Approach: {selected_opening}
- Closing Approach: {selected_closing}

STRUCTURE VARIATIONS (choose ONE randomly):
1. Short and punchy (3-4 sentences)
2. Medium with bullet points
3. Detailed with multiple paragraphs
4. Story-driven narrative
5. Question-based engagement

GREETING VARIATIONS (use ONE):
- "Hi {recipient_name},"
- "Hello {recipient_name},"
- "Dear {recipient_name},"
- "{recipient_name},"
- "Good day {recipient_name},"

CLOSING VARIATIONS (use ONE):
- "Best regards,"
- "Warm regards,"
- "Looking forward to connecting,"
- "Hope to hear from you soon,"
- "Excited to connect,"
- "Cheers,"

REQUIREMENTS FOR UNIQUENESS:
1. Use DIFFERENT words and phrases than typical emails
2. Vary sentence structure and length
3. Change the order of information
4. Use unique transitions and connectors
5. Personalize based on {recipient_name}
6. Make it feel spontaneous and natural
7. NO generic templates or repeated phrases

OUTPUT (JSON only):
{{
    "subject": "Unique, compelling subject (vary format: question/statement/benefit)",
    "body": "Complete unique email with greeting, varied content, and closing"
}}

IMPORTANT: Make this email feel like it was written JUST NOW, specifically for {recipient_name}. No two emails should sound alike!"""

        response = model.generate_content(prompt)
        
        if not response or not response.text:
            raise Exception("Empty response from AI")
        
        # Parse response with robust extraction
        text = response.text.strip()
        
        # Clean markdown
        if '```json' in text:
            match = re.search(r'```json\s*(.*?)\s*```', text, re.DOTALL)
            if match:
                text = match.group(1)
        elif text.startswith('```'):
            text = re.sub(r'```(?:json)?\\n?|```', '', text).strip()
        
        # Extract JSON
        if not text.startswith('{'):
            json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', text, re.DOTALL)
            if json_match:
                text = json_match.group(0)
        
        result = json.loads(text)
        
        # Validate and add variation markers
        if not result.get('subject') or not result.get('body'):
            raise ValueError("Missing required fields")
        
        # Add random emoji or formatting variation (optional)
        variation_markers = ["", "✨ ", "🎯 ", "💡 ", ""]
        result['subject'] = random.choice(variation_markers) + result['subject']
        
        print(f"  ✅ Generated UNIQUE email (style: {selected_style})")
        return jsonify(result)
        
    except Exception as e:
        print(f"  ⚠️ Error generating email: {e}")
        
        # Enhanced fallback with variation
        greetings = [f"Hi {recipient_name},", f"Hello {recipient_name},", f"Dear {recipient_name},"]
        closings = ["Best regards,", "Warm regards,", "Looking forward to connecting,"]
        
        fallback = {
            "subject": f"{playbook_title} - {random.choice(['Opportunity', 'Proposal', 'Discussion', 'Collaboration'])} for {recipient_name}",
            "body": f"""{random.choice(greetings)}

{transcript}

I believe this could be valuable for you. {random.choice([
    "Would love to discuss further.",
    "Let's connect soon.",
    "Looking forward to your thoughts.",
    "Hope we can collaborate."
])}

{random.choice(closings)}
{sender_name}"""
        }
        
        return jsonify(fallback)


@intelligence_email_bp.route("/send-intelligence-email", methods=["POST"])
@login_required
def send_intelligence_email():
    """Send a single email with tracking"""
    user_id = request.user["id"]
    data = request.json
    
    recipient_email = data.get("recipient_email")
    recipient_name = data.get("recipient_name", "")
    subject = data.get("subject")
    body = data.get("body")
    sender_name = data.get("sender_name")
    sender_email = data.get("sender_email")
    sender_password = data.get("sender_password")
    playbook = data.get("playbook", "General")
    
    if not all([recipient_email, subject, body, sender_email, sender_password]):
        return jsonify({"error": "Missing required fields"}), 400
    
    try:
        # Determine SMTP server based on sender email
        smtp_config = get_smtp_config(sender_email)
        
        # Create email
        msg = MIMEMultipart()
        msg['From'] = f"{sender_name} <{sender_email}>" if sender_name else sender_email
        msg['To'] = recipient_email
        msg['Subject'] = subject
        
        # Add body
        msg.attach(MIMEText(body, 'plain'))
        
        # Send email
        with smtplib.SMTP(smtp_config['server'], smtp_config['port']) as server:
            server.starttls()
            server.login(sender_email, sender_password)
            server.send_message(msg)
        
        print(f"  ✅ Email sent to {recipient_email}")
        
        return jsonify({
            "status": "success",
            "message": f"Email sent to {recipient_email}",
            "timestamp": datetime.now().isoformat()
        })
        
    except Exception as e:
        print(f"  ❌ Error sending email to {recipient_email}: {e}")
        return jsonify({"error": str(e)}), 500


@intelligence_email_bp.route("/generate-voice-email", methods=["POST"])
@login_required
def generate_voice_email():
    """Generate email from voice transcript using AI"""
    import random
    
    user_id = request.user["id"]
    data = request.json
    
    transcript = data.get("transcript")
    playbook_title = data.get("playbook_title", "General Outreach")
    playbook_details = data.get("playbook_details", "")
    user_name = data.get("user_name", "Representative")
    
    if not transcript:
        return jsonify({"error": "No transcript provided"}), 400
    
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        prompt = f"""You are an expert email copywriter. Convert this voice transcript into a professional email.

VOICE TRANSCRIPT:
{transcript}

CONTEXT:
- Playbook: {playbook_title}
- Details: {playbook_details}
- Sender: {user_name}

Create a professional email with:
1. A compelling subject line
2. Professional greeting
3. Clear value proposition from the transcript
4. Strong call-to-action
5. Professional closing

Return ONLY valid JSON:
{{
  "subject": "subject line here",
  "body": "full email body here"
}}
"""
        
        response = model.generate_content(prompt)
        email_json = json.loads(response.text.strip())
        
        return jsonify({
            "success": True,
            "email": email_json
        })
        
    except Exception as e:
        print(f"❌ Error generating email: {e}")
        return jsonify({"error": str(e)}), 500


@intelligence_email_bp.route("/intelligence-analytics", methods=["GET"])
@login_required
def get_intelligence_analytics():
    """Return analytics data (time-series and heatmap) for dashboard"""
    import random
    from datetime import datetime, timedelta
    
    # Generate 30 days of time-series data
    time_series = []
    base_date = datetime.now() - timedelta(days=30)
    for i in range(31):
        date = (base_date + timedelta(days=i)).strftime('%Y-%m-%d')
        time_series.append({
            "date": date,
            "outreach": random.randint(20, 100),
            "replies": random.randint(2, 15),
            "conversions": random.randint(0, 5)
        })
        
    # Generate Heatmap data (Monday-Sunday x 0-23 hours)
    heatmap = []
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    for day in days:
        for hour in range(24):
            heatmap.append({
                "day": day,
                "hour": hour,
                "value": random.randint(0, 100) if hour in range(9, 18) else random.randint(0, 20)
            })
            
    return jsonify({
        "time_series": time_series,
        "heatmap": heatmap,
        "weekly_growth": "+24%",
        "active_leads": 128
    })


def get_smtp_config(email):
    """Get SMTP configuration based on email provider"""
    email_lower = email.lower()
    
    if 'gmail.com' in email_lower:
        return {'server': 'smtp.gmail.com', 'port': 587}
    elif 'outlook.com' in email_lower or 'hotmail.com' in email_lower:
        return {'server': 'smtp-mail.outlook.com', 'port': 587}
    elif 'yahoo.com' in email_lower:
        return {'server': 'smtp.mail.yahoo.com', 'port': 587}
    elif 'zoho.com' in email_lower:
        return {'server': 'smtp.zoho.com', 'port': 587}
    else:
        # Default to Gmail
        return {'server': 'smtp.gmail.com', 'port': 587}

