// admin.js — Admin Dashboard (fully wired)

document.addEventListener('DOMContentLoaded', function () {

    // ── Populate top nav ──
    if (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) {
        document.querySelectorAll('.user-name').forEach(function(el) { el.textContent = CURRENT_USER.name; });
        document.querySelectorAll('.user-role').forEach(function(el) { el.textContent = CURRENT_USER.role; });
    }

    // ── Sidebar Navigation ──
    var sidebarLinks = document.querySelectorAll('.sidebar-menu a');
    var views = document.querySelectorAll('.view-content');

    function switchView(targetId) {
        views.forEach(function(v) { v.style.display = 'none'; });
        var t = document.getElementById(targetId);
        if (t) t.style.display = 'block';
    }

    sidebarLinks.forEach(function(link) {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            sidebarLinks.forEach(function(l) { l.classList.remove('active'); });
            link.classList.add('active');
            var tid = link.getAttribute('data-target');
            if (tid) switchView(tid);
        });
    });

    // ── Details tabs ──
    document.querySelectorAll('.d-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.d-tab').forEach(function(t) { t.classList.remove('active'); });
            tab.classList.add('active');
        });
    });

    // ── Settings tabs (handled by admin-settings-save buttons below) ──
    // Old generic handler removed — new one uses data-panel attributes

    // ── Logout (handled by specific IDs below) ──

    // ── Data stores ──
    var allUsers = [];
    var allDiagnoses = [];
    var allPatients = [];
    var allLogs = [];

    // ── Load all admin data ──
    function loadAdminData() {
        // Stats
        fetch('/api/stats')
        .then(function(r) { return r.json(); })
        .then(function(stats) {
            var metrics = document.querySelectorAll('#overview-content .metric-value');
            if (metrics.length >= 5) {
                metrics[0].textContent = stats.total_users     || 0;
                metrics[1].textContent = stats.total_patients  || 0;
                metrics[2].textContent = stats.total_diagnoses || 0;
                metrics[3].textContent = stats.high_risk       || 0;
                metrics[4].textContent = (stats.avg_confidence || 0) + '%';
            }
            // Also update reports page metrics
            var repMetrics = document.querySelectorAll('#reports-content .metric-value');
            if (repMetrics.length >= 4) {
                repMetrics[0].textContent = stats.total_diagnoses || 0;
                repMetrics[1].textContent = stats.total_patients  || 0;
                repMetrics[2].textContent = (stats.avg_confidence || 0) + '%';
                repMetrics[3].textContent = stats.total_users     || 0;
            }
        });

        // Diagnoses
        fetch('/api/diagnoses')
        .then(function(r) { return r.json(); })
        .then(function(diagnoses) {
            allDiagnoses = diagnoses;
            renderRecentDiagnoses(diagnoses);
            renderDiagnosesTable(diagnoses);
            updateAdminCharts(diagnoses);
        });

        // Users
        fetch('/api/users')
        .then(function(r) { return r.json(); })
        .then(function(users) {
            allUsers = users;
            renderUsersTable(users);
        });

        // Patients
        fetch('/api/patients')
        .then(function(r) { return r.json(); })
        .then(function(patients) {
            allPatients = patients;
            renderAdminPatientsTable(patients);
        });

        // Logs
        fetch('/api/logs')
        .then(function(r) { return r.json(); })
        .then(function(logs) {
            allLogs = logs;
            renderLogsWidget(logs);
            renderLogsTable(logs);
        });
    }

    function renderRecentDiagnoses(diagnoses) {
        var ardBody = document.getElementById('adminRecentDiagnosesBody');
        if (!ardBody) return;
        ardBody.innerHTML = '';
        if (!diagnoses.length) {
            ardBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#64748b;padding:20px">No diagnoses yet.</td></tr>';
            return;
        }
        diagnoses.slice(0, 5).forEach(function(d) {
            var tagClass = d.risk === 'High Risk' ? 'tag-inactive' : 'tag-active';
            var label = d.risk === 'High Risk' ? 'High' : d.risk === 'Medium Risk' ? 'Medium' : 'Low';
            ardBody.innerHTML += '<tr>' +
                '<td>' + d.patient_id + '</td><td>—</td>' +
                '<td>' + d.disease + '</td>' +
                '<td><span class="tag ' + tagClass + '">' + label + '</span></td>' +
                '<td>' + d.confidence + '%</td>' +
                '<td>' + (d.date || '').split(',')[0] + '</td>' +
            '</tr>';
        });
    }

    function renderDiagnosesTable(diagnoses) {
        var adBody = document.getElementById('adminDiagnosesTableBody');
        if (!adBody) return;
        adBody.innerHTML = '';
        if (!diagnoses.length) {
            adBody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#64748b;padding:20px">No diagnoses yet.</td></tr>';
            return;
        }
        diagnoses.forEach(function(d) {
            var tagClass = d.risk === 'High Risk' ? 'tag-review' : 'tag-confirmed';
            var status = d.risk === 'High Risk' ? 'Review' : 'Confirmed';
            adBody.innerHTML += '<tr>' +
                '<td>' + d.diag_id + '</td>' +
                '<td>' + d.patient_id + '</td>' +
                '<td>' + d.disease + '</td>' +
                '<td>' + d.confidence + '%</td>' +
                '<td>Auto-AI</td>' +
                '<td>' + d.date + '</td>' +
                '<td><span class="tag ' + tagClass + '">' + status + '</span></td>' +
                '<td><button class="action-icon view-diag-btn" data-id="' + d.diag_id + '">👁</button></td>' +
            '</tr>';
        });
    }

    function renderUsersTable(users) {
        var auBody = document.getElementById('adminUsersTableBody');
        if (!auBody) return;
        auBody.innerHTML = '';
        if (!users.length) {
            auBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#64748b;padding:20px">No users yet.</td></tr>';
            return;
        }
        users.forEach(function(u) {
            var isAdmin = u.email === 'admin@gmail.com';
            var actions = isAdmin
                ? '<span style="color:#94a3b8;font-size:0.75rem">Protected</span>'
                : '<button class="action-icon" title="Delete" onclick="deleteUser(' + u.id + ',\'' + u.email + '\')">🗑</button>';
            auBody.innerHTML += '<tr>' +
                '<td>USR-' + String(u.id).padStart(3, '0') + '</td>' +
                '<td>' + u.name + '</td>' +
                '<td>' + u.email + '</td>' +
                '<td>' + u.role + '</td>' +
                '<td><span class="tag tag-active">Active</span></td>' +
                '<td>' + (u.created_at || '—') + '</td>' +
                '<td class="action-btns">' + actions + '</td>' +
            '</tr>';
        });
    }

    function renderAdminPatientsTable(patients) {
        var ptBody = document.getElementById('adminPatientsTableBody');
        if (!ptBody) return;
        ptBody.innerHTML = '';
        if (!patients.length) {
            ptBody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#64748b;padding:20px">No patients yet.</td></tr>';
            return;
        }
        patients.forEach(function(p) {
            ptBody.innerHTML += '<tr>' +
                '<td>' + p.patient_id + '</td>' +
                '<td>' + p.name + '</td>' +
                '<td>' + p.age + '</td>' +
                '<td>' + p.gender + '</td>' +
                '<td>' + p.phone + '</td>' +
                '<td>' + p.last_visit + '</td>' +
                '<td><span class="tag tag-active">Active</span></td>' +
                '<td class="action-btns"><button class="action-icon" onclick="viewAdminPatient(\'' + p.patient_id + '\')">👁</button></td>' +
            '</tr>';
        });
        // update pagination info
        var pageInfo = document.querySelector('#patients-content .page-info');
        if (pageInfo) pageInfo.textContent = 'Showing 1 to ' + patients.length + ' of ' + patients.length + ' patients';
    }

    window.viewAdminPatient = function(patientId) {
        var p = allPatients.find(function(x) { return x.patient_id === patientId; });
        if (!p) return;
        // find diagnoses for this patient
        var patDiags = allDiagnoses.filter(function(d) { return d.patient_id === patientId; });
        var diagRows = patDiags.length ? patDiags.map(function(d) {
            return '<tr><td style="padding:6px 8px">' + d.diag_id + '</td><td style="padding:6px 8px">' + d.disease + '</td><td style="padding:6px 8px">' + d.confidence + '%</td><td style="padding:6px 8px">' + d.date + '</td></tr>';
        }).join('') : '<tr><td colspan="4" style="padding:8px;color:#64748b">No diagnoses</td></tr>';

        showInfoModal('Patient Details — ' + p.patient_id,
            '<table style="width:100%;border-collapse:collapse;font-size:0.9rem;margin-bottom:16px">' +
            '<tr><td style="padding:8px;color:#64748b;width:120px">Patient ID</td><td style="padding:8px;font-weight:600">' + p.patient_id + '</td></tr>' +
            '<tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">Name</td><td style="padding:8px;font-weight:600">' + p.name + '</td></tr>' +
            '<tr><td style="padding:8px;color:#64748b">Age</td><td style="padding:8px">' + p.age + '</td></tr>' +
            '<tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">Gender</td><td style="padding:8px">' + p.gender + '</td></tr>' +
            '<tr><td style="padding:8px;color:#64748b">Last Visit</td><td style="padding:8px">' + p.last_visit + '</td></tr>' +
            '</table>' +
            '<h4 style="font-size:0.9rem;margin-bottom:8px;color:#0f172a">Diagnoses</h4>' +
            '<table style="width:100%;border-collapse:collapse;font-size:0.85rem">' +
            '<thead><tr style="background:#f8fafc"><th style="padding:6px 8px;text-align:left">ID</th><th style="padding:6px 8px;text-align:left">Disease</th><th style="padding:6px 8px;text-align:left">Confidence</th><th style="padding:6px 8px;text-align:left">Date</th></tr></thead>' +
            '<tbody>' + diagRows + '</tbody></table>'
        );
    };

    function renderLogsWidget(logs) {
        var aslBody = document.getElementById('adminSystemLogsBody');
        if (!aslBody) return;
        aslBody.innerHTML = '';
        if (!logs.length) {
            aslBody.innerHTML = '<li class="log-item"><span class="log-msg" style="color:#64748b">No logs yet.</span></li>';
            return;
        }
        logs.slice(0, 6).forEach(function(l) {
            var time = (l.created_at || '').split(' ')[1] || l.created_at;
            var color = l.level === 'ERROR' ? '#ef4444' : l.level === 'WARNING' ? '#f59e0b' : '#10b981';
            aslBody.innerHTML += '<li class="log-item">' +
                '<span class="log-time">' + time + '</span>' +
                '<span class="log-msg">' + l.details + '</span>' +
                '<span class="log-status" style="color:' + color + '">' + l.level + '</span>' +
            '</li>';
        });
    }

    function renderLogsTable(logs) {
        var logsBody = document.querySelector('#logs-content tbody');
        if (!logsBody) return;
        logsBody.innerHTML = '';
        if (!logs.length) {
            logsBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#64748b;padding:20px">No logs yet.</td></tr>';
            return;
        }
        logs.forEach(function(l) {
            var levelClass = l.level === 'ERROR' ? 'tag-inactive' : l.level === 'WARNING' ? 'tag-training' : 'tag-active';
            logsBody.innerHTML += '<tr>' +
                '<td>' + l.created_at + '</td>' +
                '<td><span class="tag ' + levelClass + '">' + l.level + '</span></td>' +
                '<td>' + (l.user_name || '—') + '</td>' +
                '<td>' + l.action + '</td>' +
                '<td>' + l.details + '</td>' +
                '<td>' + l.ip + '</td>' +
            '</tr>';
        });
    }

    loadAdminData();

    // ── View Diagnosis Detail (click 👁) ──
    document.addEventListener('click', function(e) {
        var btn = e.target.closest('.view-diag-btn');
        if (!btn) return;
        var diagId = btn.getAttribute('data-id');
        var d = allDiagnoses.find(function(x) { return x.diag_id === diagId; });
        if (!d) return;

        // Find patient info
        var p = allPatients.find(function(x) { return x.patient_id === d.patient_id; });
        var riskColor = d.risk === 'High Risk' ? '#ef4444' : d.risk === 'Medium Risk' ? '#f59e0b' : '#10b981';
        var imgHtml = d.image_path ? '<img src="/' + d.image_path + '" style="width:100%;max-height:180px;object-fit:cover;border-radius:8px;margin-bottom:16px">' : '';

        // Parse suggestions
        var suggs = [];
        try { suggs = JSON.parse(d.suggestions || '[]'); } catch(e) { suggs = [d.suggestions || '']; }
        var suggHtml = suggs.map(function(s) { return '<li style="padding:4px 0;color:#334155">• ' + s + '</li>'; }).join('');

        showInfoModal('Diagnosis Details — ' + d.diag_id,
            imgHtml +
            '<table style="width:100%;border-collapse:collapse;font-size:0.88rem;margin-bottom:16px">' +
            '<tr><td style="padding:7px 8px;color:#64748b;width:130px;background:#f8fafc">Diagnosis ID</td><td style="padding:7px 8px;font-weight:600">' + d.diag_id + '</td></tr>' +
            '<tr><td style="padding:7px 8px;color:#64748b">Patient ID</td><td style="padding:7px 8px">' + d.patient_id + (p ? ' (' + p.name + ')' : '') + '</td></tr>' +
            '<tr><td style="padding:7px 8px;color:#64748b;background:#f8fafc">Disease</td><td style="padding:7px 8px;font-weight:700;color:' + riskColor + '">' + d.disease + '</td></tr>' +
            '<tr><td style="padding:7px 8px;color:#64748b">Risk Level</td><td style="padding:7px 8px;font-weight:600;color:' + riskColor + '">' + d.risk + '</td></tr>' +
            '<tr><td style="padding:7px 8px;color:#64748b;background:#f8fafc">Confidence</td><td style="padding:7px 8px">' + d.confidence + '%</td></tr>' +
            '<tr><td style="padding:7px 8px;color:#64748b">Date</td><td style="padding:7px 8px">' + d.date + '</td></tr>' +
            (p ? '<tr><td style="padding:7px 8px;color:#64748b;background:#f8fafc">Patient Age</td><td style="padding:7px 8px">' + p.age + '</td></tr>' +
                 '<tr><td style="padding:7px 8px;color:#64748b">Patient Gender</td><td style="padding:7px 8px">' + p.gender + '</td></tr>' : '') +
            '</table>' +
            '<div style="margin-bottom:12px"><strong style="font-size:.88rem;color:#0f172a">Medical Explanation</strong>' +
            '<p style="font-size:.85rem;color:#475569;line-height:1.6;margin-top:6px">' + (d.explanation || '—') + '</p></div>' +
            '<div><strong style="font-size:.88rem;color:#0f172a">Treatment Suggestions</strong><ul style="margin-top:6px;list-style:none;padding:0">' + suggHtml + '</ul></div>'
        );
    });

    var backBtn = document.getElementById('back-to-diagnoses');
    if (backBtn) {
        backBtn.addEventListener('click', function(e) {
            e.preventDefault();
            switchView('diagnoses-content');
        });
    }

    // ── Delete User ──
    window.deleteUser = function(userId, email) {
        if (!confirm('Delete user ' + email + '? This cannot be undone.')) return;
        fetch('/api/users/delete/' + userId, { method: 'POST' })
        .then(function(r) { return r.json(); })
        .then(function(result) {
            if (result.success) {
                showToast('User deleted successfully.', 'success');
                loadAdminData();
            } else {
                showToast(result.message || 'Failed to delete user.', 'error');
            }
        });
    };

    // ── Add User Modal ──
    var addUserBtn = document.querySelector('#users-content .btn-primary');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', function() {
            showFormModal('Add New User',
                '<div style="margin-bottom:14px"><label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:6px">Full Name</label><input id="newUserName" type="text" style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem" placeholder="Enter full name"></div>' +
                '<div style="margin-bottom:14px"><label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:6px">Email</label><input id="newUserEmail" type="email" style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem" placeholder="Enter email"></div>' +
                '<div style="margin-bottom:14px"><label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:6px">Password</label><input id="newUserPwd" type="password" style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.9rem" placeholder="Min 6 characters"></div>',
                function() {
                    var name  = document.getElementById('newUserName').value.trim();
                    var email = document.getElementById('newUserEmail').value.trim();
                    var pwd   = document.getElementById('newUserPwd').value;
                    if (!name || !email || !pwd) { showToast('All fields required.', 'error'); return false; }
                    if (pwd.length < 6) { showToast('Password too short.', 'error'); return false; }
                    fetch('/api/admin/add-user', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: name, email: email, password: pwd })
                    })
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        if (data.success) {
                            showToast('User added successfully!', 'success');
                            loadAdminData();
                            closeFormModal();
                        } else {
                            showToast(data.message || 'Failed to add user.', 'error');
                        }
                    });
                    return true;
                }
            );
        });
    }

    // ── Search Users ──
    var userSearch = document.querySelector('#users-content .search-box input');
    if (userSearch) {
        userSearch.addEventListener('input', function() {
            var q = this.value.toLowerCase();
            var filtered = allUsers.filter(function(u) {
                return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
            });
            renderUsersTable(filtered);
        });
    }

    // ── Search Admin Patients ──
    var adminPatSearch = document.querySelector('#patients-content .search-box input');
    if (adminPatSearch) {
        adminPatSearch.addEventListener('input', function() {
            var q = this.value.toLowerCase();
            var filtered = allPatients.filter(function(p) {
                return p.patient_id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.gender.toLowerCase().includes(q);
            });
            renderAdminPatientsTable(filtered);
        });
    }

    // ── Search Diagnoses ──
    var diagSearch = document.querySelector('#diagnoses-content .search-box input');
    if (diagSearch) {
        diagSearch.addEventListener('input', function() {
            var q = this.value.toLowerCase();
            var filtered = allDiagnoses.filter(function(d) {
                return d.diag_id.toLowerCase().includes(q) || d.patient_id.toLowerCase().includes(q) || d.disease.toLowerCase().includes(q);
            });
            renderDiagnosesTable(filtered);
        });
    }

    // ── Filter Logs by Level ──
    var logLevelSelect = document.querySelector('#logs-content select');
    if (logLevelSelect) {
        logLevelSelect.addEventListener('change', function() {
            var level = this.value;
            var filtered = level === 'All Levels' ? allLogs : allLogs.filter(function(l) { return l.level === level; });
            renderLogsTable(filtered);
        });
    }

    // ── Export Logs ──
    var exportLogsBtn = document.querySelector('#logs-content .btn-primary');
    if (exportLogsBtn) {
        exportLogsBtn.addEventListener('click', function() {
            var lines = ['Time,Level,User,Action,Details,IP'];
            allLogs.forEach(function(l) {
                lines.push([l.created_at, l.level, l.user_name || '', l.action, '"' + l.details + '"', l.ip].join(','));
            });
            var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = 'system_logs.csv';
            a.click(); URL.revokeObjectURL(url);
            showToast('Logs exported!', 'success');
        });
    }

    // ── Generate Report ──
    var genReportBtn = document.querySelector('#reports-content .btn-primary');
    if (genReportBtn) {
        genReportBtn.addEventListener('click', function() {
            fetch('/api/stats')
            .then(function(r) { return r.json(); })
            .then(function(stats) {
                var content = [
                    'DERMAI AGENT - ADMIN REPORT',
                    '===========================',
                    'Generated: ' + new Date().toLocaleString(),
                    '',
                    'SYSTEM STATISTICS',
                    '-----------------',
                    'Total Users: ' + (stats.total_users || 0),
                    'Total Patients: ' + (stats.total_patients || 0),
                    'Total Diagnoses: ' + (stats.total_diagnoses || 0),
                    'High Risk Cases: ' + (stats.high_risk || 0),
                    'Average AI Confidence: ' + (stats.avg_confidence || 0) + '%',
                    '',
                    'Report generated by DermAI Agent Admin Panel'
                ].join('\n');
                var blob = new Blob([content], { type: 'text/plain' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url; a.download = 'admin_report_' + Date.now() + '.txt';
                a.click(); URL.revokeObjectURL(url);
                showToast('Report generated!', 'success');
            });
        });
    }

    // ── Diagnoses Filter button ──
    var diagFilterBtn = document.querySelector('#diagnoses-content .btn-outline');
    if (diagFilterBtn) {
        diagFilterBtn.addEventListener('click', function() {
            showFormModal('Filter Diagnoses',
                '<div style="margin-bottom:12px"><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:6px">Disease</label>' +
                '<select id="fDis" style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:6px;font-size:.9rem">' +
                '<option value="">All Diseases</option><option>Melanoma</option><option>Nevus</option><option>Basal Cell Carcinoma</option><option>Psoriasis</option><option>Eczema</option>' +
                '</select></div>' +
                '<div style="margin-bottom:12px"><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:6px">Risk Level</label>' +
                '<select id="fRisk" style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:6px;font-size:.9rem">' +
                '<option value="">All Risks</option><option>High Risk</option><option>Medium Risk</option><option>Low Risk</option>' +
                '</select></div>',
                function() {
                    var dis  = document.getElementById('fDis').value;
                    var risk = document.getElementById('fRisk').value;
                    var filtered = allDiagnoses.filter(function(d) {
                        return (!dis || d.disease === dis) && (!risk || d.risk === risk);
                    });
                    renderDiagnosesTable(filtered);
                    closeFormModal();
                    showToast('Filter applied — ' + filtered.length + ' results', 'success');
                }
            );
        });
    }

    // ── Add Patient (admin) ──
    var addAdminPatBtn = document.querySelector('#patients-content .btn-primary');
    if (addAdminPatBtn) {
        addAdminPatBtn.addEventListener('click', function() {
            showFormModal('Add New Patient',
                '<div style="margin-bottom:12px"><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:6px">Full Name *</label>' +
                '<input id="apName" type="text" style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:6px;font-size:.9rem" placeholder="Patient full name"></div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">' +
                '<div><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:6px">Age *</label>' +
                '<input id="apAge" type="number" style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:6px;font-size:.9rem" placeholder="Age"></div>' +
                '<div><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:6px">Gender</label>' +
                '<select id="apGender" style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:6px;font-size:.9rem"><option>Female</option><option>Male</option><option>Other</option></select></div></div>' +
                '<div style="margin-bottom:12px"><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:6px">Phone</label>' +
                '<input id="apPhone" type="text" style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:6px;font-size:.9rem" placeholder="+1 555-000-0000"></div>',
                function() {
                    var name   = document.getElementById('apName').value.trim();
                    var age    = document.getElementById('apAge').value;
                    var gender = document.getElementById('apGender').value;
                    var phone  = document.getElementById('apPhone').value.trim();
                    if (!name || !age) { showToast('Name and Age are required.', 'error'); return; }
                    fetch('/api/patients/add', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: name, age: age, gender: gender, phone: phone }) })
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        if (data.success) {
                            showToast('Patient added! ID: ' + data.patient_id, 'success');
                            loadAdminData(); closeFormModal();
                        } else { showToast(data.message || 'Failed.', 'error'); }
                    });
                }
            );
        });
    }

    // ── Models: in-memory store ──
    var allModels = [
        { id: 'MOD-001', name: 'Skin Cancer Classifier', version: 'v2.1.0', type: 'Classification', accuracy: '92.3%', status: 'Active', trained: 'May 24, 2024' },
        { id: 'MOD-002', name: 'Nevus Detection',        version: 'v1.8.3', type: 'Detection',      accuracy: '88.7%', status: 'Active', trained: 'May 23, 2024' },
        { id: 'MOD-003', name: 'Lesion Segmentation',    version: 'v1.5.0', type: 'Segmentation',   accuracy: '90.1%', status: 'Active', trained: 'May 22, 2024' },
        { id: 'MOD-004', name: 'Melanoma Classifier',    version: 'v3.0.1', type: 'Classification', accuracy: '94.2%', status: 'Training', trained: 'May 24, 2024' },
        { id: 'MOD-005', name: 'BCC Detector',           version: 'v1.2.0', type: 'Detection',      accuracy: '86.5%', status: 'Inactive', trained: 'May 20, 2024' }
    ];

    function renderModelsTable(models) {
        var tbody = document.querySelector('#models-content tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!models.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#64748b;padding:20px">No models found.</td></tr>';
            return;
        }
        models.forEach(function(m) {
            var sc = m.status === 'Active' ? 'tag-active' : m.status === 'Training' ? 'tag-training' : 'tag-inactive';
            tbody.innerHTML += '<tr>' +
                '<td>' + m.id + '</td><td>' + m.name + '</td><td>' + m.version + '</td>' +
                '<td>' + m.type + '</td><td>' + m.accuracy + '</td>' +
                '<td><span class="tag ' + sc + '">' + m.status + '</span></td>' +
                '<td>' + m.trained + '</td>' +
                '<td class="action-btns">' +
                '<button class="action-icon" onclick="editModel(\'' + m.id + '\')">✎</button>' +
                '<button class="action-icon" onclick="deleteModel(\'' + m.id + '\')">🗑</button>' +
                '</td></tr>';
        });
    }
    renderModelsTable(allModels);

    // Models search
    var modelSearch = document.querySelector('#models-content .search-box input');
    if (modelSearch) {
        modelSearch.addEventListener('input', function() {
            var q = this.value.toLowerCase();
            renderModelsTable(allModels.filter(function(m) {
                return (m.id + m.name + m.type + m.status).toLowerCase().includes(q);
            }));
        });
    }

    // Add Model button
    var addModelBtn = document.querySelector('#models-content .btn-primary');
    if (addModelBtn) {
        addModelBtn.addEventListener('click', function() {
            showFormModal('Add New Model',
                '<div style="margin-bottom:12px"><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:6px">Model Name *</label>' +
                '<input id="mName" type="text" style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:6px;font-size:.9rem" placeholder="e.g. Skin Lesion Detector"></div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">' +
                '<div><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:6px">Version</label>' +
                '<input id="mVer" type="text" style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:6px;font-size:.9rem" placeholder="v1.0.0"></div>' +
                '<div><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:6px">Type</label>' +
                '<select id="mType" style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:6px;font-size:.9rem"><option>Classification</option><option>Detection</option><option>Segmentation</option></select></div></div>' +
                '<div style="margin-bottom:12px"><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:6px">Accuracy (%)</label>' +
                '<input id="mAcc" type="text" style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:6px;font-size:.9rem" placeholder="e.g. 91.5%"></div>',
                function() {
                    var name = document.getElementById('mName').value.trim();
                    var ver  = document.getElementById('mVer').value.trim() || 'v1.0.0';
                    var type = document.getElementById('mType').value;
                    var acc  = document.getElementById('mAcc').value.trim() || '—';
                    if (!name) { showToast('Model name is required.', 'error'); return; }
                    var newId = 'MOD-' + String(allModels.length + 1).padStart(3, '0');
                    allModels.unshift({ id: newId, name: name, version: ver, type: type, accuracy: acc, status: 'Active', trained: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) });
                    renderModelsTable(allModels);
                    closeFormModal();
                    showToast('Model "' + name + '" added!', 'success');
                }
            );
        });
    }

    window.editModel = function(id) {
        var m = allModels.find(function(x) { return x.id === id; });
        if (!m) return;
        showFormModal('Edit Model — ' + m.id,
            '<div style="margin-bottom:12px"><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:6px">Model Name</label>' +
            '<input id="emName" type="text" value="' + m.name + '" style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:6px;font-size:.9rem"></div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">' +
            '<div><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:6px">Version</label>' +
            '<input id="emVer" type="text" value="' + m.version + '" style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:6px;font-size:.9rem"></div>' +
            '<div><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:6px">Status</label>' +
            '<select id="emStatus" style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:6px;font-size:.9rem">' +
            '<option' + (m.status==='Active'?'selected':'') + '>Active</option>' +
            '<option' + (m.status==='Training'?'selected':'') + '>Training</option>' +
            '<option' + (m.status==='Inactive'?'selected':'') + '>Inactive</option>' +
            '</select></div></div>',
            function() {
                m.name    = document.getElementById('emName').value.trim() || m.name;
                m.version = document.getElementById('emVer').value.trim()  || m.version;
                m.status  = document.getElementById('emStatus').value;
                renderModelsTable(allModels);
                closeFormModal();
                showToast('Model updated!', 'success');
            }
        );
    };

    window.deleteModel = function(id) {
        if (!confirm('Delete model ' + id + '?')) return;
        allModels = allModels.filter(function(m) { return m.id !== id; });
        renderModelsTable(allModels);
        showToast('Model deleted.', 'success');
    };

    // ── Settings: tab switching with separate panels ──
    document.querySelectorAll('#settings-content .settings-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
            document.querySelectorAll('#settings-content .settings-tab').forEach(function(t) { t.classList.remove('active'); });
            tab.classList.add('active');
            var panelId = tab.getAttribute('data-panel');
            document.querySelectorAll('#settings-content [id^="set-"]').forEach(function(p) { p.style.display = 'none'; });
            var panel = document.getElementById(panelId);
            if (panel) panel.style.display = 'block';
        });
    });

    // Settings save buttons — each saves its own panel's data
    document.querySelectorAll('.admin-settings-save').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var panel = btn.closest('[id^="set-"]');
            var tabName = panel ? panel.querySelector('h3').textContent : 'Settings';
            var data = {};
            if (panel) {
                panel.querySelectorAll('input,select,textarea').forEach(function(el) {
                    if (el.id) data[el.id] = el.type === 'checkbox' ? el.checked : el.value;
                });
            }
            fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
            .then(function(r) { return r.json(); })
            .then(function(res) { showToast(res.success ? tabName + ' saved!' : 'Save failed.', res.success ? 'success' : 'error'); });
        });
    });

    // ── Backup buttons (using IDs, no dynamic injection) ──
    var createBackupBtn = document.getElementById('createBackupBtn');
    if (createBackupBtn) {
        createBackupBtn.addEventListener('click', function() {
            var tbody = document.querySelector('#backups-table tbody');
            if (!tbody) return;
            var now  = new Date();
            var name = 'backup_' + now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + '_' + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0') + String(now.getSeconds()).padStart(2,'0');
            var row  = document.createElement('tr');
            row.innerHTML = '<td>' + name + '</td><td>Full Backup</td><td>—</td><td>' + now.toLocaleString() + '</td>' +
                '<td><span class="tag tag-training">In Progress</span></td>' +
                '<td class="action-btns"><button class="action-icon bk-dl">⬇</button><button class="action-icon bk-del">🗑</button></td>';
            tbody.insertAdjacentElement('afterbegin', row);
            showToast('Backup started...', 'success');
            setTimeout(function() {
                var tag = row.querySelector('.tag-training');
                if (tag) { tag.className = 'tag tag-active'; tag.textContent = 'Completed'; }
                showToast('Backup completed!', 'success');
            }, 2000);
        });
    }

    var restoreBackupBtn = document.getElementById('restoreBackupBtn');
    if (restoreBackupBtn) {
        restoreBackupBtn.addEventListener('click', function() {
            showToast('Restore initiated (simulated).', 'success');
        });
    }

    // Wire existing static backup rows + delegate for dynamic rows
    document.querySelector('#backups-table') && document.querySelector('#backups-table').addEventListener('click', function(e) {
        var btn = e.target.closest('.action-icon');
        if (!btn) return;
        var row = btn.closest('tr');
        if (btn.classList.contains('bk-del') || btn.textContent.trim() === '🗑') {
            if (!confirm('Delete this backup?')) return;
            if (row) row.remove();
            showToast('Backup deleted.', 'success');
        } else {
            var name = row ? row.cells[0].textContent : 'backup';
            var blob = new Blob(['Backup: ' + name + '\nCreated: ' + new Date().toLocaleString()], { type: 'text/plain' });
            var url  = URL.createObjectURL(blob);
            var a    = document.createElement('a'); a.href = url; a.download = name + '.bak';
            a.click(); URL.revokeObjectURL(url);
            showToast('Backup downloaded!', 'success');
        }
    });

    // ── Logout buttons ──
    var confirmAdminLogoutBtn = document.getElementById('confirmAdminLogoutBtn');
    if (confirmAdminLogoutBtn) {
        confirmAdminLogoutBtn.addEventListener('click', function() { window.location.href = '/logout'; });
    }
    var cancelAdminLogoutBtn = document.getElementById('cancelAdminLogoutBtn');
    if (cancelAdminLogoutBtn) {
        cancelAdminLogoutBtn.addEventListener('click', function() {
            var link = document.querySelector('.sidebar-menu a[data-target="overview-content"]');
            if (link) link.click();
        });
    }

    // ── Update charts with real data ──
    function updateAdminCharts(diagnoses) {
        // Build last-6-months buckets
        var now = new Date();
        var monthKeys = [], monthLabels = [];
        for (var i = 5; i >= 0; i--) {
            var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            var key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
            var lbl = d.toLocaleString('default', { month: 'short' });
            monthKeys.push(key); monthLabels.push(lbl);
        }
        var monthCounts = {};
        monthKeys.forEach(function(k) { monthCounts[k] = 0; });
        diagnoses.forEach(function(d) {
            var dt = new Date(d.date);
            if (!isNaN(dt.getTime())) {
                var key = dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0');
                if (key in monthCounts) monthCounts[key]++;
            }
        });
        var tData = monthKeys.map(function(k) { return monthCounts[k]; });

        // Overview trend chart
        var trendCtx = document.getElementById('trendChart');
        if (trendCtx) {
            if (window._adminTrendChart) {
                window._adminTrendChart.data.labels = monthLabels;
                window._adminTrendChart.data.datasets[0].data = tData;
                window._adminTrendChart.update();
            } else {
                window._adminTrendChart = new Chart(trendCtx.getContext('2d'), {
                    type: 'line',
                    data: { labels: monthLabels, datasets: [{ label: 'Diagnoses', data: tData, borderColor: '#0d9488', backgroundColor: 'rgba(13,148,136,0.1)', tension: 0.4, fill: true, pointBackgroundColor: '#0d9488' }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
                });
            }
        }

        // Reports trend chart — same real data
        var repTrendCtx = document.getElementById('reportsTrendChart');
        if (repTrendCtx) {
            if (window._adminRepTrendChart) {
                window._adminRepTrendChart.data.labels = monthLabels;
                window._adminRepTrendChart.data.datasets[0].data = tData;
                window._adminRepTrendChart.update();
            } else {
                window._adminRepTrendChart = new Chart(repTrendCtx.getContext('2d'), {
                    type: 'line',
                    data: { labels: monthLabels, datasets: [{ label: 'Diagnoses', data: tData, borderColor: '#0d9488', backgroundColor: 'rgba(13,148,136,0.1)', tension: 0.4, fill: false, pointBackgroundColor: '#0d9488' }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
                });
            }
        }

        if (!diagnoses.length) return;
        // Disease distribution pie charts
        var diseaseCount = {};
        diagnoses.forEach(function(d) { diseaseCount[d.disease] = (diseaseCount[d.disease] || 0) + 1; });
        var labels = Object.keys(diseaseCount);
        var data   = labels.map(function(l) { return diseaseCount[l]; });
        var colors = ['#ef4444','#3b82f6','#f59e0b','#8b5cf6','#9ca3af','#10b981','#ec4899'];
        if (window._adminPieChart) {
            window._adminPieChart.data.labels = labels;
            window._adminPieChart.data.datasets[0].data = data;
            window._adminPieChart.data.datasets[0].backgroundColor = colors.slice(0, labels.length);
            window._adminPieChart.update();
        }
        if (window._adminRepPieChart) {
            window._adminRepPieChart.data.labels = labels;
            window._adminRepPieChart.data.datasets[0].data = data;
            window._adminRepPieChart.data.datasets[0].backgroundColor = colors.slice(0, labels.length);
            window._adminRepPieChart.update();
        }
    }

    // ── Charts (initial placeholders, updated with real data) ──
    var pieCtx = document.getElementById('pieChart');
    if (pieCtx) {
        window._adminPieChart = new Chart(pieCtx.getContext('2d'), {
            type: 'doughnut',
            data: { labels: ['Loading...'], datasets: [{ data: [1], backgroundColor: ['#e2e8f0'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { position: 'right' } } }
        });
    }
    var repPieCtx = document.getElementById('reportsPieChart');
    if (repPieCtx) {
        window._adminRepPieChart = new Chart(repPieCtx.getContext('2d'), {
            type: 'doughnut',
            data: { labels: ['Loading...'], datasets: [{ data: [1], backgroundColor: ['#e2e8f0'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'right' } } }
        });
    }

    // ── Info Modal ──
    function showInfoModal(title, bodyHtml) {
        var existing = document.getElementById('admin-info-modal');
        if (existing) existing.remove();
        var modal = document.createElement('div');
        modal.id = 'admin-info-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9998;display:flex;align-items:center;justify-content:center;';
        modal.innerHTML = '<div style="background:white;border-radius:14px;padding:28px;max-width:560px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.2)">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
            '<h3 style="font-size:1.1rem;color:#0f172a">' + title + '</h3>' +
            '<button onclick="document.getElementById(\'admin-info-modal\').remove()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:#64748b">&times;</button>' +
            '</div>' + bodyHtml + '</div>';
        modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
    }

    // ── Toast ──
    function showToast(msg, type) {
        var existing = document.getElementById('admin-toast');
        if (existing) existing.remove();
        var toast = document.createElement('div');
        toast.id = 'admin-toast';
        toast.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:14px 20px;border-radius:10px;font-size:0.9rem;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.15);' +
            (type === 'success' ? 'background:#10b981;color:white;' : 'background:#ef4444;color:white;');
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(function() { toast.style.opacity = '0'; setTimeout(function() { toast.remove(); }, 300); }, 3000);
    }
    window.showToast = showToast;

    // ── Form Modal ──
    function showFormModal(title, bodyHtml, onConfirm) {
        var existing = document.getElementById('form-modal');
        if (existing) existing.remove();
        var modal = document.createElement('div');
        modal.id = 'form-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9998;display:flex;align-items:center;justify-content:center;';
        modal.innerHTML = '<div style="background:white;border-radius:14px;padding:28px;max-width:460px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.2)">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
            '<h3 style="font-size:1.1rem;color:#0f172a">' + title + '</h3>' +
            '<button onclick="closeFormModal()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:#64748b">&times;</button>' +
            '</div>' + bodyHtml +
            '<div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end">' +
            '<button onclick="closeFormModal()" style="padding:10px 20px;border:1px solid #e2e8f0;background:white;border-radius:8px;cursor:pointer;font-weight:600">Cancel</button>' +
            '<button id="form-modal-confirm" style="padding:10px 20px;background:#115e59;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600">Confirm</button>' +
            '</div></div>';
        modal.addEventListener('click', function(e) { if (e.target === modal) closeFormModal(); });
        document.body.appendChild(modal);
        document.getElementById('form-modal-confirm').addEventListener('click', function() { onConfirm(); });
    }

    function closeFormModal() {
        var m = document.getElementById('form-modal');
        if (m) m.remove();
    }
    window.closeFormModal = closeFormModal;
});
