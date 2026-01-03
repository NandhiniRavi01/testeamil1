"""
Email Validator API

POST /validate-emails
- Accepts CSV/XLS/XLSX file upload
- Validates each email using:
  1) RFC 5322 format regex
  2) DNS A/NS existence
  3) MX records
  4) Catch-all detection via SMTP RCPT with random local-part
  5) SMTP mailbox verification (RCPT TO without sending)
  6) Role-based detection (info, sales, contact, admin, support, hello, team)

Returns JSON summary and saves validated-emails.xlsx
"""

from flask import Blueprint, request, jsonify, send_file
from werkzeug.utils import secure_filename
import io
import os
import re
import random
import string
import socket
import smtplib
from typing import Optional, Tuple

import pandas as pd
import dns.resolver

# Blueprint
email_validator_bp = Blueprint("email_validator", __name__)


# --- Helper functions ---

RFC5322_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$")
ROLE_LOCAL_PARTS = {"info", "sales", "contact", "admin", "support", "hello", "team"}


def validate_email_format(email: str) -> Tuple[bool, str]:
    if not isinstance(email, str):
        return False, "FAIL - Not a string"
    email = email.strip()
    if not email:
        return False, "FAIL - Empty"
    if RFC5322_REGEX.match(email):
        return True, "OK"
    return False, "FAIL - Invalid format"


def _extract_domain(email: str) -> Optional[str]:
    try:
        return email.split("@", 1)[1].strip()
    except Exception:
        return None


def check_dns(domain: str) -> Tuple[bool, str]:
    """Check if domain exists via DNS A/NS records"""
    try:
        # Try resolving A or NS records
        dns.resolver.resolve(domain, "A")
        return True, "OK"
    except Exception:
        try:
            dns.resolver.resolve(domain, "NS")
            return True, "OK"
        except Exception:
            return False, "FAIL - Domain not found"


def check_mx(domain: str) -> Tuple[bool, Optional[str], str]:
    """Return best MX host for domain"""
    try:
        answers = dns.resolver.resolve(domain, "MX")
        # Sort by preference (lower is better)
        mx_records = sorted([(r.preference, str(r.exchange).rstrip(".")) for r in answers], key=lambda x: x[0])
        if not mx_records:
            return False, None, "FAIL - No mail server (MX) found"
        return True, mx_records[0][1], "OK"
    except Exception:
        return False, None, "FAIL - No mail server (MX) found"


def _smtp_connect(mx_host: str, timeout: int = 10) -> Optional[smtplib.SMTP]:
    try:
        socket.setdefaulttimeout(timeout)
        server = smtplib.SMTP(mx_host, 25, timeout=timeout)
        server.ehlo_or_helo_if_needed()
        # Some servers require TLS for any RCPT checks
        try:
            server.starttls()
            server.ehlo()
        except Exception:
            # If TLS not supported, continue without it
            pass
        return server
    except Exception:
        return None


def check_catch_all(domain: str, mx_host: Optional[str]) -> Tuple[Optional[bool], str]:
    """Attempt RCPT TO for random local-part to detect catch-all.
    Returns (is_catch_all, message). None means unable to determine.
    """
    if not mx_host:
        return None, "UNKNOWN - MX unavailable"

    server = _smtp_connect(mx_host)
    if not server:
        return None, "UNKNOWN - SMTP connect failed"

    try:
        fake_local = "test_" + ''.join(random.choices(string.ascii_lowercase + string.digits, k=10))
        fake_rcpt = f"{fake_local}@{domain}"

        # Basic handshake
        server.mail("<test@validator.local>")
        code, _ = server.rcpt(f"<{fake_rcpt}>")

        # If server accepts random recipient with 250, likely catch-all
        if code == 250:
            return True, "UNKNOWN - Catch-all domain"
        elif code in (550, 551, 552, 553):
            return False, "NOT catch-all"
        else:
            return None, "UNKNOWN - Server protected"
    except Exception:
        return None, "UNKNOWN - Server protected"
    finally:
        try:
            server.quit()
        except Exception:
            pass


def smtp_mailbox_check(email: str, mx_host: Optional[str]) -> Tuple[str, int]:
    """Verify mailbox via RCPT TO without sending email.
    Returns (status_message, smtp_code)
    """
    if not mx_host:
        return "UNKNOWN - MX unavailable", -1

    server = _smtp_connect(mx_host)
    if not server:
        return "UNKNOWN - SMTP connect failed", -1

    try:
        server.mail("<test@validator.local>")
        code, _ = server.rcpt(f"<{email}>")

        if code == 250:
            return "PASS - Verified", code
        elif code in (550, 551):
            return "FAIL - Mailbox does not exist", code
        else:
            return "UNKNOWN - Server protected", code
    except Exception:
        return "UNKNOWN - Server protected", -1
    finally:
        try:
            server.quit()
        except Exception:
            pass


def detect_role_account(email: str) -> bool:
    try:
        local = email.split("@", 1)[0].lower()
        return local in ROLE_LOCAL_PARTS
    except Exception:
        return False


def _find_email_column(df: pd.DataFrame) -> Optional[str]:
    # Prefer columns whose name includes 'email'
    for col in df.columns:
        if re.search(r"email", str(col), flags=re.IGNORECASE):
            return col
    # Fallback: inspect values for regex matches
    for col in df.columns:
        sample = df[col].dropna().astype(str).head(50)
        if any(RFC5322_REGEX.match(v.strip()) for v in sample):
            return col
    return None


def process_file(file_storage) -> Tuple[str, dict]:
    """Process uploaded file and return saved path + summary."""
    filename = secure_filename(file_storage.filename or "uploaded.xlsx")
    content = file_storage.read()
    stream = io.BytesIO(content)

    # Read file via pandas
    try:
        if filename.lower().endswith((".xls", ".xlsx")):
            df = pd.read_excel(stream)
        else:
            # Default to CSV
            df = pd.read_csv(stream)
    except Exception as e:
        raise ValueError(f"Failed to read file: {e}")

    email_col = _find_email_column(df)
    if not email_col:
        raise ValueError("No email column found")

    statuses = []
    summary = {"total": 0, "pass": 0, "fail": 0, "unknown": 0, "role_based": 0}

    for _, row in df.iterrows():
        email = str(row.get(email_col, "")).strip()
        if not email:
            statuses.append("FAIL - Empty")
            summary["fail"] += 1
            continue

        summary["total"] += 1

        # a) Format
        ok, msg = validate_email_format(email)
        if not ok:
            statuses.append(msg)
            summary["fail"] += 1
            continue

        # b) DNS
        domain = _extract_domain(email)
        dns_ok, dns_msg = check_dns(domain)
        if not dns_ok:
            statuses.append(dns_msg)
            summary["fail"] += 1
            continue

        # c) MX
        mx_ok, mx_host, mx_msg = check_mx(domain)
        if not mx_ok:
            statuses.append(mx_msg)
            summary["fail"] += 1
            continue

        # d) Catch-all
        catch_all, catch_msg = check_catch_all(domain, mx_host)
        if catch_all is True:
            statuses.append(catch_msg)  # UNKNOWN - Catch-all domain
            summary["unknown"] += 1
            # Proceed to mailbox check anyway (some catch-all still reject real mailboxes)

        # e) SMTP mailbox check
        smtp_msg, code = smtp_mailbox_check(email, mx_host)
        if smtp_msg.startswith("PASS"):
            statuses.append(smtp_msg)
            summary["pass"] += 1
        elif smtp_msg.startswith("FAIL"):
            statuses.append(smtp_msg)
            summary["fail"] += 1
        else:
            statuses.append(smtp_msg)
            summary["unknown"] += 1

        # f) Role-based detection
        if detect_role_account(email):
            summary["role_based"] += 1

    # Create a clean output with only email and validation status columns
    output_df = pd.DataFrame({
        "Email": df[email_col].values,
        "Validation Status": statuses
    })

    # Save to file
    out_path = os.path.join(os.path.dirname(__file__), "..", "validated-emails.xlsx")
    out_path = os.path.abspath(out_path)
    try:
        with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
            output_df.to_excel(writer, index=False)
    except Exception as e:
        raise ValueError(f"Failed to write output: {e}")

    return out_path, summary


@email_validator_bp.route("/validate-emails", methods=["POST"])
def validate_emails_route():
    try:
        if "file" not in request.files:
            return jsonify({"error": "No file uploaded. Use form field 'file'"}), 400

        file = request.files["file"]
        if not file or not file.filename:
            return jsonify({"error": "No file selected"}), 400

        saved_path, summary = process_file(file)

        return jsonify({
            "success": True,
            "summary": summary,
            "file_url": "/download/validated-emails"
        })
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        return jsonify({"error": f"Internal error: {e}"}), 500


@email_validator_bp.route("/download/validated-emails", methods=["GET"])
def download_validated_emails():
    out_path = os.path.join(os.path.dirname(__file__), "..", "validated-emails.xlsx")
    out_path = os.path.abspath(out_path)
    if not os.path.exists(out_path):
        return jsonify({"error": "File not found. Run /validate-emails first."}), 404
    return send_file(out_path, as_attachment=True)
