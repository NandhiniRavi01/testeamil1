# routes/salesforce_routes.py
from flask import Blueprint, request, jsonify, session, redirect, url_for
import requests
import json
from datetime import datetime
import secrets
import base64
import hashlib
import urllib.parse
import os

salesforce_bp = Blueprint('salesforce', __name__)

# Salesforce OAuth configuration
SALESFORCE_CLIENT_ID = os.environ.get('SALESFORCE_CLIENT_ID', '3MVG97L7PWbPq6UxFHVzrT2KvRIdP456yOBxHakX6L0RBO0RuPimVVcugdh1h.LdPB5RuPfPi3bT74ZmYjQkp')
SALESFORCE_CLIENT_SECRET = os.environ.get('SALESFORCE_CLIENT_SECRET', '895B99EAE26786C8BEFB6143C38F51B3DF62D18AB4CC403E57A7FCD5F5149B61')
SALESFORCE_REDIRECT_URI = os.environ.get('SALESFORCE_REDIRECT_URI', 'https://emailagent.cubegtp.com/salesforce/callback')
SALESFORCE_LOGIN_URL = os.environ.get('SALESFORCE_LOGIN_URL', 'https://orgfarm-f6598735df-dev-ed.develop.my.salesforce.com')

class SalesforceCRMHandler:
    """Handles Salesforce CRM operations"""
    
    def __init__(self):
        self.access_token = None
        self.instance_url = None
    
    def set_tokens(self, access_token, instance_url):
        """Set Salesforce tokens from session"""
        self.access_token = access_token
        self.instance_url = instance_url
    
    def create_lead(self, lead_data):
        """Create a new Lead in Salesforce"""
        if not self.access_token or not self.instance_url:
            return False, "Not connected to Salesforce"
        
        try:
            url = f"{self.instance_url}/services/data/v58.0/sobjects/Lead/"
            headers = {
                'Authorization': f'Bearer {self.access_token}',
                'Content-Type': 'application/json'
            }
            
            # Salesforce Lead object fields
            sf_lead_data = {
                'FirstName': lead_data.get('first_name', ''),
                'LastName': lead_data.get('last_name', 'Contact'),
                'Email': lead_data.get('email', ''),
                'Company': lead_data.get('company', 'Unknown Company'),
                'Phone': lead_data.get('phone', ''),
                'Description': lead_data.get('description', ''),
                'LeadSource': 'Email Campaign'
            }
            
            print(f"DEBUG: Creating Lead in Salesforce with data: {sf_lead_data}")
            response = requests.post(url, headers=headers, json=sf_lead_data)
            
            if response.status_code in [200, 201]:
                result = response.json()
                return True, result.get('id')
            elif response.status_code == 401:
                return False, "Authentication failed. Please reconnect to Salesforce."
            else:
                error_msg = response.json() if response.text else f"Status: {response.status_code}"
                return False, f"Failed to create Lead: {error_msg}"
                
        except Exception as e:
            return False, f"Error creating Lead: {str(e)}"
    
    def get_leads_by_email(self, emails):
        """Find Leads by email addresses"""
        if not self.access_token or not self.instance_url:
            return []
        
        try:
            results = []
            for email in emails:
                query = f"SELECT Id, FirstName, LastName, Email, Company, Status, CreatedDate FROM Lead WHERE Email = '{email}'"
                url = f"{self.instance_url}/services/data/v58.0/query?q={urllib.parse.quote(query)}"
                headers = {
                    'Authorization': f'Bearer {self.access_token}',
                    'Content-Type': 'application/json'
                }
                
                response = requests.get(url, headers=headers)
                if response.status_code == 200:
                    data = response.json()
                    if data.get('records'):
                        for record in data['records']:
                            results.append({
                                'email': record['Email'],
                                'lead_id': record['Id'],
                                'name': f"{record.get('FirstName', '')} {record.get('LastName', '')}".strip(),
                                'company': record.get('Company', ''),
                                'status': record.get('Status', ''),
                                'created_date': record.get('CreatedDate', '')
                            })
            
            return results
            
        except Exception as e:
            print(f"Error querying Salesforce: {e}")
            return []

# Create handler instance
sf_handler = SalesforceCRMHandler()

@salesforce_bp.route('/auth')
def salesforce_auth():
    """Step 1: Redirect to Salesforce OAuth"""
    code_verifier = secrets.token_urlsafe(96)
    code_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(code_verifier.encode()).digest()
    ).decode().replace('=', '')
    
    session['salesforce_code_verifier'] = code_verifier
    
    auth_url = (
        f"{SALESFORCE_LOGIN_URL}/services/oauth2/authorize"
        f"?response_type=code"
        f"&client_id={SALESFORCE_CLIENT_ID}"
        f"&redirect_uri={SALESFORCE_REDIRECT_URI}"
        f"&scope=api%20refresh_token"
        f"&code_challenge={code_challenge}"
        f"&code_challenge_method=S256"
    )
    
    return redirect(auth_url)

# In your salesforce_routes.py
@salesforce_bp.route('/callback')
def salesforce_callback():
    """Step 2: Handle OAuth callback"""
    auth_code = request.args.get('code')
    
    if 'error' in request.args:
        error_msg = request.args.get('error_description', 'Unknown error')
        # Redirect to React app with error
        return redirect(f"https://emailagent.cubegtp.com/salesforce?error={urllib.parse.quote(error_msg)}")
    
    if not auth_code:
        return redirect(f"https://emailagent.cubegtp.com/salesforce?error=No authorization code")
    
    code_verifier = session.get('salesforce_code_verifier')
    if not code_verifier:
        return redirect(f"https://emailagent.cubegtp.com/salesforce?error=Missing code verifier")
    
    token_url = f"{SALESFORCE_LOGIN_URL}/services/oauth2/token"
    token_data = {
        'grant_type': 'authorization_code',
        'code': auth_code,
        'client_id': SALESFORCE_CLIENT_ID,
        'client_secret': SALESFORCE_CLIENT_SECRET,
        'redirect_uri': SALESFORCE_REDIRECT_URI,
        'code_verifier': code_verifier
    }
    
    try:
        response = requests.post(token_url, data=token_data)
        
        if response.status_code != 200:
            return redirect(f"https://emailagent.cubegtp.com/salesforce?error={urllib.parse.quote('Token exchange failed')}")
            
        tokens = response.json()
        
        session['salesforce_access_token'] = tokens['access_token']
        session['salesforce_instance_url'] = tokens['instance_url']
        session.pop('salesforce_code_verifier', None)
        
        # Set handler tokens
        sf_handler.set_tokens(tokens['access_token'], tokens['instance_url'])
        
        # Redirect back to React app with success
        return redirect("https://emailagent.cubegtp.com/salesforce?success=connected")
        
    except Exception as e:
        return redirect(f"https://emailagent.cubegtp.com/salesforce?error={urllib.parse.quote(str(e))}")



@salesforce_bp.route('/status')
def salesforce_status():
    """Check Salesforce connection status"""
    access_token = session.get('salesforce_access_token')
    instance_url = session.get('salesforce_instance_url')
    
    status = {
        'connected': bool(access_token and instance_url),
        'message': 'Connected to Salesforce' if access_token and instance_url else 'Not connected to Salesforce',
        'disconnect_url': '/salesforce/revoke'
    }
    
    # Test token if connected
    if status['connected']:
        try:
            sf_handler.set_tokens(access_token, instance_url)
            test_url = f"{instance_url}/services/oauth2/userinfo"
            headers = {'Authorization': f'Bearer {access_token}'}
            response = requests.get(test_url, headers=headers)
            status['token_valid'] = response.status_code == 200
        except:
            status['token_valid'] = False
    
    return jsonify(status)

@salesforce_bp.route('/revoke')
def salesforce_revoke():
    """Disconnect from Salesforce"""
    access_token = session.get('salesforce_access_token')
    message = ""
    
    if access_token:
        try:
            revoke_url = f"{SALESFORCE_LOGIN_URL}/services/oauth2/revoke"
            revoke_data = {'token': access_token}
            response = requests.post(revoke_url, data=revoke_data)
            
            if response.status_code == 200:
                message += "✅ Salesforce access revoked. "
            else:
                message += f"⚠️ Salesforce revocation returned {response.status_code}. "
        except Exception as e:
            message += f"⚠️ Error during revocation: {str(e)}. "
    
    # Clear session data
    session.pop('salesforce_access_token', None)
    session.pop('salesforce_instance_url', None)
    session.pop('salesforce_code_verifier', None)
    
    message += "✅ Local session cleared."
    
    return jsonify({
        'success': True,
        'message': message,
        'redirect': '/'
    })

@salesforce_bp.route('/add-lead', methods=['POST'])
def add_lead():
    """Add a single Lead to Salesforce"""
    data = request.json
    
    if not data:
        return jsonify({'success': False, 'message': 'No data provided'}), 400
    
    required_fields = ['name', 'email']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'success': False, 'message': f'Missing required field: {field}'}), 400
    
    # Extract name parts
    name_parts = data['name'].split()
    first_name = name_parts[0] if name_parts else ''
    last_name = ' '.join(name_parts[1:]) if len(name_parts) > 1 else 'Contact'
    
    # Prepare lead data
    lead_data = {
        'first_name': first_name,
        'last_name': last_name,
        'email': data['email'],
        'company': data.get('company', 'Unknown Company'),
        'phone': data.get('phone', ''),
        'description': data.get('description', '')
    }
    
    # Get tokens from session
    access_token = session.get('salesforce_access_token')
    instance_url = session.get('salesforce_instance_url')
    
    if not access_token or not instance_url:
        return jsonify({'success': False, 'message': 'Not connected to Salesforce'}), 401
    
    sf_handler.set_tokens(access_token, instance_url)
    success, result = sf_handler.create_lead(lead_data)
    
    if success:
        return jsonify({
            'success': True,
            'message': 'Lead added to Salesforce successfully',
            'lead_id': result
        })
    else:
        return jsonify({'success': False, 'message': result}), 500

@salesforce_bp.route('/add-bulk-leads', methods=['POST'])
def add_bulk_leads():
    """Add multiple Leads to Salesforce"""
    data = request.json
    
    if not data or 'users' not in data:
        return jsonify({'success': False, 'message': 'No users provided'}), 400
    
    users = data['users']
    if not isinstance(users, list):
        return jsonify({'success': False, 'message': 'Users should be a list'}), 400
    
    # Get tokens from session
    access_token = session.get('salesforce_access_token')
    instance_url = session.get('salesforce_instance_url')
    
    if not access_token or not instance_url:
        return jsonify({'success': False, 'message': 'Not connected to Salesforce'}), 401
    
    sf_handler.set_tokens(access_token, instance_url)
    
    results = {
        'total': len(users),
        'successful': 0,
        'failed': 0,
        'errors': [],
        'details': []
    }
    
    for user in users:
        try:
            # Prepare lead data
            name_parts = user.get('name', '').split()
            first_name = name_parts[0] if name_parts else ''
            last_name = ' '.join(name_parts[1:]) if len(name_parts) > 1 else 'Contact'
            
            lead_data = {
                'first_name': first_name,
                'last_name': last_name,
                'email': user.get('email', ''),
                'company': user.get('company', 'Unknown Company'),
                'phone': user.get('phone', ''),
                'description': user.get('description', '')
            }
            
            success, result = sf_handler.create_lead(lead_data)
            
            if success:
                results['successful'] += 1
                results['details'].append({
                    'email': user.get('email'),
                    'success': True,
                    'lead_id': result
                })
            else:
                results['failed'] += 1
                results['errors'].append({
                    'email': user.get('email', 'Unknown'),
                    'error': result
                })
                
        except Exception as e:
            results['failed'] += 1
            results['errors'].append({
                'email': user.get('email', 'Unknown'),
                'error': str(e)
            })
    
    response_data = {
        'success': results['successful'] > 0,
        'message': f"Added {results['successful']} of {results['total']} users to Salesforce",
        'results': results
    }
    
    return jsonify(response_data)

@salesforce_bp.route('/get-leads-by-email', methods=['POST'])
def get_leads_by_email():
    """Find Leads by email addresses"""
    data = request.json
    
    if not data or 'emails' not in data:
        return jsonify({'success': False, 'message': 'No emails provided'}), 400
    
    emails = data['emails']
    if not isinstance(emails, list):
        return jsonify({'success': False, 'message': 'Emails should be a list'}), 400
    
    access_token = session.get('salesforce_access_token')
    instance_url = session.get('salesforce_instance_url')
    
    if not access_token or not instance_url:
        return jsonify({'success': False, 'message': 'Not connected to Salesforce'}), 401
    
    sf_handler.set_tokens(access_token, instance_url)
    leads = sf_handler.get_leads_by_email(emails)
    
    # Separate found and not found
    found_emails = [lead['email'] for lead in leads]
    not_found = [email for email in emails if email not in found_emails]
    
    return jsonify({
        'success': True,
        'leads_found': leads,
        'leads_not_found': not_found,
        'total_found': len(leads),
        'total_not_found': len(not_found)
    })

@salesforce_bp.route('/test-connection')
def test_connection():
    """Test Salesforce connection"""
    access_token = session.get('salesforce_access_token')
    instance_url = session.get('salesforce_instance_url')
    
    if not access_token or not instance_url:
        return jsonify({
            'success': False,
            'connected': False,
            'message': 'Not connected to Salesforce'
        })
    
    try:
        # Test connection by getting user info
        test_url = f"{instance_url}/services/oauth2/userinfo"
        headers = {'Authorization': f'Bearer {access_token}'}
        response = requests.get(test_url, headers=headers)
        
        if response.status_code == 200:
            user_info = response.json()
            return jsonify({
                'success': True,
                'connected': True,
                'message': 'Salesforce connection successful',
                'user_info': {
                    'email': user_info.get('email'),
                    'name': user_info.get('name'),
                    'organization_id': user_info.get('organization_id')
                }
            })
        else:
            return jsonify({
                'success': False,
                'connected': False,
                'message': f'Connection test failed: {response.status_code}'
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'connected': False,
            'message': f'Connection test error: {str(e)}'

        })
