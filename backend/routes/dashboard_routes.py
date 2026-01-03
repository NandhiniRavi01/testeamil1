from flask import Blueprint, request, jsonify
from datetime import datetime
from database import db
from services.service import update_email_status
from .auth_routes import login_required

dashboard_bp = Blueprint("dashboard", __name__)

@dashboard_bp.route("/stats", methods=["GET", "OPTIONS"])
@login_required
def get_dashboard_stats():
    """Get dashboard statistics with date filtering"""
    user_id = request.user["id"]  # auth_routes decorator adds this
    
    # Get filters
    start_date = request.args.get('from')
    end_date = request.args.get('to')
    sender_email = request.args.get('sender_email')
    
    # Defaults if dates are missing
    if not start_date:
        start_date = datetime.now().strftime('%Y-%m-%d')
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')
        
    # Handle CORS preflight
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    try:
        stats = db.get_dashboard_stats_by_date(user_id, start_date, end_date, sender_email)
        
        if stats:
            # Calculate rates
            total = stats['sent'] # sent implies total emails in the period
            replied = stats['replied']
            bounced = stats['bounced']
            no_reply = stats['no_reply']
            
            success_rate = round((replied / total * 100), 1) if total > 0 else 0
            bounce_rate = round((bounced / total * 100), 1) if total > 0 else 0
            no_reply_rate = round((no_reply / total * 100), 1) if total > 0 else 0
            
            print(f"Stats counts: {stats}")
            
            return jsonify({
                "counts": stats,
                "rates": {
                    "success_rate": success_rate,
                    "bounce_rate": bounce_rate,
                    "no_reply_rate": no_reply_rate
                }
            })
        else:
             return jsonify({
                "counts": {"sent": 0, "replied": 0, "bounced": 0, "auto_reply": 0, "no_reply": 0},
                "rates": {"success_rate": 0, "bounce_rate": 0, "no_reply_rate": 0}
            })

    except Exception as e:
        print(f"Error serving dashboard stats: {e}")
        return jsonify({"error": str(e)}), 500

@dashboard_bp.route("/histogram", methods=["GET", "OPTIONS"])
@login_required
def get_dashboard_histogram():
    """Get histogram data"""
    user_id = request.user["id"]
    
    start_date = request.args.get('from')
    end_date = request.args.get('to')
    sender_email = request.args.get('sender_email')
    
    if not start_date:
        start_date = datetime.now().strftime('%Y-%m-%d')
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')
        
    # Handle CORS preflight
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    try:
        data = db.get_dashboard_histogram_by_date(user_id, start_date, end_date, sender_email)
        
        if data:
            # The database returns 'history' which is a list of daily stats
            # We want to provide this daily distribution to the frontend
            history = data.get('history', [])
            
            summary = {
                "sent": sum(d.get('sent', 0) for d in history),
                "replied": sum(d.get('replied', 0) for d in history),
                "bounced": sum(d.get('bounced', 0) for d in history),
                "auto_reply": sum(d.get('auto_reply', 0) for d in history),
                "no_reply": sum(d.get('no_reply', 0) for d in history),
                "total_campaigns": data.get('total_campaigns', 0)
            }
            print(f"Histogram summary: {summary}")
            
            return jsonify({
                "history": history,
                "total_days": data.get('total_days', 0),
                "summary": summary
            })
        else:
            return jsonify([])
            
    except Exception as e:
        print(f"Error serving histogram: {e}")
        return jsonify({"error": str(e)}), 500

@dashboard_bp.route("/status-update", methods=["POST"])
# @login_required  <-- Webhooks usually don't have user session auth. They might have API key.
# For now, I'll validte if it has data. 
def update_email_status_webhook():
    """Webhook for status updates"""
    data = request.json
    
    # Expected format: { "recipient_email": "...", "status": "bounced", "campaign_id": 123, ... }
    recipient_email = data.get("recipient_email")
    status = data.get("status")
    campaign_id = data.get("campaign_id")
    bounce_reason = data.get("reason")
    
    if not recipient_email or not status or not campaign_id:
        return jsonify({"error": "Missing required fields"}), 400
        
    try:
        success = update_email_status(campaign_id, recipient_email, status, bounce_reason)
        if success:
            return jsonify({"message": "Status updated successfully"})
        else:
            return jsonify({"error": "Failed to update status"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500
