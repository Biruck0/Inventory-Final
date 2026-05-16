const fs = require('fs');
let appFile = 'c:/Users/Biruck/OneDrive/Desktop/Pr/Inventory/public/app.js';
let content = fs.readFileSync(appFile, 'utf-8');

// 1. Insert API headers helper and generic fetch helper
const apiHelpers = `
// ================================================================
// API INTEGRATION
// ================================================================
let _items = [];
let _users = [];
let _auditLogs = [];

function apiHeaders() {
    const s = getSession();
    return {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (s ? s.token : '')
    };
}

async function fetchAllData() {
    try {
        const [resItems] = await Promise.all([
            fetch('/api/items', { headers: apiHeaders() })
        ]);
        if(resItems.ok) _items = await resItems.json();
        
        if (getSession() && getSession().role === 'admin') {
            const [resUsers, resLogs] = await Promise.all([
                fetch('/api/users', { headers: apiHeaders() }),
                fetch('/api/audit', { headers: apiHeaders() })
            ]);
            if(resUsers.ok) _users = await resUsers.json();
            if(resLogs.ok) _auditLogs = await resLogs.json();
        }
    } catch(e) { console.error('Fetch error', e); }
}
`;

content = content.replace(/const STORAGE_KEYS = \{[\s\S]*?\};/, match => match + "\n" + apiHelpers);

// 2. Override getItems and getUsers to read local array
content = content.replace(/function getItems\(\)[\s\S]*?\{.*getData.*\}/,   "function getItems() { return _items || []; }");
content = content.replace(/function getUsers\(\)[\s\S]*?\{.*getData.*\}/,   "function getUsers() { return _users || []; }");

// 3. Override saveSession
content = content.replace(/function saveSession\(user\) \{[\s\S]*?lastActive: Date.now\(\),[\s\S]*?\}\);[\s\S]*?\}/, 
`function saveSession(user, token) {
  setData(STORAGE_KEYS.session, {
    id: user.id, name: user.name, username: user.username, 
    role: user.role, initials: user.initials, token: token || user.token, lastActive: Date.now()
  });
}`);

content = content.replace(/function updateLastActive\(\) \{([\s\S]*?)s\.lastActive = Date\.now\(\);([\s\S]*?)setData\(STORAGE_KEYS\.session, s\);([\s\S]*?)\}/,
`function updateLastActive() {
  const s = getSession();
  if (!s) return;
  s.lastActive = Date.now();
  setData(STORAGE_KEYS.session, s);
}`);

// 4. Async Audit Log
content = content.replace(/function auditLog\(event, detail = ''\) \{([\s\S]*?)setData\(STORAGE_KEYS\.auditLog, logs\);([\s\S]*?)\}/, 
`function auditLog(event, detail = '') {
  fetch('/api/audit', { method: 'POST', headers: apiHeaders(), body: JSON.stringify({ event, detail }) }).catch(()=>{}).then(()=> { if(getSession()?.role==='admin') fetchAllData(); });
}`);

// 5. Replace initStorage
content = content.replace(/async function initStorage\(\) \{[\s\S]*?\}\n/m, `async function initStorage() { }\n`);

// 6. Async ITEM CRUD
const addItemRegex = /function addItem\(data\) \{\n[\s\S]*?auditLog\([^\)]*\);\n\}/;
content = content.replace(addItemRegex, `async function addItem(data) {
  await fetch('/api/items', { method: 'POST', headers: apiHeaders(), body: JSON.stringify(data) });
  auditLog('ITEM_ADD', \`Added: \${data.name} (\${data.sku})\`);
  await fetchAllData();
}`);

const updateItemRegex = /function updateItem\(id, data\) \{\n[\s\S]*?auditLog\([^\)]*\);\n  \}\n\}/;
content = content.replace(updateItemRegex, `async function updateItem(id, data) {
  await fetch('/api/items/' + id, { method: 'PUT', headers: apiHeaders(), body: JSON.stringify(data) });
  auditLog('ITEM_EDIT', \`Edited: \${data.name} (\${data.sku})\`);
  await fetchAllData();
}`);

const deleteItemRegex = /function deleteItem\(id\) \{\n[\s\S]*?auditLog\([^\)]*\);\n\}/;
content = content.replace(deleteItemRegex, `async function deleteItem(id) {
  await fetch('/api/items/' + id, { method: 'DELETE', headers: apiHeaders() });
  auditLog('ITEM_DELETE', \`Deleted item ID \${id}\`);
  await fetchAllData();
}`);

// 7. Async USERS CRUD
content = content.replace(/async function deleteUser\(id\) \{[\s\S]*?renderUsersPage\(\);\n\}/, 
`async function deleteUser(id) {
  const session = getSession();
  if (session?.role !== 'admin') return;
  if (id === session.id) { showToast("You can't delete your own account.", 'error'); return; }
  await fetch('/api/users/' + id, { method: 'DELETE', headers: apiHeaders() });
  auditLog('USER_DELETE', \`Deleted user ID: \${id}\`);
  await fetchAllData();
  renderUsersPage();
}`);

// 8. SECURITY LOG render
content = content.replace(/const logs = getData\(STORAGE_KEYS\.auditLog, \[\]\);/, `const logs = _auditLogs || [];`);

// 9. Fix CRUD callers to be async (saveItem, saveAdjustment, executeDelete)
content = content.replace(/function saveItem\(\) \{/g, `async function saveItem() {`);
content = content.replace(/if \(editingId\) \{ updateItem/g, `if (editingId) { await updateItem`);
content = content.replace(/else           \{ addItem/g, `else           { await addItem`);

content = content.replace(/function saveAdjustment\(\) \{/g, `async function saveAdjustment() {`);
content = content.replace(/items\[idx\]\.qty = newQty;\n  saveItems\(items\);/g, `await fetch('/api/items/' + item.id, { method: 'PUT', headers: apiHeaders(), body: JSON.stringify({...item, qty: newQty}) });\n  await fetchAllData();`);

content = content.replace(/function executeDelete\(\) \{/g, `async function executeDelete() {`);
content = content.replace(/deleteItem\(pendingDeleteId\);/g, `await deleteItem(pendingDeleteId);`);

// 10. Dashboard Init to fetch items
content = content.replace(/function initDashboard\(\) \{/g, `async function initDashboard() {`);
content = content.replace(/navigateTo\('overview'\);/g, `await fetchAllData();\n  navigateTo('overview');`);

// 11. Login Logic
const loginRegex = /form\.addEventListener\('submit', async e => \{[\s\S]*?btn\.textContent = 'Sign In';\n      refreshLockoutUI\(\);\n    \}\n  \}\);/
const newLogin = `form.addEventListener('submit', async e => {
    e.preventDefault();
    errBox.classList.remove('show');
    const lockMsg = checkLockout();
    if (lockMsg) { errBox.textContent = lockMsg; errBox.classList.add('show'); return; }

    const username = sanitizeText(document.getElementById('username').value).toLowerCase();
    const password = document.getElementById('password').value;
    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
      const res = await fetch('/api/auth/login', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        resetLockout();
        saveSession(data.user, data.token);
        window.location.href = 'dashboard.html';
      } else {
        throw new Error(data.error);
      }
    } catch(err) {
      recordFailedAttempt(username);
      errBox.textContent = 'Invalid credentials. Please try again.';
      errBox.classList.add('show');
      document.getElementById('password').value = '';
      btn.disabled = false;
      btn.textContent = 'Sign In';
      refreshLockoutUI();
    }
  });`;
content = content.replace(loginRegex, newLogin);

// 12. Register Logic
const regRegex = /form\.addEventListener\('submit', async e => \{[\s\S]*?window\.location\.href = 'dashboard\.html';\n  \}\);/
const newReg = `form.addEventListener('submit', async e => {
    e.preventDefault();
    errBox.classList.remove('show');

    const name     = sanitizeText(document.getElementById('reg-name').value);
    const username = sanitizeText(document.getElementById('reg-username').value).toLowerCase();
    const password = document.getElementById('reg-password').value;
    const confirm  = document.getElementById('reg-confirm').value;
    const role     = document.getElementById('reg-role').value;

    const uErr = validateUsername(username);
    if (uErr) { errBox.textContent = uErr; errBox.classList.add('show'); return; }
    if (!name || name.length < 2) { errBox.textContent = 'Please enter your full name.'; errBox.classList.add('show'); return; }
    const pwErrors = validatePassword(password);
    if (pwErrors.length > 0) { errBox.textContent = 'Password must have: ' + pwErrors.join(', ') + '.'; errBox.classList.add('show'); return; }
    if (password !== confirm) { errBox.textContent = 'Passwords do not match.'; errBox.classList.add('show'); return; }

    const btn = document.getElementById('registerBtn');
    btn.disabled = true;
    btn.textContent = 'Creating account…';

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, password, role })
      });
      const data = await res.json();
      if(res.ok) {
        saveSession(data.user, data.token);
        window.location.href = 'dashboard.html';
      } else {
        throw new Error(data.error);
      }
    } catch(err) {
      errBox.textContent = err.message || 'Error creating account.';
      errBox.classList.add('show');
      btn.disabled = false;
      btn.textContent = 'Register';
    }
  });`;
content = content.replace(regRegex, newReg);

fs.writeFileSync(appFile, content, 'utf-8');
console.log('App.js patched for API');
