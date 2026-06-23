import urllib.request, urllib.parse, http.cookiejar

base = 'http://127.0.0.1:5000'
results = []

# ── Helper: GET with no redirect following ──
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

no_redir = urllib.request.build_opener(NoRedirect())

# 1. Security Headers
req = urllib.request.urlopen(base)
# headers are case-insensitive in HTTP — use get() with lowercase
h = req.headers  # http.client.HTTPMessage — case-insensitive

def chk(label, key, expected=None):
    val = h.get(key, 'MISSING')
    if expected:
        ok = val != 'MISSING' and expected.lower() in val.lower()
    else:
        ok = val != 'MISSING'
    results.append((label, val, ok))

chk('X-Frame-Options',        'X-Frame-Options',        'DENY')
chk('X-Content-Type-Options', 'X-Content-Type-Options', 'nosniff')
chk('X-XSS-Protection',       'X-XSS-Protection',       '1')
chk('Referrer-Policy',        'Referrer-Policy')
chk('Content-Security-Policy','Content-Security-Policy')
chk('Permissions-Policy',     'Permissions-Policy')

server = h.get('Server', '')
results.append(('Server header not leaking version',
                server,
                'werkzeug' not in server.lower() and 'python' not in server.lower()))

# 2. CSRF - POST without token should get 403
data = urllib.parse.urlencode({'email':'a@a.com','password':'pass','tab':'user'}).encode()
try:
    no_redir.open(urllib.request.Request(base+'/login', data=data, method='POST'))
    results.append(('CSRF block (no token)', 'NOT blocking - got 200', False))
except urllib.error.HTTPError as e:
    results.append(('CSRF block (no token)', 'Got HTTP ' + str(e.code), e.code == 403))

# 3. Rate limiting - 12 rapid attempts
blocked = False
for i in range(13):
    data = urllib.parse.urlencode({'email':'x@x.com','password':'wrong','tab':'user','csrf_token':'fake'}).encode()
    try:
        no_redir.open(urllib.request.Request(base+'/login', data=data, method='POST'))
    except urllib.error.HTTPError as e:
        if e.code == 429:
            blocked = True
            break
results.append(('Rate limiting (429 after 10 attempts)', 'Got 429' if blocked else 'NOT triggered', blocked))

# 4. Route protection - check redirect (302) not 200
try:
    r = no_redir.open(base+'/user')
    results.append(('Route protection /user', 'ACCESSIBLE without login (200)', False))
except urllib.error.HTTPError as e:
    results.append(('Route protection /user', 'Redirected HTTP ' + str(e.code), e.code in (301,302,303)))

try:
    r = no_redir.open(base+'/admin')
    results.append(('Route protection /admin', 'ACCESSIBLE without login (200)', False))
except urllib.error.HTTPError as e:
    results.append(('Route protection /admin', 'Redirected HTTP ' + str(e.code), e.code in (301,302,303)))

# 5. API protection
try:
    r = no_redir.open(base+'/api/users')
    results.append(('API /api/users protected', 'ACCESSIBLE without login', False))
except urllib.error.HTTPError as e:
    results.append(('API /api/users protected', 'Blocked HTTP ' + str(e.code), e.code in (301,302,303,401,403)))

# 6. Debug mode - no traceback on error
try:
    urllib.request.urlopen(base+'/nonexistent-xyz-route')
except urllib.error.HTTPError as e:
    body = e.read().decode('utf-8', errors='ignore')
    debug_exposed = 'Traceback' in body or 'werkzeug debugger' in body.lower()
    results.append(('Debug mode off (no traceback)', 'Debug info exposed!' if debug_exposed else 'Clean error page', not debug_exposed))

# 7. Password hashing - check DB directly
import sqlite3
db = sqlite3.connect('dermai.db')
row = db.execute("SELECT password FROM users WHERE email='admin@gmail.com'").fetchone()
db.close()
if row:
    pwd = row[0]
    is_hashed = pwd.startswith('pbkdf2:') or pwd.startswith('scrypt:')
    results.append(('Password hashing (not plain text)', pwd[:20]+'...', is_hashed))

# 8. Session cookie flags
req2 = urllib.request.urlopen(base+'/login')
cookie_header = req2.headers.get('Set-Cookie', '')
httponly = 'httponly' in cookie_header.lower()
samesite = 'samesite' in cookie_header.lower()
results.append(('Session cookie HttpOnly flag', cookie_header[:60]+'...', httponly))
results.append(('Session cookie SameSite flag', 'SameSite present' if samesite else 'MISSING', samesite))

# Print results
print()
print('=' * 60)
print('   LIVE SECURITY AUDIT — DermAI Agent')
print('=' * 60)
passed = failed = 0
for name, val, ok in results:
    status = 'PASS' if ok else 'FAIL'
    if ok: passed += 1
    else:  failed += 1
    print('  [' + status + '] ' + name)
    print('         ' + str(val))
print('=' * 60)
print('  RESULT: ' + str(passed) + ' PASSED  |  ' + str(failed) + ' FAILED  |  Total: ' + str(passed+failed))
print('=' * 60)
