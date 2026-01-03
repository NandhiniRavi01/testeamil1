from flask import Blueprint, request, jsonify, make_response
import secrets
from datetime import datetime, timedelta
from database import db

from functools import wraps

auth_bp = Blueprint("auth", __name__)


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Allow OPTIONS requests for CORS preflight
        if request.method == 'OPTIONS':
            return jsonify({'status': 'ok'}), 200
        
        session_token = request.cookies.get("session_token")
        if not session_token:
            return jsonify({"error": "Authentication required"}), 401
        
        user = db.get_user_by_session(session_token)
        if not user:
            return jsonify({"error": "Invalid or expired session"}), 401
        
        # Add user to request context for easy access
        request.user = user
        return f(*args, **kwargs)
    return decorated_function

 @auth_bp.route("/register", methods=["POST"])
 def register():
     data = request.json
     username = data.get("username")
     email = data.get("email")
     password = data.get("password")
    
     print(f"Register attempt - Username: {username}, Email: {email}")
    
     if not all([username, email, password]):
         return jsonify({"error": "Missing required fields"}), 400
    
     if len(password) < 6:
         return jsonify({"error": "Password must be at least 6 characters"}), 400
    
     user_id = db.create_user(username, email, password)
     if user_id:
         return jsonify({"message": "User created successfully", "user_id": user_id}), 201
     else:
         return jsonify({"error": "Username or email already exists"}), 400




@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.json
    username = data.get("username")
    password = data.get("password")
    
    print(f"Login attempt - Username: {username}")
    
    if not all([username, password]):
        return jsonify({"error": "Missing username or password"}), 400
    
    user = db.verify_user(username, password)
    if user:
        session_token = secrets.token_urlsafe(32)
        expires_at = datetime.now() + timedelta(days=7)
        
        if db.create_session(user["id"], session_token, expires_at):
            response = make_response(jsonify({
                "message": "Login successful",
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "email": user["email"],
                    "role": user.get("role", "user")  # ADD THIS LINE
                }
            }))
            response.set_cookie(
                "session_token",
                session_token,
                httponly=True,
                secure=False,
                samesite="Lax",
                max_age=7*24*60*60
            )
            return response
    
    return jsonify({"error": "Invalid username or password"}), 401

@auth_bp.route("/logout", methods=["POST"])
@login_required
def logout():
    session_token = request.cookies.get("session_token")
    if session_token:
        db.delete_session(session_token)
    
    response = make_response(jsonify({"message": "Logout successful"}))
    response.set_cookie("session_token", "", expires=0)
    return response

@auth_bp.route("/check-auth", methods=["GET"])
def check_auth():
    session_token = request.cookies.get("session_token")
    if session_token:
        user = db.get_user_by_session(session_token)
        if user:
            return jsonify({
                "authenticated": True,
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "email": user["email"],
                    "role": user.get("role", "user")  # ADD THIS LINE
                }
            })
    
    return jsonify({"authenticated": False})


@auth_bp.route("/permissions/my-permissions", methods=["GET"])
@login_required
def get_my_permissions():
    """Return current user's module permissions."""
    user_id = request.user["id"]
    permissions = db.get_user_permissions(user_id)
    return jsonify({"permissions": permissions})

@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    data = request.json
    email = data.get("email")
    
    if not email:
        return jsonify({"error": "Email is required"}), 400
    
    user = db.get_user_by_email(email)
    if user:
        reset_token = db.create_password_reset_token(user["id"])
        if reset_token:
            reset_link = f"http://localhost:3000/reset-password?token={reset_token}"
            print(f"Password reset link for {email}: {reset_link}")
            
            return jsonify({
                "message": "If an account with that email exists, a reset link has been sent",
                "reset_token": reset_token
            })
    
    return jsonify({
        "message": "If an account with that email exists, a reset link has been sent"
    })

@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    data = request.json
    token = data.get("token")
    new_password = data.get("new_password")
    
    if not all([token, new_password]):
        return jsonify({"error": "Token and new password are required"}), 400
    
    if len(new_password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    
    user = db.get_user_by_reset_token(token)
    if not user:
        return jsonify({"error": "Invalid or expired reset token"}), 400
    
    if db.update_user_password(user["id"], new_password):
        db.mark_reset_token_used(token)
        return jsonify({"message": "Password reset successfully"})
    else:
        return jsonify({"error": "Failed to reset password"}), 500

@auth_bp.route("/validate-reset-token", methods=["POST"])
def validate_reset_token():
    data = request.json
    token = data.get("token")
    
    if not token:
        return jsonify({"error": "Token is required"}), 400
    
    user = db.get_user_by_reset_token(token)
    if user:
        return jsonify({"valid": True, "username": user["username"]})
    else:
        return jsonify({"valid": False}), 400


# auth_routes.py - Add this decorator
def role_required(required_role):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # First check if user is authenticated
            session_token = request.cookies.get("session_token")
            if not session_token:
                return jsonify({"error": "Authentication required"}), 401
            
            user = db.get_user_by_session(session_token)
            if not user:
                return jsonify({"error": "Invalid or expired session"}), 401
            
            # Check role
            user_role = user.get("role", "user")
            
            # Define role hierarchy
            role_hierarchy = {
                "super_admin": 3,
                "admin": 2,
                "user": 1
            }
            
            if role_hierarchy.get(user_role, 0) < role_hierarchy.get(required_role, 0):
                return jsonify({"error": f"Insufficient permissions. {required_role} role required."}), 403
            
            # Add user to request context
            request.user = user
            return f(*args, **kwargs)
        return decorated_function
    return decorator


# auth_routes.py - Add these endpoints
@auth_bp.route("/admin/users", methods=["GET"])
@role_required("super_admin")  # Only super_admin can access
def get_all_users_admin():
    """Get all users (super_admin only)"""
    users = db.get_all_users()
    return jsonify({"users": users})

@auth_bp.route("/admin/create-user", methods=["POST"])
@role_required("super_admin")
def admin_create_user():
    """Create new user (super_admin only)"""
    data = request.json
    username = data.get("username")
    email = data.get("email")
    password = data.get("password")
    role = data.get("role", "user")
    
    if not all([username, email, password]):
        return jsonify({"error": "Missing required fields"}), 400
    
    allowed_roles = ["user", "admin"]
    if role not in allowed_roles:
        return jsonify({"error": f"Invalid role. Allowed: {allowed_roles}"}), 400
    
    if role == "super_admin":
        return jsonify({"error": "Cannot create super_admin via API"}), 403
    
    user_id = db.create_user_with_role(username, email, password, role)
    if user_id:
        # Get the newly created user with all fields
        connection = db.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                cursor.execute("""
                    SELECT id, username, email, role, created_at, is_active 
                    FROM users WHERE id = ?
                """, (user_id,))
                row = cursor.fetchone()
                
                if row:
                    return jsonify({
                        "message": "User created successfully",
                        "user": {
                            "id": row[0],
                            "username": row[1],
                            "email": row[2],
                            "role": row[3],
                            "created_at": row[4] if row[4] else datetime.now().isoformat(),  # Return as-is
                            "is_active": bool(row[5]) if row[5] is not None else True
                        }
                    }), 201
                    
            except Exception as e:
                print(f"Error fetching created user: {e}")
                # Fallback with current time
                return jsonify({
                    "message": "User created successfully",
                    "user": {
                        "id": user_id,
                        "username": username,
                        "email": email,
                        "role": role,
                        "created_at": datetime.now().isoformat(),
                        "is_active": True
                    }
                }), 201
            finally:
                if connection:
                    connection.close()
    
    return jsonify({"error": "Username or email already exists"}), 400


@auth_bp.route("/admin/users/<int:user_id>/role", methods=["PUT"])
@role_required("super_admin")
def update_user_role_admin(user_id):
    """Update user role (super_admin only)"""
    data = request.json
    new_role = data.get("role")
    
    if not new_role:
        return jsonify({"error": "Role is required"}), 400
    
    allowed_roles = ["user", "admin"]
    if new_role not in allowed_roles:
        return jsonify({"error": f"Invalid role. Allowed: {allowed_roles}"}), 400
    
    # Prevent modifying own role (security)
    if user_id == request.user["id"]:
        return jsonify({"error": "Cannot modify your own role"}), 403
    
    if db.update_user_role(user_id, new_role):
        return jsonify({"message": "User role updated successfully"})
    else:
        return jsonify({"error": "Failed to update user role"}), 500

@auth_bp.route("/admin/users/<int:user_id>", methods=["DELETE"])
@role_required("super_admin")
def delete_user_admin(user_id):
    """Deactivate user (soft delete)"""
    # Prevent deleting yourself
    if user_id == request.user["id"]:
        return jsonify({"error": "Cannot deactivate your own account"}), 403
    
    if db.deactivate_user(user_id):
        return jsonify({"message": "User deactivated successfully"})
    else:
        return jsonify({"error": "Failed to deactivate user"}), 500

@auth_bp.route("/admin/users/<int:user_id>/toggle", methods=["PUT"])
@role_required("super_admin")
def toggle_user_status(user_id):
    """Toggle user active status (super_admin only)"""
    # Get current status
    connection = db.get_connection()
    if connection:
        try:
            cursor = connection.cursor()
            cursor.execute("SELECT is_active FROM users WHERE id = ?", (user_id,))
            result = cursor.fetchone()
            
            if not result:
                return jsonify({"error": "User not found"}), 404
            
            # Toggle status
            new_status = 0 if result[0] else 1
            
            # Prevent toggling super_admin
            cursor.execute("SELECT role FROM users WHERE id = ?", (user_id,))
            user_role = cursor.fetchone()[0]
            if user_role == "super_admin":
                return jsonify({"error": "Cannot modify super_admin status"}), 403
            
            cursor.execute(
                "UPDATE users SET is_active = ? WHERE id = ?",
                (new_status, user_id)
            )
            connection.commit()
            
            return jsonify({
                "message": f"User {'activated' if new_status else 'deactivated'} successfully",
                "is_active": bool(new_status)
            })
            
        except sqlite3.Error as e:
            print(f"Error toggling user status: {e}")
            return jsonify({"error": "Database error"}), 500
        finally:
            if connection:
                connection.close()

    return jsonify({"error": "Database connection failed"}), 500
