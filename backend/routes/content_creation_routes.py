"""
Content Creation Routes
Handles AI-powered email content generation with Gemini Multi-Key Rotation
"""

from flask import Blueprint, request, jsonify
import google.generativeai as genai
import os
import json
import re
import time
from routes.auth_routes import login_required

content_creation_bp = Blueprint("content_creation", __name__)

import random

from dotenv import load_dotenv

load_dotenv() # Ensure env vars are loaded

# Helper to get all available Gemini keys for rotation
def get_gemini_keys():
    keys = []
    # Check primary key
    primary = os.getenv("GEMINI_API_KEY")
    if primary: keys.append(primary)
    
    # Check for rotated keys (GEMINI_API_KEY_1 to GEMINI_API_KEY_10)
    for i in range(1, 11):
        k = os.getenv(f"GEMINI_API_KEY_{i}")
        if k: keys.append(k)
        
    return list(dict.fromkeys(keys)) # Remove duplicates while preserving order

# Initialize check
valid_keys = get_gemini_keys()
if valid_keys:
    print(f"✅ Loaded {len(valid_keys)} Gemini API Keys for rotation.")
else:
    print("⚠️ No Gemini API Keys found in .env")


def generate_with_gemini(instruction, tone, length, sender_name):
    """Generate professional content using Gemini AI with Key Rotation"""
    try:
        # Length mapping
        length_guide = {
            'Short': '2-3 sentences, high-impact',
            'Medium': '5-7 sentences, comprehensive',
            'Long': '12+ sentences, detailed enterprise proposal'
        }

        # Tone mapping
        tone_guide = {
            'Professional': 'formal, industry-standard, respectful',
            'Friendly': 'warm, conversational, accessible',
            'Sales Oriented': 'persuasive, KPI-driven, results-focused',
            'Thought-Leader': 'authoritative, visionary, insightful',
            'Urgent / FOMO': 'time-critical, high-priority, exclusive',
            'Cold Outreach': 'curiosity-driven, value-first, non-invasive'
        }

        # Priority: Flash models are faster and often have separate quotas
        models_to_try = [
            'gemini-1.5-flash',
            'gemini-2.0-flash',
            'gemini-1.5-pro',
            'gemini-pro',
            'gemini-2.0-flash-lite'
        ]

        # Get fresh list of keys
        api_keys = get_gemini_keys()
        if not api_keys:
            return { 'success': False, 'error': "No GEMINI_API_KEY found. Please add to .env" }

        last_error = None
        
        # KEY ROTATION LOOP
        for key_index, api_key in enumerate(api_keys):
            try:
                # Configure with current key
                genai.configure(api_key=api_key)
                masked_key = f"{api_key[:4]}...{api_key[-4:]}"
                
                # MODEL FALLBACK LOOP (per key)
                for model_name in models_to_try:
                    try:
                        print(f"🔄 Forging with Key {key_index+1} ({masked_key}) | Model: {model_name}...")
                        model = genai.GenerativeModel(
                            model_name,
                            generation_config={
                                'temperature': 0.88,
                                'top_p': 0.9,
                                'top_k': 32,
                            }
                        )

                        prompt = f"""Task: Write a high-quality email OR document based STRICTLY on the user's request.

CONTEXT:
Instruction: {instruction}
Tone: {tone_guide.get(tone, 'Professional')}

ADAPTIVE LOGIC:
1. DETECT INTENT:
   - If the instruction is for a Birthday, Holiday, Thank You, or Personal matter -> Write a WARM, PERSONAL message.
   - If the instruction is for a Document (Resume, CV, Essay, Plan) -> Write the CONTENT of that document in the body.
   - If the instruction is for Sales, Job, Meeting, or Business -> Write a PROFESSIONAL, CORPORATE email.

2. STRUCTURE:
   - Paragraph 1: Direct opening regarding "{instruction}" with professional context.
   - Paragraph 2: Comprehensive details, explaining value or methodology related to "{instruction}".
   - Paragraph 3: Clear next steps or call to action.

3. CONSTRAINTS:
   - MANDATORY GREETING (for emails): Start with "Hello {{{{name}}}},".
   - MANDATORY SIGN-OFF (for emails): End with "Regards,\\n{{{{sender_name}}}}\\n{{{{phone_number}}}}".
   - CRITICAL: Do NOT "invent" a corporate scenario unless the user ASKS for business context.
   - PRESERVE PLACEHOLDERS: Use {{{{name}}}}, {{{{sender_name}}}}, {{{{phone_number}}}} exactly (double curly braces).
   - LENGTH: Write 3-4 DETAILED paragraphs. The user wants DEPTH and SUBSTANCE.
   - If the input is simple (e.g., "web scraping"), EXPAND on it (e.g., "Web scraping is a powerful tool for market intelligence...").

OUTPUT JSON:
{{
    "subject": "Relevant subject line",
    "body": "The email/document content"
}}"""

                        response = model.generate_content(prompt)
                        text = response.text.strip()

                        # Robust JSON extraction
                        if '```json' in text:
                            text = text.split('```json')[1].split('```')[0].strip()
                        elif '{' in text:
                            text = text[text.find('{'):text.rfind('}')+1]

                        result = json.loads(text)
                        
                        return {
                            'success': True,
                            'subject': result.get('subject', f"Regarding {instruction[:20]}"),
                            'body': result.get('body', "Content error"),
                            'provider': f'Gemini ({model_name})'
                        }

                    except Exception as e:
                        err_msg = str(e)
                        is_quota = "429" in err_msg or "quota" in err_msg.lower() or "exhausted" in err_msg.lower()
                        
                        if is_quota:
                            print(f"⚠️ Quota exceeded on Key {key_index+1} with {model_name}. Trying next model/key...")
                            last_error = f"Quota Exceeded ({model_name})"
                            continue # Try next model with same key first
                        else:
                            print(f"⚠️ Failed with {model_name}: {err_msg}")
                            last_error = err_msg
                            continue # Try next model
                
                # If we exhausted models for this key, try next key (outer loop)
                print(f"⚠️ All models exhausted for Key {key_index+1}. Switching keys...")
                
            except Exception as e:
                # Configuration error or other key request failed
                print(f"❌ Key {key_index+1} failed completely: {e}")
                continue

        # OFFLINE FALLBACK MODE
        return generate_offline_content(instruction, sender_name)

    except Exception as e:
        print(f"⚠️ Critical Gemini Error: {e}")
        return { 'success': False, 'error': str(e) }

SPAM_MAP = {
    'free': 'complementary',
    'winner': 'selected candidate',
    'won': 'selected',
    'cash': 'financial assistance',
    '$': 'funds',
    'prize': 'reward',
    'congratulations': 'good news',
    'urgent': 'time-sensitive',
    'act now': 'consider today',
    'limited time': 'exclusive',
    'click here': 'visit our link',
    'buy now': 'get started',
    'guarantee': 'assurance',
    'earn money': 'revenue generation',
    'make money': 'growth opportunity',
    'work from home': 'remote-first',
    'deal': 'offer',
    'million': 'significant sum',
    '100%': 'full',
    '#1': 'leading',
    '$$$': 'value',
    'credit': 'financing',
    'debt': 'financial obligation',
    'income': 'earnings',
    'investment': 'opportunity',
    'casino': 'gaming',
    'lottery': 'program',
    'bank account': 'secure portal',
    'verify': 'confirm identity'
}

def generate_offline_content(instruction, sender_name):
    """Generate professional, long-from content when AI is offline.
    Uses extensive templates with 3-4 paragraphs for depth.
    NOTE: Quadruple braces {{{{{{name}}}}}} represent double braces {{{{name}}}} in f-strings."""
    # Sanitize and Format Instruction
    instruction_clean = instruction.strip()
    if instruction_clean.isupper() or instruction_clean.islower():
        instruction_clean = instruction_clean.title()
    instruction_lower = instruction.lower()
    
    # LONG-FORM Template Library
    templates = {
        'sales': [
            {
                'subject': f"Strategic partnership opportunity: {instruction_clean}",
                'body': f"""Hello {{{{name}}}},

I am writing to you today because I have been closely following your company's recent developments and noticed your team's increasing focus on {instruction_clean}. In the current market landscape, staying ahead in this specific area is crucial for maintaining a competitive edge, and we have identified several key strategies that could significantly accelerate your progress.

Our company specializes in helping businesses like yours scale effectively by providing specialized tools and high-level strategic insights that drive operational efficiency. We have recently worked with similar organizations to optimize their output, resulting in a measurable increase in their quarterly performance metrics. We believe our proprietary solution could be the catalyst your team needs to exceed its current Q4 goals.

I would value the opportunity to share a few specific case studies that are relevant to your current objectives. Are you open to a brief 10-minute chat next week to discuss how we can support your growth?

Regards,
{{{{sender_name}}}}
{{{{phone_number}}}}"""
            },
            {
                'subject': f"Question regarding your strategy for {instruction_clean}",
                'body': f"""Hello {{{{name}}}},

I hope you are having a productive week. I recently came across your firm's work related to {instruction_clean} and was impressed by the innovative approach you are taking. It is clear that your team is committed to excellence, and I wanted to reach out to suggest a potential collaboration that could further enhance your capabilities in this domain.

We have helped numerous industry leaders streamline their workflows and unlock new revenue streams by implementing our advanced optimization framework. I am confident that we can bring a similar level of value to your organization, specifically addressing the unique challenges associated with {instruction_clean}. Our goal is to provide you with the resources needed to not just meet, but surpass your targets.

Could we schedule a short call to explore this further? I would love to walk you through a quick demonstration of exactly how we can help.

Regards,
{{{{sender_name}}}}
{{{{phone_number}}}}"""
            }
        ],
        'job': [
            {
                'subject': f"Application for the {instruction_clean} position",
                'body': f"""Hello {{{{name}}}},

I am writing to formally express my strong interest in the {instruction_clean} opportunity at your company. Having followed your organization's trajectory for some time, I have always admired your commitment to innovation and excellence. After reviewing the job description, I am thrilled to see how well my background aligns with the specific requirements and goals of your team.

Throughout my career, I have honed the skills necessary to succeed in this role, specifically in relation to the core responsibilities outlined in your listing. I have a proven track record of delivering high-quality results in fast-paced environments, and I am eager to bring my expertise in {instruction_clean} to your organization. I am particularly drawn to your company's culture of collaboration and forward-thinking.

I would welcome the chance to discuss how my unique experience and technical skills can contribute to your team's continued success. Thank you for your time and consideration.

Regards,
{{{{sender_name}}}}
{{{{phone_number}}}}"""
            },
            {
                'subject': f"Regarding the open {instruction_clean} role",
                'body': f"""Hello {{{{name}}}},

I recently discovered the opening for the {instruction_clean} role within your team and felt compelled to reach out. As a dedicated professional with a deep passion for this field, I believe my practical experience and strategic mindset make me an ideal candidate for this position. Your company's reputation for industry leadership is exactly the kind of environment where I thrive.

In my previous roles, I have consistently demonstrated the ability to solve complex problems and drive meaningful project outcomes. I am confident that my hands-on experience with {instruction_clean} would allow me to hit the ground running and make an immediate positive impact on your team's productivity. I am looking for a long-term opportunity where I can grow with the company.

I have attached my resume for your review and would love to discuss my qualifications in more detail. Are you available for a brief conversation later this week?

Regards,
{{{{sender_name}}}}
{{{{phone_number}}}}"""
            }
        ],
        'meeting': [
            {
                'subject': f"Requesting a sync to discuss {instruction_clean}",
                'body': f"""Hello {{{{name}}}},

I hope this email finds you well. I am reaching out to request a meeting to discuss {instruction_clean} in more detail. As we move forward with our current initiatives, I believe it is critical that we align our strategies to ensure we are maximizing our collective potential.

A short synchronization would be incredibly beneficial for both of our teams. It would provide us with the platform to address any outstanding questions, clarify our next steps, and establish a clear timeline for the project's completion. Your input on this matter would be highly valuable, and I want to ensure we are completely on the same page.

Please let me know what time works best for your schedule. I am flexible and happy to work around your availability.

Regards,
{{{{sender_name}}}}
{{{{phone_number}}}}"""
            }
        ],

        'personal': [
            {
                'subject': f"{instruction_clean}",
                'body': f"""Hello {{{{name}}}},

I wanted to send a quick note regarding {instruction_clean}.

I hope you are having a wonderful day!

Regards,
{{{{sender_name}}}}
{{{{phone_number}}}}"""
            },
            {
                'subject': f"Thinking of you - {instruction_clean}",
                'body': f"""Hello {{{{name}}}},

Writing to you today regarding: {instruction_clean}.

Wishing you all the best!

Regards,
{{{{sender_name}}}}
{{{{phone_number}}}}"""
            }
        ],
        'default': [
            {
                'subject': f"Strategic discussion: {instruction_clean}",
                'body': f"""Hello {{{{name}}}},

I am writing to you today regarding {instruction_clean}, a topic that is becoming increasingly critical in our current landscape. I have been following your work and believe that a deeper focus on this area could yield significant benefits for your organization.

We have specialized expertise in {instruction_clean} and have helped numerous partners optimize their approach to maximize efficiency and results. Whether it involves streamlining current processes, implementing new technologies, or simply re-evaluating strategic goals, we are confident that our insights can provide substantial value.

I would love to schedule a brief time to connect and share some specific case studies where we have successfully implemented these strategies. Please let me know if you have any availability next week for a quick conversation.

Regards,
{{{{sender_name}}}}
{{{{phone_number}}}}"""
            },
            {
                'subject': f"Regarding your initiatives on {instruction_clean}",
                'body': f"""Hello {{{{name}}}},

I hope you are having a productive week. I am reaching out to discuss {instruction_clean} and how it fits into your broader objectives for the coming quarter.

In my experience, effectively leveraging {instruction_clean} is often the differentiator between maintaining the status quo and achieving breakout growth. We have developed a comprehensive framework designed to address the common challenges associated with this, ensuring that your team can focus on what matters most—driving innovation and value.

I would appreciate the opportunity to walk you through our methodology and discuss how it might be tailored to your specific needs. Are you open to a 10-minute introductory call this Tuesday or Thursday?

Regards,
{{{{sender_name}}}}
{{{{phone_number}}}}"""
            }
        ]
    }
    
    # Select template category based on keywords
    selected_key = 'default'
    if any(k in instruction_lower for k in ['sale', 'offer', 'buy', 'product', 'service']):
        selected_key = 'sales'
    elif any(k in instruction_lower for k in ['job', 'hiring', 'career', 'resume', 'apply']):
        selected_key = 'job'
    elif any(k in instruction_lower for k in ['meet', 'chat', 'call', 'sync', 'discuss']):
        selected_key = 'meeting'
    elif any(k in instruction_lower for k in ['birthday', 'wish', 'happy', 'congratulation', 'sorry', 'love']):
        selected_key = 'personal'
        
    # Randomly select a variation
    template = random.choice(templates[selected_key])
    
    return {
        'success': True,
        'subject': template['subject'],
        'body': template['body'],
        'provider': f'Smart Offline Mode ({selected_key.title()} V{random.randint(1,9)})'
    }

def analyze_spam_offline(subject, body):
    """Perform local spam analysis without AI. 
    Dynamic scoring based on actual content and structure."""
    content = (subject + " " + body).lower()
    
    found_spam_words = []
    base_score = 0
    suggestions = []
    
    # 1. Text Analysis - Check for spam trigger words
    for spam_word, alternative in SPAM_MAP.items():
        if f" {spam_word} " in f" {content} " or spam_word in content: # Relaxed matching to catch substrings like "$100"
            weight = 15
            if spam_word in ['won', 'winner', 'cash', 'prize', 'million', '$$$', 'free', 'congratulations']:
                weight = 30 # Heavy penalty for critical spam words
            
            found_spam_words.append({
               "word": spam_word,
               "reason": "High spam trigger probability",
               "suggestion": alternative
            })
            base_score += weight
            suggestions.append(f"Replace high-risk word '{spam_word}' with '{alternative}'")

    # 2. Heuristics & Typos
    # Penalize all caps
    if body.isupper() or subject.isupper():
        base_score += 40
        suggestions.append("Convert uppercase text to sentence case.")
    
    # Penalize specific phrase combos
    if "congratulations" in content and ("won" in content or "selected" in content):
        base_score += 30
        suggestions.append("Avoid 'Congratulations... You Won' phrasing.")

    # Penalize excessive punctuation
    if "!!" in body or "??" in body:
        base_score += 20
        suggestions.append("Remove excessive punctuation (!!! / ???).")
    
    if "$" in content:
        base_score += 20
        suggestions.append("Avoid using currency symbols ($) directly.")
        
    # Weak language detection
    if "hope" in body.lower():
        base_score += 5
        suggestions.append("Replace weak 'hope' with confident action verbs.")

    if len(subject.split()) > 9:
        base_score += 5
        suggestions.append("Shorten subject line to under 9 words.")
        
    # Penalize suspiciously long or malformed subject/instruction that looks "wrong"
    # e.g. "JOB OPPOERTUNIT" might be a typo
    if len(subject) > 80:
         base_score += 10
         suggestions.append("Subject line is too long (> 80 chars).")

    # Fallback/Additional Logic
    # 3. Final Scoring (Strict)
    if base_score == 0:
        final_score = 0
    else:
        final_score = min(base_score, 99)
        
    # Determine verdict
    verdict = "SAFE"
    verdict_desc = "Content appears safe for delivery."
    
    if final_score > 35:
        verdict = "NEEDS IMPROVEMENT" 
        verdict_desc = "Moderate risk triggers detected."
    if final_score > 65:
        verdict = "HIGH RISK"
        verdict_desc = "Likely to trigger spam filters."
        
    delivery_chance = max(0, 100 - final_score)

    # Ensure suggestions exist if score is imperfect
    if not suggestions and delivery_chance < 100:
         suggestions.append("Add a P.S. line to increase conversion.")
         suggestions.append("Include a direct question to improve reply rates.")

    return {
        "spam_score": final_score,
        "delivery_chance": delivery_chance,
        "verdict": verdict,
        "verdict_desc": verdict_desc,
        "factors": {
            "spam_words": "Risk" if len(found_spam_words) > 0 else "Safe",
            "links": "Safe", 
            "formatting": "Risk" if body.isupper() else "Safe",
            "tone": "Warning" if final_score > 40 else "Safe",
            "personalization": "Safe"
        },
        "highlighted_words": found_spam_words,
        "critical_spam_words": [{"spam": w['word'], "alternative": w['suggestion']} for w in found_spam_words],
        "suggestions": suggestions,
        "metrics": {
            "grammar": "Clean",
            "length_status": "Ideal" if len(body) > 100 else "Short",
            "cta_strength": "Strong" if "?" in body else "Standard",
            "personalization_score": 90 + (len(content) % 9)
        }
    }

def analyze_spam_with_gemini(subject, body):
    """Deep Spam Analysis using Gemini AI (with Key Rotation)"""
    
    models_to_try = [
        'gemini-1.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-pro',
        'gemini-pro'
    ]

    api_keys = get_gemini_keys()
    if not api_keys:
        return analyze_spam_offline(subject, body)

    last_error = None

    for key_index, api_key in enumerate(api_keys):
        try:
            genai.configure(api_key=api_key)
            
            for model_name in models_to_try:
                try:
                    print(f"🔄 Analysis Neural Bridge (Key {key_index+1}): Attempting {model_name}...")
                    model = genai.GenerativeModel(model_name)
                    
                    prompt = f"""As an AI Deliverability Expert, perform a RIGOROUS, EXACT parsing of this email for spam triggers:
Subject: {subject}
Body: {body}

Your analysis must be uncompromising. Identify ANY word or tone that could trigger a spam filter.
CRITICAL: If the email mentions "winning", "money", "congratulations", or uses excessive CAPS/punctuation, you MUST mark it as HIGH RISK (Score > 80).
IMPORTANT: If the content is professional, clean, and has NO spam triggers, you MUST set "spam_score" to 0 and "delivery_chance" to 100. Do not artificially lower the score.

Return a high-precision JSON analysis with exactly these keys:
{{
    "spam_score": 0-100,
    "delivery_chance": 0-100,
    "verdict": "SAFE" | "NEEDS IMPROVEMENT" | "HIGH RISK",
    "verdict_desc": "Short explanation",
    "factors": {{
        "spam_words": "Safe" | "Warning" | "Risk",
        "links": "Safe" | "Warning" | "Risk",
        "formatting": "Safe" | "Warning" | "Risk",
        "tone": "Safe" | "Warning" | "Risk",
        "personalization": "Safe" | "Warning" | "Risk"
    }},
    "highlighted_words": [
        {{"word": "word", "reason": "why", "suggestion": "better alternative"}}
    ],
    "critical_spam_words": [
        {{"spam": "word", "alternative": "safe word"}}
    ],
    "suggestions": ["advice 1", "advice 2"],
    "metrics": {{
        "grammar": "Clean" | "Needs Review",
        "length_status": "Short" | "Ideal" | "Long",
        "cta_strength": "Strong",
        "personalization_score": 85
    }}
If Delivery Chance < 95%, you MUST include at least 2 specific "suggestions" to improve it.
If Delivery Chance is 100%, suggest "A/B test the Subject Line" or "Perfectly optimized content".
ONLY return valid JSON."""

                    response = model.generate_content(prompt)
                    text = response.text.strip()
                    
                    if '```json' in text:
                        text = text.split('```json')[1].split('```')[0].strip()
                    elif '{' in text:
                        text = text[text.find('{'):text.rfind('}')+1]
                    
                    print(f"✅ Analysis Successful via {model_name}")
                    return json.loads(text)

                except Exception as e:
                    err_msg = str(e)
                    print(f"⚠️ Analysis failed with {model_name}: {err_msg}")
                    last_error = err_msg
                    continue
        
        except Exception as e:
            continue

    # If all models fail
    print(f"❌ All Gemini Analysis models exhausted. Error: {last_error}")
    return analyze_spam_offline(subject, body)

@content_creation_bp.route("/generate", methods=["POST"])
@login_required
def generate_content():
    try:
        data = request.json
        instruction = data.get("instruction", "")
        sender_name = data.get("sender_name", "The Team")
        
        if not instruction: return jsonify({"error": "Instruction required"}), 400

        # DIRECT CALL TO GEMINI (Grok removed)
        gen_result = generate_with_gemini(instruction, "Professional", "Long", sender_name)
        
        if not gen_result['success']:
            return jsonify({
                "error": f"AI Generation Failed: {gen_result.get('error')}"
            }), 500

        # Detailed Analysis
        analysis = analyze_spam_with_gemini(gen_result['subject'], gen_result['body'])
        
        return jsonify({
            "subject": gen_result['subject'],
            "body": gen_result['body'],
            "provider": gen_result['provider'],
            "analysis": analysis
        })

    except Exception as e:
        print(f"❌ Route Error: {e}")
        return jsonify({"error": str(e)}), 500


import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def get_smtp_config(provider, email=""):
    configs = {
        'gmail': ('smtp.gmail.com', 587),
        'outlook': ('smtp-mail.outlook.com', 587),
        'zoho': ('smtppro.zoho.in' if email.endswith('.in') else 'smtppro.zoho.com', 465),
        'custom': ('', 0)
    }
    return configs.get(provider, ('smtp.gmail.com', 587))

@content_creation_bp.route("/send-bulk", methods=["POST"])
@login_required
def send_bulk():
    try:
        data = request.json
        subject = data.get("subject", "")
        body = data.get("body", "")
        recipients = data.get("recipients", [])
        senders = data.get("senders", [])

        if not recipients or not senders:
            return jsonify({"error": "Recipients and sender account required"}), 400

        sent_count = 0
        failed_count = 0
        
        # Use simple cycling if multiple senders provided
        from itertools import cycle
        sender_cycle = cycle(senders)

        errors = []
        for recipient in recipients:
            sender = next(sender_cycle)
            recipient_email = recipient.get('email')
            recipient_name = recipient.get('name', 'Recipient')
            
            try:
                host, port = get_smtp_config(sender['provider'], sender['email'])
                print(f"📡 Dispatching to {recipient_email} via {host}:{port} ({sender['email']})")
                
                # Use SSL for port 465 (Zoho/Custom), TLS for 587
                if port == 465:
                    server = smtplib.SMTP_SSL(host, port, timeout=15)
                else:
                    server = smtplib.SMTP(host, port, timeout=15)
                    server.starttls()

                server.login(sender['email'], sender['password'])

                # Deep Personalization (Strict Double Curly Braces)
                personalized_body = body.replace("{{name}}", recipient_name)
                personalized_body = personalized_body.replace("{{sender_name}}", sender.get('name', 'The Team'))
                # Handle phone number if present in sender dict, else empty
                sender_phone = sender.get('phone', '')
                personalized_body = personalized_body.replace("{{phone_number}}", sender_phone)
                
                msg = MIMEMultipart()
                msg['From'] = f"{sender.get('name', '')} <{sender['email']}>"
                msg['To'] = recipient_email
                msg['Subject'] = subject
                msg.attach(MIMEText(personalized_body, 'plain'))

                # Using sendmail instead of send_message for broader compatibility
                server.sendmail(sender['email'], [recipient_email], msg.as_string())
                server.quit()
                sent_count += 1
                print(f"✅ Successfully sent to {recipient_email}")
            except Exception as e:
                err_msg = str(e)
                print(f"❌ Failed to send to {recipient_email}: {err_msg}")
                failed_count += 1
                errors.append(f"{recipient_email}: {err_msg}")

        return jsonify({
            "success": True,
            "sent": sent_count,
            "failed": failed_count,
            "errors": errors[:5] # Return first 5 errors for debugging
        })

    except Exception as e:
        print(f"   ❌ Dispatch error: {e}")
        return jsonify({"error": str(e)}), 500

@content_creation_bp.route("/analyze", methods=["POST"])
@login_required
def analyze_content():
    try:
        data = request.json
        subject = data.get("subject", "")
        body = data.get("body", "")
        
        if not subject or not body:
            return jsonify({"error": "Subject and body required for analysis"}), 400

        # Detailed Analysis Only
        analysis = analyze_spam_with_gemini(subject, body)
        
        return jsonify({
            "success": True,
            "analysis": analysis
        })

    except Exception as e:
        print(f"❌ Analysis Route Error: {e}")
        return jsonify({"error": str(e)}), 500

@content_creation_bp.route("/refine", methods=["POST"])
@login_required
def refine_content():
    try:
        data = request.json
        current_subject = data.get("subject", "")
        current_body = data.get("body", "")
        refinement_instruction = data.get("refinement", "")
        
        if not refinement_instruction:
             return jsonify({"error": "Refinement instruction required"}), 400

        # Attempt to use Gemini for intelligent refinement
        api_keys = get_gemini_keys()
        if api_keys:
            try:
                # Key rotation for refinement too
                selected_key = random.choice(api_keys)
                genai.configure(api_key=selected_key)
                model = genai.GenerativeModel('gemini-1.5-flash')
                
                prompt = f"""Task: Refine the following email content based SPECIFICALLY on this instruction: "{refinement_instruction}".
                
                CURRENT CONTENT:
                Subject: {current_subject}
                Body: {current_body}
                
                RULES:
                1. ONLY apply the requested change. Do not rewrite the entire email style unless asked.
                2. Keep the same placeholders ({{{{name}}}}, {{{{sender_name}}}}, etc).
                3. Return the result in JSON: {{"subject": "...", "body": "..."}}
                4. If the instruction is "Convert uppercase text to sentence case", fix capitalization throughout.
                5. If the instruction is replacing a specific word, only replace that word contextually.
                """
                
                response = model.generate_content(prompt)
                text = response.text.strip()
                if '```json' in text:
                    text = text.split('```json')[1].split('```')[0].strip()
                elif '{' in text:
                    text = text[text.find('{'):text.rfind('}')+1]
                
                result = json.loads(text)
                return jsonify({
                    "success": True,
                    "subject": result.get('subject', current_subject),
                    "body": result.get('body', current_body),
                    "analysis": analyze_spam_with_gemini(result.get('subject'), result.get('body')) # Auto-reanalyze
                })
                
            except Exception as ai_e:
                print(f"⚠️ AI Refinement failed: {ai_e}. Falling back to basic logic.")
                # Fallthrough to basic logic
        
        # BASIC OFFLINE REFINEMENT LOGIC (Regex/String ops)
        new_subject = current_subject
        new_body = current_body
        
        if "uppercase" in refinement_instruction.lower():
            new_subject = new_subject.title()
            # Restore placeholders which might get messed up by title() if not careful, 
            # but simple sentence case for body is better:
            sentences = new_body.split('. ')
            new_body = ". ".join([s.capitalize() for s in sentences])
            
        if "replace" in refinement_instruction.lower():
            # Extract basic "Replace X with Y" pattern if possible, or just look up known maps
            for spam, safe in SPAM_MAP.items():
                if f"'{spam}'" in refinement_instruction or f" {spam} " in refinement_instruction:
                    # Case insensitive replace
                    pattern = re.compile(re.escape(spam), re.IGNORECASE)
                    new_body = pattern.sub(safe, new_body)
                    new_subject = pattern.sub(safe, new_subject)

        if "punctuation" in refinement_instruction.lower():
            new_body = new_body.replace("!!!", ".").replace("???", "?").replace("!!", ".").replace("??", "?")

        return jsonify({
            "success": True,
            "subject": new_subject,
            "body": new_body,
            "analysis": analyze_spam_offline(new_subject, new_body) # Auto-reanalyze offline
        })

    except Exception as e:
        print(f"❌ Refine Route Error: {e}")
        return jsonify({"error": str(e)}), 500

@content_creation_bp.route("/test", methods=["GET"])
def test_route():
    """Test route to verify blueprint is registered"""
    return jsonify({
        "status": "ok",
        "message": "Content Creation API is running",
        "gemini_keys_available": len(get_gemini_keys())
    })
