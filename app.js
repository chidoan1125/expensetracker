const STORAGE_KEY = 'expenses_v1'
const TOKEN_KEY = 'expense_token'
const USER_KEY = 'expense_user'
const API_BASE = '/api'

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

function load() {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : [] } catch (e) { return [] }
}
function save(items) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) }

const authForm = document.querySelector('.auth-form')
const authEmail = document.getElementById('auth-email')
const authPassword = document.getElementById('auth-password')
const loginBtn = document.getElementById('loginBtn')
const registerBtn = document.getElementById('registerBtn')
const logoutBtn = document.getElementById('logoutBtn')
const authFeedback = document.getElementById('authFeedback')
const userBadge = document.getElementById('userBadge')
const userEmail = document.getElementById('userEmail')
const appWrapper = document.getElementById('appWrapper')
const adminPortal = document.getElementById('adminPortal')
const form = document.getElementById('expense-form')
const tableBody = document.querySelector('#expenses-table tbody')
const totalEl = document.getElementById('total')
const countEl = document.getElementById('count')
const monthFilterButtons = document.getElementById('monthFilterButtons')
const budgetTargetEl = document.getElementById('budgetTarget')
const budgetStatusEl = document.getElementById('budgetStatus')
const budgetFillEl = document.getElementById('budgetFill')
const budgetSpentEl = document.getElementById('budgetSpent')
const budgetRemainingEl = document.getElementById('budgetRemaining')
const analysisList = document.getElementById('analysisList')
const budgetInput = document.getElementById('budgetInput')
const setBudgetBtn = document.getElementById('setBudgetBtn')

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
let activeMonthFilter = ''
let BUDGET_TARGET = 1500

let expenses = load()
let backendAvailable = false
let summaryChart = null
let currentUser = getUser()

function getBudget() {
  return JSON.parse(localStorage.getItem('budget_target') || '1500')
}

function saveBudget(value) {
  localStorage.setItem('budget_target', JSON.stringify(value))
  BUDGET_TARGET = value
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

function getUser() {
  try { const raw = localStorage.getItem(USER_KEY); return raw ? JSON.parse(raw) : null } catch (e) { return null }
}

function setUser(user) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
  else localStorage.removeItem(USER_KEY)
}

function showAuth(message = '') {
  authForm.classList.remove('hidden')
  userBadge.classList.add('hidden')
  appWrapper.classList.add('hidden')
  authFeedback.textContent = message
  currentUser = null
  setUser(null)
}

function showApp() {
  authForm.classList.add('hidden')
  userBadge.classList.remove('hidden')
  appWrapper.classList.remove('hidden')
  adminPortal.classList.add('hidden')
  authFeedback.textContent = ''
  if (currentUser?.email) {
    userEmail.textContent = currentUser.email
  } else {
    userEmail.textContent = 'Logged in'
  }
  
  // Load and display budget
  BUDGET_TARGET = getBudget()
  budgetInput.value = BUDGET_TARGET
  renderMonthFilterButtons()
  
  // Show admin button if user is admin
  let adminBtn = document.getElementById('adminBtn')
  if (currentUser?.isAdmin && !adminBtn) {
    adminBtn = document.createElement('button')
    adminBtn.id = 'adminBtn'
    adminBtn.textContent = 'Admin Portal'
    adminBtn.type = 'button'
    adminBtn.addEventListener('click', showAdminPortal)
    userBadge.insertBefore(adminBtn, logoutBtn)
  } else if (!currentUser?.isAdmin && adminBtn) {
    adminBtn.remove()
  }
}

function renderMonthFilterButtons() {
  monthFilterButtons.innerHTML = ''

  const allButton = document.createElement('button')
  allButton.type = 'button'
  allButton.textContent = 'All'
  allButton.className = activeMonthFilter === '' ? 'active' : ''
  allButton.addEventListener('click', () => {
    activeMonthFilter = ''
    renderMonthFilterButtons()
    render()
  })
  monthFilterButtons.appendChild(allButton)

  MONTHS.forEach(month => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = month
    btn.className = activeMonthFilter === month ? 'active' : ''
    btn.addEventListener('click', () => {
      activeMonthFilter = month
      renderMonthFilterButtons()
      render()
    })
    monthFilterButtons.appendChild(btn)
  })
}

async function authenticate(path) {
  const email = authEmail.value.trim()
  const password = authPassword.value.trim()
  if (!email || !password) {
    authFeedback.textContent = 'Please enter email and password.'
    return
  }

  try {
    const res = await fetch(`${API_BASE}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })

    const result = await res.json()
    if (!res.ok) {
      authFeedback.textContent = result.error || 'Authentication failed.'
      return
    }

    setToken(result.token)
    currentUser = result.user
    setUser(currentUser)
    backendAvailable = true
    authEmail.value = ''
    authPassword.value = ''
    showApp()
    expenses = []
    await refreshExpenses()
    render()
  } catch (error) {
    authFeedback.textContent = 'Unable to reach server. Please try again later.'
  }
}

loginBtn.addEventListener('click', () => authenticate('login'))
registerBtn.addEventListener('click', () => authenticate('register'))
logoutBtn.addEventListener('click', () => {
  setToken(null)
  setUser(null)
  backendAvailable = false
  showAuth()
})

setBudgetBtn.addEventListener('click', () => {
  const value = parseFloat(budgetInput.value) || 1500
  if (value < 0) {
    budgetInput.value = 1500
    return
  }
  saveBudget(value)
  render()
})

budgetInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    setBudgetBtn.click()
  }
})

async function showAdminPortal() {
  appWrapper.classList.add('hidden')
  adminPortal.classList.remove('hidden')
  await loadAdminData()
}

document.getElementById('backToAppBtn')?.addEventListener('click', () => {
  adminPortal.classList.add('hidden')
  appWrapper.classList.remove('hidden')
})

async function loadAdminData() {
  const token = getToken()
  if (!token) return

  try {
    const [usersRes, expensesRes] = await Promise.all([
      fetch(`${API_BASE}/admin/users`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_BASE}/admin/expenses`, { headers: { Authorization: `Bearer ${token}` } })
    ])

    if (!usersRes.ok || !expensesRes.ok) throw new Error('Admin access denied')

    const users = await usersRes.json()
    const allExpenses = await expensesRes.json()

    renderAdminUsers(users)
    renderAdminExpenses(allExpenses)
  } catch (err) {
    alert('Failed to load admin data: ' + err.message)
  }
}

function renderAdminUsers(users) {
  const usersList = document.getElementById('usersList')
  usersList.innerHTML = ''

  for (const user of users) {
    const div = document.createElement('div')
    div.className = 'admin-item'
    const isAdmin = user.is_admin ? ' (Admin)' : ''
    div.innerHTML = `
      <div class="admin-item-content">
        <div class="admin-item-email">${escapeHtml(user.email)}${isAdmin}</div>
        <div class="admin-item-meta">Joined: ${user.created_at?.slice(0, 10) || 'N/A'}</div>
      </div>
      <div class="admin-item-actions">
        <button data-user-id="${user.id}" class="toggle-admin" type="button">
          ${user.is_admin ? 'Remove Admin' : 'Make Admin'}
        </button>
        ${user.id !== currentUser?.id ? `<button data-user-id="${user.id}" class="delete-user danger" type="button">Delete</button>` : ''}
      </div>
    `
    usersList.appendChild(div)
  }

  usersList.querySelectorAll('.toggle-admin').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const userId = e.target.dataset.userId
      const user = users.find(u => u.id === userId)
      try {
        const res = await fetch(`${API_BASE}/admin/users/${userId}/admin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ isAdmin: !user.is_admin })
        })
        if (res.ok) {
          await loadAdminData()
        }
      } catch (err) {
        alert('Failed to update admin status')
      }
    })
  })

  usersList.querySelectorAll('.delete-user').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (!confirm('Delete this user? This cannot be undone.')) return
      const userId = e.target.dataset.userId
      try {
        const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${getToken()}` }
        })
        if (res.ok) {
          await loadAdminData()
        }
      } catch (err) {
        alert('Failed to delete user')
      }
    })
  })
}

function renderAdminExpenses(allExpenses) {
  const expensesList = document.getElementById('expensesList')
  const filterMonth = document.getElementById('adminFilterMonth')
  
  const renderList = () => {
    expensesList.innerHTML = ''
    const filter = filterMonth.value
    const filtered = filter ? allExpenses.filter(e => e.date.slice(0, 7) === filter) : allExpenses
    filtered.sort((a, b) => b.date.localeCompare(a.date))

    for (const e of filtered) {
      const div = document.createElement('div')
      div.className = 'admin-expense-item'
      div.innerHTML = `
        <div class="admin-expense-date">${e.date}</div>
        <div class="admin-expense-desc">${escapeHtml(e.desc)}</div>
        <div class="admin-expense-category">${escapeHtml(e.category)}</div>
        <div class="admin-expense-amount">$${Number(e.amount).toFixed(2)}</div>
        <button data-expense-id="${e.id}" class="delete-expense" type="button" style="width: auto; padding: 6px 10px; font-size: 0.85rem; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5;">Delete</button>
      `
      expensesList.appendChild(div)
    }

    expensesList.querySelectorAll('.delete-expense').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (!confirm('Delete this expense?')) return
        const expenseId = e.target.dataset.expenseId
        try {
          const res = await fetch(`${API_BASE}/admin/expenses/${expenseId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${getToken()}` }
          })
          if (res.ok) {
            await loadAdminData()
          }
        } catch (err) {
          alert('Failed to delete expense')
        }
      })
    })
  }

  filterMonth.addEventListener('change', renderList)
  
  document.getElementById('adminExportCsv')?.addEventListener('click', () => {
    const rows = [['Date', 'Description', 'Category', 'Amount', 'User']]
    const filter = filterMonth.value
    const filtered = filter ? allExpenses.filter(e => e.date.slice(0, 7) === filter) : allExpenses
    for (const e of filtered) {
      rows.push([e.date, `"${e.desc.replace(/"/g, '""')}"`, e.category, e.amount, e.user_id])
    }
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'all-expenses.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  })

  renderList()
}

async function fetchExpensesFromServer() {
  const token = getToken()
  if (!token) throw new Error('No token')
  const res = await fetch(`${API_BASE}/expenses`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error('Unauthorized')
  return res.json()
}

async function refreshExpenses() {
  try {
    const data = await fetchExpensesFromServer()
    expenses = data.map(x => ({ ...x, amount: Number(x.amount).toFixed(2) }))
    save(expenses)
    backendAvailable = true
  } catch (err) {
    backendAvailable = false
  }
}

async function checkBackend() {
  const token = getToken()
  if (!token) { showAuth(); return }

  try {
    await refreshExpenses()
    if (backendAvailable) {
      currentUser = getUser()
      showApp()
      render()
    } else {
      showAuth('Session expired. Please log in again.')
    }
  } catch (err) {
    showAuth('Session expired. Please log in again.')
  }
}

function escapeHtml(s) { return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') }

async function render() {
  const filter = activeMonthFilter

  if (backendAvailable) {
    try {
      await refreshExpenses()
    } catch (e) {
      backendAvailable = false
    }
  }

  const rows = []
  let sum = 0
  const list = expenses.filter(e => !filter || e.date.slice(5, 7) === filter)
  list.sort((a, b) => b.date.localeCompare(a.date))
  for (const e of list) {
    sum += Number(e.amount)
    const tr = document.createElement('tr')
    tr.innerHTML = `<td>${e.date}</td><td>${escapeHtml(e.desc)}</td><td>${escapeHtml(e.category)}</td><td>$${Number(e.amount).toFixed(2)}</td><td><button class="action-btn" data-id="${e.id}">Delete</button></td>`
    rows.push(tr)
  }

  tableBody.innerHTML = ''
  rows.forEach(r => tableBody.appendChild(r))
  totalEl.textContent = '$' + sum.toFixed(2)
  countEl.textContent = list.length
  const average = list.length ? (sum / list.length).toFixed(2) : '0.00'
  document.getElementById('average').textContent = '$' + average
  updateBudget(sum)
  renderSpendingAnalysis(list, sum)
  renderCharts(list)
}

function updateBudget(spent) {
  budgetTargetEl.textContent = '$' + BUDGET_TARGET.toLocaleString()
  budgetSpentEl.textContent = `$${spent.toFixed(2)} spent`
  const remaining = Math.max(0, BUDGET_TARGET - spent)
  budgetRemainingEl.textContent = `$${remaining.toFixed(2)} left`
  const percent = Math.min(100, (spent / BUDGET_TARGET) * 100)
  budgetFillEl.style.width = `${percent}%`
  if (spent <= BUDGET_TARGET) {
    budgetStatusEl.textContent = 'On track'
    budgetFillEl.style.background = 'linear-gradient(135deg, #34d399, #38bdf8)'
  } else {
    budgetStatusEl.textContent = 'Over budget'
    budgetFillEl.style.background = 'linear-gradient(135deg, #f87171, #fb7185)'
  }
}

function renderSpendingAnalysis(list, totalSpent) {
  const categoryTotals = list.reduce((acc, expense) => {
    acc[expense.category] = (acc[expense.category] || 0) + Number(expense.amount)
    return acc
  }, {})

  const items = []
  const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])
  const topCategory = sortedCategories[0]
  if (topCategory) {
    items.push(`Your highest spend is ${topCategory[0]} with $${topCategory[1].toFixed(2)}.`)
  }

  if (sortedCategories.length > 1) {
    const secondary = sortedCategories[1]
    items.push(`Consider trimming ${secondary[0]} if it is not essential.`)
  }

  if (totalSpent > BUDGET_TARGET) {
    items.push('You are over budget; cut back on non-essential purchases this month.')
  } else if (totalSpent > BUDGET_TARGET * 0.8) {
    items.push('You are close to your budget limit; watch variable costs closely.')
  } else {
    items.push('Spending is within budget; keep focusing on recurring expenses.')
  }

  if (!topCategory) {
    items.push('Add your first expense to get personalized recommendations.')
  }

  analysisList.innerHTML = items.map(text => `<li>${text}</li>`).join('')
}

async function postExpense(item) {
  const token = getToken()
  if (!token) throw new Error('No token')
  return fetch(`${API_BASE}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(item)
  })
}

async function deleteExpense(id) {
  const token = getToken()
  if (!token) throw new Error('No token')
  return fetch(`${API_BASE}/expenses/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  })
}

form.addEventListener('submit', async e => {
  e.preventDefault()
  const date = document.getElementById('date').value
  const desc = document.getElementById('desc').value.trim()
  const amount = parseFloat(document.getElementById('amount').value)
  const category = document.getElementById('category').value
  if (!date || !desc || !amount) return
  const item = { id: uid(), date, desc, amount: amount.toFixed(2), category }

  if (backendAvailable) {
    try {
      const res = await postExpense(item)
      if (res.ok) {
        await render()
        form.reset()
        return
      }
    } catch (e) {
      backendAvailable = false
    }
  }

  expenses.push(item)
  save(expenses)
  form.reset()
  render()
})

tableBody.addEventListener('click', async e => {
  const btn = e.target.closest('button')
  if (!btn) return
  const id = btn.dataset.id
  if (!id) return

  if (backendAvailable) {
    try {
      const res = await deleteExpense(id)
      if (res.ok) {
        await render()
        return
      }
    } catch (e) {
      backendAvailable = false
    }
  }

  expenses = expenses.filter(x => x.id !== id)
  save(expenses)
  render()
})

document.getElementById('clear').addEventListener('click', async () => {
  if (!confirm('Clear all expenses?')) return
  if (backendAvailable) {
    for (const e of expenses) {
      try { await deleteExpense(e.id) } catch (_) {}
    }
    await render()
    return
  }
  expenses = []
  save(expenses)
  render()
})

document.getElementById('export-csv').addEventListener('click', () => {
  const rows = [['date', 'description', 'category', 'amount']]
  const filter = activeMonthFilter
  for (const e of expenses.filter(e => !filter || e.date.slice(0, 7) === filter)) {
    rows.push([e.date, `"${e.desc.replace(/"/g, '""')}"`, e.category, e.amount])
  }
  const csv = rows.map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'expenses.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
})

function renderCharts(list) {
  const byCat = {}
  for (const e of list) {
    byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount)
  }
  const catLabels = Object.keys(byCat)
  const catData = catLabels.map(k => byCat[k])
  const colors = getChartColors(catLabels.length)

  if (window.Chart) {
    const ctx = document.getElementById('summaryChart').getContext('2d')
    if (!summaryChart) {
      summaryChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: catLabels,
          datasets: [{
            label: 'Category spend',
            data: catData,
            backgroundColor: colors,
            borderColor: colors,
            borderWidth: 1,
            borderRadius: 12,
            maxBarThickness: 48
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: varColor('--text') } },
            y: { grid: { color: 'rgba(148, 163, 184, 0.18)' }, ticks: { color: varColor('--muted') } }
          },
          maintainAspectRatio: false
        }
      })
    } else {
      summaryChart.data.labels = catLabels
      summaryChart.data.datasets[0].data = catData
      summaryChart.data.datasets[0].backgroundColor = colors
      summaryChart.data.datasets[0].borderColor = colors
      summaryChart.update()
    }
  }
}

function varColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#e2e8f0'
}

function getChartColors(count) {
  const palette = [
    '#38bdf8',
    '#f472b6',
    '#34d399',
    '#f59e0b',
    '#818cf8',
    '#fb7185',
    '#a78bfa',
    '#22c55e',
    '#f97316',
    '#60a5fa',
    '#facc15',
    '#fb7185'
  ]
  if (count <= palette.length) return palette.slice(0, count)
  return Array.from({ length: count }, (_, index) => palette[index % palette.length])
}

;(async () => {
  await checkBackend()
  if (!backendAvailable) {
    showAuth()
  }
})()

