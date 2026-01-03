import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# Configure Gemini API
GENAI_API_KEY = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=GENAI_API_KEY)

if GENAI_API_KEY:
    print(f"✅ GEMINI API key loaded: {GENAI_API_KEY[:6]}******{GENAI_API_KEY[-4:]}")
else:
    print("❌ GEMINI API key NOT FOUND. Check your .env file")

# Zoho configuration
ZOHO_CLIENT_ID = None
ZOHO_CLIENT_SECRET = None
ZOHO_REDIRECT_URI = None
ZOHO_ACCESS_TOKEN = None
ZOHO_REFRESH_TOKEN = None
ZOHO_API_DOMAIN = os.getenv("ZOHO_API_DOMAIN")

def get_redirect_uri():
    if os.getenv('FLASK_ENV') == 'production':
        return "https://your-aws-domain.com/zoho-callback"
    else:
        return "http://localhost:3000/zoho-callback"

class AppState:
    def __init__(self):
        self.progress = {"sent": 0, "total": 0, "status": "idle"}
        self.email_content = {"subject": "", "body": "", "sender_name": "", "sender_email": "", "phone_number": ""}
        self.zoho_status = {"connected": False, "message": "Not connected to Zoho CRM"}
        self.user_zoho_credentials = {}
        self.user_data = {}

app_state = AppState()