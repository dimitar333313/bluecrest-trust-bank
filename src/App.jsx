import { useEffect, useState } from 'react'
import './balance-editor.css'
import './customer-portal.css'
import './admin-login.css'
import './transfer.css'
import './admin-features.css'
import './admin-settings.css'
import './admin-overview.css'
import './public-site-enhanced.css'
import './customer-dashboard-reference.css'
import './customer-copy.css'

const API_BASE = window.location.port === '5173' ? 'http://localhost:4000/api' : '/api'

const starterTransactions = [
  { id: 'starter-1', name: 'Harbor & Pine Market', date: 'Today, 10:42 AM', amount: '-$84.20', type: 'Groceries', tone: 'orange' },
  { id: 'starter-2', name: 'Maya Thompson', date: 'Yesterday, 4:18 PM', amount: '+$1,250.00', type: 'Transfer received', tone: 'green' },
  { id: 'starter-3', name: 'Northline Electric', date: 'Aug 18, 2026', amount: '-$126.40', type: 'Utilities', tone: 'blue' },
  { id: 'starter-4', name: 'Luma Studio', date: 'Aug 17, 2026', amount: '+$680.00', type: 'Invoice payment', tone: 'purple' },
]

const starterAccounts = [
  { id: 1, name: 'Everyday Checking', number: '**** 4288', type: 'Checking', balance: 24680.42, status: 'Active', username: 'jordan', password: 'welcome' },
  { id: 2, name: 'Rainy Day Savings', number: '**** 9017', type: 'Savings', balance: 12850.00, status: 'Active', username: 'savings', password: 'welcome' },
]

const messages = [
  { sender: 'Bluecrest Support', subject: 'Your August statement is ready', preview: 'Your monthly statement is now available to view...', time: '9:24 AM', unread: true },
  { sender: 'Maya Thompson', subject: 'Re: Shared expenses', preview: 'Thanks, I received the transfer. I will send...', time: 'Yesterday', unread: true },
  { sender: 'Bluecrest Trust Bank', subject: 'Welcome to your new account', preview: 'Here are a few ways to make your banking...', time: 'Aug 16', unread: false },
]

function loadAccounts() {
  const saved = JSON.parse(localStorage.getItem('bluecrest-accounts') || JSON.stringify(starterAccounts))
  return saved.map((account) => ({ ...account, username: account.username || (account.id === 1 ? 'jordan' : account.id === 2 ? 'savings' : `customer${account.id}`), password: account.password || 'welcome' }))
}

function getLocalCustomerRecords() {
  try {
    return JSON.parse(localStorage.getItem('bluecrest-customer-records') || '[]')
  } catch {
    return []
  }
}

function saveLocalCustomerRecord(record) {
  const records = getLocalCustomerRecords().filter((item) => item.id !== record.id)
  records.push({
    id: record.id,
    name: record.name,
    email: record.email,
    username: record.username,
    password: record.password,
    status: record.status || 'Active',
  })
  localStorage.setItem('bluecrest-customer-records', JSON.stringify(records))
  return records
}

function findLocalCustomerRecord(usernameOrEmail, password) {
  const lookup = String(usernameOrEmail || '').trim().toLowerCase()
  const targetPassword = String(password || '')
  return getLocalCustomerRecords().find((record) => {
    const username = String(record.username || '').trim().toLowerCase()
    const email = String(record.email || '').trim().toLowerCase()
    return (username === lookup || email === lookup) && record.password === targetPassword
  }) || null
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Request failed')
  return body
}

function App() {
  const pathname = window.location.pathname.replace(/\/$/, '') || '/'
  const customerId = window.location.pathname.match(/^\/customer\/([^/]+)/)?.[1]
  const isPublic = pathname === '/' || pathname === '/login' || pathname === '/register'
  const isAdmin = pathname === '/admin' || !customerId
  const [adminAuthenticated, setAdminAuthenticated] = useState(() => sessionStorage.getItem('bluecrest-admin-session') === 'active')
  const [adminPassword, setAdminPassword] = useState(() => localStorage.getItem('bluecrest-admin-password') || 'bluecrest')
  const [active, setActive] = useState('Overview')
  const [accounts, setAccounts] = useState(loadAccounts)
  const [transactions, setTransactions] = useState(() => JSON.parse(localStorage.getItem('bluecrest-transactions') || JSON.stringify(starterTransactions)))
  const [otpCodes, setOtpCodes] = useState(() => JSON.parse(sessionStorage.getItem('bluecrest-otp-codes') || '{}'))
  const [auditLogs, setAuditLogs] = useState(() => JSON.parse(localStorage.getItem('bluecrest-audit-logs') || '[]'))
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [accountForm, setAccountForm] = useState({ name: '', email: '', type: 'Checking', balance: '', username: '', password: '' })
  const [showBalanceEditor, setShowBalanceEditor] = useState(false)
  const [balanceDraft, setBalanceDraft] = useState(String(starterAccounts[0].balance))
  const [createdCustomerLink, setCreatedCustomerLink] = useState('')
  const [accountFormError, setAccountFormError] = useState('')
  const [transactionForm, setTransactionForm] = useState({ name: '', amount: '', date: new Date().toISOString().slice(0, 10), direction: 'debit', type: 'Transfer' })

  useEffect(() => localStorage.setItem('bluecrest-accounts', JSON.stringify(accounts)), [accounts])
  useEffect(() => localStorage.setItem('bluecrest-transactions', JSON.stringify(transactions)), [transactions])
  useEffect(() => sessionStorage.setItem('bluecrest-otp-codes', JSON.stringify(otpCodes)), [otpCodes])
  useEffect(() => localStorage.setItem('bluecrest-audit-logs', JSON.stringify(auditLogs)), [auditLogs])

  if (isPublic) return <PublicSite accounts={accounts} setAccounts={setAccounts} initialMode={pathname.slice(1) || 'home'} />

  if (!isAdmin) {
    return <CustomerPortal account={accounts.find((account) => String(account.id) === customerId)} customerId={customerId} transactions={transactions} onTransfer={processTransfer} issueOtp={issueOtp} verifyOtp={verifyOtp} />
  }

  if (!adminAuthenticated) {
    return <AdminLogin adminPassword={adminPassword} onLogin={() => { sessionStorage.setItem('bluecrest-admin-session', 'active'); setAdminAuthenticated(true) }} />
  }

  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0)

  const updatePrimaryBalance = (event) => {
    event.preventDefault()
    const value = Number(balanceDraft)
    if (!Number.isFinite(value) || value < 0) return
    setAccounts(accounts.map((account, index) => index === 0 ? { ...account, balance: value } : account))
    setShowBalanceEditor(false)
  }

  function processTransfer(accountId, transfer) {
    const account = accounts.find((item) => item.id === accountId)
    const amount = Number(transfer.amount)
    if (!account || !Number.isFinite(amount) || amount <= 0 || account.balance < amount) return { ok: false }
    const timestamp = new Date()
    const record = { id: `transfer-${timestamp.getTime()}`, accountId, name: transfer.recipient, date: timestamp.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }), amount: `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, type: 'Transfer sent', tone: 'blue' }
    setAccounts(accounts.map((item) => item.id === accountId ? { ...item, balance: item.balance - amount } : item))
    setTransactions([record, ...transactions])
    return { ok: true, record }
  }

  function issueOtp(accountId) {
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const expiresAt = Date.now() + 5 * 60 * 1000
    setOtpCodes({ ...otpCodes, [accountId]: { code, expiresAt } })
    setAuditLogs([{ id: Date.now(), action: 'OTP generated', accountId, timestamp: new Date().toISOString() }, ...auditLogs])
    return code
  }

  function verifyOtp(accountId, code) {
    const record = otpCodes[accountId]
    const valid = Boolean(record && Date.now() < record.expiresAt && record.code === code)
    setAuditLogs([{ id: Date.now(), action: valid ? 'OTP verified' : 'OTP failed', accountId, timestamp: new Date().toISOString() }, ...auditLogs])
    if (valid) {
      const nextCodes = { ...otpCodes }
      delete nextCodes[accountId]
      setOtpCodes(nextCodes)
    }
    return valid
  }

  function updateAccount(accountId, changes) {
    setAccounts(accounts.map((account) => account.id === accountId ? { ...account, ...changes } : account))
    setAuditLogs([{ id: Date.now(), action: 'Account updated', accountId, timestamp: new Date().toISOString() }, ...auditLogs])
  }

  function deleteAccount(accountId) {
    setAccounts(accounts.filter((account) => account.id !== accountId))
    setAuditLogs([{ id: Date.now(), action: 'Account deleted', accountId, timestamp: new Date().toISOString() }, ...auditLogs])
  }

  const createAccount = async (event) => {
    event.preventDefault()
    if (!accountForm.name.trim()) return
    setAccountFormError('')
    const username = accountForm.username.trim() || `customer${Date.now()}`
    const password = accountForm.password || 'welcome'
    let registeredUser
    try {
      registeredUser = await apiRequest('/customers/register', { method: 'POST', body: JSON.stringify({ name: accountForm.name.trim(), email: accountForm.email, username, password }) })
    } catch (error) {
      setAccountFormError(error.message)
      return
    }
    const newAccount = { id: registeredUser.id, name: registeredUser.name, email: registeredUser.email, number: `**** ${Math.floor(1000 + Math.random() * 9000)}`, type: accountForm.type, balance: Number(accountForm.balance) || 0, status: 'Active', username, email: registeredUser.email }
    saveLocalCustomerRecord({
      id: newAccount.id,
      name: newAccount.name,
      email: newAccount.email,
      username: newAccount.username,
      password: newAccount.password,
      status: newAccount.status,
    })
    setAccounts([...accounts, newAccount])
    const welcome = { id: `welcome-${newAccount.id}`, sender: 'Bluecrest Trust Bank', recipient: accountForm.email || 'customer@example.com', subject: 'Welcome to Bluecrest Trust Bank', preview: 'Your account has been created successfully.' }
    const existingMail = JSON.parse(localStorage.getItem('bluecrest-welcome-emails') || '[]')
    localStorage.setItem('bluecrest-welcome-emails', JSON.stringify([welcome, ...existingMail]))
    setCreatedCustomerLink(`${window.location.origin}/customer/${newAccount.id}`)
    setAccountForm({ name: '', email: '', type: 'Checking', balance: '', username: '', password: '' })
    setShowAccountForm(false)
  }

  const addTransaction = (event) => {
    event.preventDefault()
    const value = Number(transactionForm.amount)
    if (!transactionForm.name.trim() || !value) return
    const formattedDate = new Date(`${transactionForm.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const isCredit = transactionForm.direction === 'credit'
    setTransactions([{ id: `admin-${Date.now()}`, accountId: 1, name: transactionForm.name.trim(), date: formattedDate, amount: `${isCredit ? '+' : '-'}$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, type: transactionForm.type, tone: isCredit ? 'green' : 'orange' }, ...transactions])
    setAccounts(accounts.map((account, index) => index === 0 ? { ...account, balance: account.balance + (isCredit ? value : -value) } : account))
    setTransactionForm({ ...transactionForm, name: '', amount: '' })
  }

  return (
    <div className={active === 'Overview' ? 'app-shell admin-app' : 'app-shell'}>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">B</span><span>bluecrest <b>trust</b></span></div>
        <div className="profile-mini"><div className="avatar">AD</div><div><strong>Administrator</strong><small>Operations workspace</small></div><span className="chevron">⌄</span></div>
        <nav>
          {['Overview', 'Accounts', 'Payments', 'Cards', 'Webmail'].map((item, index) => <button key={item} className={active === item ? 'nav-item active' : 'nav-item'} onClick={() => setActive(item)}><span className="nav-icon">{index === 0 ? '📊' : index === 1 ? '👥' : index === 2 ? '💳' : index === 3 ? '🎫' : '✉️'}</span>{item}</button>)}
        </nav>
        <div className="sidebar-bottom"><button className={active === 'Settings' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Settings')}><span className="nav-icon">⚙</span>Settings</button></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div><p className="eyebrow">SATURDAY, AUGUST 22, 2026</p><h1>{active === 'Webmail' ? 'Administrative webmail' : active === 'Accounts' ? 'Customer accounts' : active === 'Payments' ? 'Transactions' : active === 'Settings' ? 'Admin settings' : 'Overview'}</h1></div></header>

        {active === 'Webmail' ? <Webmail /> : <>
          {active === 'Accounts' ? <AccountsView accounts={accounts} showAccountForm={showAccountForm} setShowAccountForm={setShowAccountForm} accountForm={accountForm} setAccountForm={setAccountForm} createAccount={createAccount} createdCustomerLink={createdCustomerLink} accountFormError={accountFormError} setAccountFormError={setAccountFormError} otpCodes={otpCodes} issueOtp={issueOtp} verifyOtp={verifyOtp} updateAccount={updateAccount} deleteAccount={deleteAccount} /> : active === 'Payments' ? <PaymentsView transactionForm={transactionForm} setTransactionForm={setTransactionForm} addTransaction={addTransaction} transactions={transactions} setTransactions={setTransactions} /> : active === 'Settings' ? <AdminSettings adminPassword={adminPassword} setAdminPassword={setAdminPassword} setAuditLogs={setAuditLogs} auditLogs={auditLogs} /> : <>
            <section className="admin-overview"><div className="admin-overview-heading"><p className="eyebrow">PRIVATE WORKSPACE</p><h2>Admin dashboard</h2><p>Monitor access, transactions, support, and security from your control center.</p></div><div className="overview-grid"><div className="stat-card"><p>Total Assets</p><h3>${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</h3><small>All customer accounts</small></div><div className="stat-card"><p>Active Customers</p><h3>{accounts.length}</h3><small>Verified identities</small></div><div className="stat-card"><p>Transactions</p><h3>{transactions.length}</h3><small>This quarter</small></div><div className="stat-card"><p>Audit Logs</p><h3>{auditLogs.length}</h3><small>System events</small></div></div></section>
          </>}
          </>}
      </main>

    </div>
  )
}

function PublicSite({ accounts, setAccounts, initialMode }) {
  const [mode, setMode] = useState(initialMode)
  const [form, setForm] = useState({ name: '', email: '', username: '', password: '' })
  const [notice, setNotice] = useState('')
  const navigate = (nextMode) => { setNotice(''); setMode(nextMode); window.history.pushState({}, '', nextMode === 'home' ? '/' : `/${nextMode}`) }
  const submitRegistration = async (event) => {
    event.preventDefault()
    try {
      const user = await apiRequest('/customers/register', { method: 'POST', body: JSON.stringify(form) })
      saveLocalCustomerRecord({ id: user.id, name: user.name, email: user.email, username: user.username, password: form.password, status: 'Active' })
      const account = { id: user.id, name: user.name, number: `BC-${user.id.slice(-8)}`, type: 'Checking', balance: 0, status: 'Active', username: user.username, email: user.email }
      setAccounts([...accounts, account])
      setNotice(`Account created. Your customer banking link is ${window.location.origin}/customer/${user.id}`)
      setForm({ name: '', email: '', username: '', password: '' })
    } catch (error) {
      setNotice(error.message)
    }
  }
  const submitLogin = async (event) => {
    event.preventDefault()
    try {
      const result = await apiRequest('/customers/login', { method: 'POST', body: JSON.stringify({ username: form.username.trim().toLowerCase(), password: form.password }) })
      setNotice(result.delivered ? `A verification code was sent to ${result.delivery}.` : 'The verification email could not be sent.')
      window.location.href = `/customer/${result.userId}`
    } catch (error) {
      setNotice(error.message)
    }
  }
  if (mode === 'login' || mode === 'register') return <main className="public-auth"><div className="public-auth-card"><div className="brand"><span className="brand-mark">B</span><span>bluecrest <b>trust</b></span></div><p className="eyebrow">{mode === 'login' ? 'CUSTOMER LOGIN' : 'CREATE ACCOUNT'}</p><h1>{mode === 'login' ? 'Welcome back' : 'Join Bluecrest'}</h1><form onSubmit={mode === 'login' ? submitLogin : submitRegistration}>{mode === 'register' && <input type="text" placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />}<input type="email" placeholder="Email address" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /><input type="text" placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /><input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /><button type="submit" className="primary-button">{mode === 'login' ? 'Sign in' : 'Create account'}</button></form>{notice && <p className="notice">{notice}</p>}<p>{mode === 'login' ? "Don't have an account? " : 'Already have an account? '}<button onClick={() => navigate(mode === 'login' ? 'register' : 'login')} style={{ background: 'none', border: 'none', color: '#1558bb', cursor: 'pointer', fontWeight: '600', textDecoration: 'underline' }}>{mode === 'login' ? 'Sign up' : 'Sign in'}</button></p></div></main>
  return <div className="public-site"><header className="public-header"><div className="brand"><span className="brand-mark">B</span><span>bluecrest <b>trust</b></span></div><nav><button onClick={() => navigate('login')}>Login</button><button onClick={() => navigate('register')}>Open Account</button></nav></header><section className="public-hero"><div className="public-hero-content"><h1>Banking Reimagined for Your Success</h1><p>Experience secure, fast, and easy banking with Bluecrest Trust Bank. Manage your finances, make transfers, and grow your wealth with industry-leading security.</p><div className="public-hero-buttons"><button className="primary-button" onClick={() => navigate('register')}>Open Account Now</button><button className="secondary-button" onClick={() => navigate('login')}>Sign In</button></div></div><div className="public-hero-graphic"><div className="graphic-container"><svg viewBox="0 0 400 400" style={{ width: '100%', height: '100%' }}><defs><linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style={{ stopColor: '#1558bb', stopOpacity: 1 }} /><stop offset="100%" style={{ stopColor: '#0a8f5f', stopOpacity: 1 }} /></linearGradient></defs><rect x="80" y="100" width="240" height="140" rx="12" fill="url(#cardGrad)" opacity="0.9" /><circle cx="120" cy="140" r="8" fill="white" /><circle cx="120" cy="155" r="8" fill="white" /><circle cx="120" cy="170" r="8" fill="white" /><text x="150" y="155" fontSize="20" fontWeight="bold" fill="white">BLUECREST</text><text x="150" y="180" fontSize="12" fill="white" opacity="0.8">****  ****  ****  4288</text><path d="M 80 280 Q 120 250, 200 270 T 320 280" stroke="#1558bb" strokeWidth="3" fill="none" opacity="0.3" /><circle cx="200" cy="320" r="30" fill="#0a8f5f" opacity="0.2" /><circle cx="200" cy="320" r="20" fill="none" stroke="#0a8f5f" strokeWidth="2" /></svg></div></div></section><section className="features-section"><div className="section-title"><h2>Why Choose Bluecrest?</h2><p>Trusted by thousands of customers worldwide for secure and convenient banking</p></div><div className="features-grid"><div className="feature-card"><div className="feature-icon">🔒</div><h3>Bank-Grade Security</h3><p>Military-grade encryption and multi-factor authentication protect your account 24/7.</p></div><div className="feature-card"><div className="feature-icon">⚡</div><h3>Lightning Fast</h3><p>Transfer money instantly with our optimized payment system. No delays, just results.</p></div><div className="feature-card"><div className="feature-icon">📱</div><h3>Mobile First</h3><p>Manage your finances on the go with our responsive, intuitive mobile experience.</p></div><div className="feature-card"><div className="feature-icon">👥</div><h3>24/7 Support</h3><p>Our dedicated support team is always ready to help with any questions or concerns.</p></div><div className="feature-card"><div className="feature-icon">💰</div><h3>Competitive Rates</h3><p>Enjoy industry-leading interest rates on savings and low-cost loan options.</p></div><div className="feature-card"><div className="feature-icon">🎯</div><h3>Financial Goals</h3><p>Smart tools to help you save, invest, and achieve your financial dreams.</p></div></div></section><section className="cta-section"><h2>Ready to Get Started?</h2><p>Join thousands of customers enjoying safe, fast, and easy banking with Bluecrest Trust Bank.</p><button className="cta-button" onClick={() => navigate('register')}>Open Your Account Today</button></section><footer className="public-footer"><div className="footer-content"><div className="footer-section"><h4>About</h4><ul><li><a href="#about">About Bluecrest</a></li><li><a href="#careers">Careers</a></li><li><a href="#press">Press</a></li><li><a href="#blog">Blog</a></li></ul></div><div className="footer-section"><h4>Products</h4><ul><li><a href="#checking">Checking Accounts</a></li><li><a href="#savings">Savings Accounts</a></li><li><a href="#loans">Loans</a></li><li><a href="#investments">Investments</a></li></ul></div><div className="footer-section"><h4>Support</h4><ul><li><a href="#help">Help Center</a></li><li><a href="#contact">Contact Us</a></li><li><a href="#faq">FAQ</a></li><li><a href="#security">Security</a></li></ul></div><div className="footer-section"><h4>Legal</h4><ul><li><a href="#privacy">Privacy Policy</a></li><li><a href="#terms">Terms of Service</a></li><li><a href="#compliance">Compliance</a></li><li><a href="#cookies">Cookie Policy</a></li></ul></div></div><div className="footer-bottom"><p>&copy; 2026 Bluecrest Trust Bank. All rights reserved. Banking services provided securely.</p></div></footer></div>
}

function AdminLogin({ onLogin, adminPassword }) {
  const [credentials, setCredentials] = useState({ username: '', password: '' })
  const [error, setError] = useState('')

  const submit = (event) => {
    event.preventDefault()
    if (credentials.username === 'admin' && credentials.password === adminPassword) {
      onLogin()
      return
    }
    setError('Enter the authorized administrator credentials.')
  }

  return <main className="admin-login"><div className="admin-login-card"><div className="brand"><span className="brand-mark">B</span><span>bluecrest <b>trust</b></span></div><p className="eyebrow">ADMINISTRATOR ACCESS</p><h1>Admin Panel</h1><form onSubmit={submit}><input type="text" placeholder="Username" value={credentials.username} onChange={(e) => setCredentials({ ...credentials, username: e.target.value })} /><input type="password" placeholder="Password" value={credentials.password} onChange={(e) => setCredentials({ ...credentials, password: e.target.value })} /><button type="submit" className="primary-button">Sign in</button></form>{error && <p className="error">{error}</p>}</div></main>
}

function AdminSettings({ adminPassword, setAdminPassword, setAuditLogs, auditLogs }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [notice, setNotice] = useState('')
  const savePassword = (event) => {
    event.preventDefault()
    if (form.current !== adminPassword) return setNotice('Current password is incorrect.')
    if (form.next.length < 8 || form.next !== form.confirm) return setNotice('Use matching passwords with at least 8 characters.')
    localStorage.setItem('bluecrest-admin-password', form.next)
    setAdminPassword(form.next)
    setAuditLogs([{ id: Date.now(), action: 'Admin password changed', timestamp: new Date().toISOString() }, ...auditLogs])
    setForm({ current: '', next: '', confirm: '' })
    setNotice('Admin password updated successfully.')
  }
  return <section className="management-view"><div className="section-heading"><div><p className="eyebrow">SECURITY</p><h2>Admin settings</h2></div></div><form className="form-panel admin-password-form" onSubmit={savePassword}><div><label>Current Password</label><input type="password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required /></div><div><label>New Password</label><input type="password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} required /></div><div><label>Confirm Password</label><input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required /></div><button type="submit" className="primary-button">Update Password</button></form>{notice && <p style={{ marginTop: '20px', padding: '12px', borderRadius: '6px', backgroundColor: form.current === adminPassword && form.next === form.confirm ? '#e8f5e9' : '#ffebee', color: form.current === adminPassword && form.next === form.confirm ? '#2e7d32' : '#c62828' }}>{notice}</p>}</section>
}

function AccountsView({ accounts, showAccountForm, setShowAccountForm, accountForm, setAccountForm, createAccount, createdCustomerLink, accountFormError, setAccountFormError, otpCodes, issueOtp, verifyOtp, updateAccount, deleteAccount }) {
  return <section className="management-view"><div className="section-heading"><div><p className="eyebrow">ADMINISTRATION</p><h2>Customer accounts</h2></div><button className="primary-button" onClick={() => setShowAccountForm(!showAccountForm)}>+ New Account</button></div>{showAccountForm && <form className="form-panel" onSubmit={createAccount}><div><label>Full Name</label><input type="text" value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} required /></div><div><label>Email</label><input type="email" value={accountForm.email} onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })} required /></div><div><label>Username</label><input type="text" value={accountForm.username} onChange((e) => setAccountForm({ ...accountForm, username: e.target.value })} /></div><div><label>Password</label><input type="password" value={accountForm.password} onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })} /></div><div><label>Account Type</label><select value={accountForm.type} onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value })}><option>Checking</option><option>Savings</option></select></div><div><label>Initial Balance</label><input type="number" step="0.01" value={accountForm.balance} onChange={(e) => setAccountForm({ ...accountForm, balance: e.target.value })} /></div><button type="submit" className="primary-button">Create Account</button></form>}{accountFormError && <p style={{ color: '#d32f2f', marginTop: '12px' }}>{accountFormError}</p>}{createdCustomerLink && <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#e8f5e9', borderRadius: '8px', borderLeft: '4px solid #4caf50' }}><strong>Account Created!</strong><p>{createdCustomerLink}</p></div>}<div className="accounts-table" style={{ marginTop: '30px' }}><table><thead><tr><th>Name</th><th>Email</th><th>Account Type</th><th>Balance</th><th>Status</th></tr></thead><tbody>{accounts.map((account) => <tr key={account.id}><td>{account.name}</td><td>{account.email || 'N/A'}</td><td>{account.type}</td><td>${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td>{account.status}</td></tr>)}</tbody></table></div></section>
}

function CustomerLogin({ account, onLogin, issueOtp, verifyOtp }) {
  const [credentials, setCredentials] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [otp, setOtp] = useState('')
  const [otpIssued, setOtpIssued] = useState(null)
  const submit = async (event) => {
    event.preventDefault()
    if (!otpIssued) {
      const localCustomer = findLocalCustomerRecord(credentials.username, credentials.password)
      try {
        const result = await apiRequest('/customers/login', { method: 'POST', body: JSON.stringify({ username: credentials.username.trim().toLowerCase(), password: credentials.password }) })
        setOtpIssued(result.userId)
        setError(result.delivered ? `A verification code was sent to ${result.delivery}.` : 'The verification email could not be sent.')
      } catch (requestError) {
        if (!localCustomer) {
          setError(requestError.message)
          return
        }
        const localCode = String(Math.floor(100000 + Math.random() * 900000))
        sessionStorage.setItem(`bluecrest-local-otp-${localCustomer.id}`, localCode)
        setOtpIssued(localCustomer.id)
        setError(`A verification code was generated for demo login: ${localCode}`)
      }
    } else {
      const localCode = sessionStorage.getItem(`bluecrest-local-otp-${otpIssued}`)
      if (localCode === otp) {
        onLogin()
        return
      }
      try {
        await apiRequest('/customers/verify-otp', { method: 'POST', body: JSON.stringify({ userId: otpIssued, code: otp }) })
        onLogin()
      } catch (requestError) {
        setError(requestError.message)
      }
    }
  }
  return <main className="admin-login customer-login"><div className="admin-login-card"><div className="brand"><span className="brand-mark">B</span><span>bluecrest <b>trust</b></span></div><p className="eyebrow">CUSTOMER LOGIN</p><h1>{otpIssued ? 'Verify OTP' : 'Welcome back'}</h1><form onSubmit={submit}>{!otpIssued ? <><input type="text" placeholder="Username or email" value={credentials.username} onChange={(e) => setCredentials({ ...credentials, username: e.target.value })} required /><input type="password" placeholder="Password" value={credentials.password} onChange={(e) => setCredentials({ ...credentials, password: e.target.value })} required /></> : <><input type="text" placeholder="Enter verification code" value={otp} onChange={(e) => setOtp(e.target.value)} maxLength="6" required /></>}<button type="submit" className="primary-button">{otpIssued ? 'Verify' : 'Sign in'}</button></form>{error && <p className="error">{error}</p>}</div></main>
}

function CustomerChat() {
  const [authenticated, setAuthenticated] = useState(() => sessionStorage.getItem('bluecrest-customer-auth') === 'active')
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (authenticated) apiRequest('/customer-chat/messages').then(setSent).catch(() => {})
  }, [authenticated])
  const send = async (event) => {
    event.preventDefault()
    if (!message.trim()) return
    try {
      const record = await apiRequest('/customer-chat/messages', { method: 'POST', body: JSON.stringify({ message: message.trim() }) })
      setSent([...sent, record])
      setMessage('')
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    }
  }
  useEffect(() => {
    const handleAuthentication = () => setAuthenticated(true)
    window.addEventListener('bluecrest-customer-authenticated', handleAuthentication)
    return () => window.removeEventListener('bluecrest-customer-authenticated', handleAuthentication)
  }, [])
  if (!authenticated) return null
  return <>{open && <div className="chat-window customer-chat"><div className="chat-header"><div><strong>Bluecrest support</strong><span>Secure customer support</span></div><button onClick={() => setOpen(false)}>✕</button></div><div className="chat-messages">{sent.map((msg) => <div key={msg.id} className="chat-message"><p>{msg.message}</p><small>{new Date(msg.createdAt).toLocaleTimeString()}</small></div>)}</div><form onSubmit={send} className="chat-input"><input type="text" placeholder="Type a message..." value={message} onChange={(e) => setMessage(e.target.value)} /><button type="submit">Send</button></form>{error && <p className="chat-error">{error}</p>}</div>}<button className="chat-button" onClick={() => setOpen(!open)}>💬 Chat</button></>
}

function CustomerPortal({ account, transactions, onTransfer, issueOtp, verifyOtp }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [transfer, setTransfer] = useState({ recipient: '', account: '', amount: '' })
  const [feedback, setFeedback] = useState(null)
  if (!account) return <div className="customer-missing"><h1>Account unavailable</h1><p>This customer access link is not active.</p></div>
  if (account.status !== 'Active') return <div className="customer-missing"><h1>Account unavailable</h1><p>This account has been deactivated. Please contact support.</p></div>
  if (!authenticated) return <CustomerLogin account={account} issueOtp={issueOtp} verifyOtp={verifyOtp} onLogin={() => { setAuthenticated(true); sessionStorage.setItem('bluecrest-customer-auth', 'active'); window.dispatchEvent(new Event('bluecrest-customer-authenticated')) }} />
  const accountTransactions = transactions.filter((item) => !item.accountId || item.accountId === account.id).slice(0, 5)
  const submitTransfer = async (event) => {
    event.preventDefault()
    const result = onTransfer(account.id, transfer)
    setFeedback(result.ok ? { type: 'success', text: 'Transfer Successful' } : { type: 'error', text: 'Insufficient Balance' })
    if (result.ok) {
      try {
        await apiRequest('/customers/debit-alert', { method: 'POST', body: JSON.stringify({ amount: transfer.amount, description: `Transfer to ${transfer.account}` }) })
      } catch {
        setFeedback({ type: 'success', text: 'Transfer Successful' })
      }
    }
    if (result.ok) { setTransfer({ recipient: '', account: '', amount: '' }); setShowTransfer(false) }
  }
  return <div className="customer-portal"><header className="customer-header"><div className="brand"><span className="brand-mark">B</span><span>bluecrest <b>trust</b></span></div><div className="customer-welcome"><strong>{account.name}</strong><small>{account.type} Account</small></div></header><main className="customer-main"><section className="balance-panel"><h2>Balance</h2><p className="balance-amount">${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p><p className="balance-label">{account.name}</p></section><section className="customer-actions"><button className="primary-button" onClick={() => setShowTransfer(!showTransfer)}>Send Money</button><button className="secondary-button">Request Money</button><button className="secondary-button">Add Money</button></section>{showTransfer && <form className="form-panel" onSubmit={submitTransfer}><div><label>Recipient Name</label><input type="text" value={transfer.recipient} onChange={(e) => setTransfer({ ...transfer, recipient: e.target.value })} required /></div><div><label>Account Number</label><input type="text" value={transfer.account} onChange={(e) => setTransfer({ ...transfer, account: e.target.value })} required /></div><div><label>Amount</label><input type="number" step="0.01" value={transfer.amount} onChange={(e) => setTransfer({ ...transfer, amount: e.target.value })} required /></div><button type="submit" className="primary-button">Send Transfer</button></form>}{feedback && <div style={{ marginTop: '16px', padding: '12px', borderRadius: '6px', backgroundColor: feedback.type === 'success' ? '#e8f5e9' : '#ffebee', color: feedback.type === 'success' ? '#2e7d32' : '#c62828' }}>{feedback.text}</div>}<section className="transactions-list"><h3>Recent Transactions</h3><div>{accountTransactions.length === 0 ? <p>No transactions yet</p> : accountTransactions.map((tx) => <div key={tx.id} className="transaction-item"><div><strong>{tx.name}</strong><small>{tx.date}</small></div><div style={{ textAlign: 'right', color: tx.amount.startsWith('+') ? '#4caf50' : '#f44336' }}><strong>{tx.amount}</strong><small>{tx.type}</small></div></div>)}</div></section></main><CustomerChat /></div>
}

function PaymentsView({ transactionForm, setTransactionForm, addTransaction, transactions, setTransactions }) {
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState({ name: '', date: '' })
  const editTransaction = (event) => {
    event.preventDefault()
    const correctedDate = new Date(`${draft.date}T12:00:00`)
    if (Number.isNaN(correctedDate.getTime())) return
    setTransactions(transactions.map((transaction) => transaction.id === editingId ? { ...transaction, name: draft.name, date: correctedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } : transaction))
    setEditingId(null)
  }
  return <section className="management-view"><div className="section-heading"><div><p className="eyebrow">ACCOUNT ACTIVITY</p><h2>Add or correct transaction</h2></div></div><form className="form-panel" onSubmit={addTransaction}><div><label>Merchant / Recipient</label><input type="text" value={transactionForm.name} onChange={(e) => setTransactionForm({ ...transactionForm, name: e.target.value })} required /></div><div><label>Amount</label><input type="number" step="0.01" value={transactionForm.amount} onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })} required /></div><div><label>Date</label><input type="date" value={transactionForm.date} onChange={(e) => setTransactionForm({ ...transactionForm, date: e.target.value })} required /></div><div><label>Type</label><select value={transactionForm.direction} onChange={(e) => setTransactionForm({ ...transactionForm, direction: e.target.value })}><option value="debit">Debit (withdrawal)</option><option value="credit">Credit (deposit)</option></select></div><div><label>Category</label><select value={transactionForm.type} onChange={(e) => setTransactionForm({ ...transactionForm, type: e.target.value })}><option>Transfer</option><option>Payment</option><option>Deposit</option><option>Withdrawal</option></select></div><button type="submit" className="primary-button">Add Transaction</button></form><div className="transactions-list" style={{ marginTop: '40px' }}><h3>All Transactions</h3><div>{transactions.map((tx) => <div key={tx.id} className="transaction-item"><div><strong>{tx.name}</strong><small>{tx.date}</small></div><div style={{ textAlign: 'right', color: tx.amount.startsWith('+') ? '#4caf50' : '#f44336' }}><strong>{tx.amount}</strong><small>{tx.type}</small></div></div>)}</div></div></section>
}

function Webmail() {
  const welcomeMessages = JSON.parse(localStorage.getItem('bluecrest-welcome-emails') || '[]')
  const inbox = [...welcomeMessages, ...messages]
  const [compose, setCompose] = useState(false)
  const [form, setForm] = useState({ to: '', subject: '', text: '' })
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem('bluecrest-admin-api-key') || '')
  const [notice, setNotice] = useState('')
  const send = async (event) => {
    event.preventDefault()
    try {
      await apiRequest('/admin/email', { method: 'POST', headers: { 'x-admin-key': adminKey }, body: JSON.stringify(form) })
      setNotice('Message sent successfully.')
      sessionStorage.setItem('bluecrest-admin-api-key', adminKey)
      setForm({ to: '', subject: '', text: '' })
      setCompose(false)
    } catch (error) {
      setNotice(error.message)
    }
  }
  return <section className="webmail"><div className="mail-toolbar"><div className="mail-search">⌕ <input placeholder="Search your mail" /></div><button className="compose-button" onClick={() => setCompose(!compose)}>✎ Compose</button></div>{compose && <form className="compose-form" onSubmit={send}><input type="text" placeholder="Admin API Key" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} required /><input type="email" placeholder="To" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} required /><input type="text" placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required /><textarea placeholder="Message" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} required /><button type="submit" className="primary-button">Send Email</button></form>}{notice && <p style={{ margin: '16px', padding: '12px', borderRadius: '6px', backgroundColor: '#e8f5e9', color: '#2e7d32' }}>{notice}</p>}<div className="mail-inbox"><h3>Inbox</h3>{inbox.map((msg) => <div key={msg.id} className="mail-item"><div><strong>{msg.sender}</strong><small>{msg.time}</small></div><div><p>{msg.subject}</p><small>{msg.preview}</small></div></div>)}</div></section>
}

export default App
