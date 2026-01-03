from flask import Blueprint, request, jsonify
from database import db
from routes.auth_routes import role_required, login_required

role_bp = Blueprint("roles", __name__)


@role_bp.route("/users", methods=["GET"])
@role_required("super_admin")
def list_users():
    users = db.get_all_users_with_permissions()
    return jsonify({"users": users})


@role_bp.route("/modules", methods=["GET"])
@role_required("super_admin")
def list_modules():
    modules = db.get_all_modules()
    return jsonify({"modules": modules})


@role_bp.route("/activity-log", methods=["GET"])
@role_required("super_admin")
def get_activity_log():
    limit = request.args.get("limit", 100, type=int)
    logs = db.get_activity_log(limit=limit)
    return jsonify({"logs": logs})


@role_bp.route("/activity-log/clear", methods=["DELETE"])
@role_required("super_admin")
def clear_activity_log():
    if db.clear_activity_logs():
        return jsonify({"message": "Activity logs cleared"})
    return jsonify({"error": "Failed to clear activity logs"}), 500


@role_bp.route("/user/<int:user_id>/role", methods=["PUT"])
@role_required("super_admin")
def update_user_role(user_id):
    data = request.get_json() or {}
    new_role = data.get("role")

    if not new_role:
        return jsonify({"error": "Role is required"}), 400

    if user_id == request.user["id"]:
        return jsonify({"error": "Cannot modify your own role"}), 403

    # Get user info for detailed logging
    target_user = db.get_user_by_id(user_id)
    if not target_user:
        return jsonify({"error": "User not found"}), 404
    
    old_role = target_user.get('role')
    
    if db.update_user_role(user_id, new_role):
        db.log_activity(
            request.user["id"], 
            "update_role", 
            None, 
            f"Changed {target_user.get('username', 'Unknown')}'s role from {old_role} to {new_role}",
            target_user_id=user_id,
            old_value=old_role,
            new_value=new_role
        )
        return jsonify({"message": "User role updated"})
    return jsonify({"error": "Failed to update role"}), 500


@role_bp.route("/user/<int:user_id>/toggle-status", methods=["PUT"])
@role_required("super_admin")
def toggle_user_status(user_id):
    data = request.get_json() or {}
    is_active = data.get("is_active")
    if is_active is None:
        return jsonify({"error": "is_active is required"}), 400

    if user_id == request.user["id"]:
        return jsonify({"error": "Cannot modify your own status"}), 403

    # Get user info for detailed logging
    target_user = db.get_user_by_id(user_id)
    if not target_user:
        return jsonify({"error": "User not found"}), 404
    
    old_status = "active" if target_user.get('is_active') else "inactive"
    new_status = "active" if is_active else "inactive"
    
    if db.update_user_status(user_id, 1 if is_active else 0):
        db.log_activity(
            request.user["id"], 
            "toggle_user", 
            None, 
            f"Changed {target_user.get('username', 'Unknown')}'s status from {old_status} to {new_status}",
            target_user_id=user_id,
            old_value=old_status,
            new_value=new_status
        )
        return jsonify({"message": "User status updated", "is_active": bool(is_active)})
    return jsonify({"error": "Failed to update status"}), 500


@role_bp.route("/user/<int:user_id>", methods=["DELETE"])
@role_required("super_admin")
def delete_user(user_id):
    if user_id == request.user["id"]:
        return jsonify({"error": "Cannot delete your own account"}), 403

    if db.delete_user(user_id):
        db.log_activity(request.user["id"], "delete_user", None, f"Deleted user {user_id}")
        return jsonify({"message": "User deleted"})
    return jsonify({"error": "Failed to delete user"}), 500


@role_bp.route("/user/<int:user_id>/permissions/batch", methods=["POST"])
@role_required("super_admin")
def update_permissions(user_id):
    payload = request.get_json() or {}
    permissions = payload.get("permissions", {})

    if not isinstance(permissions, dict):
        return jsonify({"error": "permissions must be an object"}), 400

    success = True
    for module_key, can_access in permissions.items():
        if not db.set_user_permission(user_id, module_key, bool(can_access), request.user["id"]):
            success = False

    if success:
        db.log_activity(request.user["id"], "update_permissions", None, f"Updated permissions for user {user_id}")
        return jsonify({"message": "Permissions updated"})
    return jsonify({"error": "Failed to update permissions"}), 500
