import { useEffect, useState } from 'react'
import './balance-editor.css'
import './customer-portal.css'
import './admin-login.css'
import './transfer.css'
import './admin-features.css'
import './admin-settings.css'
import './admin-overview.css'
import './public-site.css'
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
  return saved.map((account) => ({ ...account, username: account.username || (account.id === 1 ? 'jordan' : account.id === 2 ? 'savings' : `customer${account.id}`), password: account.password || 'welcome', status: account.status || 'Active' }))
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
    const record = { id: `transfer-${timestamp.getTime()}`, accountId, name: transfer.recipient, date: timestamp.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }), amount: `-$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, type: `Transfer to ${transfer.account}`, tone: 'orange', status: 'Successful' }
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
    const newAccount = { id: registeredUser.id, name: registeredUser.name, email: registeredUser.email, number: `**** ${Math.floor(1000 + Math.random() * 9000)}`, type: accountForm.type, balance: Number(accountForm.balance) || 0, status: 'Active', username: registeredUser.username, password }
    saveLocalCustomerRecord({
      id: newAccount.id,
      name: newAccount.name,
      email: newAccount.email,
      username: newAccount.username,
      password: newAccount.password,
      status: newAccount.status,
    })
    setAccounts([...accounts, newAccount])
    const welcome = { id: `welcome-${newAccount.id}`, sender: 'Bluecrest Trust Bank', recipient: accountForm.email || 'customer@example.com', subject: 'Welcome to Bluecrest Trust Bank', preview: 'Your account has been successfully opened. Your online banking access is ready.', time: 'Just now', unread: true, content: 'Your account has been opened. Never share your password or one-time security code by email.' }
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
    setTransactions([{ id: `admin-${Date.now()}`, accountId: 1, name: transactionForm.name.trim(), date: formattedDate, amount: `${isCredit ? '+' : '-'}$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, type: transactionForm.type, tone: isCredit ? 'green' : 'orange', status: 'Recorded' }, ...transactions])
    setAccounts(accounts.map((account, index) => index === 0 ? { ...account, balance: account.balance + (isCredit ? value : -value) } : account))
    setTransactionForm({ ...transactionForm, name: '', amount: '' })
  }

  return (
    <div className={active === 'Overview' ? 'app-shell admin-app' : 'app-shell'}>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">B</span><span>bluecrest <b>trust</b></span></div>
        <div className="profile-mini"><div className="avatar">AD</div><div><strong>Administrator</strong><small>Operations workspace</small></div><span className="chevron">⌄</span></div>
        <nav>
          {['Overview', 'Accounts', 'Payments', 'Cards', 'Webmail'].map((item, index) => <button key={item} className={active === item ? 'nav-item active' : 'nav-item'} onClick={() => setActive(item)}><span className="nav-icon">{['⌂', '◉', '↗', '▣', '✉'][index]}</span>{item}{item === 'Webmail' && <span className="nav-badge">2</span>}</button>)}
        </nav>
        <div className="sidebar-bottom"><button className={active === 'Settings' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Settings')}><span className="nav-icon">⚙</span>Settings</button><button className="nav-item" onClick={() => { sessionStorage.removeItem('bluecrest-admin-session'); setAdminAuthenticated(false) }}><span className="nav-icon">↪</span>Sign out</button></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div><p className="eyebrow">SATURDAY, AUGUST 22, 2026</p><h1>{active === 'Webmail' ? 'Administrative webmail' : active === 'Accounts' ? 'Customer accounts' : active === 'Payments' ? 'Transaction management' : 'Admin operations'}</h1></div><div className="top-actions"><button className="icon-button" aria-label="Search">⌕</button><button className="icon-button notification" aria-label="Notifications">♧<i /></button><div className="avatar avatar-small">AD</div></div></header>

        {active === 'Webmail' ? <Webmail /> : <>
          {active === 'Accounts' ? <AccountsView accounts={accounts} showAccountForm={showAccountForm} setShowAccountForm={setShowAccountForm} accountForm={accountForm} setAccountForm={setAccountForm} createAccount={createAccount} createdCustomerLink={createdCustomerLink} accountFormError={accountFormError} otpCodes={otpCodes} issueOtp={issueOtp} updateAccount={updateAccount} deleteAccount={deleteAccount} /> : active === 'Payments' ? <PaymentsView transactionForm={transactionForm} setTransactionForm={setTransactionForm} addTransaction={addTransaction} transactions={transactions} setTransactions={setTransactions} /> : active === 'Settings' ? <AdminSettings adminPassword={adminPassword} setAdminPassword={setAdminPassword} setAuditLogs={setAuditLogs} auditLogs={auditLogs} /> : <>
          <section className="admin-overview"><div className="admin-overview-heading"><p className="eyebrow">PRIVATE WORKSPACE</p><h2>Admin dashboard</h2><p>Monitor access, transactions, support, and communications from one place.</p></div><div className="admin-summary-grid"><button onClick={() => setActive('Accounts')}><span className="metric-icon blue">♙</span><strong>{accounts.length}</strong><span>Customer accounts <em>↑ 8.2%</em></span></button><button onClick={() => setActive('Accounts')}><span className="metric-icon green">▣</span><strong>{accounts.length}</strong><span>Active accounts <em>↑ 5.4%</em></span></button><button onClick={() => setActive('Payments')}><span className="metric-icon orange">↗</span><strong>{transactions.length}</strong><span>Recorded transactions <em>↑ 10.2%</em></span></button><button onClick={() => setActive('Webmail')}><span className="metric-icon red">✉</span><strong>{messages.length}</strong><span>Unread communications <em>3 new</em></span></button></div><div className="admin-panel-grid"><section className="admin-panel"><div className="admin-panel-title"><h3>Transaction activity</h3><button onClick={() => setActive('Payments')}>View records →</button></div><div className="activity-bars"><i style={{ height: '42%' }} /><i style={{ height: '68%' }} /><i style={{ height: '54%' }} /><i style={{ height: '82%' }} /><i style={{ height: '61%' }} /><i style={{ height: '92%' }} /><i style={{ height: '74%' }} /><i style={{ height: '88%' }} /></div><div className="activity-legend"><span>Last 8 reporting periods</span><strong>{transactions.length} records</strong></div></section><section className="admin-panel"><div className="admin-panel-title"><h3>Security center</h3><button>View audit →</button></div><div className="security-row"><span className="status-dot green-dot" />OTP services operational<strong>Ready</strong></div><div className="security-row"><span className="status-dot blue-dot" />Admin session protected<strong>Active</strong></div><div className="security-row"><span className="status-dot amber-dot" />Audit events recorded<strong>{auditLogs.length}</strong></div></section></div><div className="admin-quick-links"><button onClick={() => setActive('Accounts')}>Create or manage customer accounts <span>→</span></button><button onClick={() => setActive('Payments')}>Edit or backdate a transaction <span>→</span></button><button onClick={() => setActive('Webmail')}>Open branded webmail <span>→</span></button></div></section>
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
  if (mode === 'login' || mode === 'register') return <main className="public-auth"><div className="public-auth-card"><div className="brand"><span className="brand-mark">B</span><span>bluecrest <b>trust</b></span></div><button className="back-link" onClick={() => navigate('home')}>← Back to home</button><p className="eyebrow">{mode === 'login' ? 'CUSTOMER BANKING' : 'OPEN AN ACCOUNT'}</p><h1>{mode === 'login' ? 'Welcome back' : 'Start banking with confidence'}</h1><p>{mode === 'login' ? 'Sign in to your customer banking website.' : 'Create your fictional customer profile in a few steps.'}</p><form onSubmit={mode === 'login' ? submitLogin : submitRegistration}>{mode === 'register' && <><label>Full name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><label>Email address<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label></>}<label>{mode === 'login' ? 'Username or email address' : 'Username'}<input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required /></label><label>Password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label>{notice && <div className="public-notice">{notice}</div>}<button className="public-primary" type="submit">{mode === 'login' ? 'Continue to banking' : 'Create account'}</button></form>{mode === 'login' ? <button className="switch-link" onClick={() => navigate('register')}>New customer? Open an account</button> : <button className="switch-link" onClick={() => navigate('login')}>Already have an account? Sign in</button>}</div></main>
  return <div className="public-site"><header className="public-header"><div className="brand"><span className="brand-mark">B</span><span>bluecrest <b>trust</b></span></div><nav><button onClick={() => navigate('login')}>Login</button><button className="public-nav-cta" onClick={() => navigate('register')}>Open an account</button></nav></header><main><section className="public-hero"><div><p className="eyebrow">BANKING, CLEARLY DONE</p><h1>Move forward with confidence.</h1><p>Simple digital banking for everyday decisions, with support when you need it.</p><div className="public-hero-actions"><button className="public-primary" onClick={() => navigate('register')}>Open an account</button><button className="public-secondary" onClick={() => navigate('login')}>Login to banking →</button></div></div><div className="public-hero-card"><span>YOUR MONEY, IN VIEW</span><strong>Secure by design</strong><p>Account insights, helpful alerts, and support in one calm place.</p></div></section><section className="public-services"><p className="eyebrow">MEMBER EXPERIENCE</p><h2>Banking designed around your life.</h2><div><article><b>01</b><h3>Everyday accounts</h3><p>Manage your checking and savings with clarity.</p></article><article><b>02</b><h3>Move money simply</h3><p>Review transfers and account activity in one place.</p></article><article><b>03</b><h3>Support that listens</h3><p>Reach the customer team from your banking website.</p></article></div></section><p className="public-contact">Customer support: <a href="mailto:info@bluecresttrustbank.com">info@bluecresttrustbank.com</a></p></main></div>
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

  return <main className="admin-login"><div className="admin-login-card"><div className="brand"><span className="brand-mark">B</span><span>bluecrest <b>trust</b></span></div><p className="eyebrow">PRIVATE ADMIN DOMAIN</p><h1>Administrator sign in</h1><p className="login-copy">Access is restricted to authorized administrators.</p><form onSubmit={submit}><label>Admin username<input value={credentials.username} onChange={(event) => setCredentials({ ...credentials, username: event.target.value })} autoComplete="username" required /></label><label>Password<input type="password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} autoComplete="current-password" required /></label>{error && <p className="login-error">{error}</p>}<button className="primary-button" type="submit">Sign in securely</button></form><small>Protected workspace</small></div></main>
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
  return <section className="management-view"><div className="section-heading"><div><p className="eyebrow">SECURITY</p><h2>Admin settings</h2></div></div><form className="form-panel admin-password-form" onSubmit={savePassword}><h3>Change admin password</h3><label>Current password<input type="password" value={form.current} onChange={(event) => setForm({ ...form, current: event.target.value })} required /></label><label>New password<input type="password" minLength="8" value={form.next} onChange={(event) => setForm({ ...form, next: event.target.value })} required /></label><label>Confirm new password<input type="password" minLength="8" value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} required /></label>{notice && <p className="settings-notice">{notice}</p>}<button className="primary-button" type="submit">Update password</button></form></section>
}

function AccountsView({ accounts, showAccountForm, setShowAccountForm, accountForm, setAccountForm, createAccount, createdCustomerLink, accountFormError, otpCodes, issueOtp, updateAccount, deleteAccount }) {
  return <section className="management-view"><div className="section-heading"><div><p className="eyebrow">ADMINISTRATION</p><h2>Customer accounts</h2></div><button className="primary-button" onClick={() => { setAccountFormError(''); setShowAccountForm(!showAccountForm) }}>＋ Create account</button></div>{createdCustomerLink && <div className="customer-link"><strong>Customer access link created</strong><span>{createdCustomerLink}</span><button onClick={() => navigator.clipboard?.writeText(createdCustomerLink)}>Copy link</button></div>}{showAccountForm && <form className="form-panel" onSubmit={createAccount}><label>Customer name<input value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} placeholder="e.g. Jordan Davis" required /></label><label>Customer email<input type="email" value={accountForm.email} onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })} placeholder="customer@example.com" required /></label><label>Type<select value={accountForm.type} onChange={(event) => setAccountForm({ ...accountForm, type: event.target.value })}><option>Checking</option><option>Savings</option><option>Business</option></select></label><label>Opening figure<input type="number" min="0" step="0.01" value={accountForm.balance} onChange={(event) => setAccountForm({ ...accountForm, balance: event.target.value })} placeholder="0.00" /></label><label>Customer username<input value={accountForm.username} onChange={(event) => setAccountForm({ ...accountForm, username: event.target.value })} placeholder="e.g. jordan.davis" /></label><label>Customer password<input type="text" value={accountForm.password} onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })} placeholder="Temporary password" /></label>{accountFormError && <p className="login-error">{accountFormError}</p>}<button className="primary-button" type="submit">Create account</button></form>}<div className="account-list">{accounts.map((account) => <div className="account-card" key={account.id}><div className="account-card-icon">{account.type === 'Savings' ? '◒' : '◉'}</div><div><strong>{account.name}</strong><span>{account.type} · {account.number} · {account.username || 'jordan'}</span></div><div className="account-balance"><strong>${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong><span>{account.status}</span></div><div className="account-controls"><button onClick={() => issueOtp(account.id)}>Generate OTP</button><button onClick={() => updateAccount(account.id, { status: account.status === 'Active' ? 'Inactive' : 'Active' })}>{account.status === 'Active' ? 'Deactivate' : 'Activate'}</button><button onClick={() => { if (window.confirm('Delete this account and keep an audit record?')) deleteAccount(account.id) }}>Delete</button></div>{otpCodes[account.id] && <small className="otp-admin">OTP {otpCodes[account.id].code} · expires in 5 minutes</small>}</div>)}</div></section>
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
  return <main className="admin-login customer-login"><div className="admin-login-card"><div className="brand"><span className="brand-mark">B</span><span>bluecrest <b>trust</b></span></div><p className="eyebrow">CUSTOMER BANKING</p><h1>{otpIssued ? 'Verify your identity' : 'Welcome back'}</h1><p className="login-copy">{otpIssued ? 'Enter the one-time code sent to your registered contact.' : 'Sign in to access your account.'}</p><form onSubmit={submit}>{!otpIssued && <><label>Username<input value={credentials.username} onChange={(event) => setCredentials({ ...credentials, username: event.target.value })} required /></label><label>Password<input type="password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} required /></label></>}{otpIssued && <label>One-time password<input inputMode="numeric" value={otp} onChange={(event) => setOtp(event.target.value)} maxLength="6" required /></label>}{error && <p className="login-error">{error}</p>}<button className="primary-button" type="submit">{otpIssued ? 'Verify OTP' : 'Continue'}</button></form></div></main>
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
  return <>{open && <div className="chat-window customer-chat"><div className="chat-header"><div><strong>Bluecrest support</strong><span>Secure customer support</span></div><button onClick={() => setOpen(false)}>×</button></div><div className="chat-body"><div className="agent-message"><div className="support-avatar">B</div><div><span className="bubble">Hello. How can we help today?</span><small>Support team · now</small></div></div>{sent.map((item, index) => <div className="user-message" key={item.id || index}><span className="bubble">{item.message || item}</span></div>)}{error && <small className="login-error">{error}</small>}</div><form className="chat-form" onSubmit={send}><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write a message..." aria-label="Message support" /><button aria-label="Send message">↑</button></form></div>}<button className="chat-launcher customer-chat-launcher" onClick={() => setOpen(true)}><span className="chat-dot" />Chat with support <b>↗</b></button></>
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
  return <div className="customer-portal"><header className="customer-header"><div className="brand"><span className="brand-mark">B</span><span>bluecrest <b>trust</b></span></div><div className="avatar avatar-small">{account.name.slice(0, 2).toUpperCase()}</div></header><main className="customer-main"><p className="eyebrow">PERSONAL BANKING</p><h1>Good morning, {account.name}</h1><section className="customer-balance"><span>Available balance</span><strong>${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} <small>USD</small></strong><div><span>{account.name} · {account.number}</span><b>Active</b></div></section>{feedback && <div className={`transfer-feedback ${feedback.type}`}><strong>{feedback.text}</strong><span>{feedback.type === 'success' ? 'Your simulated transfer was added to transaction history.' : 'The requested amount is greater than your available balance.'}</span></div>}<section className="customer-actions"><button>Account info</button><button onClick={() => { setShowTransfer(true); setFeedback(null) }}>Send money</button><button>Pay a bill</button><button>Cards</button></section>{showTransfer && <form className="transfer-panel" onSubmit={submitTransfer}><h2>Send money</h2><p>Simulated transfer only. No real funds are moved.</p><label>Recipient name<input value={transfer.recipient} onChange={(event) => setTransfer({ ...transfer, recipient: event.target.value })} required /></label><label>Recipient account<input value={transfer.account} onChange={(event) => setTransfer({ ...transfer, account: event.target.value })} required /></label><label>Amount<input type="number" min="0.01" step="0.01" value={transfer.amount} onChange={(event) => setTransfer({ ...transfer, amount: event.target.value })} required /></label><div><button className="primary-button" type="submit">Review transfer</button><button type="button" onClick={() => setShowTransfer(false)}>Cancel</button></div></form>}<div className="customer-section-title"><h2>Recent transactions</h2><button>View all</button></div><div className="customer-transactions">{accountTransactions.map((transaction) => <div className="transaction" key={`${transaction.name}-${transaction.date}`}><div className={`transaction-icon ${transaction.tone}`}>{transaction.name[0]}</div><div className="transaction-info"><strong>{transaction.name}</strong><span>{transaction.type} · {transaction.date}{transaction.status && ` · ${transaction.status}`}</span></div><strong className={transaction.amount[0] === '+' ? 'amount positive' : 'amount'}>{transaction.amount}</strong></div>)}</div></main><nav className="customer-nav"><button className="selected">⌂<span>Home</span></button><button>⌁<span>Stats</span></button><button>▣<span>Cards</span></button><button>◯<span>Profile</span></button></nav><CustomerChat /></div>
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
  return <section className="management-view"><div className="section-heading"><div><p className="eyebrow">ACCOUNT ACTIVITY</p><h2>Add or correct transaction</h2></div></div><form className="form-panel transaction-form" onSubmit={addTransaction}><label>Payee or source<input value={transactionForm.name} onChange={(event) => setTransactionForm({ ...transactionForm, name: event.target.value })} placeholder="e.g. Apartment rent" required /></label><label>Amount<input type="number" min="0.01" step="0.01" value={transactionForm.amount} onChange={(event) => setTransactionForm({ ...transactionForm, amount: event.target.value })} placeholder="0.00" required /></label><label>Transaction date<input type="date" value={transactionForm.date} onChange={(event) => setTransactionForm({ ...transactionForm, date: event.target.value })} required /></label><label>Direction<select value={transactionForm.direction} onChange={(event) => setTransactionForm({ ...transactionForm, direction: event.target.value })}><option value="debit">Money out</option><option value="credit">Money in</option></select></label><label>Category<input value={transactionForm.type} onChange={(event) => setTransactionForm({ ...transactionForm, type: event.target.value })} placeholder="Transfer" /></label><button className="primary-button" type="submit">Add transaction</button></form><div className="admin-transaction-list">{transactions.slice(0, 8).map((transaction, index) => <div className="admin-transaction-row" key={transaction.id || `${transaction.name}-${index}`}>{editingId === transaction.id ? <form onSubmit={editTransaction}><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /><input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} required /><button type="submit">Save correction</button></form> : <><span><strong>{transaction.name}</strong><small>{transaction.amount} · {transaction.date} {transaction.status ? `· ${transaction.status}` : ''}</small></span><button disabled={!transaction.id} onClick={() => { setEditingId(transaction.id); setDraft({ name: transaction.name, date: new Date(transaction.date).toISOString().slice(0, 10) })}}>Edit</button></>}</div>)}</div></section>
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
  return <section className="webmail"><div className="mail-toolbar"><div className="mail-search">⌕ <input placeholder="Search your mail" /></div><button className="compose-button" onClick={() => setCompose(!compose)}>＋ Compose</button></div>{compose && <form className="form-panel" onSubmit={send}><label>Recipient email<input type="email" value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} required /></label><label>Subject<input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} required /></label><label>Message<textarea value={form.text} onChange={(event) => setForm({ ...form, text: event.target.value })} required /></label><label>Admin mail key<input type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} required /></label>{notice && <p className="settings-notice">{notice}</p>}<button className="primary-button" type="submit">Send email</button></form>}{!compose && notice && <p className="settings-notice">{notice}</p>}<div className="mail-tabs"><button className="selected">Inbox <span>{inbox.filter((mail) => mail.unread).length}</span></button><button>Sent</button><button>Drafts</button><button>Archive</button></div><div className="full-mail-list">{inbox.map((mail, index) => <button className={`full-mail-row ${mail.unread ? 'is-unread' : ''}`} key={mail.id || `${mail.subject}-${index}`}><div className="mail-avatar">{mail.sender[0]}</div><div className="full-mail-copy"><strong>{mail.sender}</strong><b>{mail.subject}</b><span>{mail.preview}</span>{mail.recipient && <small>To: {mail.recipient}</small>}</div><time>{mail.time}</time><span className="mail-more">•••</span></button>)}</div></section>
}

export default App
