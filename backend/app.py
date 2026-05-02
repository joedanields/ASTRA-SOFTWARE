import os
import re
import uuid
import logging
import smtplib
import ssl
from datetime import datetime, timezone
from email.message import EmailMessage

from dotenv import load_dotenv
from flask import Flask, request, jsonify, send_from_directory, abort
from flask_cors import CORS
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

load_dotenv()

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)s %(name)s %(message)s"
)
logger = logging.getLogger("astra-api")

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

BASE_DIR = os.path.dirname(__file__)
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, ".."))

app = Flask(__name__)


def configure_cors(app_instance):
    origins = os.getenv("CORS_ORIGINS", "*").strip()
    if origins == "*":
        CORS(app_instance, resources={r"/api/*": {"origins": "*"}})
        return

    origin_list = [item.strip() for item in origins.split(",") if item.strip()]
    if not origin_list:
        origin_list = "*"
    CORS(app_instance, resources={r"/api/*": {"origins": origin_list}})


configure_cors(app)


def resolve_frontend_path(requested_path):
    safe_path = requested_path.strip("/")
    if not safe_path:
        return "index.html"
    if safe_path.startswith("api"):
        abort(404)
    if safe_path.startswith("backend") or safe_path.startswith(".git"):
        abort(404)

    full_path = os.path.abspath(os.path.join(FRONTEND_DIR, safe_path))
    if not full_path.startswith(FRONTEND_DIR):
        abort(404)

    if os.path.isdir(full_path):
        abort(404)

    if not os.path.exists(full_path):
        if "." not in os.path.basename(safe_path):
            html_path = f"{safe_path}.html"
            html_full = os.path.abspath(os.path.join(FRONTEND_DIR, html_path))
            if html_full.startswith(FRONTEND_DIR) and os.path.exists(html_full):
                return html_path
        abort(404)

    return safe_path


def parse_recipients(raw):
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


def validate_payload(data):
    errors = {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip()
    message = (data.get("message") or "").strip()

    if not name:
        errors["name"] = "Name is required."
    elif len(name) > 120:
        errors["name"] = "Name is too long."

    if not email or not EMAIL_REGEX.match(email):
        errors["email"] = "Valid email is required."
    elif len(email) > 200:
        errors["email"] = "Email is too long."

    if len(message) < 10:
        errors["message"] = "Message must be at least 10 characters."
    elif len(message) > 5000:
        errors["message"] = "Message is too long."

    subject = (data.get("subject") or "").strip()
    if len(subject) > 200:
        errors["subject"] = "Subject is too long."

    service = (data.get("service") or "").strip()
    if len(service) > 120:
        errors["service"] = "Service is too long."

    return errors


def build_email_body(payload):
    lines = [
        "New contact form submission",
        "",
        f"Name: {payload['name']}",
        f"Email: {payload['email']}",
        f"Subject: {payload.get('subject') or 'N/A'}",
        f"Service: {payload.get('service') or 'N/A'}",
        f"Page: {payload.get('page') or 'N/A'}",
        f"IP: {payload.get('ip') or 'N/A'}",
        f"User Agent: {payload.get('user_agent') or 'N/A'}",
        "",
        "Message:",
        payload["message"],
        "",
        f"Timestamp (UTC): {payload['timestamp']}"
    ]
    return "\n".join(lines)


def send_email(payload):
    host = os.getenv("SMTP_HOST", "").strip()
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_PASSWORD", "").strip()
    from_addr = os.getenv("SMTP_FROM", "").strip() or username
    to_addrs = parse_recipients(os.getenv("SMTP_TO", ""))

    if not host or not from_addr or not to_addrs:
        raise RuntimeError("SMTP configuration is incomplete.")

    subject = payload.get("subject") or "Contact Form Submission"

    msg = EmailMessage()
    msg["Subject"] = f"[ASTRA] {subject}"
    msg["From"] = from_addr
    msg["To"] = ", ".join(to_addrs)
    if payload.get("email"):
        msg["Reply-To"] = payload["email"]
    msg.set_content(build_email_body(payload))

    context = ssl.create_default_context()
    with smtplib.SMTP(host, port, timeout=20) as server:
        server.ehlo()
        server.starttls(context=context)
        server.ehlo()
        if username and password:
            server.login(username, password)
        server.send_message(msg)

    return True


def get_sheets_service():
    creds_path = (
        os.getenv("GSHEETS_CREDENTIALS_PATH")
        or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    )

    if not creds_path:
        raise RuntimeError("GSHEETS_CREDENTIALS_PATH is not set.")

    scopes = ["https://www.googleapis.com/auth/spreadsheets"]
    creds = Credentials.from_service_account_file(creds_path, scopes=scopes)
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def append_to_sheet(payload):
    spreadsheet_id = os.getenv("SHEETS_SPREADSHEET_ID", "").strip()
    sheet_name = os.getenv("SHEETS_SHEET_NAME", "Sheet1").strip()

    if not spreadsheet_id:
        raise RuntimeError("SHEETS_SPREADSHEET_ID is not set.")

    service = get_sheets_service()
    values = [[
        payload["timestamp"],
        payload["name"],
        payload["email"],
        payload.get("subject") or "",
        payload.get("service") or "",
        payload["message"],
        payload.get("page") or "",
        payload.get("ip") or "",
        payload.get("user_agent") or ""
    ]]

    body = {"values": values}
    range_name = f"{sheet_name}!A1"

    service.spreadsheets().values().append(
        spreadsheetId=spreadsheet_id,
        range=range_name,
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body=body
    ).execute()

    return True


@app.post("/api/contact")
def contact():
    request_id = str(uuid.uuid4())
    data = request.get_json(silent=True) or {}
    errors = validate_payload(data)
    if errors:
        return jsonify(
            success=False,
            error="Validation failed.",
            details=errors,
            requestId=request_id
        ), 400

    payload = {
        "name": (data.get("name") or "").strip(),
        "email": (data.get("email") or "").strip(),
        "subject": (data.get("subject") or "").strip(),
        "service": (data.get("service") or "").strip(),
        "message": (data.get("message") or "").strip(),
        "page": (data.get("page") or "").strip(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "ip": request.headers.get("X-Forwarded-For", request.remote_addr),
        "user_agent": request.headers.get("User-Agent", "")
    }

    logger.info("Contact submission received requestId=%s email=%s", request_id, payload["email"])

    sheet_ok = False
    email_ok = False

    try:
        sheet_ok = append_to_sheet(payload)
    except HttpError as err:
        logger.exception("Google Sheets error requestId=%s: %s", request_id, err)
    except Exception as err:
        logger.exception("Sheet append failed requestId=%s: %s", request_id, err)

    try:
        email_ok = send_email(payload)
    except Exception as err:
        logger.exception("Email send failed requestId=%s: %s", request_id, err)

    if not sheet_ok and not email_ok:
        return jsonify(
            success=False,
            error="Submission failed. Please try again later.",
            requestId=request_id
        ), 500

    return jsonify(
        success=True,
        requestId=request_id,
        sheetSaved=sheet_ok,
        emailSent=email_ok
    ), 200


@app.get("/")
def serve_index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/<path:requested_path>")
def serve_frontend(requested_path):
    safe_path = resolve_frontend_path(requested_path)
    return send_from_directory(FRONTEND_DIR, safe_path)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "0").lower() in ("1", "true", "yes")
    app.run(host="0.0.0.0", port=port, debug=debug)
