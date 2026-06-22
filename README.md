# Expense Tracker

Expense data is stored in SQLite when the backend is running. If the backend is unavailable, the app falls back to browser `localStorage`.

Run (frontend-only):

Open `index.html` in your browser (double-click or serve via a static server).

Run (with backend sync):

1. Install dependencies:

```bash
cd "Web App"
npm install
```

2. Start server:

```bash
npm start
```

This will start an Express server on port 3000 and serve the static frontend. The backend stores inputs in SQLite and writes a JSON backup file at `expenses-backup.json` for extra persistence. The app will try to use the backend for sync when available and fall back to localStorage when not.

Features:
- Add expenses (date, description, category, amount)
- Persist input data to SQLite via backend API when available
- Backup all expense rows into `expenses-backup.json`
- Filter by month
- Delete individual expenses or clear all
- Export visible entries to CSV
- LocalStorage fallback for offline use
- **Admin Portal** (when logged in as admin):
  - View all users and their accounts
  - Promote/demote users to admin
  - Delete user accounts
  - View all expenses across the system
  - Delete any expense
  - Export all expenses to CSV

Admin Setup:

To make a user an admin, you need to manually update the database:

```bash
sqlite3 expenses.db "UPDATE users SET is_admin = 1 WHERE email = 'user@example.com';"
```

After updating, the user can log in and will see the "Admin Portal" button in the top right. The admin portal provides system-wide management of users and all logged expenses.

Next steps:
- Add a UI to promote users to admin (instead of manual database updates)
- Add password reset functionality
- Add expense categories customization per user
