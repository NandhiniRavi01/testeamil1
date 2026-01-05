from flask import Flask, jsonify
from flask_cors import CORS

# Import blueprints
from routes.content_routes import content_bp
from routes.auth_routes import auth_bp
from routes.webscraping_routes import lead_generator_bp
from routes.EmailGenerateAndValidator_routes import file_processor_bp
from routes.googlescraper_routes import googlescraper_bp
from routes.zoho_routes import zoho_crm_bp
from routes.SalesForce import salesforce_bp
from routes.email_template_routes import email_template_bp
from routes.email_validator_routes import email_validator_bp
from routes.event_discovery_routes import event_discovery_bp
from routes.roles_routes import role_bp
from routes.content_creation_routes import content_creation_bp
from routes.dashboard_routes import dashboard_bp

app = Flask(__name__)

# 🔐 Secret key (required for sessions)
app.secret_key = "super-secret-key-change-this"

# 🌐 Enhanced CORS configuration (React frontend safe)
CORS(
    app,
    supports_credentials=True,
    origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://65.1.129.37:3000",
            "http://65.1.129.37:8000",
            "http://65.1.129.37:5000",
            "http://65.1.129.37",
        "https://emailagent.cubegtp.com/"
        
            "http://65.1.129.37:3001",
            
    ],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-User-ID",
        "Accept",
        "X-Requested-With"
    ],
    expose_headers=[
        "Content-Type",
        "Authorization",
        "X-Total-Count"
    ],
    max_age=3600
)

# 📦 Register blueprints
app.register_blueprint(content_bp)
app.register_blueprint(auth_bp, url_prefix="/auth")
app.register_blueprint(lead_generator_bp, url_prefix="/webscraping")
app.register_blueprint(file_processor_bp, url_prefix="/api")
app.register_blueprint(googlescraper_bp, url_prefix="/googlescraper")
app.register_blueprint(zoho_crm_bp, url_prefix="/api/zoho")
app.register_blueprint(salesforce_bp, url_prefix="/salesforce")
app.register_blueprint(email_template_bp, url_prefix="/api/email-template")
app.register_blueprint(content_creation_bp, url_prefix="/content-creation")
app.register_blueprint(event_discovery_bp, url_prefix="/api/discovery")
app.register_blueprint(role_bp, url_prefix="/api/roles")
app.register_blueprint(email_validator_bp)
app.register_blueprint(dashboard_bp, url_prefix="/dashboard")

# 🏠 Health check / Home route
@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "message": "Email Agent Backend is Running",
        "status": "OK"
    })

# ❤️ Ping endpoint (frontend test)
@app.route("/ping", methods=["GET"])
def ping():
    return jsonify({"status": "ok"})

# ❌ 404 handler
@app.errorhandler(404)
def handle_404_error(e):
    return jsonify({"error": "Endpoint not found"}), 404

# 🔥 500 handler
@app.errorhandler(500)
def handle_500_error(e):
    return jsonify({"error": "Internal server error"}), 500

# 🚀 App runner
if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000, use_reloader=False)



