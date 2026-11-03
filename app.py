import os
import json
import sqlite3
import random
import secrets
import hashlib
import time
from datetime import datetime, timedelta
from functools import wraps
from flask import (Flask, render_template, request, redirect,
                   url_for, session, jsonify, g, abort)
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
import numpy as np
from PIL import Image

# ── Confidence calibration module ──
from confidence_calibration import (
    calibrate_prediction,
    get_cached_calibration,
    get_or_run_calibration,
    invalidate_cache,
    run_calibration_pipeline,
)

# ─────────────────────────────────────────────
# APP CONFIG
# ─────────────────────────────────────────────
app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', secrets.token_hex(32))

# ── Secure session cookie settings ──
app.config['SESSION_COOKIE_HTTPONLY']  = True   # JS cannot read cookie
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'  # CSRF protection
app.config['SESSION_COOKIE_SECURE']   = os.environ.get('HTTPS', 'false').lower() == 'true'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=8)

DATABASE    = 'dermai.db'
UPLOAD_FOLDER = os.path.join('static', 'uploads')

# ── Strict upload validation ──
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}
MAX_UPLOAD_BYTES   = 5 * 1024 * 1024   # 5 MB hard limit
# Magic bytes for allowed image types
MAGIC_BYTES = {
    b'\xff\xd8\xff':       'jpg',
    b'\x89PNG\r\n\x1a\n': 'png',
    b'RIFF':               'webp',   # RIFF....WEBP
}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ─────────────────────────────────────────────
# AI MODEL — lazy-loaded on first prediction
# ─────────────────────────────────────────────
MODEL_PATH    = os.path.join(os.path.dirname(__file__), 'dermai_model.h5')
METADATA_PATH = os.path.join(os.path.dirname(__file__), 'dermai_class_metadata.json')
AI_IMG_SIZE   = 224

_skin_model = None
_skin_meta  = None

def get_skin_model():
    """Load model and metadata once, reuse on every subsequent call."""
    global _skin_model, _skin_meta
    if _skin_model is None:
        try:
            import tensorflow as tf
            print("[DermAI] Loading skin disease model...")
            _skin_model = tf.keras.models.load_model(MODEL_PATH)
            with open(METADATA_PATH) as f:
                _skin_meta = json.load(f)
            print("[DermAI] Model loaded successfully.")
        except Exception as e:
            print(f"[DermAI] Model load failed: {e}")
            _skin_model = None
            _skin_meta  = None
    return _skin_model, _skin_meta

# ── Eagerly preload model in background thread so first request is fast ──
import threading
def _preload_model():
    get_skin_model()
threading.Thread(target=_preload_model, daemon=True).start()

def predict_skin_disease(image_path):
    """
    Run inference on a saved image.
    Returns (display_name, raw_confidence_int, calibrated_confidence_int_or_None,
             risk, explanation, suggestions, raw_probs_json).
    Falls back to a safe default if the model is unavailable.

    Note on confidence values:
        raw_confidence      — clipped to [60, 99] for display consistency (legacy behaviour)
        calibrated_confidence — temperature-scaled; not artificially clipped;
                                None if calibration data is insufficient.
    """
    model, meta = get_skin_model()
    if model is None or meta is None:
        return ('Unknown', 0, None, 'Low Risk',
                'AI model is unavailable. Please contact the administrator.',
                ['Consult a dermatologist for a proper diagnosis.'], None)

    try:
        img  = Image.open(image_path).convert('RGB')
        img  = img.resize((AI_IMG_SIZE, AI_IMG_SIZE))
        arr  = np.array(img, dtype=np.float32) / 255.0
        arr  = np.expand_dims(arr, 0)                  # shape (1, 224, 224, 3)

        import tensorflow as tf
        probs    = model.predict(arr, verbose=0)[0]    # shape (7,)
        top_idx  = int(np.argmax(probs))
        top_prob = float(probs[top_idx])

        cls         = meta['idx_to_class'][str(top_idx)]
        display     = meta['class_display_names'].get(cls, cls)
        risk        = meta['risk_mapping'].get(cls, 'Low Risk')
        explanation = meta['explanation'].get(cls, '')
        suggestions = meta['suggestions'].get(cls, [])

        # Raw confidence (legacy clamped range for UI consistency)
        raw_confidence = max(60, min(99, int(top_prob * 100)))

        # Calibrated confidence via Temperature Scaling
        cal_confidence, cal_available = calibrate_prediction(probs)

        # Serialise full probability vector for storage
        raw_probs_json = json.dumps([round(float(p), 6) for p in probs])

        return (display, raw_confidence, cal_confidence if cal_available else None,
                risk, explanation, suggestions, raw_probs_json)

    except Exception as e:
        print(f"[DermAI] Prediction error: {e}")
        return ('Unknown', 0, None, 'Low Risk',
                'Prediction failed. Please try again with a clearer image.',
                ['Ensure the image is a close-up of the skin lesion.'], None)

# ── Rate limiting store (in-memory, per IP) ──
_rate_store: dict = {}   # { ip: [timestamp, ...] }
RATE_LIMIT_WINDOW  = 60   # seconds
RATE_LIMIT_MAX     = 10   # max login attempts per window

# ─────────────────────────────────────────────
# DATABASE HELPERS
# ─────────────────────────────────────────────
def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row
    return db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def init_db():
    with app.app_context():
        db = get_db()
        db.executescript('''
            CREATE TABLE IF NOT EXISTS users (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                name      TEXT    NOT NULL,
                email     TEXT    NOT NULL UNIQUE,
                password  TEXT    NOT NULL,
                phone     TEXT    DEFAULT '',
                role      TEXT    DEFAULT 'User',
                created_at TEXT   DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS patients (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id TEXT    NOT NULL,
                name       TEXT    NOT NULL,
                age        INTEGER,
                gender     TEXT,
                phone      TEXT    DEFAULT '-',
                last_visit TEXT,
                user_id    INTEGER,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS diagnoses (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                diag_id             TEXT    NOT NULL,
                patient_id          TEXT    NOT NULL,
                disease             TEXT,
                confidence          INTEGER,
                calibrated_confidence INTEGER,
                raw_probs           TEXT,
                risk                TEXT,
                explanation         TEXT,
                suggestions         TEXT,
                image_path          TEXT,
                date                TEXT,
                user_id             INTEGER,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS logs (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                level     TEXT    DEFAULT 'INFO',
                user_name TEXT,
                action    TEXT,
                details   TEXT,
                ip        TEXT,
                created_at TEXT   DEFAULT (datetime('now'))
            );
        ''')
        db.commit()

        # Seed admin account if not exists
        existing = db.execute("SELECT id FROM users WHERE email='admin@gmail.com'").fetchone()
        if not existing:
            db.execute(
                "INSERT INTO users (name, email, password, role) VALUES (?,?,?,?)",
                ('Admin User', 'admin@gmail.com',
                 generate_password_hash('admin123'), 'Super Administrator')
            )
            db.commit()

init_db()

# ── Migrate existing DB: add missing columns if absent ──
with app.app_context():
    _mdb = get_db()

    # diagnoses table additions
    for _col, _default in [
        ('calibrated_confidence', 'NULL'),
        ('raw_probs',             "''"),
        ('visit_number',          '1'),
        ('symptoms',              "''"),
    ]:
        try:
            _mdb.execute(f"ALTER TABLE diagnoses ADD COLUMN {_col} TEXT DEFAULT {_default}")
            _mdb.commit()
        except Exception:
            pass  # column already exists

    # patients table additions
    for _col, _default in [
        ('visit_count', '1'),
        ('first_visit', "''"),
        ('symptoms',    "''"),
    ]:
        try:
            _mdb.execute(f"ALTER TABLE patients ADD COLUMN {_col} TEXT DEFAULT {_default}")
            _mdb.commit()
        except Exception:
            pass  # column already exists

# ─────────────────────────────────────────────
# SECURITY HEADERS (after every response)
# ─────────────────────────────────────────────
@app.after_request
def set_security_headers(response):
    response.headers['X-Frame-Options']        = 'DENY'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-XSS-Protection']       = '1; mode=block'
    response.headers['Referrer-Policy']        = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy']     = 'geolocation=(), microphone=(), camera=()'
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: https://images.unsplash.com https://upload.wikimedia.org; "
        "connect-src 'self'; "
        "frame-ancestors 'none';"
    )
    response.headers.pop('Server', None)
    response.headers.pop('X-Powered-By', None)
    response.headers['Server'] = 'DermAI-Server'
    return response

# ─────────────────────────────────────────────
# RATE LIMITING (in-memory, per IP)
# ─────────────────────────────────────────────
def is_rate_limited(ip):
    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW
    hits = _rate_store.get(ip, [])
    hits = [t for t in hits if t > window_start]
    _rate_store[ip] = hits
    if len(hits) >= RATE_LIMIT_MAX:
        return True
    hits.append(now)
    _rate_store[ip] = hits
    return False

# ─────────────────────────────────────────────
# CSRF TOKEN HELPERS
# ─────────────────────────────────────────────
def generate_csrf_token():
    if 'csrf_token' not in session:
        session['csrf_token'] = secrets.token_hex(32)
    return session['csrf_token']

def validate_csrf(token):
    stored = session.get('csrf_token', '')
    if not stored or not token:
        return False
    return secrets.compare_digest(stored, token)

@app.context_processor
def inject_csrf():
    return {'csrf_token': generate_csrf_token()}

# ─────────────────────────────────────────────
# UPLOAD VALIDATION (extension + size + magic bytes)
# ─────────────────────────────────────────────
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def validate_image(file_storage):
    """Returns (is_valid, error_message)"""
    if not allowed_file(file_storage.filename):
        return False, 'File type not allowed. Use PNG, JPG, JPEG or WEBP.'
    file_storage.seek(0, 2)
    size = file_storage.tell()
    file_storage.seek(0)
    if size == 0:
        return False, 'Empty file.'
    if size > MAX_UPLOAD_BYTES:
        return False, 'File too large. Maximum 5 MB allowed.'
    header = file_storage.read(12)
    file_storage.seek(0)
    valid = (
        header[:3]  == b'\xff\xd8\xff' or          # JPEG
        header[:8]  == b'\x89PNG\r\n\x1a\n' or     # PNG
        (header[:4] == b'RIFF' and header[8:12] == b'WEBP')  # WEBP
    )
    if not valid:
        return False, 'File content does not match a valid image.'
    return True, ''
def log_action(level, user_name, action, details):
    db = get_db()
    ip = request.remote_addr or '127.0.0.1'
    db.execute(
        "INSERT INTO logs (level, user_name, action, details, ip) VALUES (?,?,?,?,?)",
        (level, user_name, action, details, ip)
    )
    db.commit()

# ─────────────────────────────────────────────
# AUTH DECORATORS
# ─────────────────────────────────────────────
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login') + '?tab=admin')
        if session.get('role') != 'Super Administrator':
            return redirect(url_for('user_dashboard'))
        return f(*args, **kwargs)
    return decorated

# ─────────────────────────────────────────────
# ROUTES — PUBLIC
# ─────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        # ── Rate limiting ──
        ip = request.remote_addr or '127.0.0.1'
        if is_rate_limited(ip):
            error = 'Too many login attempts. Please wait 60 seconds and try again.'
            return render_template('login.html', error=error, tab='user'), 429

        # ── CSRF check ──
        if not validate_csrf(request.form.get('csrf_token', '')):
            error = 'Invalid request. Please refresh and try again.'
            return render_template('login.html', error=error, tab='user'), 403

        email    = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        tab      = request.form.get('tab', 'user')

        # Basic input validation
        if not email or not password:
            return render_template('login.html', error='Email and password are required.', tab=tab)
        if len(email) > 254 or len(password) > 128:
            return render_template('login.html', error='Invalid input.', tab=tab)

        db   = get_db()
        user = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()

        if not user or not check_password_hash(user['password'], password):
            error = 'Invalid email or password.'
            return render_template('login.html', error=error, tab=tab)

        if tab == 'admin' and user['role'] != 'Super Administrator':
            error = 'Invalid admin credentials.'
            return render_template('login.html', error=error, tab='admin')

        # Regenerate session on login (session fixation prevention)
        session.clear()
        session.permanent = True
        session['user_id'] = user['id']
        session['name']    = user['name']
        session['email']   = user['email']
        session['role']    = user['role']

        log_action('INFO', user['name'], 'User Login', f"{user['name']} logged in successfully")

        if user['role'] == 'Super Administrator':
            return redirect(url_for('admin_dashboard'))
        return redirect(url_for('user_dashboard'))

    tab = request.args.get('tab', 'user')
    return render_template('login.html', tab=tab)

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        # ── CSRF check ──
        if not validate_csrf(request.form.get('csrf_token', '')):
            return render_template('signup.html', error='Invalid request. Please refresh and try again.'), 403

        name     = request.form.get('name', '').strip()
        email    = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        confirm  = request.form.get('confirmPassword', '')

        if not name or not email or not password:
            return render_template('signup.html', error='All fields are required.')
        if len(name) > 100 or len(email) > 254 or len(password) > 128:
            return render_template('signup.html', error='Input too long.')
        if password != confirm:
            return render_template('signup.html', error='Passwords do not match.')
        if len(password) < 6:
            return render_template('signup.html', error='Password must be at least 6 characters.')

        db = get_db()
        existing = db.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
        if existing:
            return render_template('signup.html', error='Email already registered.')

        db.execute(
            "INSERT INTO users (name, email, password, role) VALUES (?,?,?,?)",
            (name, email, generate_password_hash(password), 'User')
        )
        db.commit()
        log_action('INFO', name, 'User Signup', f"New user {name} ({email}) registered")
        return redirect(url_for('login') + '?signup=success')

    return render_template('signup.html')

@app.route('/logout')
def logout():
    name = session.get('name', 'Unknown')
    log_action('INFO', name, 'User Logout', f"{name} logged out")
    session.clear()
    return redirect(url_for('login'))

# ─────────────────────────────────────────────
# ROUTES — USER DASHBOARD
# ─────────────────────────────────────────────
@app.route('/user')
@login_required
def user_dashboard():
    if session.get('role') == 'Super Administrator':
        return redirect(url_for('admin_dashboard'))
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE id=?", (session['user_id'],)).fetchone()
    user = dict(row) if row else {}
    return render_template('user.html', user=user)

# ─────────────────────────────────────────────
# ROUTES — ADMIN DASHBOARD
# ─────────────────────────────────────────────
@app.route('/admin')
@admin_required
def admin_dashboard():
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE id=?", (session['user_id'],)).fetchone()
    user = dict(row) if row else {}
    return render_template('admin.html', user=user)

# ─────────────────────────────────────────────
# API — PROFILE UPDATE
# ─────────────────────────────────────────────
@app.route('/api/profile', methods=['POST'])
@login_required
def update_profile():
    data  = request.get_json()
    name  = data.get('name', '').strip()
    phone = data.get('phone', '').strip()
    if not name:
        return jsonify({'success': False, 'message': 'Name is required'})
    db = get_db()
    db.execute("UPDATE users SET name=?, phone=? WHERE id=?",
               (name, phone, session['user_id']))
    db.commit()
    session['name'] = name
    log_action('INFO', name, 'Profile Updated', f"User {name} updated their profile")
    return jsonify({'success': True})

# ─────────────────────────────────────────────
# API — CHANGE PASSWORD
# ─────────────────────────────────────────────
@app.route('/api/change-password', methods=['POST'])
@login_required
def change_password():
    data         = request.get_json()
    current_pwd  = data.get('current_password', '')
    new_pwd      = data.get('new_password', '')
    if not current_pwd or not new_pwd:
        return jsonify({'success': False, 'message': 'All fields required'})
    if len(new_pwd) < 6:
        return jsonify({'success': False, 'message': 'Password must be at least 6 characters'})
    db   = get_db()
    user = db.execute("SELECT * FROM users WHERE id=?", (session['user_id'],)).fetchone()
    if not check_password_hash(user['password'], current_pwd):
        return jsonify({'success': False, 'message': 'Current password is incorrect'})
    db.execute("UPDATE users SET password=? WHERE id=?",
               (generate_password_hash(new_pwd), session['user_id']))
    db.commit()
    log_action('INFO', session['name'], 'Password Changed', f"User {session['name']} changed their password")
    return jsonify({'success': True})

# ─────────────────────────────────────────────
# API — UPLOAD PROFILE PICTURE
# ─────────────────────────────────────────────
@app.route('/api/profile/picture', methods=['POST'])
@login_required
def upload_profile_picture():
    image = request.files.get('picture')
    if not image or not image.filename:
        return jsonify({'success': False, 'message': 'No file provided'})
    ok, err = validate_image(image)
    if not ok:
        return jsonify({'success': False, 'message': err})
    filename  = secure_filename(f"avatar_{session['user_id']}_{datetime.now().strftime('%Y%m%d%H%M%S')}_{image.filename}")
    save_path = os.path.join(UPLOAD_FOLDER, filename).replace('\\', '/')
    image.save(save_path)
    db = get_db()
    db.execute("UPDATE users SET phone=phone WHERE id=?", (session['user_id'],))  # keep connection alive
    # store avatar path in a new column — add it if missing
    try:
        db.execute("ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT ''")
        db.commit()
    except Exception:
        pass
    db.execute("UPDATE users SET avatar=? WHERE id=?", (save_path, session['user_id']))
    db.commit()
    log_action('INFO', session['name'], 'Profile Picture Updated', f"User {session['name']} updated profile picture")
    return jsonify({'success': True, 'url': '/' + save_path})

# ─────────────────────────────────────────────
# API — ADD PATIENT MANUALLY
# ─────────────────────────────────────────────
@app.route('/api/patients/add', methods=['POST'])
@login_required
def add_patient():
    data   = request.get_json()
    name   = data.get('name', '').strip()
    age    = data.get('age', '')
    gender = data.get('gender', 'Unknown')
    phone  = data.get('phone', '').strip()
    if not name or not age:
        return jsonify({'success': False, 'message': 'Name and age are required'})
    db         = get_db()
    patient_id = 'P' + str(random.randint(10000, 99999))
    date_str   = datetime.now().strftime('%b %d, %Y %I:%M %p')
    db.execute(
        "INSERT INTO patients (patient_id, name, age, gender, phone, last_visit, user_id) VALUES (?,?,?,?,?,?,?)",
        (patient_id, name, age, gender, phone or '-', date_str, session['user_id'])
    )
    db.commit()
    log_action('INFO', session['name'], 'Patient Added', f"Patient {name} ({patient_id}) added manually")
    return jsonify({'success': True, 'patient_id': patient_id})

# ─────────────────────────────────────────────
# API — SAVE SETTINGS
# ─────────────────────────────────────────────
@app.route('/api/settings', methods=['POST'])
@login_required
def save_settings():
    data = request.get_json()
    # Settings are user-preference only — store in session for now
    session['settings'] = data
    log_action('INFO', session['name'], 'Settings Saved', f"User {session['name']} saved settings")
    return jsonify({'success': True})
@app.route('/api/admin/add-user', methods=['POST'])
@admin_required
def admin_add_user():
    data     = request.get_json()
    name     = data.get('name', '').strip()
    email    = data.get('email', '').strip().lower()
    password = data.get('password', '')
    if not name or not email or not password:
        return jsonify({'success': False, 'message': 'All fields required'})
    if len(password) < 6:
        return jsonify({'success': False, 'message': 'Password too short'})
    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
    if existing:
        return jsonify({'success': False, 'message': 'Email already registered'})
    db.execute("INSERT INTO users (name, email, password, role) VALUES (?,?,?,?)",
               (name, email, generate_password_hash(password), 'User'))
    db.commit()
    log_action('INFO', session['name'], 'User Added', f"Admin added new user {name} ({email})")
    return jsonify({'success': True})

# ─────────────────────────────────────────────
# API — DIAGNOSIS (AI powered)
# ─────────────────────────────────────────────

@app.route('/api/diagnose', methods=['POST'])
@login_required
def diagnose():
    age          = request.form.get('age', '')
    gender       = request.form.get('gender', 'Unknown')
    symptoms     = request.form.get('symptoms', '')
    patient_name = request.form.get('patient_name', '').strip() or 'Unknown Patient'
    existing_pid = request.form.get('existing_patient_id', '').strip()
    image        = request.files.get('image')

    if not age or not symptoms:
        return jsonify({'success': False, 'message': 'Age and symptoms are required.'})

    image_path = ''
    if image and image.filename:
        ok, err = validate_image(image)
        if not ok:
            return jsonify({'success': False, 'message': err})
        filename   = secure_filename(f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{image.filename}")
        image_path = os.path.join(UPLOAD_FOLDER, filename).replace('\\', '/')
        image.save(image_path)

    # ── Real AI prediction ──
    if image_path:
        disease, raw_confidence, cal_confidence, risk, explanation, suggestions, raw_probs_json = predict_skin_disease(image_path)
    else:
        disease        = 'Inconclusive'
        raw_confidence = 0
        cal_confidence = None
        risk           = 'Low Risk'
        explanation    = 'No image was provided. Please upload a clear skin lesion image for accurate diagnosis.'
        suggestions    = ['Upload a close-up image of the affected skin area.', 'Ensure good lighting when taking the photo.']
        raw_probs_json = None

    db       = get_db()
    date_str = datetime.now().strftime('%b %d, %Y %I:%M %p')

    # ── Patient identification: returning vs new ──
    # Priority 1: explicit existing_patient_id from form
    # Priority 2: auto-match by name + age + gender for same user
    is_returning = False
    prev_disease  = None
    visit_count   = 1
    first_visit   = date_str
    existing      = None

    if existing_pid:
        if session.get('role') == 'Super Administrator':
            existing = db.execute(
                "SELECT * FROM patients WHERE patient_id=?", (existing_pid,)
            ).fetchone()
        else:
            existing = db.execute(
                "SELECT * FROM patients WHERE patient_id=? AND user_id=?",
                (existing_pid, session['user_id'])
            ).fetchone()

    # Auto-match by name + age + gender if no explicit ID given
    if not existing:
        existing = db.execute(
            "SELECT * FROM patients WHERE LOWER(name)=? AND age=? AND LOWER(gender)=? AND user_id=? "
            "ORDER BY id DESC LIMIT 1",
            (patient_name.lower(), str(age), gender.lower(), session['user_id'])
        ).fetchone()

    if existing:
        is_returning  = True
        patient_id    = existing['patient_id']
        visit_count   = (int(existing['visit_count'] or 1)) + 1
        first_visit   = existing['first_visit'] or existing['last_visit'] or date_str
        prev_disease  = db.execute(
            "SELECT disease FROM diagnoses WHERE patient_id=? ORDER BY id DESC LIMIT 1",
            (patient_id,)
        ).fetchone()
        prev_disease  = prev_disease['disease'] if prev_disease else None
        # Update patient record
        db.execute(
            "UPDATE patients SET last_visit=?, visit_count=?, symptoms=?, age=?, gender=? WHERE patient_id=?",
            (date_str, visit_count, symptoms, age, gender, patient_id)
        )
        db.commit()
    else:
        # Brand new patient
        patient_id = 'P' + str(random.randint(10000, 99999))
        db.execute(
            "INSERT INTO patients (patient_id, name, age, gender, phone, last_visit, user_id, visit_count, first_visit, symptoms) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (patient_id, patient_name, age, gender, '-', date_str, session['user_id'],
             1, date_str, symptoms)
        )
        db.commit()
        visit_count = 1
        first_visit = date_str

    # ── Save diagnosis record ──
    diag_id = 'H' + str(random.randint(10000, 99999))
    db.execute(
        "INSERT INTO diagnoses (diag_id, patient_id, disease, confidence, calibrated_confidence, raw_probs, "
        "risk, explanation, suggestions, image_path, date, user_id, visit_number, symptoms) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (diag_id, patient_id, disease, raw_confidence, cal_confidence,
         raw_probs_json or '', risk,
         explanation, json.dumps(suggestions), image_path, date_str, session['user_id'],
         visit_count, symptoms)
    )
    db.commit()

    # Invalidate calibration cache and recompute in background (non-blocking)
    invalidate_cache()
    import threading
    threading.Thread(target=run_calibration_pipeline, daemon=True).start()

    log_action('INFO', session['name'], 'Diagnosis Completed',
               f"Diagnosis {diag_id} for {patient_name} ({patient_id}) Visit #{visit_count}: {disease} ({raw_confidence}%)")

    return jsonify({
        'success':               True,
        'diag_id':               diag_id,
        'patient_id':            patient_id,
        'disease':               disease,
        'risk':                  risk,
        'confidence':            raw_confidence,
        'calibrated_confidence': cal_confidence,
        'explanation':           explanation,
        'suggestions':           suggestions,
        'image_url':             '/' + image_path if image_path else '',
        'date':                  date_str,
        'visit_count':           visit_count,
        'visit_number':          visit_count,
        'is_returning':          is_returning,
        'first_visit':           first_visit,
        'previous_disease':      prev_disease,
        'symptoms':              symptoms,
    })

# ─────────────────────────────────────────────
# API — DATA ENDPOINTS (JSON for JS to consume)
# ─────────────────────────────────────────────
@app.route('/api/patients')
@login_required
def api_patients():
    db = get_db()
    if session.get('role') == 'Super Administrator':
        rows = db.execute("SELECT * FROM patients ORDER BY id DESC").fetchall()
    else:
        rows = db.execute("SELECT * FROM patients WHERE user_id=? ORDER BY id DESC",
                          (session['user_id'],)).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/diagnoses')
@login_required
def api_diagnoses():
    db = get_db()
    if session.get('role') == 'Super Administrator':
        rows = db.execute("SELECT * FROM diagnoses ORDER BY id DESC").fetchall()
    else:
        rows = db.execute("SELECT * FROM diagnoses WHERE user_id=? ORDER BY id DESC",
                          (session['user_id'],)).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/users')
@admin_required
def api_users():
    db   = get_db()
    rows = db.execute("SELECT id, name, email, role, phone, created_at FROM users ORDER BY id").fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/users/delete/<int:user_id>', methods=['POST'])
@admin_required
def api_delete_user(user_id):
    db = get_db()
    user = db.execute("SELECT name, email FROM users WHERE id=?", (user_id,)).fetchone()
    if not user:
        return jsonify({'success': False, 'message': 'User not found'})
    if user['email'] == 'admin@gmail.com':
        return jsonify({'success': False, 'message': 'Cannot delete the admin account'})
    db.execute("DELETE FROM users WHERE id=?", (user_id,))
    db.commit()
    log_action('WARNING', session['name'], 'User Deleted', f"Admin deleted user {user['name']} ({user['email']})")
    return jsonify({'success': True})

@app.route('/api/logs')
@admin_required
def api_logs():
    db   = get_db()
    rows = db.execute("SELECT * FROM logs ORDER BY id DESC LIMIT 100").fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/stats')
@login_required
def api_stats():
    db = get_db()
    if session.get('role') == 'Super Administrator':
        total_users      = db.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        total_patients   = db.execute("SELECT COUNT(*) FROM patients").fetchone()[0]
        total_diagnoses  = db.execute("SELECT COUNT(*) FROM diagnoses").fetchone()[0]
        high_risk        = db.execute("SELECT COUNT(*) FROM diagnoses WHERE risk='High Risk'").fetchone()[0]
        avg_conf_row     = db.execute("SELECT AVG(confidence) FROM diagnoses").fetchone()[0]
        avg_conf         = round(avg_conf_row, 1) if avg_conf_row else 0
        return jsonify({
            'total_users': total_users,
            'total_patients': total_patients,
            'total_diagnoses': total_diagnoses,
            'high_risk': high_risk,
            'avg_confidence': avg_conf,
        })
    else:
        uid             = session['user_id']
        total_diagnoses = db.execute("SELECT COUNT(*) FROM diagnoses WHERE user_id=?", (uid,)).fetchone()[0]
        high_risk       = db.execute("SELECT COUNT(*) FROM diagnoses WHERE user_id=? AND risk='High Risk'", (uid,)).fetchone()[0]
        avg_conf_row    = db.execute("SELECT AVG(confidence) FROM diagnoses WHERE user_id=?", (uid,)).fetchone()[0]
        avg_conf        = round(avg_conf_row, 1) if avg_conf_row else 0
        return jsonify({
            'total_diagnoses': total_diagnoses,
            'high_risk': high_risk,
            'avg_confidence': avg_conf,
        })

@app.route('/api/session-user')
@login_required
def api_session_user():
    db   = get_db()
    user = db.execute("SELECT id, name, email, role, phone FROM users WHERE id=?",
                      (session['user_id'],)).fetchone()
    return jsonify(dict(user))

# ─────────────────────────────────────────────
# API — CONFIDENCE CALIBRATION & EVALUATION
# ─────────────────────────────────────────────

@app.route('/api/calibration/run', methods=['POST'])
@admin_required
def api_run_calibration():
    """Trigger (or re-run) the full calibration pipeline and return results."""
    invalidate_cache()   # force fresh computation
    try:
        result = run_calibration_pipeline()
        log_action('INFO', session['name'], 'Calibration Run',
                   f"Calibration pipeline executed. Samples: {result.get('n_samples',0)}, "
                   f"Calibrated: {result.get('calibrated')}")
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/calibration/status')
@admin_required
def api_calibration_status():
    cal = get_or_run_calibration()
    return jsonify({'success': True, 'result': cal})

@app.route('/api/calibration/user-status')
@login_required
def api_calibration_user_status():
    """Return calibration metrics — uses cache only, never blocks on pipeline."""
    cal = get_cached_calibration()   # fast — returns None or cached result
    if not cal or not cal.get('calibrated'):
        return jsonify({'success': True, 'calibrated': False,
                        'message': cal.get('message', 'Calibration not yet computed.') if cal else 'Not yet computed.'})
    return jsonify({
        'success':        True,
        'calibrated':     True,
        'ece_before':     cal['ece_before'],
        'ece_after':      cal['ece_after'],
        'brier_before':   cal['brier_before'],
        'brier_after':    cal['brier_after'],
        'temperature':    cal['temperature'],
        'n_samples':      cal['n_samples'],
        'n_test':         cal.get('n_test', 0),
        'n_cal':          cal.get('n_cal', 0),
        'eval_date':      cal['eval_date'],
        'diagram_before': cal.get('diagram_before'),
        'diagram_after':  cal.get('diagram_after'),
    })


@app.route('/api/calibration/diagnosis/<diag_id>')
@login_required
def api_diagnosis_calibration(diag_id):
    """
    Return raw and calibrated confidence for a specific diagnosis.
    Used by the patient report view to show both scores.
    """
    db = get_db()
    if session.get('role') == 'Super Administrator':
        row = db.execute(
            "SELECT diag_id, disease, confidence, calibrated_confidence, risk, date "
            "FROM diagnoses WHERE diag_id=?", (diag_id,)
        ).fetchone()
    else:
        row = db.execute(
            "SELECT diag_id, disease, confidence, calibrated_confidence, risk, date "
            "FROM diagnoses WHERE diag_id=? AND user_id=?",
            (diag_id, session['user_id'])
        ).fetchone()

    if not row:
        return jsonify({'success': False, 'message': 'Diagnosis not found'}), 404

    cal = get_cached_calibration()
    return jsonify({
        'success':                True,
        'diag_id':                row['diag_id'],
        'disease':                row['disease'],
        'raw_confidence':         row['confidence'],
        'calibrated_confidence':  row['calibrated_confidence'],
        'risk':                   row['risk'],
        'date':                   row['date'],
        'calibration_available':  cal.get('calibrated', False),
        'temperature':            cal.get('temperature'),
        'ece_after':              cal.get('ece_after'),
    })

# ─────────────────────────────────────────────
# API — PATIENT VISIT TRACKING & REPORT COMPARISON
# ─────────────────────────────────────────────

@app.route('/api/patient/<patient_id>/history')
@login_required
def api_patient_history(patient_id):
    """Return full patient profile + all their consultations ordered chronologically."""
    db = get_db()
    if session.get('role') == 'Super Administrator':
        patient = db.execute("SELECT * FROM patients WHERE patient_id=?", (patient_id,)).fetchone()
    else:
        patient = db.execute("SELECT * FROM patients WHERE patient_id=? AND user_id=?",
                             (patient_id, session['user_id'])).fetchone()
    if not patient:
        return jsonify({'success': False, 'message': 'Patient not found'}), 404

    diags = db.execute(
        "SELECT * FROM diagnoses WHERE patient_id=? ORDER BY id ASC",
        (patient_id,)
    ).fetchall()

    pat = dict(patient)
    visits = [dict(d) for d in diags]

    # Enrich each visit with readable suggestions
    for v in visits:
        try:
            v['suggestions_list'] = json.loads(v.get('suggestions', '[]'))
        except Exception:
            v['suggestions_list'] = []

    return jsonify({
        'success': True,
        'patient': pat,
        'diagnoses': visits,
        'total_visits': len(visits),
    })


@app.route('/api/patient/<patient_id>/compare')
@login_required
def api_patient_compare(patient_id):
    """Return the last two consultations for side-by-side comparison."""
    db = get_db()
    if session.get('role') == 'Super Administrator':
        patient = db.execute("SELECT * FROM patients WHERE patient_id=?", (patient_id,)).fetchone()
    else:
        patient = db.execute("SELECT * FROM patients WHERE patient_id=? AND user_id=?",
                             (patient_id, session['user_id'])).fetchone()
    if not patient:
        return jsonify({'success': False, 'message': 'Patient not found'}), 404

    diags = db.execute(
        "SELECT * FROM diagnoses WHERE patient_id=? ORDER BY id ASC",
        (patient_id,)
    ).fetchall()
    visits = [dict(d) for d in diags]
    for v in visits:
        try:
            v['suggestions_list'] = json.loads(v.get('suggestions', '[]'))
        except Exception:
            v['suggestions_list'] = []

    if len(visits) < 2:
        return jsonify({'success': True, 'has_previous': False, 'message': 'Not enough visits for comparison'})

    current  = visits[-1]
    previous = visits[-2]
    return jsonify({
        'success': True,
        'has_previous': True,
        'previous': previous,
        'current': current,
        'patient': dict(patient),
    })


@app.route('/api/patients/search')
@login_required
def api_patients_search():
    """Search patients by name or patient_id for the returning-patient lookup."""
    q = request.args.get('q', '').strip().lower()
    db = get_db()
    if session.get('role') == 'Super Administrator':
        rows = db.execute(
            "SELECT patient_id, name, age, gender, last_visit, visit_count, first_visit "
            "FROM patients WHERE LOWER(name) LIKE ? OR LOWER(patient_id) LIKE ? "
            "ORDER BY last_visit DESC LIMIT 20",
            (f'%{q}%', f'%{q}%')
        ).fetchall()
    else:
        rows = db.execute(
            "SELECT patient_id, name, age, gender, last_visit, visit_count, first_visit "
            "FROM patients WHERE user_id=? AND (LOWER(name) LIKE ? OR LOWER(patient_id) LIKE ?) "
            "ORDER BY last_visit DESC LIMIT 20",
            (session['user_id'], f'%{q}%', f'%{q}%')
        ).fetchall()
    return jsonify([dict(r) for r in rows])

# ─────────────────────────────────────────────
# ERROR HANDLERS
# ─────────────────────────────────────────────
@app.errorhandler(404)
def not_found(e):
    return render_template('index.html'), 404

@app.errorhandler(403)
def forbidden(e):
    return redirect(url_for('login'))

@app.errorhandler(429)
def too_many_requests(e):
    return render_template('login.html', error='Too many requests. Please wait and try again.', tab='user'), 429

# ─────────────────────────────────────────────
# RUN — debug OFF in production, suppress version
# ─────────────────────────────────────────────
if __name__ == '__main__':
    from werkzeug.serving import WSGIRequestHandler
    WSGIRequestHandler.server_version = 'DermAI-Server'
    WSGIRequestHandler.sys_version = ''
    debug_mode = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(debug=debug_mode, port=5000)
