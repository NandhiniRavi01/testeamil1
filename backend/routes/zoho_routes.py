from flask import Blueprint, request, jsonify, redirect, url_for
import requests
import json
from datetime import datetime, timedelta
from database import db
import os
import urllib.parse
import time



zoho_crm_bp = Blueprint('zoho_crm', __name__)

# Zoho CRM OAuth configuration - use .in domain for India
ZOHO_API_DOMAIN = os.getenv("ZOHO_API_DOMAIN", "https://www.zohoapis.in")
ZOHO_ACCOUNTS_DOMAIN = os.getenv("ZOHO_ACCOUNTS_DOMAIN", "https://accounts.zoho.in")
DEFAULT_USER_ID = int(os.getenv("DEFAULT_ZOHO_USER_ID", "1"))
def ensure_user_settings_table():
    """Create the user_settings table if it doesn't exist with proper schema"""
    connection = db.get_connection()
    if connection:
        try:
            cursor = connection.cursor()
            
            # First, check if the table exists and has the correct schema
            cursor.execute("PRAGMA table_info(user_settings)")
            existing_columns = [column[1] for column in cursor.fetchall()]
            
            print(f"=== DEBUG: Existing columns in user_settings: {existing_columns} ===")
            
            # Create table if it doesn't exist
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_settings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL DEFAULT 1,
                    zoho_client_id TEXT,
                    zoho_client_secret TEXT,
                    zoho_access_token TEXT,
                    zoho_refresh_token TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP
                )
            """)
            
            # Add missing columns if they don't exist (without default value)
            if 'updated_at' not in existing_columns:
                print("=== DEBUG: Adding updated_at column to user_settings ===")
                cursor.execute("ALTER TABLE user_settings ADD COLUMN updated_at TIMESTAMP")
            
            connection.commit()
            print("=== DEBUG: user_settings table ensured with correct schema ===")
            
        except Exception as e:
            print(f"=== DEBUG: Error creating/updating table: {e} ===")
        finally:
            if connection:
                connection.close()

# Call this function when the module loads
ensure_user_settings_table()

class ZohoCRMHandler:
    def __init__(self):
        self.api_domain = ZOHO_API_DOMAIN
        self.accounts_domain = ZOHO_ACCOUNTS_DOMAIN
    
    def get_user_zoho_credentials(self, user_id=1):
        """Get Zoho credentials for a specific user - using default user_id for now"""
        connection = db.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                cursor.execute(
                    "SELECT zoho_client_id, zoho_client_secret, zoho_access_token, zoho_refresh_token FROM user_settings WHERE user_id = ?",
                    (user_id,)
                )
                result = cursor.fetchone()
                
                if result:
                    credentials = {
                        'client_id': result[0],
                        'client_secret': result[1],
                        'access_token': result[2],
                        'refresh_token': result[3]
                    }
                    return credentials
                else:
                    return None
            except Exception as e:
                return None
            finally:
                if connection:
                    connection.close()
        else:
            print("=== DEBUG: No database connection in get_user_zoho_credentials ===")
        return None
    
    def save_user_zoho_credentials(self, user_id=1, client_id=None, client_secret=None, access_token=None, refresh_token=None):
        """Save Zoho credentials for a specific user - using default user_id for now"""
        connection = db.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                
                # Check if user settings already exist
                cursor.execute("SELECT id FROM user_settings WHERE user_id = ?", (user_id,))
                existing = cursor.fetchone()
                
                current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                
                if existing:
                    if access_token and refresh_token:
                        try:
                            cursor.execute(
                                """UPDATE user_settings 
                                SET zoho_client_id = ?, zoho_client_secret = ?, 
                                    zoho_access_token = ?, zoho_refresh_token = ?,
                                    updated_at = ?
                                WHERE user_id = ?""",
                                (client_id, client_secret, access_token, refresh_token, current_time, user_id)
                            )
                            print(f"=== DEBUG: Updated tokens - Access Token: {access_token[:20] if access_token else 'None'}... ===")
                        except Exception as e:
                            print(f"=== DEBUG: Error with updated_at, updating without it: {e} ===")
                            cursor.execute(
                                """UPDATE user_settings 
                                SET zoho_client_id = ?, zoho_client_secret = ?, 
                                    zoho_access_token = ?, zoho_refresh_token = ?
                                WHERE user_id = ?""",
                                (client_id, client_secret, access_token, refresh_token, user_id)
                            )
                    else:
                        try:
                            cursor.execute(
                                """UPDATE user_settings 
                                SET zoho_client_id = ?, zoho_client_secret = ?,
                                    updated_at = ?
                                WHERE user_id = ?""",
                                (client_id, client_secret, current_time, user_id)
                            )
                        except Exception as e:
                            cursor.execute(
                                """UPDATE user_settings 
                                SET zoho_client_id = ?, zoho_client_secret = ?
                                WHERE user_id = ?""",
                                (client_id, client_secret, user_id)
                            )
                else:
                    if access_token and refresh_token:
                        cursor.execute(
                            """INSERT INTO user_settings 
                            (user_id, zoho_client_id, zoho_client_secret, zoho_access_token, zoho_refresh_token) 
                            VALUES (?, ?, ?, ?, ?)""",
                            (user_id, client_id, client_secret, access_token, refresh_token)
                        )
                    else:
                        cursor.execute(
                            """INSERT INTO user_settings 
                            (user_id, zoho_client_id, zoho_client_secret) 
                            VALUES (?, ?, ?)""",
                            (user_id, client_id, client_secret)
                        )
                
                connection.commit()
                print(f"=== DEBUG: Successfully saved credentials for user_id {user_id} ===")
                return True
            except Exception as e:
                print(f"=== DEBUG: Error saving user Zoho credentials: {e} ===")
                return False
            finally:
                if connection:
                    connection.close()
        else:
            print("=== DEBUG: No database connection ===")
        return False
    
    def refresh_access_token(self, user_id=1):
        """Refresh Zoho access token using refresh token"""
        credentials = self.get_user_zoho_credentials(user_id)
        if not credentials or not credentials.get('refresh_token'):
            return None
        
        try:
            url = f"{self.accounts_domain}/oauth/v2/token"
            data = {
                'grant_type': 'refresh_token',
                'client_id': credentials['client_id'],
                'client_secret': credentials['client_secret'],
                'refresh_token': credentials['refresh_token']
            }
            
            print(f"=== DEBUG: Refreshing access token ===")
            response = requests.post(url, data=data)
            
            if response.status_code == 200:
                token_data = response.json()
                new_access_token = token_data['access_token']
                print(f"=== DEBUG: New access token: {new_access_token[:20]}... ===")
                
                # Update the access token in database
                if self.save_user_zoho_credentials(
                    user_id, 
                    credentials['client_id'], 
                    credentials['client_secret'],
                    new_access_token,
                    credentials['refresh_token']  # Keep the same refresh token
                ):
                    return new_access_token
            else:
                print(f"=== DEBUG: Token refresh failed: {response.status_code} - {response.text} ===")
        except Exception as e:
            print(f"=== DEBUG: Error refreshing access token: {e} ===")
        
        return None
    
    def get_valid_access_token(self, user_id=1):
        """Get a valid access token, refreshing if necessary"""
        credentials = self.get_user_zoho_credentials(user_id)
        if not credentials or not credentials.get('access_token'):
            return None
        
        # For now, just return the current access token
        # In production, you should check expiration and refresh if needed
        return credentials.get('access_token')
    
    def create_lead_in_zoho(self, user_id=1, lead_data=None):
        """Create a lead in Zoho CRM"""
        if lead_data is None:
            lead_data = {}
            
        access_token = self.get_valid_access_token(user_id)
        if not access_token:
            return False, "No valid access token available"
        
        try:
            # FIXED: Use the CORRECT API domain (www.zohoapis.in for India)
            url = f"{self.api_domain}/crm/v2/Leads"
            headers = {
                'Authorization': f'Zoho-oauthtoken {access_token}',
                'Content-Type': 'application/json'
            }
            
            # Extract name parts and ensure Last_Name is not empty
            first_name = lead_data.get('first_name', 'Unknown')
            last_name = lead_data.get('last_name', '')
            email = lead_data.get('email', '')
            
            # If last_name is empty, use a default value or derive from first_name/email
            if not last_name:
                if first_name and first_name != 'Unknown':
                    # If we have a first name but no last name, use "Contact" as last name
                    last_name = 'Contact'
                elif email:
                    # If we only have email, use the domain part as last name
                    last_name = email.split('@')[1].split('.')[0].title()
                else:
                    # Final fallback
                    last_name = 'Lead'
            
            # Prepare lead data according to Zoho CRM API
            zoho_lead_data = {
                "data": [
                    {
                        "Company": lead_data.get('company', 'Unknown Company'),
                        "First_Name": first_name,
                        "Last_Name": last_name,  # This field is MANDATORY for Zoho CRM
                        "Email": email,
                        "Phone": lead_data.get('phone', ''),
                        "Description": lead_data.get('description', ''),
                        "Lead_Source": "Email Campaign"
                    }
                ]
            }
            
            response = requests.post(url, headers=headers, json=zoho_lead_data, timeout=30)
            
            # Check if response is HTML (error page) instead of JSON
            content_type = response.headers.get('content-type', '')
            if 'text/html' in content_type:
                if response.status_code == 404:
                    return False, f"Zoho CRM API endpoint not found (404). URL used: {url}"
                else:
                    return False, f"Zoho CRM returned an error page (Status: {response.status_code}). Please check your Zoho CRM configuration."
            
            if response.status_code == 201:
                return True, "Lead created successfully in Zoho CRM"
            elif response.status_code == 401:
                # Token might be expired, try to refresh
                new_token = self.refresh_access_token(user_id)
                if new_token:
                    return self.create_lead_in_zoho(user_id, lead_data)
                else:
                    return False, "Authentication failed. Please reconnect your Zoho CRM account."
            elif response.status_code == 400:
                try:
                    error_data = response.json()
                    error_msg = error_data.get('message', 'Invalid request data')
                    return False, f"Bad request: {error_msg}"
                except:
                    return False, "Invalid request data sent to Zoho CRM"
            elif response.status_code == 403:
                return False, "Insufficient permissions. Please check your Zoho CRM user permissions and API scopes."
            elif response.status_code == 404:
                return False, f"Zoho CRM API endpoint not found (404). URL used: {url}"
            else:
                try:
                    error_data = response.json()
                    error_msg = error_data.get('message', response.text[:200])
                except:
                    error_msg = response.text[:200]
                
                return False, f"Failed to create lead: {response.status_code} - {error_msg}"
                
        except requests.exceptions.RequestException as e:
            error_msg = f"Network error connecting to Zoho CRM: {str(e)}"
            print(f"=== DEBUG: {error_msg} ===")
            return False, error_msg
        except Exception as e:
            error_msg = f"Error creating lead in Zoho CRM: {str(e)}"
            print(f"=== DEBUG: {error_msg} ===")
            return False, error_msg

    def find_lead_by_email(self, email, user_id=1):
        """Find existing lead in Zoho CRM by email"""
        access_token = self.get_valid_access_token(user_id)
        if not access_token:
            return None
        
        try:
            url = f"{self.api_domain}/crm/v2/Leads/search"
            headers = {
                'Authorization': f'Zoho-oauthtoken {access_token}',
                'Content-Type': 'application/json'
            }
            
            params = {
                'criteria': f"(Email:equals:{email})"
            }
            
            response = requests.get(url, headers=headers, params=params, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                if data.get('data') and len(data['data']) > 0:
                    return data['data'][0]
            elif response.status_code == 401:
                # Token expired, try refresh
                new_token = self.refresh_access_token(user_id)
                if new_token:
                    return self.find_lead_by_email(email, user_id)
            
        except Exception as e:
            print(f"=== DEBUG: Error finding lead by email: {e} ===")
        
        return None
    
            
    

# Create Zoho CRM handler instance
zoho_handler = ZohoCRMHandler()

@zoho_crm_bp.route('/debug-config')
def debug_config():
    """Debug endpoint to check current configuration"""
    return jsonify({
        'ZOHO_API_DOMAIN': os.getenv("ZOHO_API_DOMAIN"),
        'ZOHO_ACCOUNTS_DOMAIN': os.getenv("ZOHO_ACCOUNTS_DOMAIN"),
        'handler_api_domain': zoho_handler.api_domain,
        'handler_accounts_domain': zoho_handler.accounts_domain,
        'environment_loaded': True
    })

@zoho_crm_bp.route('/reset-connection')
def reset_connection():
    """Reset Zoho connection and clear tokens"""
    connection = db.get_connection()
    if not connection:
        return jsonify({'success': False, 'message': 'No database connection'})
    
    try:
        cursor = connection.cursor()
        
        # Clear all tokens but keep client ID/secret
        cursor.execute("""
            UPDATE user_settings 
            SET zoho_access_token = NULL, zoho_refresh_token = NULL, updated_at = NULL
            WHERE user_id = 1
        """)
        
        connection.commit()
        return jsonify({
            'success': True,
            'message': 'Zoho connection reset. Please reconnect to Zoho CRM.'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})
    finally:
        if connection:
            connection.close()

@zoho_crm_bp.route('/add-all-leads', methods=['POST'])
def add_all_leads_to_zoho():
    """Add all replied users as leads to Zoho CRM in bulk"""
    connection = db.get_connection()
    if not connection:
        return jsonify({'success': False, 'message': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor()
        
        # Get all replied users
        cursor.execute("""
            SELECT 
                et.id,
                et.recipient_name,
                et.recipient_email,
                et.reply_message,
                et.reply_time,
                et.sent_time,
                ec.campaign_name
            FROM email_tracking et
            LEFT JOIN email_campaigns ec ON et.campaign_id = ec.id
            WHERE et.status = 'replied' AND et.added_to_zoho = 0  -- ✅ Only get unsynced users
            ORDER BY et.reply_time DESC
        """)
        
        replied_users = cursor.fetchall()
        
        if not replied_users:
            return jsonify({'success': False, 'message': 'No replied users found'}), 404
        
        results = {
            'total': len(replied_users),
            'successful': 0,
            'failed': 0,
            'errors': []
        }
        
        # Process each user and add to Zoho CRM
        for user in replied_users:
            try:
                # Parse user data
                user_id = user[0]
                recipient_name = user[1] or ''
                email = user[2] or ''
                reply_message = user[3] or ''
                reply_time = user[4] or ''
                
                # Simple name parsing
                name_parts = recipient_name.split()
                first_name = name_parts[0] if name_parts else ''
                last_name = ' '.join(name_parts[1:]) if len(name_parts) > 1 else ''
                
                if not first_name and email:
                    first_name = email.split('@')[0]
                
                # Prepare lead data for Zoho CRM
                lead_data = {
                    'first_name': first_name,
                    'last_name': last_name,
                    'email': email,
                    'phone': '',
                    'description': f"Reply received: {reply_message}\n\nReply Time: {reply_time}",
                    'company': 'Unknown Company'
                }
                
                # Create lead in Zoho CRM
                success, message = zoho_handler.create_lead_in_zoho(user_id=1, lead_data=lead_data)
                
                if success:
                    # ✅ UPDATE THE DATABASE TO MARK AS SYNCED
                    cursor.execute(
                        "UPDATE email_tracking SET added_to_zoho = 1 WHERE id = ?",
                        (user_id,)
                    )
                    results['successful'] += 1
                    print(f"=== DEBUG: Successfully synced and updated user_id {user_id} ===")
                else:
                    results['failed'] += 1
                    results['errors'].append({
                        'user_id': user_id,
                        'email': email,
                        'error': message
                    })
                    
            except Exception as e:
                results['failed'] += 1
                results['errors'].append({
                    'user_id': user_id,
                    'email': email,
                    'error': str(e)
                })
        
        # Commit all database updates
        connection.commit()
        
        # Prepare response message
        if results['successful'] > 0:
            message = f"Successfully added {results['successful']} out of {results['total']} users to Zoho CRM"
            if results['failed'] > 0:
                message += f". {results['failed']} failed."
            return jsonify({
                'success': True, 
                'message': message,
                'results': results
            })
        else:
            return jsonify({
                'success': False, 
                'message': 'Failed to add any users to Zoho CRM',
                'results': results
            }), 500
            
    except Exception as e:
        print(f"Error adding all leads to Zoho: {e}")
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500
    finally:
        if connection:
            connection.close()

@zoho_crm_bp.route('/test-zoho-connection')
def test_zoho_connection():
    """Test Zoho CRM connection and API access"""
    credentials = zoho_handler.get_user_zoho_credentials(user_id=1)
    
    if not credentials or not credentials.get('access_token'):
        return jsonify({
            'success': False,
            'message': 'No access token found. Please connect to Zoho CRM first.'
        })
    
    try:
        access_token = credentials['access_token']
        # Use the correct API domain
        url = f"{ZOHO_API_DOMAIN}/crm/v2/org"
        headers = {
            'Authorization': f'Zoho-oauthtoken {access_token}',
            'Content-Type': 'application/json'
        }
        
        print(f"=== DEBUG: Testing Zoho connection to: {url} ===")
        print(f"=== DEBUG: Using access token: {access_token[:20]}... ===")
        
        response = requests.get(url, headers=headers, timeout=30)
        
        print(f"=== DEBUG: Test connection response status: {response.status_code} ===")
        
        if response.status_code == 200:
            return jsonify({
                'success': True,
                'message': 'Zoho CRM connection successful',
                'org_info': 'Connection test passed'
            })
        else:
            return jsonify({
                'success': False,
                'message': f'Zoho CRM connection failed: {response.status_code}',
                'details': response.text[:500] if response.text else 'No response body'
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Error testing Zoho connection: {str(e)}'
        })

@zoho_crm_bp.route('/fix-database')
def fix_database():
    """Endpoint to fix database schema issues"""
    connection = db.get_connection()
    if not connection:
        return jsonify({'success': False, 'message': 'No database connection'})
    
    try:
        cursor = connection.cursor()
        
        # Check current schema
        cursor.execute("PRAGMA table_info(user_settings)")
        columns = cursor.fetchall()
        column_names = [column[1] for column in columns]
        
        print(f"=== DEBUG: Current columns: {column_names} ===")
        
        # Add missing columns without default value
        if 'updated_at' not in column_names:
            print("=== DEBUG: Adding updated_at column ===")
            cursor.execute("ALTER TABLE user_settings ADD COLUMN updated_at TIMESTAMP")
        
        connection.commit()
        
        # Verify the fix
        cursor.execute("PRAGMA table_info(user_settings)")
        updated_columns = [column[1] for column in cursor.fetchall()]
        
        return jsonify({
            'success': True,
            'message': 'Database schema fixed',
            'previous_columns': column_names,
            'current_columns': updated_columns
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})
    finally:
        if connection:
            connection.close()

@zoho_crm_bp.route('/save-credentials', methods=['POST'])
def save_zoho_credentials():
    """Save user's Zoho Client ID and Client Secret - no authentication required"""
    data = request.get_json()
    print(f"=== DEBUG: Save credentials called with data: {data} ===")
    
    client_id = data.get('client_id')
    client_secret = data.get('client_secret')
    
    if not client_id or not client_secret:
        return jsonify({'success': False, 'message': 'Client ID and Client Secret are required'}), 400
    
    # Save credentials without tokens initially - using default user_id 1
    success = zoho_handler.save_user_zoho_credentials(user_id=1, client_id=client_id, client_secret=client_secret)
    print(f"=== DEBUG: Save credentials result: {success} ===")
    
    if success:
        return jsonify({'success': True, 'message': 'Zoho credentials saved successfully'})
    else:
        return jsonify({'success': False, 'message': 'Failed to save Zoho credentials'}), 500

# Add this function at the top of zoho_routes.py
def get_dynamic_redirect_uri():
    """Get redirect URI dynamically based on the request"""
    base_url = request.host_url.rstrip('/')
    
    # Check if we're running on a local development server
    if 'localhost' in base_url or '127.0.0.1' in base_url:
        # For local development, use localhost:5000
        return f"http://localhost:5000/api/zoho/oauth-callback"
    else:
        # For production/deployment, use the actual domain
        return f"{base_url}/api/zoho/oauth-callback"

# Then update the connect_zoho function:
@zoho_crm_bp.route('/connect')
def connect_zoho():
    """Initiate Zoho OAuth connection - no authentication required"""
    print("=== DEBUG: Connect endpoint called ===")
    
    # Get user's Zoho credentials - using default user_id 1
    credentials = zoho_handler.get_user_zoho_credentials(user_id=1)
    
    if not credentials:
        return jsonify({
            'success': False, 
            'message': 'No Zoho credentials found. Please save your Client ID and Client Secret first.',
            'error_type': 'no_credentials'
        }), 400
    
    if not credentials.get('client_id') or not credentials.get('client_secret'):
        missing = []
        if not credentials.get('client_id'):
            missing.append('Client ID')
        if not credentials.get('client_secret'):
            missing.append('Client Secret')
        
        return jsonify({
            'success': False, 
            'message': f'Missing: {", ".join(missing)}. Please save your Zoho credentials first.',
            'error_type': 'missing_credentials',
            'missing_fields': missing
        }), 400
    
    try:
        # Get region from query params, default to 'IN' (since user seems to be in India)
        # But respect what's passed from frontend
        region = request.args.get('region', 'IN').upper()
        
        # Region to Domain Mapping
        region_domains = {
            'US': 'https://accounts.zoho.com',
            'IN': 'https://accounts.zoho.in',
            'EU': 'https://accounts.zoho.eu',
            'AU': 'https://accounts.zoho.com.au',
            'JP': 'https://accounts.zoho.jp',
            'CN': 'https://accounts.zoho.com.cn'
        }
        
        accounts_domain = region_domains.get(region, region_domains['IN'])
        print(f"=== DEBUG: Using accounts domain: {accounts_domain} for region {region} ===")

        # Use dynamic redirect URI
        redirect_uri = get_dynamic_redirect_uri()
        
        auth_params = {
            'client_id': credentials['client_id'],
            'response_type': 'code',
            'redirect_uri': redirect_uri,
            'scope': 'ZohoCRM.modules.leads.ALL,ZohoCRM.settings.ALL,ZohoCRM.users.READ',
            'access_type': 'offline',
            'prompt': 'consent'
        }
        
        auth_url = f"{accounts_domain}/oauth/v2/auth?{urllib.parse.urlencode(auth_params)}"
        print(f"=== DEBUG: Auth URL generated: {auth_url} ===")
        
        return jsonify({
            'success': True, 
            'auth_url': auth_url,
            'message': 'OAuth flow initiated successfully'
        })
        
    except Exception as e:
        print(f"=== DEBUG: Error generating auth URL: {e} ===")
        return jsonify({
            'success': False, 
            'message': f'Error initiating OAuth: {str(e)}',
            'error_type': 'auth_url_generation_failed'
        }), 500

@zoho_crm_bp.route('/oauth-callback')
def oauth_callback():
    """Handle Zoho OAuth callback - no authentication required"""
    auth_code = request.args.get('code')
    error = request.args.get('error')
    location = request.args.get('location', 'us')  # Default to US if not provided
    
    print(f"=== DEBUG: OAuth callback received ===")
    print(f"=== DEBUG: Code: {auth_code} ===")
    print(f"=== DEBUG: Location (DC): {location} ===")
    print(f"=== DEBUG: All params: {dict(request.args)} ===")
    
    if error:
        error_message = f"OAuth error: {error}"
        print(f"=== DEBUG: {error_message} ===")
        return redirect(get_frontend_redirect_url('crm', error='oauth_failed', message=urllib.parse.quote(error_message)))
    
    if not auth_code:
        print("=== DEBUG: No authorization code received ===")
        return redirect(get_frontend_redirect_url('crm', error='no_auth_code'))
    
    # Get user's Zoho credentials - using default user_id 1
    credentials = zoho_handler.get_user_zoho_credentials(user_id=1)
    if not credentials:
        print("=== DEBUG: No credentials found in database ===")
        return redirect(get_frontend_redirect_url('crm', error='no_credentials'))
    
    try:
        # Determine the correct accounts domain based on location returned by Zoho
        location = location.lower()
        dc_domains = {
            'us': 'https://accounts.zoho.com',
            'in': 'https://accounts.zoho.in',
            'eu': 'https://accounts.zoho.eu',
            'au': 'https://accounts.zoho.com.au',
            'jp': 'https://accounts.zoho.jp',
            'cn': 'https://accounts.zoho.com.cn'
        }
        
        accounts_domain = dc_domains.get(location, 'https://accounts.zoho.com')
        
        # Update the API domain in the handler/environment for future requests?
        # Ideally, we should store the API domain in the user settings along with tokens
        # For now, we'll try to set the env var but this is not thread-safe or persistent across restarts properly
        # if using os.environ. A better approach is to store 'api_domain_url' in the DB.
        
        print(f"=== DEBUG: Using accounts domain for token exchange: {accounts_domain} (Location: {location}) ===")
        
        # Exchange authorization code for access token
        token_url = f"{accounts_domain}/oauth/v2/token"
        redirect_uri = get_dynamic_redirect_uri()
        
        token_data = {
            'grant_type': 'authorization_code',
            'client_id': credentials['client_id'],
            'client_secret': credentials['client_secret'],
            'redirect_uri': redirect_uri,
            'code': auth_code
        }
        
        print(f"=== DEBUG: Token exchange request to: {token_url} ===")
        
        response = requests.post(token_url, data=token_data)
        
        if response.status_code == 200:
            token_info = response.json()
            access_token = token_info.get('access_token')
            refresh_token = token_info.get('refresh_token')
            api_domain = token_info.get('api_domain') # Zoho returns the API domain too!
            
            print(f"=== DEBUG: Token exchange success. API Domain: {api_domain} ===")
            
            # Save tokens and preferably the API domain (though we don't have a column for it yet)
            # We'll save tokens normally.
            if zoho_handler.save_user_zoho_credentials(
                user_id=1,
                client_id=credentials['client_id'], 
                client_secret=credentials['client_secret'],
                access_token=access_token,
                refresh_token=refresh_token
            ):
                print("=== DEBUG: Tokens saved successfully ===")
                
                # If we received an api_domain, we should update our ZOHO_API_DOMAIN temporarily 
                # or saving it would be better. For this immediate fix:
                if api_domain:
                    # Update the global/handler domain
                    zoho_handler.api_domain = api_domain
                    print(f"=== DEBUG: Updated cached handler API domain to {api_domain} ===")
                
                return redirect(get_frontend_redirect_url('crm', success='connected'))
            else:
                return redirect(get_frontend_redirect_url('crm', error='token_save_failed'))
        else:
            error_msg = f"Token exchange failed: {response.status_code} - {response.text}"
            print(f"=== DEBUG: {error_msg} ===")
            return redirect(get_frontend_redirect_url('crm', error='token_exchange_failed', message=urllib.parse.quote(error_msg)))
            
    except Exception as e:
        error_msg = f"OAuth callback error: {str(e)}"
        print(f"=== DEBUG: {error_msg} ===")
        return redirect(get_frontend_redirect_url('crm', error='oauth_exception', message=urllib.parse.quote(str(e))))

# Helper function for frontend redirects
def get_frontend_redirect_url(path='crm', **params):
    """Generate frontend redirect URL dynamically"""
    # Default to localhost:3000 for development
    frontend_base = "http://localhost:3000"
    
    # Check request referrer to determine frontend URL
    # But SKIP if referrer is from Zoho (accounts.zoho...)
    referrer = request.referrer
    if referrer and 'zoho' not in referrer and 'accounts' not in referrer:
        # Extract base URL from referrer
        from urllib.parse import urlparse
        parsed = urlparse(referrer)
        if parsed.netloc:  # If we have a valid domain
            frontend_base = f"{parsed.scheme}://{parsed.netloc}"
            
    # Production fallback: If we are not on localhost and frontend_base is still localhost,
    # it implies we couldn't detect frontend from referrer (because it was Zoho).
    # In production, assuming frontend and backend are on same origin is a reasonable default.
    if 'localhost' not in request.host and '127.0.0.1' not in request.host:
        if frontend_base == "http://localhost:3000":
             frontend_base = request.host_url.rstrip('/')
    
    # Build query string from params
    query_string = '&'.join([f"{k}={v}" for k, v in params.items()])
    return f"{frontend_base}/{path}?{query_string}" if query_string else f"{frontend_base}/{path}"

@zoho_crm_bp.route('/connection-status')
def zoho_connection_status():
    """Check Zoho connection status - no authentication required"""
    # Using default user_id 1
    credentials = zoho_handler.get_user_zoho_credentials(user_id=1)
    
    if not credentials:
        return jsonify({
            'connected': False,
            'message': 'Zoho credentials not configured'
        })
    
    has_credentials = bool(credentials.get('client_id') and credentials.get('client_secret'))
    has_tokens = bool(credentials.get('access_token'))
    
    if has_credentials and has_tokens:
        return jsonify({
            'connected': True,
            'message': 'Connected to Zoho CRM'
        })
    elif has_credentials:
        return jsonify({
            'connected': False,
            'message': 'Credentials saved but not connected. Please connect to Zoho CRM.'
        })
    else:
        return jsonify({
            'connected': False,
            'message': 'Zoho credentials not configured'
        })

@zoho_crm_bp.route('/add-lead', methods=['POST'])
def add_lead_to_zoho():
    """Add a replied user as a lead to Zoho CRM - no authentication required"""
    data = request.get_json()
    
    lead_id = data.get('lead_id')
    if not lead_id:
        return jsonify({'success': False, 'message': 'Lead ID is required'}), 400
    
    # Get the replied user details from database
    connection = db.get_connection()
    if not connection:
        return jsonify({'success': False, 'message': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor()
        
        # Get replied user details
        cursor.execute("""
            SELECT recipient_name, recipient_email, reply_message, reply_time 
            FROM email_tracking 
            WHERE id = ? AND status = 'replied'
        """, (lead_id,))
        
        replied_user = cursor.fetchone()
        if not replied_user:
            return jsonify({'success': False, 'message': 'Replied user not found'}), 404
        
        # Parse name (assuming format "First Last" or just email)
        recipient_name = replied_user[0] or ''
        email = replied_user[1] or ''
        reply_message = replied_user[2] or ''
        reply_time = replied_user[3] or ''
        
        # Simple name parsing
        name_parts = recipient_name.split()
        first_name = name_parts[0] if name_parts else ''
        last_name = ' '.join(name_parts[1:]) if len(name_parts) > 1 else ''
        
        if not first_name and email:
            first_name = email.split('@')[0]
        
        # Prepare lead data for Zoho CRM
        lead_data = {
            'first_name': first_name,
            'last_name': last_name,
            'email': email,
            'phone': '',  # You might need to extract this from your data
            'description': f"Reply received: {reply_message}\n\nReply Time: {reply_time}",
            'company': 'Unknown Company'  # Default company name
        }
        
        print(f"=== DEBUG: Prepared lead data: {lead_data} ===")
        
        # Create lead in Zoho CRM - using default user_id 1
        success, message = zoho_handler.create_lead_in_zoho(user_id=1, lead_data=lead_data)
        
        if success:
            # ✅ UPDATE THE DATABASE TO MARK AS SYNCED
            cursor.execute(
                "UPDATE email_tracking SET added_to_zoho = 1 WHERE id = ?",
                (lead_id,)
            )
            connection.commit()
            print(f"=== DEBUG: Updated email_tracking for lead_id {lead_id} ===")
            return jsonify({'success': True, 'message': message})
        else:
            return jsonify({'success': False, 'message': message}), 500
            
    except Exception as e:
        print(f"Error adding lead to Zoho: {e}")
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500
    finally:
        if connection:
            connection.close()

@zoho_crm_bp.route('/get-replied-users')
def get_replied_users():
    """Get replied users - no authentication required"""
    connection = db.get_connection()
    if not connection:
        return jsonify({'success': False, 'message': 'Database connection failed'}), 500

    try:
        cursor = connection.cursor()
        
        # First, ensure the schema is correct
        cursor.execute("PRAGMA table_info(email_tracking)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'added_to_zoho' not in columns:
            # If column doesn't exist, add it
            cursor.execute("ALTER TABLE email_tracking ADD COLUMN added_to_zoho INTEGER DEFAULT 0")
            connection.commit()
            print("=== DEBUG: Added added_to_zoho column to email_tracking ===")
        
        cursor.execute("""
            SELECT 
                et.id,
                et.recipient_name,
                et.recipient_email,
                et.reply_message,
                et.reply_time,
                et.sent_time,
                ec.campaign_name,
                et.added_to_zoho
            FROM email_tracking et
            LEFT JOIN email_campaigns ec ON et.campaign_id = ec.id
            WHERE et.status = 'replied'
            ORDER BY et.reply_time DESC
        """)

        rows = cursor.fetchall()

        users_list = []
        for user in rows:
            users_list.append({
                'id': user[0],
                'name': user[1] or '',
                'email': user[2] or '',
                'reply_message': user[3] or '',
                'reply_time': user[4] or '',
                'sent_time': user[5] or '',
                'campaign_name': user[6] or '',
                'added_to_zoho': bool(user[7]) if user[7] is not None else False
            })

        return jsonify({'success': True, 'replied_users': users_list})

    except Exception as e:
        print("Error in get-replied-users:", e)
        return jsonify({'success': False, 'message': str(e)}), 500

    finally:
        if connection:
            connection.close()

@zoho_crm_bp.route('/disconnect', methods=['POST'])
def disconnect_zoho():
    """Disconnect Zoho CRM integration - no authentication required"""
    connection = db.get_connection()
    if not connection:
        return jsonify({'success': False, 'message': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor()
        
        # Remove Zoho tokens but keep client ID/secret if user wants to reconnect
        # Using default user_id 1
        cursor.execute("""
            UPDATE user_settings 
            SET zoho_access_token = NULL, zoho_refresh_token = NULL 
            WHERE user_id = ?
        """, (1,))
        
        connection.commit()
        return jsonify({'success': True, 'message': 'Zoho CRM disconnected successfully'})
        
    except Exception as e:
        print(f"Error disconnecting Zoho: {e}")
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500
    finally:
        if connection:
            connection.close()

# Add to the top of your zoho_routes.py file

@zoho_crm_bp.route('/get-leads-by-email', methods=['POST'])
def get_leads_by_email():
    """Get leads by email addresses"""
    data = request.json
    
    if not data or 'emails' not in data:
        return jsonify({'success': False, 'message': 'No emails provided'}), 400
    
    emails = data['emails']
    if not isinstance(emails, list):
        return jsonify({'success': False, 'message': 'Emails should be a list'}), 400
    
    try:
        access_token = zoho_handler.get_valid_access_token(DEFAULT_USER_ID)
        if not access_token:
            return jsonify({'success': False, 'message': 'No valid access token'}), 401
        
        leads_found = []
        leads_not_found = []
        
        for email in emails:
            lead = zoho_handler.find_lead_by_email(email, user_id=DEFAULT_USER_ID)
            if lead:
                leads_found.append({
                    'email': email,
                    'lead_id': lead.get('id'),
                    'name': f"{lead.get('First_Name', '')} {lead.get('Last_Name', '')}".strip(),
                    'company': lead.get('Company', ''),
                    'lead_status': lead.get('Lead_Status', '')
                })
            else:
                leads_not_found.append(email)
        
        return jsonify({
            'success': True,
            'leads_found': leads_found,
            'leads_not_found': leads_not_found,
            'total_found': len(leads_found),
            'total_not_found': len(leads_not_found)
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500

@zoho_crm_bp.route('/store-tracking', methods=['POST'])
def store_tracking_in_zoho():
    """Store email tracking data in Zoho CRM - ENHANCED VERSION"""
    data = request.json
    
    # Debug logging
    print(f"=== DEBUG: Received tracking data: {data} ===")
    
    required_fields = ['recipient_email', 'email_subject', 'tracking_data']
    for field in required_fields:
        if not data.get(field):
            return jsonify({
                'success': False, 
                'message': f'Missing required field: {field}'
            }), 400
    
    recipient_email = data['recipient_email']
    email_subject = data['email_subject']
    tracking_data = data['tracking_data']
    
    # Enhanced tracking data with defaults
    enhanced_tracking_data = {
        'opened': tracking_data.get('opened', False),
        'open_count': tracking_data.get('open_count', 0),
        'clicked': tracking_data.get('clicked', False),
        'click_count': tracking_data.get('click_count', 0),
        'read_duration': tracking_data.get('read_duration', 0),
        'engagement_score': tracking_data.get('engagement_score', 0),
        'device_type': tracking_data.get('device_type', 'Unknown'),
        'last_activity': tracking_data.get('last_activity', datetime.now().isoformat()),
        'activity_log': tracking_data.get('activity_log', []),
        'campaign_source': tracking_data.get('campaign_source', 'Email Campaign')
    }
    
    try:
        # Check if lead already exists
        existing_lead = zoho_handler.find_lead_by_email(recipient_email, user_id=DEFAULT_USER_ID)
        
        if existing_lead:
            # Update existing lead with tracking
            return update_lead_with_tracking(existing_lead, email_subject, enhanced_tracking_data)
        else:
            # Create new lead with tracking
            return create_lead_with_tracking(recipient_email, email_subject, enhanced_tracking_data)
            
    except Exception as e:
        error_msg = f'Error storing tracking data: {str(e)}'
        print(f"=== DEBUG: {error_msg} ===")
        return jsonify({'success': False, 'message': error_msg}), 500

def update_lead_with_tracking(lead, email_subject, tracking_data):
    """Update existing lead with tracking information"""
    try:
        lead_id = lead['id']
        access_token = zoho_handler.get_valid_access_token(DEFAULT_USER_ID)
        
        if not access_token:
            return jsonify({'success': False, 'message': 'No valid access token'}), 401
        
        # Create enhanced description
        existing_desc = lead.get('Description', '')
        
        # Create tracking summary
        tracking_summary = f"\n\n--- Email Tracking Update ---\n"
        tracking_summary += f"Campaign: {email_subject}\n"
        tracking_summary += f"Last Activity: {tracking_data['last_activity']}\n"
        tracking_summary += f"Engagement Score: {tracking_data['engagement_score']}/100\n"
        tracking_summary += f"Status: {'Opened' if tracking_data['opened'] else 'Not Opened'}"
        if tracking_data['opened']:
            tracking_summary += f" ({tracking_data['open_count']} times)"
        tracking_summary += f"\nClicked Links: {'Yes' if tracking_data['clicked'] else 'No'}"
        if tracking_data['clicked']:
            tracking_summary += f" ({tracking_data['click_count']} times)"
        tracking_summary += f"\nRead Duration: {tracking_data['read_duration']} seconds"
        tracking_summary += f"\nDevice: {tracking_data['device_type']}"
        
        # Add activity log if available
        if tracking_data.get('activity_log'):
            tracking_summary += f"\n\nActivity Log:"
            for activity in tracking_data['activity_log'][:5]:  # Show last 5 activities
                tracking_summary += f"\n• {activity}"
        
        # Truncate to Zoho's field limit (32000 chars)
        new_desc = existing_desc + tracking_summary
        if len(new_desc) > 32000:
            new_desc = new_desc[:31997] + "..."
        
        # Update lead in Zoho
        url = f"{ZOHO_API_DOMAIN}/crm/v2/Leads/{lead_id}"
        headers = {
            'Authorization': f'Zoho-oauthtoken {access_token}',
            'Content-Type': 'application/json'
        }
        
        update_data = {
            "data": [
                {
                    "Description": new_desc,
                    "Last_Activity_Time": tracking_data['last_activity']
                }
            ]
        }
        
        print(f"=== DEBUG: Updating lead {lead_id} with tracking data ===")
        response = requests.put(url, headers=headers, json=update_data)
        
        if response.status_code in [200, 201, 202]:
            response_data = response.json()
            
            # Add a note with detailed tracking
            if tracking_data.get('activity_log'):
                add_tracking_note_to_lead(lead_id, email_subject, tracking_data, access_token)
            
            return jsonify({
                'success': True,
                'message': 'Tracking data added to existing lead',
                'lead_id': lead_id,
                'lead_data': {
                    'id': lead['id'],
                    'name': f"{lead.get('First_Name', '')} {lead.get('Last_Name', '')}".strip(),
                    'email': lead.get('Email', ''),
                    'company': lead.get('Company', ''),
                    'lead_source': lead.get('Lead_Source', ''),
                    'description_preview': new_desc[:200] + ('...' if len(new_desc) > 200 else '')
                }
            })
        else:
            error_msg = f'Failed to update lead: {response.status_code} - {response.text}'
            print(f"=== DEBUG: {error_msg} ===")
            return jsonify({'success': False, 'message': error_msg}), 500
            
    except Exception as e:
        error_msg = f'Error updating lead: {str(e)}'
        print(f"=== DEBUG: {error_msg} ===")
        return jsonify({'success': False, 'message': error_msg}), 500

def create_lead_with_tracking(recipient_email, email_subject, tracking_data):
    """Create a new lead with tracking information"""
    try:
        # Extract name from email
        name_parts = recipient_email.split('@')[0].split('.')
        first_name = name_parts[0].title() if name_parts else ''
        last_name = name_parts[1].title() if len(name_parts) > 1 else 'Contact'
        
        # Create detailed description
        description = f"Lead created from email tracking\n\n"
        description += f"Campaign: {email_subject}\n"
        description += f"Tracking Summary:\n"
        description += f"- Engagement Score: {tracking_data['engagement_score']}/100\n"
        description += f"- Email Opened: {'Yes' if tracking_data['opened'] else 'No'}"
        if tracking_data['opened']:
            description += f" ({tracking_data['open_count']} times)\n"
        else:
            description += "\n"
        description += f"- Links Clicked: {'Yes' if tracking_data['clicked'] else 'No'}"
        if tracking_data['clicked']:
            description += f" ({tracking_data['click_count']} times)\n"
        else:
            description += "\n"
        description += f"- Read Duration: {tracking_data['read_duration']} seconds\n"
        description += f"- Last Activity: {tracking_data['last_activity']}\n"
        description += f"- Device: {tracking_data['device_type']}\n"
        
        if tracking_data.get('activity_log'):
            description += f"\nActivity History:\n"
            for activity in tracking_data['activity_log']:
                description += f"• {activity}\n"
        
        # Prepare lead data
        lead_data = {
            'first_name': first_name,
            'last_name': last_name,
            'email': recipient_email,
            'description': description[:32000],  # Zoho field limit
            'company': 'Unknown Company',
            'lead_source': tracking_data.get('campaign_source', 'Email Campaign Tracking'),
            'lead_status': 'Open'
        }
        
        # Create lead in Zoho CRM
        success, message = zoho_handler.create_lead_in_zoho(
            user_id=DEFAULT_USER_ID, 
            lead_data=lead_data
        )
        
        if success:
            # Get the newly created lead to add detailed notes
            new_lead = zoho_handler.find_lead_by_email(recipient_email, user_id=DEFAULT_USER_ID)
            
            if new_lead:
                lead_id = new_lead['id']
                access_token = zoho_handler.get_valid_access_token(DEFAULT_USER_ID)
                
                # Add detailed tracking as notes if available
                if tracking_data.get('activity_log') and len(tracking_data['activity_log']) > 0:
                    add_tracking_note_to_lead(lead_id, email_subject, tracking_data, access_token)
            
            return jsonify({
                'success': True,
                'message': 'New lead created in Zoho CRM with tracking data',
                'lead_created': True,
                'lead_id': new_lead['id'] if new_lead else None
            })
        else:
            return jsonify({'success': False, 'message': message}), 500
            
    except Exception as e:
        error_msg = f'Error creating lead: {str(e)}'
        print(f"=== DEBUG: {error_msg} ===")
        return jsonify({'success': False, 'message': error_msg}), 500

def add_tracking_note_to_lead(lead_id, email_subject, tracking_data, access_token):
    """Add detailed tracking information as a note to the lead"""
    try:
        url = f"{ZOHO_API_DOMAIN}/crm/v2/Leads/{lead_id}/Notes"
        headers = {
            'Authorization': f'Zoho-oauthtoken {access_token}',
            'Content-Type': 'application/json'
        }
        
        note_content = f"📊 Detailed Email Tracking Report\n\n"
        note_content += f"Campaign: {email_subject}\n"
        note_content += f"Tracking Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        note_content += "=" * 40 + "\n\n"
        
        # Add engagement metrics
        note_content += "📈 Engagement Metrics:\n"
        note_content += f"• Overall Score: {tracking_data['engagement_score']}/100\n"
        note_content += f"• Email Opened: {'✅ Yes' if tracking_data['opened'] else '❌ No'}"
        if tracking_data['opened']:
            note_content += f" (Opened {tracking_data['open_count']} times)\n"
        else:
            note_content += "\n"
        note_content += f"• Links Clicked: {'✅ Yes' if tracking_data['clicked'] else '❌ No'}"
        if tracking_data['clicked']:
            note_content += f" (Clicked {tracking_data['click_count']} links)\n"
        else:
            note_content += "\n"
        note_content += f"• Read Duration: {tracking_data['read_duration']} seconds\n"
        note_content += f"• Device Type: {tracking_data['device_type']}\n\n"
        
        # Add activity log
        if tracking_data.get('activity_log') and len(tracking_data['activity_log']) > 0:
            note_content += "📋 Activity Timeline:\n"
            for i, activity in enumerate(tracking_data['activity_log'][:10], 1):  # Show first 10 activities
                note_content += f"{i}. {activity}\n"
        
        note_data = {
            "data": [
                {
                    "Note_Title": f"Email Tracking: {email_subject}",
                    "Note_Content": note_content
                }
            ]
        }
        
        response = requests.post(url, headers=headers, json=note_data)
        if response.status_code in [200, 201]:
            print(f"=== DEBUG: Added tracking note to lead {lead_id} ===")
            return True
        else:
            print(f"=== DEBUG: Failed to add note: {response.status_code} - {response.text} ===")
            return False
            
    except Exception as e:
        print(f"=== DEBUG: Error adding tracking note: {e} ===")
        return False

@zoho_crm_bp.route('/batch-store-tracking', methods=['POST'])
def batch_store_tracking():
    """Store multiple tracking records in Zoho CRM at once"""
    data = request.json
    
    if not data or 'tracking_records' not in data:
        return jsonify({'success': False, 'message': 'No tracking records provided'}), 400
    
    tracking_records = data['tracking_records']
    if not isinstance(tracking_records, list):
        return jsonify({'success': False, 'message': 'tracking_records should be a list'}), 400
    
    if len(tracking_records) == 0:
        return jsonify({'success': False, 'message': 'No tracking records provided'}), 400
    
    results = {
        'total': len(tracking_records),
        'successful': 0,
        'failed': 0,
        'errors': [],
        'leads_created': 0,
        'leads_updated': 0,
        'details': []
    }
    
    # Process records in batches of 10 to avoid rate limits
    batch_size = 10
    for i in range(0, len(tracking_records), batch_size):
        batch = tracking_records[i:i + batch_size]
        
        for record in batch:
            try:
                # Validate required fields
                if not record.get('recipient_email') or not record.get('email_subject'):
                    error_msg = 'Missing required fields in record'
                    results['failed'] += 1
                    results['errors'].append({
                        'email': record.get('recipient_email', 'Unknown'),
                        'error': error_msg
                    })
                    continue
                
                # Prepare the request for single record
                from flask import request as flask_request
                
                # Create a mock request context
                with zoho_crm_bp.test_request_context(
                    method='POST',
                    json=record,
                    content_type='application/json'
                ):
                    # Call the single store-tracking endpoint
                    response = store_tracking_in_zoho()
                    response_data = json.loads(response.get_data(as_text=True))
                    
                    if response_data.get('success'):
                        results['successful'] += 1
                        
                        # Track if lead was created or updated
                        if response_data.get('lead_created'):
                            results['leads_created'] += 1
                        else:
                            results['leads_updated'] += 1
                        
                        # Add details
                        results['details'].append({
                            'email': record['recipient_email'],
                            'success': True,
                            'lead_id': response_data.get('lead_id'),
                            'action': 'created' if response_data.get('lead_created') else 'updated'
                        })
                    else:
                        results['failed'] += 1
                        results['errors'].append({
                            'email': record['recipient_email'],
                            'error': response_data.get('message', 'Unknown error')
                        })
                        
            except Exception as e:
                results['failed'] += 1
                results['errors'].append({
                    'email': record.get('recipient_email', 'Unknown'),
                    'error': str(e)
                })
        
        # Small delay between batches to avoid rate limiting
        if i + batch_size < len(tracking_records):
            import time
            time.sleep(1)
    
    # Prepare response
    response_data = {
        'success': results['successful'] > 0,
        'message': f"Processed {results['successful']} of {results['total']} tracking records",
        'results': results
    }
    
    # Add summary statistics
    response_data['summary'] = {
        'total_processed': results['total'],
        'successful': results['successful'],
        'failed': results['failed'],
        'leads_created': results['leads_created'],
        'leads_updated': results['leads_updated'],
        'success_rate': (results['successful'] / results['total']) * 100 if results['total'] > 0 else 0
    }
    
    return jsonify(response_data)

@zoho_crm_bp.route('/test-tracking-integration', methods=['POST'])
def test_tracking_integration():
    """Test the tracking integration with sample data"""
    try:
        # Create test data
        test_email = "test@example.com"
        test_subject = "Test Campaign - Email Tracking"
        
        test_tracking_data = {
            'opened': True,
            'open_count': 3,
            'clicked': True,
            'click_count': 2,
            'read_duration': 45,
            'engagement_score': 85,
            'device_type': 'Desktop',
            'last_activity': datetime.now().isoformat(),
            'activity_log': [
                'Email opened at 2024-01-15 10:30:00',
                'Link clicked at 2024-01-15 10:32:00',
                'Email opened at 2024-01-15 14:15:00',
                'Link clicked at 2024-01-15 14:16:00',
                'Email opened at 2024-01-16 09:45:00'
            ],
            'campaign_source': 'Test Campaign'
        }
        
        # Check connection first
        access_token = zoho_handler.get_valid_access_token(DEFAULT_USER_ID)
        if not access_token:
            return jsonify({
                'success': False,
                'message': 'Zoho CRM not connected. Please connect first.',
                'connection_status': 'disconnected'
            })
        
        # Test with the store-tracking endpoint
        test_record = {
            'recipient_email': test_email,
            'email_subject': test_subject,
            'tracking_data': test_tracking_data
        }
        
        # Create a mock request
        with zoho_crm_bp.test_request_context(
            method='POST',
            json=test_record,
            content_type='application/json'
        ):
            response = store_tracking_in_zoho()
            response_data = json.loads(response.get_data(as_text=True))
            
            if response_data.get('success'):
                return jsonify({
                    'success': True,
                    'message': 'Tracking integration test successful!',
                    'test_result': response_data,
                    'connection_status': 'connected'
                })
            else:
                return jsonify({
                    'success': False,
                    'message': f'Tracking test failed: {response_data.get("message")}',
                    'test_result': response_data,
                    'connection_status': 'connected'
                })
                
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Test failed with error: {str(e)}',
            'connection_status': 'error'
        })

@zoho_crm_bp.route('/get-tracking-summary', methods=['GET'])
def get_tracking_summary():
    """Get summary of all tracking data stored in Zoho"""
    try:
        access_token = zoho_handler.get_valid_access_token(DEFAULT_USER_ID)
        if not access_token:
            return jsonify({'success': False, 'message': 'No valid access token'}), 401
        
        # Search for leads with tracking information
        url = f"{ZOHO_API_DOMAIN}/crm/v2/Leads/search"
        headers = {
            'Authorization': f'Zoho-oauthtoken {access_token}',
            'Content-Type': 'application/json'
        }
        
        # Search for leads with email tracking keywords
        params = {
            'criteria': "(Lead_Source:equals:Email Campaign Tracking)or(Description:contains:Email Tracking)"
        }
        
        response = requests.get(url, headers=headers, params=params)
        
        if response.status_code == 200:
            data = response.json()
            leads = data.get('data', [])
            
            summary = {
                'total_tracked_leads': len(leads),
                'leads_by_status': {},
                'recent_activities': []
            }
            
            # Analyze leads
            for lead in leads:
                status = lead.get('Lead_Status', 'Unknown')
                if status not in summary['leads_by_status']:
                    summary['leads_by_status'][status] = 0
                summary['leads_by_status'][status] += 1
            
            # Get recent activities (last 10)
            for lead in leads[:10]:
                summary['recent_activities'].append({
                    'name': f"{lead.get('First_Name', '')} {lead.get('Last_Name', '')}".strip(),
                    'email': lead.get('Email', ''),
                    'company': lead.get('Company', ''),
                    'last_activity': lead.get('Last_Activity_Time', ''),
                    'lead_source': lead.get('Lead_Source', '')
                })
            
            return jsonify({
                'success': True,
                'summary': summary,
                'total_leads_found': len(leads)
            })
        else:
            return jsonify({
                'success': False,
                'message': f'Failed to fetch leads: {response.status_code}'
            }), 500
            
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500