# ASTRA-SOFTWARE

This project is a static frontend with a Python backend that handles contact form submissions.
Submissions are sent via SMTP and stored in Google Sheets.

## Backend Setup (Flask)

1. Create and activate a virtual environment.
2. Install dependencies from backend/requirements.txt.
3. Copy backend/.env.example to backend/.env and fill in values.
4. Place your Google service account JSON file at backend/credentials.json.
5. Run the server with python app.py inside the backend folder.

Example commands (Windows PowerShell):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python app.py
```

The API endpoint is POST /api/contact.

## Google Sheets API Setup

1. Create a Google Cloud project.
2. Enable the Google Sheets API.
3. Create a service account and download the JSON key.
4. Share your Google Sheet with the service account email (Editor access).
5. Set SHEETS_SPREADSHEET_ID and SHEETS_SHEET_NAME in backend/.env.
6. Place the JSON key at backend/credentials.json and set GSHEETS_CREDENTIALS_PATH if needed.

## Gmail SMTP Setup

1. Enable 2-Step Verification for your Google account.
2. Create an App Password for Mail.
3. Use smtp.gmail.com on port 587.
4. Set SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM, and SMTP_TO in backend/.env.

## Frontend Integration

The frontend sends contact form submissions with fetch() to /api/contact.
When served on localhost with a non-5000 port, it defaults to http://localhost:5000.
If your backend runs on a different origin, set CORS_ORIGINS in backend/.env
and define window.ASTRA_API_BASE before loading js/main.js.

## Logging

The backend uses Python logging. Set LOG_LEVEL in backend/.env.

## Render Deployment (Single Service)

This setup serves the HTML/CSS/JS from Flask and exposes the API on the same domain.

Render Web Service settings:

- Root Directory: backend
- Build Command: pip install -r requirements.txt
- Start Command: gunicorn app:app

Environment variables to set in Render:

- SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM, SMTP_TO
- SHEETS_SPREADSHEET_ID, SHEETS_SHEET_NAME
- GSHEETS_CREDENTIALS_PATH=/etc/secrets/credentials.json
- CORS_ORIGINS=https://your-render-domain.onrender.com

Secrets:

- Add a Secret File at /etc/secrets/credentials.json with your service account JSON.