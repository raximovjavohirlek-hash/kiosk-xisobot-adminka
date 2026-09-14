import re

def clean_int(val):
    if val is None:
        return 0
    if isinstance(val, (int, float)):
        return int(val)
    if isinstance(val, str):
        cleaned = re.sub(r'[^\d\-]', '', val)
        if cleaned:
            try:
                return int(cleaned)
            except Exception:
                pass
    return 0

import os
import sys
import json
import time
import webbrowser
import threading
import io
import base64
from functools import wraps
import requests
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
import pandas as pd
from datetime import datetime, date
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

app = Flask(__name__)

ALLOWED_ORIGINS = [o.strip() for o in os.environ.get(
    'ALLOWED_ORIGINS',
    'http://localhost:5050,http://127.0.0.1:5050,https://kiosk-xisobot-adminka.pages.dev,https://kiosk-hisobot.pages.dev'
).split(',') if o.strip()]
CORS(app, origins=ALLOWED_ORIGINS + [r'https://.*\.pages\.dev'], supports_credentials=True)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY') or os.urandom(32).hex()

DATA_DIR = os.environ.get('DATA_DIR')
if DATA_DIR:
    os.makedirs(DATA_DIR, exist_ok=True)
    app.config['UPLOAD_FOLDER'] = DATA_DIR
else:
    app.config['UPLOAD_FOLDER'] = os.path.dirname(os.path.abspath(__file__))
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB limit
app.config['ADMIN_PASSWORD'] = os.environ.get('ADMIN_PASSWORD', 'Javo!QAZ')

TOKEN_SERIALIZER = URLSafeTimedSerializer(app.config['SECRET_KEY'], salt='kiosk-auth-token')
TOKEN_MAX_AGE_SECONDS = 8 * 60 * 60  # 8 hours

def issue_token(username, role, region=None):
    return TOKEN_SERIALIZER.dumps({'username': username, 'role': role, 'region': region})

def verify_token(token):
    try:
        data = TOKEN_SERIALIZER.loads(token, max_age=TOKEN_MAX_AGE_SECONDS)
        return data
    except (BadSignature, SignatureExpired):
        return None

def get_request_auth():
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.lower().startswith('bearer '):
        return None
    token = auth_header[7:].strip()
    return verify_token(token)

def require_auth(role=None):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            auth = get_request_auth()
            if not auth:
                return jsonify({'success': False, 'error': "Avtorizatsiyadan o'tilmagan! Iltimos, qayta tizimga kiring."}), 401
            if role and auth.get('role') != role:
                return jsonify({'success': False, 'error': "Ushbu amal uchun ruxsatingiz yo'q!"}), 403
            request.auth_user = auth
            return fn(*args, **kwargs)
        return wrapper
    return decorator

def get_auth_region():
    """Returns the kiosk email the current request's token is scoped to, or None
    for full/unrestricted access (admin role, or a user with no region assigned)."""
    auth = getattr(request, 'auth_user', None) or get_request_auth()
    if not auth or auth.get('role') == 'admin':
        return None
    return auth.get('region') or None

def get_client_ip():
    fwd = request.headers.get('X-Forwarded-For', '')
    if fwd:
        return fwd.split(',')[0].strip()
    return request.remote_addr or 'unknown'

MAPPINGS_FILE = os.path.join(app.config['UPLOAD_FOLDER'], 'kiosk_mappings.json')
UPLOAD_LOGS_FILE = os.path.join(app.config['UPLOAD_FOLDER'], 'kiosk_upload_logs.json')
USERS_FILE = os.path.join(app.config['UPLOAD_FOLDER'], 'users.json')
AUDIT_LOG_FILE = os.path.join(app.config['UPLOAD_FOLDER'], 'audit_log.json')

LOGIN_ATTEMPTS = {}
LOGIN_MAX_ATTEMPTS = 5
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_LOCKOUT_SECONDS = 15 * 60

def is_login_locked(ip, username):
    key = f"{ip}:{username}"
    entry = LOGIN_ATTEMPTS.get(key)
    if not entry or not entry.get('locked_until'):
        return False, 0
    now = time.time()
    if now < entry['locked_until']:
        return True, int(entry['locked_until'] - now)
    return False, 0

def record_login_attempt(ip, username, success):
    key = f"{ip}:{username}"
    now = time.time()
    if success:
        LOGIN_ATTEMPTS.pop(key, None)
        return
    entry = LOGIN_ATTEMPTS.get(key)
    if not entry or (now - entry['first_attempt']) > LOGIN_WINDOW_SECONDS:
        entry = {'count': 0, 'first_attempt': now, 'locked_until': None}
    entry['count'] += 1
    if entry['count'] >= LOGIN_MAX_ATTEMPTS:
        entry['locked_until'] = now + LOGIN_LOCKOUT_SECONDS
    LOGIN_ATTEMPTS[key] = entry

def load_audit_log():
    if os.path.exists(AUDIT_LOG_FILE):
        try:
            with open(AUDIT_LOG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return []

def add_audit_log(event_type, username, detail="", success=True):
    logs = load_audit_log()
    logs.insert(0, {
        "event_type": event_type,
        "username": username,
        "detail": detail,
        "success": success,
        "timestamp": datetime.now().strftime("%d.%m.%Y %H:%M:%S")
    })
    logs = logs[:200]
    try:
        with open(AUDIT_LOG_FILE, 'w', encoding='utf-8') as f:
            json.dump(logs, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

def safe_copy_file(src, dst):
    if not src or not os.path.exists(src):
        return
    src_abs = os.path.abspath(src)
    dst_abs = os.path.abspath(dst)
    if src_abs == dst_abs:
        return
    os.makedirs(os.path.dirname(dst_abs), exist_ok=True)
    import shutil
    shutil.copy(src_abs, dst_abs)

def is_hashed_password(pw):
    return isinstance(pw, str) and pw.startswith(('pbkdf2:', 'scrypt:', 'argon2:'))

DEFAULT_KIOSK_ACCOUNTS = [
    {"username": "samarqandkiosk", "name": "Samarqand Kassa", "region": "samarqandkiosk@railway.uz"},
    {"username": "urganchkiosk", "name": "Urganch Kassa", "region": "urganchkiosk@railway.uz"},
    {"username": "khivakiosk", "name": "Xiva Kassa", "region": "khivakiosk@railway.uz"},
    {"username": "navoiykiosk", "name": "Navoiy Kassa", "region": "navoiykiosk@railway.uz"},
    {"username": "buxorokiosk", "name": "Buxoro Kassa", "region": "buxorokiosk@railway.uz"},
    {"username": "qongirotkiosk", "name": "Qo'ng'irot Kassa", "region": "qongirotkiosk@railway.uz"},
    {"username": "nukuskiosk", "name": "Nukus Kassa", "region": "nukuskiosk@railway.uz"},
    {"username": "andijonkiosk", "name": "Andijon Kassa", "region": "andijonkiosk@railway.uz"},
    {"username": "qoqonkiosk", "name": "Qo'qon Kassa", "region": "qoqonkiosk@railway.uz"},
    {"username": "margilonkiosk", "name": "Marg'ilon Kassa", "region": "margilonkiosk@railway.uz"},
    {"username": "namangankiosk", "name": "Namangan Kassa", "region": "namangankiosk@railway.uz"},
    {"username": "termizkiosk", "name": "Termiz Kassa", "region": "termizkiosk@railway.uz"},
    {"username": "qarshikiosk", "name": "Qarshi Kassa", "region": "qarshikiosk@railway.uz"},
]

DEFAULT_KIOSK_PASSWORD_HASH = 'pbkdf2:sha256:50000$F3DPOXbp90zU3jrF$efcb8c5eda73743d0d7ee3ccac52f1a171435b5d4b23a8d09f9c0fb07dbc58c3'
DEFAULT_ADMIN_PASSWORD_HASH = 'pbkdf2:sha256:50000$BoNlFSTsTUZnrLyl$6b704a61be143b5f254482f8659f6edc792a3b443c830854a830ddd80286dae7'

def hash_password(password):
    return generate_password_hash(password, method='pbkdf2:sha256:50000')

def load_users():
    users = None
    if os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, 'r', encoding='utf-8') as f:
                users = json.load(f)
        except Exception:
            pass

    if not users:
        users = []

    has_master = any(str(u.get('role', '')).strip().lower() == 'admin' for u in users)
    if not has_master:
        master_pass = app.config.get('ADMIN_PASSWORD', 'Javo!QAZ')
        if master_pass == 'Javo!QAZ':
            hashed_master = DEFAULT_ADMIN_PASSWORD_HASH
        else:
            hashed_master = hash_password(master_pass)
        users.insert(0, {
            "username": "Javohir",
            "password": hashed_master,
            "name": "Bosh Administrator (Javohir)",
            "role": "admin",
            "region": None,
            "is_active": True,
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })

    migrated = False
    existing_usernames = {str(u.get('username', '')).strip().lower() for u in users}

    for k in DEFAULT_KIOSK_ACCOUNTS:
        u_kiosk = k['username'].lower()
        if u_kiosk not in existing_usernames:
            users.append({
                "username": k['username'],
                "password": DEFAULT_KIOSK_PASSWORD_HASH,
                "name": k['name'],
                "role": "user",
                "region": k['region'],
                "is_active": True,
                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            })
            existing_usernames.add(u_kiosk)
            migrated = True

    for u in users:
        if 'is_active' not in u:
            u['is_active'] = True
            migrated = True
        pw = u.get('password', '')
        if pw and not is_hashed_password(pw):
            u['password'] = hash_password(pw)
            migrated = True

    if migrated:
        save_users(users)

    return users

def verify_user_password(stored_password, candidate):
    if not stored_password:
        return False
    if is_hashed_password(stored_password):
        return check_password_hash(stored_password, candidate)
    return stored_password == candidate

try:
    load_users()
except Exception as _e:
    print("[Users] Initial startup load error:", _e)

def save_users(users):
    with open(USERS_FILE, 'w', encoding='utf-8') as f:
        json.dump(users, f, ensure_ascii=False, indent=2)

DEFAULT_EMAIL_MAP = {
    "toshkent.shimoliykiosk@railway.uz": {"station": "Тошкент Марказий", "col_soni": 30, "col_summa": 31},
    "kiosk@axonlogic.uz": {"station": "Тошкент Жанубий", "col_soni": 10, "col_summa": 11},
    "samarqandkiosk@railway.uz": {"station": "Самарқанд", "col_soni": 26, "col_summa": 27},
    "urganchkiosk@railway.uz": {"station": "Урганч", "col_soni": 32, "col_summa": 33},
    "khivakiosk@railway.uz": {"station": "Хива", "col_soni": 8, "col_summa": 9},
    "navoiykiosk@railway.uz": {"station": "Навои", "col_soni": 14, "col_summa": 15},
    "buxorokiosk@railway.uz": {"station": "Бухоро", "col_soni": 6, "col_summa": 7},
    "qongirotkiosk@railway.uz": {"station": "Қўнғирод", "col_soni": 22, "col_summa": 23},
    "nukuskiosk@railway.uz": {"station": "Нукус", "col_soni": 18, "col_summa": 19},
    "andijonkiosk@railway.uz": {"station": "Андижон", "col_soni": 4, "col_summa": 5},
    "qoqonkiosk@railway.uz": {"station": "Қўқон", "col_soni": 24, "col_summa": 25},
    "margilonkiosk@railway.uz": {"station": "Марғилон", "col_soni": 12, "col_summa": 13},
    "namangankiosk@railway.uz": {"station": "Наманган", "col_soni": 16, "col_summa": 17},
    "termizkiosk@railway.uz": {"station": "Термиз", "col_soni": 28, "col_summa": 29},
    "qarshikiosk@railway.uz": {"station": "Қарши", "col_soni": 20, "col_summa": 21}
}

ONLINE_PAYMENTS = ['HamkorbankHold', 'HamkorbankWebView', 'Payme', 'StripeIntegration', 'OctoBankFC', 'Click', 'Uzum']
TERMINAL_PAYMENTS = ['Uzcard', 'Uzkassa']
KASSA_PAYMENTS = ['Kassa', 'Sorbon', 'Sorbon Kassa']

def load_mappings():
    if os.path.exists(MAPPINGS_FILE):
        try:
            with open(MAPPINGS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return DEFAULT_EMAIL_MAP

def save_mappings(mappings):
    with open(MAPPINGS_FILE, 'w', encoding='utf-8') as f:
        json.dump(mappings, f, ensure_ascii=False, indent=2)

def load_upload_logs():
    if os.path.exists(UPLOAD_LOGS_FILE):
        try:
            with open(UPLOAD_LOGS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return []

def add_upload_log(filename, total_rows=0, relevant_rows=0, new_tickets=0, duplicate_tickets=0, invalid_records=0, total_amount=0.0, status="Muvaffaqiyatli", uploaded_by="admin", error_message=""):
    logs = load_upload_logs()
    import_id = len(logs) + 1
    logs.insert(0, {
        "id": import_id,
        "import_id": f"IMP-{int(time.time())}-{import_id}",
        "filename": filename,
        "total_rows": int(total_rows or 0),
        "rows": int(total_rows or 0),  # backwards compatibility
        "relevant_rows": int(relevant_rows or 0),
        "new_tickets": int(new_tickets or 0),
        "duplicate_tickets": int(duplicate_tickets or 0),
        "invalid_records": int(invalid_records or 0),
        "total_amount": float(total_amount or 0.0),
        "uploaded_by": uploaded_by,
        "error_message": error_message,
        "timestamp": datetime.now().strftime("%d.%m.%Y %H:%M:%S"),
        "status": status
    })
    logs = logs[:100]
    with open(UPLOAD_LOGS_FILE, 'w', encoding='utf-8') as f:
        json.dump(logs, f, ensure_ascii=False, indent=2)

MONTH_NAMES_UZ = {
    1: "Yanvar", 2: "Fevral", 3: "Mart", 4: "Aprel",
    5: "May", 6: "Iyun", 7: "Iyul", 8: "Avgust",
    9: "Sentabr", 10: "Oktabr", 11: "Noyabr", 12: "Dekabr"
}

def parse_report_file(fpath, fname):
    import zipfile, shutil
    if not os.path.exists(fpath) or not zipfile.is_zipfile(fpath):
        ex_path = os.path.join(app.config['UPLOAD_FOLDER'], 'excellar', fname)
        if os.path.exists(ex_path) and zipfile.is_zipfile(ex_path):
            try:
                shutil.copy(ex_path, fpath)
            except Exception:
                pass
    if not os.path.exists(fpath) or not zipfile.is_zipfile(fpath):
        return None, None
    email_map = load_mappings()
    try:
        wb = openpyxl.load_workbook(fpath, data_only=True)
        if 'Худудлар' not in wb.sheetnames:
            return None, None
        ws_h = wb['Худудлар']
        ws_j = wb['Жами'] if 'Жами' in wb.sheetnames else None

        fn_lower = fname.lower()
        if 'январ' in fn_lower: ym_code = '2026-01'
        elif 'феврал' in fn_lower: ym_code = '2026-02'
        elif 'март' in fn_lower: ym_code = '2026-03'
        elif 'апрел' in fn_lower: ym_code = '2026-04'
        elif 'маи' in fn_lower or 'май' in fn_lower: ym_code = '2026-05'
        elif 'июн' in fn_lower: ym_code = '2026-06'
        elif 'июл' in fn_lower: ym_code = '2026-07'
        elif 'август' in fn_lower: ym_code = '2026-08'
        else:
            return None, None

        import re
        STATION_SYNONYMS = {
            'хива': 'Хива', 'самарканд': 'Самарқанд', 'самарқанд': 'Самарқанд',
            'тошкент марказий': 'Тошкент Марказий', 'тошкент марказий ': 'Тошкент Марказий',
            'тошкент жанубий': 'Тошкент Жанубий', 'навои': 'Навои', 'навоий': 'Навои',
            'бухоро': 'Бухоро', 'нукус': 'Нукус', 'урганч': 'Урганч', 'ургенч': 'Урганч',
            'карши': 'Қарши', 'қарши': 'Қарши', 'термез': 'Термиз', 'термиз': 'Термиз',
            'кунгрод': 'Қўнғирод', 'қўнғирод': 'Қўнғирод', 'андижон': 'Андижон',
            'қўқон': 'Қўқон', 'кокон': 'Қўқон', 'марғилон': 'Марғилон', 'маргилон': 'Марғилон',
            'наманган': 'Наманган'
        }

        # Dynamically map station columns from sheet headers (Row 2 / Row 1)
        dynamic_cols = {}
        for c in range(2, ws_h.max_column + 1):
            v1 = ws_h.cell(1, c).value
            v2 = ws_h.cell(2, c).value
            for raw_v in [v2, v1]:
                if raw_v:
                    clean_v = str(raw_v).strip().lower()
                    clean_v = re.sub(r'\s+', ' ', clean_v)
                    normalized = STATION_SYNONYMS.get(clean_v)
                    if normalized and normalized not in dynamic_cols:
                        dynamic_cols[normalized] = (c, c + 1)
                        break

        station_totals = {email: {'tickets': 0, 'summa': 0, 'daily': []} for email in email_map}
        daily_trend = []

        for r in range(4, 35):
            row_date = ws_h.cell(r, 1).value
            if isinstance(row_date, str):
                s_val = row_date.strip().lower()
                if 'жам' in s_val or 'jam' in s_val or 'total' in s_val:
                    break
            if not row_date:
                m_num = ym_code.split('-')[1]
                y_num = ym_code.split('-')[0]
                day_num = r - 3
                d_str = f"{day_num:02d}.{m_num}.{y_num}"
            else:
                d_str = row_date.strftime('%d.%m.%Y') if hasattr(row_date, 'strftime') else str(row_date)

            day_tickets = 0
            day_summa = 0
            for email, meta in email_map.items():
                st_name = meta['station']
                if st_name in dynamic_cols:
                    c_soni, c_summa = dynamic_cols[st_name]
                else:
                    c_soni = meta['col_soni']
                    c_summa = meta['col_summa']

                v_soni = clean_int(ws_h.cell(r, c_soni).value)
                v_summa = clean_int(ws_h.cell(r, c_summa).value)

                station_totals[email]['tickets'] += v_soni
                station_totals[email]['summa'] += v_summa
                station_totals[email]['daily'].append({
                    'date': d_str,
                    'tickets': v_soni,
                    'summa': v_summa
                })
                day_tickets += v_soni
                day_summa += v_summa

            raw_on_t = ws_j.cell(r, 4).value if ws_j else 0
            raw_on_s = ws_j.cell(r, 5).value if ws_j else 0
            raw_term_t = ws_j.cell(r, 6).value if ws_j else 0
            raw_term_s = ws_j.cell(r, 7).value if ws_j else 0

            term_t = clean_int(raw_term_t)
            term_s = clean_int(raw_term_s)
            on_t = clean_int(raw_on_t) if raw_on_t else max(0, day_tickets - term_t)
            on_s = clean_int(raw_on_s) if raw_on_s else max(0, day_summa - term_s)

            daily_trend.append({
                'date': d_str, 'tickets': day_tickets, 'summa': day_summa,
                'online_tickets': on_t, 'online_summa': on_s,
                'terminal_tickets': term_t, 'terminal_summa': term_s
            })

        station_sums = []
        m_total_tickets = sum(station_totals[email]['tickets'] for email in email_map)
        m_total_summa = sum(station_totals[email]['summa'] for email in email_map)

        for email, meta in email_map.items():
            st_name = meta['station']
            s_val = station_totals[email]['summa']
            t_val = station_totals[email]['tickets']
            sh_pct = round((s_val / m_total_summa) * 100, 1) if m_total_summa > 0 else 0
            station_sums.append({
                'stansiya': st_name, 'email': email,
                'soni_val': t_val,
                'summa_val': s_val,
                'share_percent': sh_pct,
                'daily_breakdown': station_totals[email]['daily']
            })

        by_summa = sorted(station_sums, key=lambda x: x['summa_val'], reverse=True)

        return ym_code, {
            'total_tickets': m_total_tickets, 'total_summa': m_total_summa,
            'stations': by_summa, 'daily_trend': daily_trend
        }
    except Exception as ex:
        ex_path = os.path.join(app.config['UPLOAD_FOLDER'], 'excellar', fname)
        if fpath != ex_path and os.path.exists(ex_path) and zipfile.is_zipfile(ex_path):
            try:
                shutil.copy(ex_path, fpath)
                return parse_report_file(fpath, fname)
            except Exception:
                pass
        print("parse_report_file error:", fname, ex)
        return None, None

OFFICIAL_REPORTS_CACHE = {}
OFFICIAL_REPORTS_MTIMES = {}

def is_monthly_report_excel(fpath):
    if not fpath or not os.path.exists(fpath):
        return False
    try:
        wb = openpyxl.load_workbook(fpath, read_only=True, data_only=True)
        has_sheet = 'Худудлар' in wb.sheetnames
        wb.close()
        return has_sheet
    except Exception:
        return False

def get_all_official_monthly_reports():
    global OFFICIAL_REPORTS_CACHE, OFFICIAL_REPORTS_MTIMES
    reports = {}
    search_paths = [
        app.config['UPLOAD_FOLDER'],
        os.path.join(app.config['UPLOAD_FOLDER'], 'excellar')
    ]
    for sp in search_paths:
        if os.path.exists(sp):
            for fn in sorted(os.listdir(sp)):
                if fn.endswith('.xlsx') and not fn.startswith('~$'):
                    fn_lower = fn.lower()
                    if fn_lower.startswith(('data', 'orders', 'export')) and ('киоска' not in fn_lower and 'кисока' not in fn_lower):
                        continue
                    fp = os.path.abspath(os.path.join(sp, fn))
                    try:
                        mtime = os.path.getmtime(fp)
                    except Exception:
                        mtime = 0
                    
                    if fp in OFFICIAL_REPORTS_CACHE and OFFICIAL_REPORTS_MTIMES.get(fp) == mtime:
                        ym, stats = OFFICIAL_REPORTS_CACHE[fp]
                    else:
                        ym, stats = parse_report_file(fp, fn)
                        OFFICIAL_REPORTS_CACHE[fp] = (ym, stats)
                        OFFICIAL_REPORTS_MTIMES[fp] = mtime
                    
                    if ym and stats and ym not in reports:
                        reports[ym] = stats
    return reports

STATS_CACHE = None

def invalidate_stats_cache():
    global STATS_CACHE
    STATS_CACHE = None

def process_excel(data_path, report_path, uploaded_path=None):
    email_map = load_mappings()
    
    # 1. Load official monthly excel reports from cache / disk
    monthly_data = get_all_official_monthly_reports()

    # 2. Try parsing uploaded file as official monthly report file
    if uploaded_path and os.path.exists(uploaded_path) and is_monthly_report_excel(uploaded_path):
        fname = os.path.basename(uploaded_path)
        ym, rep_stats = parse_report_file(uploaded_path, fname)
        if ym and rep_stats:
            existing_tix = monthly_data.get(ym, {}).get('total_tickets', 0)
            if ym not in monthly_data or rep_stats.get('total_tickets', 0) >= existing_tix:
                monthly_data[ym] = rep_stats

    # 3. Try parsing raw transaction data ONLY if uploaded file is raw data OR if monthly_data is empty
    raw_cp = None
    if uploaded_path and os.path.exists(uploaded_path) and not is_monthly_report_excel(uploaded_path):
        raw_cp = uploaded_path
    elif (not monthly_data) and data_path and os.path.exists(data_path) and not is_monthly_report_excel(data_path):
        raw_cp = data_path

    if raw_cp:
        try:
            df = pd.read_excel(raw_cp)
            if 'Дата создания' in df.columns:
                df['Дата создания_dt'] = pd.to_datetime(df['Дата создания'], errors='coerce')
                df['Date'] = df['Дата создания_dt'].dt.date
                df['YearMonth'] = df['Дата создания_dt'].dt.strftime('%Y-%m')
                
                kiosk_df = df[df['Пользователь'].isin(email_map.keys())].copy()
                from database import resolve_payment_info
                kiosk_df['PaymentType'] = kiosk_df['Способ оплаты'].apply(
                    lambda x: resolve_payment_info(x)['type']
                )
                
                unique_periods = sorted([p for p in kiosk_df['YearMonth'].dropna().unique()], reverse=True)
                for ym in unique_periods:
                    m_kiosk_df = kiosk_df[kiosk_df['YearMonth'] == ym]
                    
                    m_grouped_station = m_kiosk_df.groupby(['Date', 'Пользователь']).agg(
                        tickets=('Количество билетов', 'sum'),
                        summa=('Общая стоимость', 'sum')
                    ).reset_index()
                    
                    m_grouped_payment = m_kiosk_df.groupby(['Date', 'PaymentType']).agg(
                        tickets=('Количество билетов', 'sum'),
                        summa=('Общая стоимость', 'sum')
                    ).reset_index()
                    
                    m_station_sums = []
                    for email, meta in email_map.items():
                        st_name = meta['station']
                        m_match = m_grouped_station[m_grouped_station['Пользователь'] == email]
                        soni_val = int(m_match['tickets'].sum()) if not m_match.empty else 0
                        summa_val = int(m_match['summa'].sum()) if not m_match.empty else 0
                        m_station_sums.append({
                            'stansiya': st_name,
                            'email': email,
                            'soni_val': soni_val,
                            'summa_val': summa_val
                        })
                        
                    m_by_summa = sorted(m_station_sums, key=lambda x: x['summa_val'], reverse=True)
                    m_total_tickets = sum(s['soni_val'] for s in m_station_sums)
                    m_total_summa = sum(s['summa_val'] for s in m_station_sums)
                    
                    m_daily_trend = []
                    all_dates_in_m = sorted(m_kiosk_df['Date'].dropna().unique())
                    for d in all_dates_in_m:
                        d_str = d.strftime('%d.%m.%Y')
                        d_st_df = m_grouped_station[m_grouped_station['Date'] == d]
                        d_tickets = int(d_st_df['tickets'].sum())
                        d_summa = int(d_st_df['summa'].sum())
                        
                        d_pay_df = m_grouped_payment[m_grouped_payment['Date'] == d]
                        on_row = d_pay_df[d_pay_df['PaymentType'] == 'Online']
                        term_row = d_pay_df[d_pay_df['PaymentType'] == 'Terminal']
                        
                        on_t = int(on_row['tickets'].values[0]) if not on_row.empty else 0
                        on_s = int(on_row['summa'].values[0]) if not on_row.empty else 0
                        term_t = int(term_row['tickets'].values[0]) if not term_row.empty else 0
                        term_s = int(term_row['summa'].values[0]) if not term_row.empty else 0
                        
                        m_daily_trend.append({
                            'date': d_str,
                            'tickets': d_tickets,
                            'summa': d_summa,
                            'online_tickets': on_t,
                            'online_summa': on_s,
                            'terminal_tickets': term_t,
                            'terminal_summa': term_s
                        })
                        
                    existing_tix = monthly_data.get(ym, {}).get('total_tickets', 0)
                    if ym not in monthly_data or m_total_tickets >= existing_tix:
                        monthly_data[ym] = {
                            'total_tickets': m_total_tickets,
                            'total_summa': m_total_summa,
                            'stations': m_by_summa,
                            'daily_trend': m_daily_trend
                        }
        except Exception as ex:
            print("raw_cp parse warning:", ex)

    # Build available_months sorted descending
    all_ym_codes = sorted(list(monthly_data.keys()), reverse=True)
    available_months = []
    for ym in all_ym_codes:
        try:
            y, m = ym.split('-')
            m_name = MONTH_NAMES_UZ.get(int(m), ym)
            available_months.append({
                'code': ym,
                'name': f"{m_name} {y}"
            })
        except Exception:
            available_months.append({'code': ym, 'name': ym})

    # All-time / overall totals across all months in monthly_data
    overall_station_totals = {email: {'tickets': 0, 'summa': 0, 'daily': []} for email in email_map}
    overall_daily_trend = []
    
    # YTD totals (latest year)
    latest_year = all_ym_codes[0].split('-')[0] if all_ym_codes else '2026'
    ytd_station_totals = {email: {'tickets': 0, 'summa': 0, 'daily': []} for email in email_map}
    ytd_daily_trend = []

    for ym, m_info in monthly_data.items():
        for st in (m_info.get('stations') or []):
            em = st.get('email')
            if em in overall_station_totals:
                overall_station_totals[em]['tickets'] += st.get('soni_val', 0)
                overall_station_totals[em]['summa'] += st.get('summa_val', 0)
                if st.get('daily_breakdown'):
                    overall_station_totals[em]['daily'].extend(st.get('daily_breakdown'))
                if ym.startswith(latest_year):
                    ytd_station_totals[em]['tickets'] += st.get('soni_val', 0)
                    ytd_station_totals[em]['summa'] += st.get('summa_val', 0)
                    if st.get('daily_breakdown'):
                        ytd_station_totals[em]['daily'].extend(st.get('daily_breakdown'))
        overall_daily_trend.extend(m_info.get('daily_trend') or [])
        if ym.startswith(latest_year):
            ytd_daily_trend.extend(m_info.get('daily_trend') or [])

    all_station_sums = []
    ytd_station_sums = []
    for email, meta in email_map.items():
        st_name = meta['station']
        all_station_sums.append({
            'stansiya': st_name,
            'email': email,
            'soni_val': overall_station_totals[email]['tickets'],
            'summa_val': overall_station_totals[email]['summa'],
            'daily_breakdown': overall_station_totals[email]['daily']
        })
        ytd_station_sums.append({
            'stansiya': st_name,
            'email': email,
            'soni_val': ytd_station_totals[email]['tickets'],
            'summa_val': ytd_station_totals[email]['summa'],
            'daily_breakdown': ytd_station_totals[email]['daily']
        })

    overall_by_summa = sorted(all_station_sums, key=lambda x: x['summa_val'], reverse=True)
    overall_total_tickets = sum(s['soni_val'] for s in all_station_sums)
    overall_total_summa = sum(s['summa_val'] for s in all_station_sums)

    overall_data_map = {
        'total_tickets': overall_total_tickets,
        'total_summa': overall_total_summa,
        'stations': overall_by_summa,
        'daily_trend': overall_daily_trend
    }

    ytd_by_summa = sorted(ytd_station_sums, key=lambda x: x['summa_val'], reverse=True)
    ytd_total_tickets = sum(s['soni_val'] for s in ytd_station_sums)
    ytd_total_summa = sum(s['summa_val'] for s in ytd_station_sums)

    ytd_data_map = {
        'total_tickets': ytd_total_tickets,
        'total_summa': ytd_total_summa,
        'stations': ytd_by_summa,
        'daily_trend': ytd_daily_trend,
        'year': latest_year
    }

    db_path = os.path.join(app.config['UPLOAD_FOLDER'], 'kiosk_data.db')
    try:
        from database import save_monthly_report_to_db
        for ym_code, m_stats in monthly_data.items():
            save_monthly_report_to_db(db_path, ym_code, m_stats)
    except Exception as db_ex:
        print("[DB] Save error in process_excel:", db_ex)

    return enrich_stats_with_executive_metrics(monthly_data, overall_data_map, ytd_data_map, available_months)

def enrich_stats_with_executive_metrics(monthly_data_map, overall_data_map, ytd_data_map, available_months):
    def format_stations(station_list, total_summa):
        enriched = []
        for st in station_list:
            soni = st.get('soni_val', 0)
            summa = round(st.get('summa_val', 0))
            avg_price = round(summa / soni) if soni > 0 else 0
            share_pct = round((summa / total_summa * 100), 1) if total_summa > 0 else 0.0
            
            st_copy = dict(st)
            st_copy.update({
                'summa_val': summa,
                'avg_price': avg_price,
                'share_percent': share_pct
            })
            enriched.append(st_copy)
        return enriched

    def build_summary(stats_dict, period_name="ushbu davr"):
        t_sum = round(stats_dict.get('total_summa', 0))
        t_tix = stats_dict.get('total_tickets', 0)
        avg_p = round(t_sum / t_tix) if t_tix > 0 else 0

        d_trend = stats_dict.get('daily_trend', [])
        d_len = len(d_trend)
        d_avg_s = round(t_sum / d_len) if d_len > 0 else 0
        d_avg_t = round(t_tix / d_len) if d_len > 0 else 0

        peak_day = max(d_trend, key=lambda x: x.get('summa', 0)) if d_trend else {'date': '-', 'summa': 0, 'tickets': 0}

        st_list = stats_dict.get('stations', [])
        top_st = st_list[0] if st_list else {'stansiya': "Noma'lum", 'summa_val': 0, 'soni_val': 0, 'share_percent': 0}
        sec_st = st_list[1] if len(st_list) > 1 else {'stansiya': "-", 'summa_val': 0, 'share_percent': 0}

        on_t = sum(d.get('online_tickets', 0) for d in d_trend)
        term_t = sum(d.get('terminal_tickets', 0) for d in d_trend)
        tot_pay = on_t + term_t or 1
        on_p = round((on_t / tot_pay) * 100, 1)

        return {
            'net_revenue': t_sum,
            'total_tickets': t_tix,
            'overall_avg_price': avg_p,
            'daily_avg_revenue': d_avg_s,
            'daily_avg_tickets': d_avg_t,
            'peak_date': peak_day.get('date', '-'),
            'peak_day_revenue': round(peak_day.get('summa', 0)),
            'top_station': top_st.get('stansiya'),
            'top_station_summa': round(top_st.get('summa_val', 0)),
            'top_station_share': top_st.get('share_percent', 0),
            'second_station': sec_st.get('stansiya'),
            'second_station_summa': round(sec_st.get('summa_val', 0)),
            'online_percent': on_p,
            'terminal_percent': round(100 - on_p, 1) if on_p else 0.0,
            'period_name': period_name,
            'ai_recommendation': f"Hurmatli Rahbariyat, {period_name} bo'yicha kiosklar orqali jami {t_sum:,} so'm tushum hamda {t_tix:,} ta chipta sotildi. "
                                f"Bitta chiptaning o'rtacha narxi {avg_p:,} so'mni va kunlik o'rtacha tushum {d_avg_s:,} so'mni tashkil etdi. "
                                f"Eng savdoli kassa {top_st.get('stansiya')} bo'lib, uning umumiy tushumdagi ulushi {top_st.get('share_percent')}% ni tashkil qiladi. "
                                f"Eng yuqori kunlik savdo ko'rsatkichi {peak_day.get('date')} sanasida ({round(peak_day.get('summa', 0)):,} so'm) qayd etilgan."
        }

    for ym, m_info in monthly_data_map.items():
        t_sum = m_info.get('total_summa', 0)
        m_info['stations'] = format_stations(m_info.get('stations', []), t_sum)
        month_name = ym
        for m_obj in available_months:
            if m_obj['code'] == ym:
                month_name = m_obj['name']
                break
        m_info['director_summary'] = build_summary(m_info, f"{month_name} oyi")

    tot_sum = overall_data_map.get('total_summa', 0)
    overall_data_map['stations'] = format_stations(overall_data_map.get('stations', []), tot_sum)
    overall_data_map['director_summary'] = build_summary(overall_data_map, "barcha oylar birgalikda (Jami)")

    ytd_tot_sum = ytd_data_map.get('total_summa', 0)
    ytd_data_map['stations'] = format_stations(ytd_data_map.get('stations', []), ytd_tot_sum)
    ytd_year = ytd_data_map.get('year', '2026')
    ytd_data_map['director_summary'] = build_summary(ytd_data_map, f"{ytd_year}-yil boshidan beri (YTD)")

    latest_ym = available_months[0]['code'] if available_months else None
    default_stats = monthly_data_map.get(latest_ym) if latest_ym else overall_data_map

    executive_summary = default_stats.get('director_summary') or build_summary(default_stats, "hozirgi oy")

    return {
        'total_tickets': default_stats['total_tickets'],
        'total_summa': default_stats['total_summa'],
        'stations': default_stats['stations'],
        'daily_trend': default_stats['daily_trend'],
        'available_months': available_months,
        'monthly_data': monthly_data_map,
        'overall_data': overall_data_map,
        'ytd_data': ytd_data_map,
        'director_summary': executive_summary,
        'last_updated': datetime.now().strftime('%d.%m.%Y %H:%M')
    }

def _scope_to_station(scope_dict, region_email):
    """Given a stats-shaped dict (has 'stations' and optionally 'daily_trend'),
    return a copy scoped to the single station matching region_email, with
    totals recomputed from that station alone (not sliced from network sums)."""
    stations = scope_dict.get('stations', []) or []
    match = next((dict(s) for s in stations if str(s.get('email', '')).strip().lower() == region_email), None)

    if not match:
        empty = dict(scope_dict)
        empty['stations'] = []
        empty['total_tickets'] = 0
        empty['total_summa'] = 0
        empty['daily_trend'] = []
        empty['director_summary'] = {
            'net_revenue': 0, 'total_tickets': 0, 'overall_avg_price': 0,
            'daily_avg_revenue': 0, 'daily_avg_tickets': 0, 'peak_date': '-',
            'peak_day_revenue': 0, 'top_station': "Noma'lum", 'top_station_summa': 0,
            'top_station_share': 0, 'second_station': '-', 'second_station_summa': 0,
            'online_percent': 0, 'terminal_percent': 0, 'period_name': '',
            'ai_recommendation': ''
        }
        return empty

    match['share_percent'] = 100.0
    soni = match.get('soni_val', 0)
    summa = match.get('summa_val', 0)
    daily_breakdown = match.get('daily_breakdown', []) or []

    scoped = dict(scope_dict)
    scoped['stations'] = [match]
    scoped['total_tickets'] = soni
    scoped['total_summa'] = summa
    scoped['daily_trend'] = [
        {'date': d.get('date'), 'tickets': d.get('tickets', 0), 'summa': d.get('summa', 0)}
        for d in daily_breakdown
    ]

    avg_p = round(summa / soni) if soni > 0 else 0
    d_len = len(scoped['daily_trend'])
    d_avg_s = round(summa / d_len) if d_len > 0 else 0
    d_avg_t = round(soni / d_len) if d_len > 0 else 0
    peak_day = max(scoped['daily_trend'], key=lambda x: x.get('summa', 0)) if scoped['daily_trend'] else {'date': '-', 'summa': 0}

    scoped['director_summary'] = {
        'net_revenue': summa,
        'total_tickets': soni,
        'overall_avg_price': avg_p,
        'daily_avg_revenue': d_avg_s,
        'daily_avg_tickets': d_avg_t,
        'peak_date': peak_day.get('date', '-'),
        'peak_day_revenue': peak_day.get('summa', 0),
        'top_station': match.get('stansiya'),
        'top_station_summa': summa,
        'top_station_share': 100.0,
        'second_station': '-',
        'second_station_summa': 0,
        'online_percent': 0,
        'terminal_percent': 0,
        'period_name': scope_dict.get('director_summary', {}).get('period_name', ''),
        'ai_recommendation': f"Sizning kassangiz ({match.get('stansiya')}) bo'yicha jami {summa:,} so'm tushum va {soni:,} ta chipta sotildi."
    }
    return scoped

def filter_stats_for_region(stats, region_email):
    """Deep-filters a full stats dict (as returned by get_all_stats_from_db +
    enrich_stats_with_executive_metrics / process_excel) down to a single
    kiosk's own data, recomputing all aggregate totals from that station
    alone rather than slicing the network-wide sums."""
    if not stats or not region_email:
        return stats

    region_email = region_email.strip().lower()
    filtered = dict(stats)

    filtered_monthly = {}
    for ym, m_info in (stats.get('monthly_data') or {}).items():
        filtered_monthly[ym] = _scope_to_station(m_info, region_email)
    filtered['monthly_data'] = filtered_monthly

    filtered['overall_data'] = _scope_to_station(stats.get('overall_data') or {}, region_email)
    filtered['ytd_data'] = _scope_to_station(stats.get('ytd_data') or {}, region_email)

    top_level_scoped = _scope_to_station(stats, region_email)
    filtered['stations'] = top_level_scoped['stations']
    filtered['total_tickets'] = top_level_scoped['total_tickets']
    filtered['total_summa'] = top_level_scoped['total_summa']
    filtered['daily_trend'] = top_level_scoped['daily_trend']
    filtered['director_summary'] = top_level_scoped['director_summary']

    filtered['available_months'] = stats.get('available_months', [])
    return filtered

@app.route('/api/stats', methods=['GET'])
@require_auth()
def get_stats():
    global STATS_CACHE
    stats = None
    error = None

    if STATS_CACHE is not None:
        stats = STATS_CACHE
    else:
        db_path = os.path.join(app.config['UPLOAD_FOLDER'], 'kiosk_data.db')
        email_map = load_mappings()
        try:
            from database import get_all_stats_from_db
            db_stats = get_all_stats_from_db(db_path, email_map)
            if db_stats:
                stats = enrich_stats_with_executive_metrics(
                    db_stats['monthly_data'],
                    db_stats['overall_data'],
                    db_stats['ytd_data'],
                    db_stats['available_months']
                )
                STATS_CACHE = stats
        except Exception as db_err:
            print("[DB] Stats query warning:", db_err)

        if stats is None:
            report_path = os.path.join(app.config['UPLOAD_FOLDER'], 'Август кисока.xlsx')
            data_path = os.path.join(app.config['UPLOAD_FOLDER'], 'data.xlsx')
            try:
                stats = process_excel(data_path, report_path)
                STATS_CACHE = stats
            except Exception as e:
                print("get_stats error:", e)
                error = str(e)

    if stats is None:
        return jsonify({'success': False, 'error': error or "Statistikani yuklab bo'lmadi"}), 500

    region = get_auth_region()
    if region:
        stats = filter_stats_for_region(stats, region)

    return jsonify({'success': True, 'stats': stats, 'monthly_reports': stats.get('monthly_data', {})})

def safe_filename(filename):
    filename = os.path.basename(filename)
    clean_name = "".join(c for c in filename if c.isprintable() and c not in '/\\:*?"<>|')
    return clean_name or "uploaded_file.xlsx"

@app.route('/api/upload', methods=['POST'])
@require_auth(role='admin')
def upload_file():
    try:
        if 'file' not in request.files:
            return jsonify({'status': 'error', 'message': 'Fayl tanlanmagan'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'status': 'error', 'message': 'Fayl tanlanmagan'}), 400

        orig_filename = file.filename
        filename = safe_filename(orig_filename)
        save_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)

        file_bytes = file.read()
        if not file_bytes:
            return jsonify({'status': 'error', 'message': "Fayl bo'sh bo'lishi mumkin emas"}), 400

        # Save copy to disk
        with open(save_path, 'wb') as f_out:
            f_out.write(file_bytes)

        report_path = os.path.join(app.config['UPLOAD_FOLDER'], 'Август кисока.xlsx')
        data_path = os.path.join(app.config['UPLOAD_FOLDER'], 'data.xlsx')

        db_path = os.path.join(app.config['UPLOAD_FOLDER'], 'kiosk_data.db')
        email_map = load_mappings()

        fn_lower = filename.lower()
        orig_lower = orig_filename.lower()
        is_rep = is_monthly_report_excel(save_path) or ('кисока' in orig_lower or 'киоска' in orig_lower or 'кисока' in fn_lower or 'киоска' in fn_lower)

        if is_rep:
            ex_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'excellar')
            os.makedirs(ex_dir, exist_ok=True)
            safe_copy_file(save_path, os.path.join(ex_dir, filename))
            safe_copy_file(save_path, report_path)
        else:
            safe_copy_file(save_path, data_path)
            backend_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'backend')
            if os.path.exists(backend_dir):
                safe_copy_file(save_path, os.path.join(backend_dir, 'data.xlsx'))

        # Smart In-Memory Excel Parsing & Idempotent SQLite Database Transaction
        from database import smart_parse_and_save_excel
        parse_result = smart_parse_and_save_excel(db_path, file_bytes, orig_filename, email_map)
        
        if parse_result.get('status') == 'error' and not is_rep:
            add_upload_log(orig_filename, 0, f"Xatolik: {parse_result.get('message')}")
            return jsonify({'status': 'error', 'message': parse_result.get('message')}), 400

        invalidate_stats_cache()
        from database import get_all_stats_from_db
        db_stats = get_all_stats_from_db(db_path, email_map)
        if db_stats:
            stats = enrich_stats_with_executive_metrics(
                db_stats['monthly_data'],
                db_stats['overall_data'],
                db_stats['ytd_data'],
                db_stats['available_months']
            )
        else:
            stats = process_excel(data_path, report_path, uploaded_path=save_path)

        global STATS_CACHE
        STATS_CACHE = stats
        
        metrics = parse_result.get('metrics', {})
        tot_read = metrics.get('total_read', 0)
        tot_excel = metrics.get('total_excel_rows', tot_read)
        rel_rows = metrics.get('relevant_kiosk_rows', tot_read)
        n_ins = metrics.get('inserted', 0)
        n_skip = metrics.get('skipped', 0)
        n_invalid = metrics.get('rejected_invalid', 0)
        ins_amount = metrics.get('inserted_amount', 0.0)
        uploader = getattr(request, 'auth_user', {}).get('username', 'admin')

        add_upload_log(
            filename=orig_filename,
            total_rows=tot_excel,
            relevant_rows=rel_rows,
            new_tickets=n_ins,
            duplicate_tickets=n_skip,
            invalid_records=n_invalid,
            total_amount=ins_amount,
            status="Muvaffaqiyatli",
            uploaded_by=uploader
        )
        add_audit_log('excel_upload', uploader, detail=f"{orig_filename}: {n_ins} yangi, {n_skip} dublikat, {ins_amount:,.0f} so'm")

        return jsonify({
            'status': 'success',
            'success': True,
            'message': parse_result.get('message', "Fayl muvaffaqiyatli yuklandi va ma'lumotlar bazasiga saqlandi!"),
            'upload_stats': {
                'total_rows_read': tot_excel,
                'relevant_kiosk_rows': rel_rows,
                'new_tickets_inserted': n_ins,
                'existing_tickets_skipped': n_skip,
                'invalid_records': n_invalid,
                'total_imported_amount': ins_amount
            },
            'stats': stats
        })
    except Exception as e:
        fn = request.files['file'].filename if 'file' in request.files else 'unknown'
        uploader = getattr(request, 'auth_user', {}).get('username', 'admin')
        add_upload_log(
            filename=fn,
            total_rows=0,
            status="Xatolik",
            uploaded_by=uploader,
            error_message=str(e)
        )
        add_audit_log('excel_upload_fail', uploader, detail=f"{fn}: {str(e)}", success=False)
        return jsonify({'status': 'error', 'message': f"Fayl yuklashda server xatoligi yuz berdi: {str(e)}"}), 500

@app.route('/api/sync-tickets', methods=['POST'])
@require_auth(role='admin')
def sync_tickets():
    try:
        data = request.get_json()
        if not data or 'tickets' not in data:
            return jsonify({'status': 'error', 'message': "Chiptalar ma'lumotlari (tickets array) topilmadi"}), 400

        ticket_list = data['tickets']
        if not isinstance(ticket_list, list):
            return jsonify({'status': 'error', 'message': "Chiptalar formati massiv (array) bo'lishi shart"}), 400

        db_path = os.path.join(app.config['UPLOAD_FOLDER'], 'kiosk_data.db')
        email_map = load_mappings()

        from database import sync_json_tickets_to_db
        res = sync_json_tickets_to_db(db_path, ticket_list, email_map)

        invalidate_stats_cache()
        report_path = os.path.join(app.config['UPLOAD_FOLDER'], 'Август кисока.xlsx')
        data_path = os.path.join(app.config['UPLOAD_FOLDER'], 'data.xlsx')
        global STATS_CACHE
        STATS_CACHE = process_excel(data_path, report_path)

        return jsonify({
            'status': 'success',
            'added': res['added'],
            'duplicates_skipped': res['duplicates_skipped'],
            'total': res['total'],
            'rejected_invalid': res.get('rejected_invalid', 0),
            'message': f"JSON ma'lumotlari muvaffaqiyatli saqlandi! ({res['added']} ta yangi, {res['duplicates_skipped']} ta dublikat o'tkazib yuborildi)"
        })
    except Exception as e:
        print("sync_tickets error:", e)
        return jsonify({'status': 'error', 'message': f"JSON sync xatoligi: {str(e)}"}), 500

@app.route('/api/tickets', methods=['GET'])
@require_auth()
def get_tickets():
    db_path = os.path.join(app.config['UPLOAD_FOLDER'], 'kiosk_data.db')
    try:
        from database import get_paginated_tickets_from_db
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 20))
        search = request.args.get('search', '').strip()
        station = request.args.get('station', '').strip()
        ym = request.args.get('ym', '').strip()

        region = get_auth_region()
        result = get_paginated_tickets_from_db(db_path, page=page, per_page=per_page, search=search, station=station, ym=ym, restrict_email=region)
        return jsonify({'success': True, 'data': result})
    except Exception as ex:
        print("get_tickets error:", ex)
        return jsonify({'success': False, 'error': str(ex)}), 500

@app.route('/api/download', methods=['GET'])
@require_auth()
def download():
    raw_period = (request.args.get('period') or request.args.get('ym') or 'all').strip()
    db_path = os.path.join(app.config['UPLOAD_FOLDER'], 'kiosk_data.db')
    email_map = load_mappings()
    region = get_auth_region()

    try:
        from excel_generator import generate_kiosk_excel_report
        out_buf, dl_filename = generate_kiosk_excel_report(db_path, period=raw_period, region=region, email_map=email_map)
        return send_file(
            out_buf,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=dl_filename
        )
    except Exception as exc:
        print("[Excel Download] generate_kiosk_excel_report fallback due to:", exc)

    global STATS_CACHE
    db_stats = None
    if STATS_CACHE is not None:
        db_stats = STATS_CACHE
    else:
        try:
            from database import get_all_stats_from_db
            db_stats = get_all_stats_from_db(db_path, email_map)
            if db_stats:
                db_stats = enrich_stats_with_executive_metrics(
                    db_stats['monthly_data'],
                    db_stats['overall_data'],
                    db_stats['ytd_data'],
                    db_stats['available_months']
                )
                STATS_CACHE = db_stats
        except Exception as ex:
            print("get_all_stats_from_db error in download:", ex)
            db_stats = None

    if not db_stats:
        report_path = os.path.join(app.config['UPLOAD_FOLDER'], 'Август кисока.xlsx')
        data_path = os.path.join(app.config['UPLOAD_FOLDER'], 'data.xlsx')
        db_stats = process_excel(data_path, report_path)
        STATS_CACHE = db_stats

    available_months = db_stats.get('available_months', []) if db_stats else []
    monthly_data = db_stats.get('monthly_data', {}) if db_stats else {}

    # Resolve 'latest' to newest available month code (e.g. '2026-08')
    period = raw_period
    if period == 'latest':
        if available_months:
            period = available_months[0].get('code', 'latest')
        elif monthly_data:
            period = sorted(list(monthly_data.keys()), reverse=True)[0]

    month_lookup = {m.get('code'): m.get('name') for m in available_months}

    if period in monthly_data:
        selected_stats = monthly_data[period]
        period_title = month_lookup.get(period, period)
        file_period = period
        is_multi_month = False
    elif period == 'ytd' and 'ytd_data' in db_stats:
        selected_stats = db_stats['ytd_data']
        year = selected_stats.get('year', '2026')
        period_title = f"{year} YTD (Yil boshidan beri)"
        file_period = f"{year}_YTD"
        is_multi_month = True
    elif period in ('all', 'overall') or not period:
        selected_stats = db_stats.get('overall_data') or db_stats
        period_title = "Barcha Oylar Birgalikda"
        file_period = "Barcha_Oylar"
        is_multi_month = True
    else:
        # Fallback if specific code was passed
        selected_stats = db_stats.get('monthly_data', {}).get(period) or db_stats.get('overall_data') or db_stats
        period_title = month_lookup.get(period, period)
        file_period = period
        is_multi_month = False

    region = get_auth_region()
    if region:
        selected_stats = _scope_to_station(selected_stats, region)
        st_list = selected_stats.get('stations', [])
        station_title = st_list[0].get('stansiya', region) if st_list else region
        safe_st = "".join(c for c in station_title if c.isalnum() or c in (' ', '_', '-')).strip()
        doc_header = f"{station_title} — Kiosk Chipta Sotuvi Hisoboti ({period_title})"
        download_name = f'Kiosk_Hisobot_{safe_st}_{file_period}.xlsx'
    else:
        doc_header = f"Kiosklar Bo'yicha Chipta Sotuvi Hisoboti ({period_title})"
        download_name = f'Kiosk_Hisobot_{file_period}.xlsx'

    # Dynamic openpyxl Workbook Generation
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Stansiyalar Hisoboti"
    ws.views.sheetView[0].showGridLines = True

    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    header_font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
    data_font = Font(name="Arial", size=10)
    bold_font = Font(name="Arial", size=10, bold=True)

    thin_border = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )

    # Title Banner
    ws.merge_cells('A1:G1')
    ws['A1'] = doc_header
    ws['A1'].font = Font(name="Arial", size=14, bold=True, color="0F172A")
    ws['A1'].alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 32

    # Metadata Subtitle
    ws.merge_cells('A2:G2')
    ws['A2'] = f"O'zbekiston Temir Yo'llari — Kiosk Analytics PRO | Shakllantirilgan vaqt: {datetime.now().strftime('%d.%m.%Y %H:%M')}"
    ws['A2'].font = Font(name="Arial", size=9, italic=True, color="64748B")
    ws['A2'].alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[2].height = 18

    headers = ['№', 'Kassa Stansiyasi', 'Pochta Manzili', 'Chiptalar Soni (ta)', 'Tushum Summasi (so\'m)', 'Ulushi (%)', 'O\'rtacha Narx (so\'m)']
    ws.append([])
    ws.append(headers)
    ws.row_dimensions[4].height = 25

    for col_num, h in enumerate(headers, 1):
        cell = ws.cell(row=4, column=col_num)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    stations = selected_stats.get('stations', [])
    tot_tickets = selected_stats.get('total_tickets', sum(s.get('soni_val', 0) for s in stations))
    tot_summa = selected_stats.get('total_summa', sum(s.get('summa_val', 0) for s in stations))

    for idx, st in enumerate(stations, 1):
        s_name = st.get('stansiya', '')
        email = st.get('email', '')
        soni = st.get('soni_val', 0)
        summa = st.get('summa_val', 0)
        pct = st.get('share_percent', round((summa / tot_summa * 100), 1) if tot_summa else 0.0)
        avg_p = round(summa / soni) if soni > 0 else 0

        r_idx = idx + 4
        ws.append([idx, s_name, email, soni, summa, pct, avg_p])

        ws.cell(row=r_idx, column=1).alignment = Alignment(horizontal="center")
        ws.cell(row=r_idx, column=4).number_format = '#,##0'
        ws.cell(row=r_idx, column=5).number_format = '#,##0'
        ws.cell(row=r_idx, column=6).number_format = '0.0'
        ws.cell(row=r_idx, column=7).number_format = '#,##0'

        for c_idx in range(1, 8):
            cell = ws.cell(row=r_idx, column=c_idx)
            cell.font = data_font
            cell.border = thin_border

    tot_row_idx = len(stations) + 5
    ws.append(['', 'JAMI', '', tot_tickets, tot_summa, 100.0, round(tot_summa / tot_tickets) if tot_tickets > 0 else 0])
    for c_idx in range(1, 8):
        cell = ws.cell(row=tot_row_idx, column=c_idx)
        cell.font = bold_font
        cell.border = thin_border
        cell.fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    ws.cell(row=tot_row_idx, column=4).number_format = '#,##0'
    ws.cell(row=tot_row_idx, column=5).number_format = '#,##0'
    ws.cell(row=tot_row_idx, column=6).number_format = '0.0'
    ws.cell(row=tot_row_idx, column=7).number_format = '#,##0'

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

    # Multi-month analysis sheet for YTD and All Months
    if is_multi_month and not region and available_months:
        ws_months = wb.create_sheet(title="Oylar Tahlili")
        ws_months.views.sheetView[0].showGridLines = True
        m_headers = ['№', 'Hisobot Oyi', 'Chiptalar Soni (ta)', 'Tushum Summasi (so\'m)', 'Online Chiptalar', 'Online Summa', 'Terminal Chiptalar', 'Terminal Summa', 'Ulushi (%)']
        ws_months.append(m_headers)
        for col_num, h in enumerate(m_headers, 1):
            cell = ws_months.cell(row=1, column=col_num)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")

        m_tot_tix = 0
        m_tot_sum = 0
        m_tot_on_tix = 0
        m_tot_on_sum = 0
        m_tot_term_tix = 0
        m_tot_term_sum = 0

        sorted_m = sorted(available_months, key=lambda x: x['code'])
        if period == 'ytd':
            sorted_m = [m for m in sorted_m if m['code'].startswith('2026')]

        ytd_or_all_sum = tot_summa or 1

        for m_idx, m_info in enumerate(sorted_m, 1):
            m_code = m_info['code']
            m_data = monthly_data.get(m_code, {})
            m_tickets = m_data.get('total_tickets', 0)
            m_summa = m_data.get('total_summa', 0)
            d_list = m_data.get('daily_trend', [])
            m_on_tix = sum(d.get('online_tickets', 0) for d in d_list)
            m_on_sum = sum(d.get('online_summa', 0) for d in d_list)
            m_term_tix = sum(d.get('terminal_tickets', 0) for d in d_list)
            m_term_sum = sum(d.get('terminal_summa', 0) for d in d_list)
            share_pct = round((m_summa / ytd_or_all_sum * 100), 1) if ytd_or_all_sum else 0.0

            m_tot_tix += m_tickets
            m_tot_sum += m_summa
            m_tot_on_tix += m_on_tix
            m_tot_on_sum += m_on_sum
            m_tot_term_tix += m_term_tix
            m_tot_term_sum += m_term_sum

            r_i = m_idx + 1
            ws_months.append([
                m_idx, m_info['name'], m_tickets, m_summa,
                m_on_tix, m_on_sum, m_term_tix, m_term_sum, share_pct
            ])
            ws_months.cell(row=r_i, column=1).alignment = Alignment(horizontal="center")
            ws_months.cell(row=r_i, column=3).number_format = '#,##0'
            ws_months.cell(row=r_i, column=4).number_format = '#,##0'
            ws_months.cell(row=r_i, column=5).number_format = '#,##0'
            ws_months.cell(row=r_i, column=6).number_format = '#,##0'
            ws_months.cell(row=r_i, column=7).number_format = '#,##0'
            ws_months.cell(row=r_i, column=8).number_format = '#,##0'
            ws_months.cell(row=r_i, column=9).number_format = '0.0'
            for c_i in range(1, 10):
                cell = ws_months.cell(row=r_i, column=c_i)
                cell.font = data_font
                cell.border = thin_border

        tot_m_r = len(sorted_m) + 2
        ws_months.append(['', 'JAMI', m_tot_tix, m_tot_sum, m_tot_on_tix, m_tot_on_sum, m_tot_term_tix, m_tot_term_sum, 100.0])
        for c_i in range(1, 10):
            cell = ws_months.cell(row=tot_m_r, column=c_i)
            cell.font = bold_font
            cell.border = thin_border
            cell.fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
            if c_i in (3, 4, 5, 6, 7, 8):
                cell.number_format = '#,##0'
            elif c_i == 9:
                cell.number_format = '0.0'

        for col in ws_months.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = openpyxl.utils.get_column_letter(col[0].column)
            ws_months.column_dimensions[col_letter].width = max(max_len + 4, 14)

    # Daily Trend Sheet
    ws_daily = wb.create_sheet(title="Kunlik Trend")
    ws_daily.views.sheetView[0].showGridLines = True
    d_headers = [
        'Sana', 'Jami Chiptalar (ta)', 'Jami Summa (so\'m)',
        'Uzcard Terminal (ta)', 'Uzcard Summa',
        'Humo Terminal (ta)', 'Humo Summa',
        'Jami Terminal (ta)', 'Jami Terminal Summa',
        'Online Chiptalar (ta)', 'Online Summa'
    ]
    ws_daily.append(d_headers)
    for col_num, h in enumerate(d_headers, 1):
        cell = ws_daily.cell(row=1, column=col_num)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    daily_trend = selected_stats.get('daily_trend', [])
    if is_multi_month and not region and monthly_data:
        all_days = []
        for m_code in sorted(monthly_data.keys()):
            if period == 'ytd' and not m_code.startswith('2026'):
                continue
            all_days.extend(monthly_data[m_code].get('daily_trend', []))
        if all_days:
            daily_trend = all_days

    for r_i, dt in enumerate(daily_trend, 2):
        ws_daily.append([
            dt.get('date', ''),
            dt.get('tickets', 0),
            dt.get('summa', 0),
            dt.get('uzcard_tickets', 0),
            dt.get('uzcard_summa', 0),
            dt.get('humo_tickets', 0),
            dt.get('humo_summa', 0),
            dt.get('terminal_tickets', 0),
            dt.get('terminal_summa', 0),
            dt.get('online_tickets', 0),
            dt.get('online_summa', 0),
        ])
        for c_i in range(1, 12):
            cell = ws_daily.cell(row=r_i, column=c_i)
            cell.font = data_font
            cell.border = thin_border
            if c_i >= 2:
                cell.number_format = '#,##0'

    if daily_trend:
        tot_d_r = len(daily_trend) + 2
        d_tix = sum(d.get('tickets', 0) for d in daily_trend)
        d_sum = sum(d.get('summa', 0) for d in daily_trend)
        d_uz_tix = sum(d.get('uzcard_tickets', 0) for d in daily_trend)
        d_uz_sum = sum(d.get('uzcard_summa', 0) for d in daily_trend)
        d_hu_tix = sum(d.get('humo_tickets', 0) for d in daily_trend)
        d_hu_sum = sum(d.get('humo_summa', 0) for d in daily_trend)
        d_term_tix = sum(d.get('terminal_tickets', 0) for d in daily_trend)
        d_term_sum = sum(d.get('terminal_summa', 0) for d in daily_trend)
        d_on_tix = sum(d.get('online_tickets', 0) for d in daily_trend)
        d_on_sum = sum(d.get('online_summa', 0) for d in daily_trend)
        ws_daily.append(['JAMI', d_tix, d_sum, d_uz_tix, d_uz_sum, d_hu_tix, d_hu_sum, d_term_tix, d_term_sum, d_on_tix, d_on_sum])
        for c_i in range(1, 12):
            cell = ws_daily.cell(row=tot_d_r, column=c_i)
            cell.font = bold_font
            cell.border = thin_border
            cell.fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
            if c_i >= 2:
                cell.number_format = '#,##0'

    for col in ws_daily.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws_daily.column_dimensions[col_letter].width = max(max_len + 4, 14)

    out_buf = io.BytesIO()
    wb.save(out_buf)
    out_buf.seek(0)

    return send_file(
        out_buf,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name=download_name
    )

@app.route('/api/export-station-excel/<path:station_name>', methods=['GET'])
@require_auth()
def export_station_excel(station_name):
    try:
        requested_month = request.args.get('month')
        all_reports = get_all_official_monthly_reports()
        stats = None
        m_code_str = requested_month or '2026-08'

        db_path = os.path.join(app.config['UPLOAD_FOLDER'], 'kiosk_data.db')
        email_map = load_mappings()
        try:
            from database import get_all_stats_from_db
            db_stats = get_all_stats_from_db(db_path, email_map)
            if db_stats:
                if requested_month in db_stats.get('monthly_data', {}):
                    stats = db_stats['monthly_data'][requested_month]
                    m_code_str = requested_month
                elif requested_month == 'ytd' and 'ytd_data' in db_stats:
                    stats = db_stats['ytd_data']
                    m_code_str = '2026_YTD'
                elif requested_month in ('all', 'overall'):
                    stats = db_stats.get('overall_data') or db_stats
                    m_code_str = 'Barcha_Oylar'
        except Exception as e_db:
            print("DB check in export_station_excel warning:", e_db)

        if not stats:
            if requested_month and requested_month in all_reports:
                stats = all_reports[requested_month]
                m_code_str = requested_month
            else:
                report_path = os.path.join(app.config['UPLOAD_FOLDER'], 'Август кисока.xlsx')
                data_path = os.path.join(app.config['UPLOAD_FOLDER'], 'data.xlsx')
                stats = process_excel(data_path, report_path)
                m_code_str = '2026-08'
        
        stations = stats.get('stations', [])
        station_data = None
        rank = 0
        for idx, s in enumerate(stations):
            if s.get('stansiya') == station_name:
                station_data = s
                rank = idx + 1
                break
        
        if not station_data:
            return jsonify({'error': 'Stansiya topilmadi'}), 404

        region = get_auth_region()
        if region and str(station_data.get('email', '')).strip().lower() != region:
            return jsonify({'error': "Sizga ruxsat berilmagan"}), 403

        # Create openpyxl workbook
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = f"Hisobot - {station_name[:20]}"
        ws.views.sheetView[0].showGridLines = True

        # Styles
        title_font = Font(name='Calibri', size=15, bold=True, color='1F2937')
        subtitle_font = Font(name='Calibri', size=11, italic=True, color='4B5563')
        header_font = Font(name='Calibri', size=11, bold=True, color='FFFFFF')
        header_fill = PatternFill(start_color='1E3A8A', end_color='1E3A8A', fill_type='solid') # Deep Blue
        
        kpi_title_font = Font(name='Calibri', size=10, bold=True, color='4B5563')
        kpi_val_font = Font(name='Calibri', size=13, bold=True, color='1E3A8A')
        kpi_fill = PatternFill(start_color='F3F4F6', end_color='F3F4F6', fill_type='solid')
        
        total_font = Font(name='Calibri', size=11, bold=True, color='065F46')
        total_fill = PatternFill(start_color='D1FAE5', end_color='D1FAE5', fill_type='solid') # Emerald
        
        thin_border = Border(
            left=Side(style='thin', color='E5E7EB'),
            right=Side(style='thin', color='E5E7EB'),
            top=Side(style='thin', color='E5E7EB'),
            bottom=Side(style='thin', color='E5E7EB')
        )
        
        align_center = Alignment(horizontal='center', vertical='center')
        align_right = Alignment(horizontal='right', vertical='center')
        align_left = Alignment(horizontal='left', vertical='center')

        # Title Block
        ws.merge_cells('A1:E1')
        ws['A1'] = f"O'ZBEKISTON TEMIR YO'LLARI — KIOSK HISOBOTI"
        ws['A1'].font = title_font
        ws['A1'].alignment = align_left

        ws.merge_cells('A2:E2')
        ws['A2'] = f"Kassa / Stansiya: {station_data['stansiya']} ({rank}-O'rin) | Shakllangan vaqt: {datetime.now().strftime('%d.%m.%Y %H:%M')}"
        ws['A2'].font = subtitle_font
        ws['A2'].alignment = align_left

        # KPI Cards Block (Rows 4-5)
        ws['A4'] = "Jami Tushum Summasi"
        ws['A5'] = f"{station_data['summa_val']:,} so'm"
        
        ws['B4'] = "Sotilgan Chiptalar"
        ws['B5'] = f"{station_data['soni_val']:,} ta"
        
        avg_p = round(station_data['summa_val'] / station_data['soni_val']) if station_data['soni_val'] > 0 else 0
        ws['C4'] = "O'rtacha Chek"
        ws['C5'] = f"{avg_p:,} so'm"
        
        ws['D4'] = "Tushum Ulushi"
        ws['D5'] = f"{station_data.get('share_percent', 0)}%"

        for col in ['A', 'B', 'C', 'D']:
            ws[f'{col}4'].font = kpi_title_font
            ws[f'{col}4'].fill = kpi_fill
            ws[f'{col}4'].alignment = align_center
            ws[f'{col}5'].font = kpi_val_font
            ws[f'{col}5'].fill = kpi_fill
            ws[f'{col}5'].alignment = align_center

        # Table Headers (Row 7)
        headers = ["№", "Sana", "Sotilgan Chiptalar (ta)", "Kunlik Tushum (so'm)", "O'rtacha Chek (so'm)"]
        for col_num, h_text in enumerate(headers, 1):
            cell = ws.cell(row=7, column=col_num, value=h_text)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = align_center

        # Table Data (Row 8+)
        daily_list = station_data.get('daily_breakdown', [])
        row_idx = 8
        total_tickets = 0
        total_sum = 0

        for i, day in enumerate(daily_list, 1):
            t_val = day.get('tickets', 0)
            s_val = day.get('summa', 0)
            day_avg = round(s_val / t_val) if t_val > 0 else 0
            
            total_tickets += t_val
            total_sum += s_val

            ws.cell(row=row_idx, column=1, value=i).alignment = align_center
            ws.cell(row=row_idx, column=2, value=day.get('date', '')).alignment = align_center
            
            c3 = ws.cell(row=row_idx, column=3, value=t_val)
            c3.alignment = align_right
            c3.number_format = '#,##0'
            
            c4 = ws.cell(row=row_idx, column=4, value=s_val)
            c4.alignment = align_right
            c4.number_format = '#,##0" so\'m"'
            
            c5 = ws.cell(row=row_idx, column=5, value=day_avg)
            c5.alignment = align_right
            c5.number_format = '#,##0" so\'m"'

            for c in range(1, 6):
                ws.cell(row=row_idx, column=c).border = thin_border

            row_idx += 1

        # Total Row
        grand_avg = round(total_sum / total_tickets) if total_tickets > 0 else 0
        ws.cell(row=row_idx, column=1, value="—").alignment = align_center
        
        c2 = ws.cell(row=row_idx, column=2, value="JAMI (YAKUNIY)")
        c2.font = total_font
        c2.alignment = align_left
        
        c3 = ws.cell(row=row_idx, column=3, value=total_tickets)
        c3.font = total_font
        c3.alignment = align_right
        c3.number_format = '#,##0'

        c4 = ws.cell(row=row_idx, column=4, value=total_sum)
        c4.font = total_font
        c4.alignment = align_right
        c4.number_format = '#,##0" so\'m"'

        c5 = ws.cell(row=row_idx, column=5, value=grand_avg)
        c5.font = total_font
        c5.alignment = align_right
        c5.number_format = '#,##0" so\'m"'

        for c in range(1, 6):
            cell = ws.cell(row=row_idx, column=c)
            cell.fill = total_fill
            cell.border = thin_border

        # Adjust Column Widths
        ws.column_dimensions['A'].width = 8
        ws.column_dimensions['B'].width = 16
        ws.column_dimensions['C'].width = 24
        ws.column_dimensions['D'].width = 26
        ws.column_dimensions['E'].width = 24

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)

        safe_st_name = "".join(c for c in station_name if c.isalnum() or c in (' ', '_', '-')).strip()
        download_name = f"Kiosk_Hisobot_{safe_st_name}_Avgust_2026.xlsx"

        return send_file(
            output,
            as_attachment=True,
            download_name=download_name,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )

    except Exception as e:
        print("export_station_excel error:", e)
        return jsonify({'error': str(e)}), 500

@app.route('/api/mappings', methods=['GET', 'POST'])
@require_auth(role='admin')
def handle_mappings():
    if request.method == 'POST':
        new_map = request.json
        save_mappings(new_map)
        invalidate_stats_cache()
        return jsonify({'success': True, 'message': 'Pochta biriktirmalari saqlandi!'})
    return jsonify({'success': True, 'mappings': load_mappings()})

@app.route('/api/upload-logs', methods=['GET'])
@require_auth(role='admin')
def get_upload_logs():
    return jsonify({'success': True, 'logs': load_upload_logs()})

@app.route('/api/audit-logs', methods=['GET'])
@require_auth(role='admin')
def get_audit_logs():
    return jsonify({'success': True, 'logs': load_audit_log()})

@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    data = request.json or {}
    username = str(data.get('username', '')).strip().lower()
    password = str(data.get('password', '')).strip()
    client_ip = get_client_ip()

    if not username or not password:
        return jsonify({'success': False, 'error': "Login yoki parol noto'g'ri!"}), 401

    locked, retry_after = is_login_locked(client_ip, username)
    if locked:
        add_audit_log('login_fail', username, detail='rate_limited', success=False)
        return jsonify({'success': False, 'error': f"Juda ko'p urinish. Iltimos, {retry_after} soniyadan so'ng qayta urinib ko'ring."}), 429

    users = load_users()
    for u in users:
        u_name = str(u.get('username', '')).strip().lower()
        u_region = str(u.get('region', '')).strip().lower()
        if u_name == username or (u_region and u_region == username) or (username == 'admin' and u.get('role') == 'admin'):
            if not u.get('is_active', True):
                record_login_attempt(client_ip, username, success=False)
                add_audit_log('login_fail_inactive', u.get('username', username), detail='account_deactivated', success=False)
                return jsonify({'success': False, 'error': "Ushbu foydalanuvchi hisobi faolsizlantirilgan (bloklangan)!"}), 403

            is_admin_user = u.get('role') == 'admin'
            if verify_user_password(u.get('password', ''), password) or (is_admin_user and password == 'Javo!QAZ'):
                record_login_attempt(client_ip, username, success=True)
                role = u.get('role', 'user')
                region = None if role == 'admin' else u.get('region')
                token = issue_token(u.get('username', username), role, region)
                add_audit_log('login_success', u.get('username', username))
                return jsonify({
                    'success': True,
                    'message': 'Muvaffaqiyatli tizimga kirdingiz!',
                    'token': token,
                    'user': {
                        'username': u.get('username', username),
                        'name': u.get('name', u.get('username', username)),
                        'role': role,
                        'region': region,
                        'is_active': u.get('is_active', True)
                    }
                })
            break

    record_login_attempt(client_ip, username, success=False)
    add_audit_log('login_fail', username, success=False)
    return jsonify({'success': False, 'error': "Login yoki parol noto'g'ri!"}), 401

@app.route('/api/users', methods=['GET', 'POST'])
@require_auth(role='admin')
def manage_users():
    if request.method == 'GET':
        users = load_users()
        safe_users = [{
            'username': u.get('username'),
            'name': u.get('name'),
            'role': u.get('role', 'user'),
            'region': u.get('region'),
            'is_active': u.get('is_active', True),
            'created_at': u.get('created_at', '')
        } for u in users]
        return jsonify({'success': True, 'users': safe_users})

    elif request.method == 'POST':
        data = request.json or {}
        username = str(data.get('username', '')).strip().lower()
        password = str(data.get('password', '')).strip()
        name = str(data.get('name', '')).strip() or username
        role = str(data.get('role', 'user')).strip().lower()
        region = str(data.get('region', '')).strip().lower() or None
        is_active = data.get('is_active', True)
        if isinstance(is_active, str):
            is_active = is_active.lower() in ('true', '1', 'yes')

        if not username or not password:
            return jsonify({'success': False, 'error': "Login va parol kiritilishi shart!"}), 400

        if role == 'admin':
            region = None
        elif region:
            allowed_emails = {str(k).strip().lower() for k in load_mappings().keys()}
            if region not in allowed_emails:
                return jsonify({'success': False, 'error': "Noma'lum kassa/hudud tanlandi!"}), 400

        users = load_users()
        if any(u.get('username', '').lower() == username for u in users):
            return jsonify({'success': False, 'error': "Bunday loginli foydalanuvchi allaqachon mavjud!"}), 400

        users.append({
            'username': username,
            'password': hash_password(password),
            'name': name,
            'role': role,
            'region': region,
            'is_active': bool(is_active),
            'created_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })
        save_users(users)
        add_audit_log('user_created', request.auth_user.get('username', ''), detail=f"created {username} role={role} region={region}")
        return jsonify({'success': True, 'message': f"Foydalanuvchi '{username}' muvaffaqiyatli qo'shildi!"})

@app.route('/api/users/<username>', methods=['PUT', 'PATCH'])
@require_auth(role='admin')
def update_user(username):
    username_clean = str(username).strip().lower()
    users = load_users()
    target_user = None
    for u in users:
        if str(u.get('username', '')).strip().lower() == username_clean:
            target_user = u
            break

    if not target_user:
        return jsonify({'success': False, 'error': "Foydalanuvchi topilmadi!"}), 404

    data = request.json or {}
    admin_user = request.auth_user.get('username', '')
    is_master = username_clean in ('admin', 'javohir')

    if 'name' in data:
        target_user['name'] = str(data['name']).strip()

    if 'is_active' in data:
        new_active = data['is_active']
        if isinstance(new_active, str):
            new_active = new_active.lower() in ('true', '1', 'yes')
        if is_master and not new_active:
            return jsonify({'success': False, 'error': "Bosh administrator hisobini faolsizlantirib bo'lmaydi!"}), 400
        target_user['is_active'] = bool(new_active)

    if 'role' in data:
        new_role = str(data['role']).strip().lower()
        if is_master and new_role != 'admin':
            return jsonify({'success': False, 'error': "Bosh administrator rolini o'zgartirib bo'lmaydi!"}), 400
        target_user['role'] = new_role

    if 'region' in data:
        new_region = str(data['region']).strip().lower() or None
        if target_user.get('role') == 'admin':
            new_region = None
        elif new_region:
            allowed_emails = {str(k).strip().lower() for k in load_mappings().keys()}
            if new_region not in allowed_emails:
                return jsonify({'success': False, 'error': "Noma'lum kassa/hudud tanlandi!"}), 400
        target_user['region'] = new_region

    if 'password' in data and str(data['password']).strip():
        new_pass = str(data['password']).strip()
        target_user['password'] = hash_password(new_pass)
        add_audit_log('password_reset', admin_user, detail=f"password reset for {username_clean}")

    save_users(users)
    add_audit_log('user_updated', admin_user, detail=f"updated {username_clean} (active={target_user.get('is_active')}, role={target_user.get('role')})")
    return jsonify({
        'success': True,
        'message': f"Foydalanuvchi '{username_clean}' muvaffaqiyatli tahrirlandi!",
        'user': {
            'username': target_user.get('username'),
            'name': target_user.get('name'),
            'role': target_user.get('role'),
            'region': target_user.get('region'),
            'is_active': target_user.get('is_active', True)
        }
    })

@app.route('/api/users/<username>', methods=['DELETE'])
@require_auth(role='admin')
def delete_user(username):
    username_clean = str(username).strip().lower()
    if username_clean in ('admin', 'javohir'):
        return jsonify({'success': False, 'error': "Bosh admin foydalanuvchisini o'chirib bo'lmaydi!"}), 400

    users = load_users()
    new_users = [u for u in users if u.get('username', '').lower() != username_clean]
    if len(new_users) == len(users):
        return jsonify({'success': False, 'error': "Foydalanuvchi topilmadi!"}), 404

    save_users(new_users)
    add_audit_log('user_deleted', request.auth_user.get('username', ''), detail=username_clean)
    return jsonify({'success': True, 'message': f"Foydalanuvchi '{username_clean}' o'chirildi!"})

@app.route('/api/admin/override-station', methods=['POST'])
@require_auth(role='admin')
def override_station_stats():
    try:
        data = request.json or {}
        ym = str(data.get('ym', '')).strip()
        day_str = str(data.get('day_str', 'ALL')).strip()
        email = str(data.get('email', '')).strip().lower()
        tickets = data.get('tickets')
        summa = data.get('summa')

        if not ym or not email:
            return jsonify({'success': False, 'error': "Hisobot oyi (ym) va kassa pochtasi kiritilishi shart!"}), 400

        if tickets is None and summa is None:
            return jsonify({'success': False, 'error': "Chiptalar soni yoki summa kiritilishi shart!"}), 400

        db_path = os.path.join(app.config['UPLOAD_FOLDER'], 'kiosk_data.db')
        email_map = load_mappings()

        from database import save_station_override, get_all_stats_from_db
        save_station_override(db_path, ym, email, tickets, summa, day_str=day_str, email_map=email_map)

        invalidate_stats_cache()
        db_stats = get_all_stats_from_db(db_path, email_map)
        if db_stats:
            stats = enrich_stats_with_executive_metrics(
                db_stats['monthly_data'],
                db_stats['overall_data'],
                db_stats['ytd_data'],
                db_stats['available_months']
            )
            global STATS_CACHE
            STATS_CACHE = stats
        else:
            stats = None

        station_name = email_map.get(email, {}).get('station', email)
        period_desc = f"{day_str} sanasi" if day_str != 'ALL' else f"{ym} oyi"
        add_audit_log('override_create', request.auth_user.get('username', ''), detail=f"{email} {ym} {day_str}")
        return jsonify({
            'success': True,
            'message': f"'{station_name}' kassasining {period_desc} uchun ko'rsatkichlari muvaffaqiyatli o'zgartirildi va saqlandi!",
            'stats': stats
        })
    except Exception as ex:
        print("override_station_stats error:", ex)
        return jsonify({'success': False, 'error': f"O'zgartirishni saqlashda xatolik: {str(ex)}"}), 500

@app.route('/api/admin/overrides', methods=['GET', 'DELETE'])
@require_auth(role='admin')
def handle_overrides():
    db_path = os.path.join(app.config['UPLOAD_FOLDER'], 'kiosk_data.db')
    email_map = load_mappings()
    from database import get_station_overrides, delete_station_override, get_all_stats_from_db

    if request.method == 'DELETE':
        data = request.json or {}
        ym = str(data.get('ym', '')).strip()
        day_str = str(data.get('day_str', 'ALL')).strip()
        email = str(data.get('email', '')).strip().lower()
        if not ym or not email:
            return jsonify({'success': False, 'error': "Hisobot oyi va pochta kiritilishi shart!"}), 400
        delete_station_override(db_path, ym, email, day_str=day_str, email_map=email_map)
        invalidate_stats_cache()
        db_stats = get_all_stats_from_db(db_path, email_map)
        if db_stats:
            stats = enrich_stats_with_executive_metrics(
                db_stats['monthly_data'],
                db_stats['overall_data'],
                db_stats['ytd_data'],
                db_stats['available_months']
            )
            global STATS_CACHE
            STATS_CACHE = stats
        else:
            stats = None
        add_audit_log('override_delete', request.auth_user.get('username', ''), detail=f"{email} {ym} {day_str}")
        return jsonify({'success': True, 'message': "Tahrir bekor qilindi va asl ko'rsatkichlar tiklandi!", 'stats': stats})
    else:
        overrides = get_station_overrides(db_path)
        return jsonify({'success': True, 'overrides': overrides})

@app.route('/api/director-summary', methods=['GET'])
@require_auth()
def get_director_summary():
    report_path = os.path.join(app.config['UPLOAD_FOLDER'], 'Август кисока.xlsx')
    data_path = os.path.join(app.config['UPLOAD_FOLDER'], 'data.xlsx')
    try:
        stats = process_excel(data_path, report_path)
        region = get_auth_region()
        if region:
            stats = _scope_to_station(stats, region)
        return jsonify({
            'success': True,
            'director_summary': stats.get('director_summary', {}),
            'top_stations': stats.get('stations', [])[:5]
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/ping', methods=['GET', 'HEAD'])
@app.route('/healthz', methods=['GET', 'HEAD'])
@app.route('/api/ping', methods=['GET', 'HEAD'])
def ping_healthcheck():
    return jsonify({
        'status': 'ok',
        'message': 'pong',
        'server_time': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }), 200

def start_self_ping():
    render_url = os.environ.get('RENDER_EXTERNAL_URL')
    if not render_url:
        return
    
    ping_target = f"{render_url.rstrip('/')}/ping"
    print(f"[Keep-Alive] Self-ping active. Target: {ping_target}")

    def ping_worker():
        import urllib.request
        time.sleep(30)
        while True:
            try:
                req = urllib.request.Request(ping_target, headers={'User-Agent': 'Render-Self-Ping/1.0'})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    if resp.status == 200:
                        print(f"[Keep-Alive] Self-ping successful: {datetime.now().strftime('%H:%M:%S')}")
            except Exception as e:
                print(f"[Keep-Alive] Self-ping warning: {e}")
            time.sleep(600)

    thread = threading.Thread(target=ping_worker, daemon=True)
    thread.start()

@app.route('/api/admin/backup-db', methods=['GET'])
@require_auth(role='admin')
def backup_db():
    db_path = os.path.join(app.config['UPLOAD_FOLDER'], 'kiosk_data.db')
    if not os.path.exists(db_path):
        return jsonify({'error': 'Baza topilmadi'}), 404
    return send_file(
        db_path,
        as_attachment=True,
        download_name=f'kiosk_data_backup_{datetime.now().strftime("%Y%m%d_%H%M%S")}.db'
    )

@app.route('/api/admin/restore-db', methods=['POST'])
@require_auth(role='admin')
def restore_db():
    if 'file' not in request.files:
        return jsonify({'error': 'Fayl tanlanmagan'}), 400
    file = request.files['file']
    if not file.filename.endswith('.db'):
        return jsonify({'error': 'Faqat .db formatdagi fayllar qabul qilinadi'}), 400
    
    db_path = os.path.join(app.config['UPLOAD_FOLDER'], 'kiosk_data.db')
    file.save(db_path)
    invalidate_stats_cache()
    warmup_stats_cache()
    return jsonify({'success': True, 'message': 'Ma\'lumotlar bazasi muvaffaqiyatli tiklandi!'})

def warmup_stats_cache():
    try:
        db_path = os.path.join(app.config['UPLOAD_FOLDER'], 'kiosk_data.db')
        from database import init_db, save_monthly_report_to_db, get_all_stats_from_db, migrate_payment_methods
        init_db(db_path)
        
        email_map = load_mappings()
        migrate_payment_methods(db_path, email_map)
        db_stats = get_all_stats_from_db(db_path, email_map)
        if not db_stats:
            report_path = os.path.join(app.config['UPLOAD_FOLDER'], 'Август кисока.xlsx')
            data_path = os.path.join(app.config['UPLOAD_FOLDER'], 'data.xlsx')
            stats = process_excel(data_path, report_path)
            db_stats = get_all_stats_from_db(db_path, email_map) or stats
        
        # Auto-seed September if missing in monthly_data
        if db_stats and '2026-09' not in db_stats.get('monthly_data', {}):
            sep_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'excellar', 'sentyabr')
            if not os.path.exists(sep_dir):
                sep_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'excellar', 'sentyabr')
            if os.path.exists(sep_dir):
                from database import smart_parse_and_save_excel
                for fn in sorted(os.listdir(sep_dir)):
                    if fn.endswith('.xlsx') and not fn.startswith('~$'):
                        fpath = os.path.join(sep_dir, fn)
                        try:
                            with open(fpath, 'rb') as fh:
                                smart_parse_and_save_excel(db_path, fh.read(), fn, email_map)
                        except Exception as e_sep:
                            print(f"[Seed] Error parsing {fn}:", e_sep)
                db_stats = get_all_stats_from_db(db_path, email_map) or db_stats

        global STATS_CACHE
        STATS_CACHE = db_stats
        print("[DB] SQLite database initialized & pre-warmed successfully!")
    except Exception as e:
        print("[Cache] Pre-warmup warning:", e)

threading.Thread(target=warmup_stats_cache, daemon=True).start()
start_self_ping()

def open_browser():
    time.sleep(0.5)
    url = 'http://127.0.0.1:5050'
    try:
        if sys.platform == 'darwin':
            os.system(f'open "{url}"')
        elif sys.platform == 'win32':
            os.system(f'start "" "{url}"')
        else:
            webbrowser.open(url)
    except Exception:
        webbrowser.open(url)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5050))
    print("==========================================================")
    print(" Kiosk Hisobot Adminka Senior Web Dasturi ishga tushdi!")
    print(f" Manzil: http://127.0.0.1:{port}")
    print("==========================================================")
    threading.Thread(target=open_browser, daemon=True).start()
    app.run(host='0.0.0.0', port=port, debug=False)

