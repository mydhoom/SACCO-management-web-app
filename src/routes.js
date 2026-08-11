import React, { lazy } from 'react'

// --- Direct Imports (critical components that should load immediately) ---
import Approvals from './views/admin/Approvals.jsx'
import MyPassbooks from './views/members/MyPassbooks'

// --- Lazy Imports (non-critical, load on demand) ---
const Member360Monitor = lazy(() => import('./views/admin/Member360Monitor.jsx'))
const AdminClearanceDashboard = lazy(() => import('./views/admin/AdminClearanceDashboard.jsx'))
const MasterJournal = lazy(() => import('./views/admin/MasterJournal'))
const Dashboard = lazy(() => import('./views/dashboard/Dashboard'))
const ShareSavings = lazy(() => import('./views/accounts/ShareSavings.jsx'))
const ActiveLoans = lazy(() => import('./views/accounts/ActiveLoans.jsx'))
const SocietyDirectory = lazy(() => import('./views/members/MembersDirectory.jsx'))
const UpdateData = lazy(() => import('./views/admin/UpdateData.jsx'))
const UserProfile = lazy(() => import('./views/accounts/UserProfile'))
const YearEndProcessing = lazy(() => import('./views/financials/YearEndProcessing'))

// --- Financials & Member Tools ---
const LoanCalculator = lazy(() => import('./views/financials/LoanCalculator'))

// --- Core Administration ---
const ProcessLoans = lazy(() => import('./views/loan-operations/ProcessLoans.jsx'))
const RestructureLoans = lazy(() => import('./views/loan-operations/RestructureLoans.jsx'))
const DefaulterDashboard = lazy(() => import('./views/admin/DefaulterDashboard.jsx'))
const DepositsWithdrawals = lazy(() => import('./views/capital/DepositsWithdrawals'))
const IncentiveEngine = lazy(() => import('./views/capital/IncentiveEngine'))

// --- Accounting & Ledger ---
const BankReconciliation = lazy(() => import('./views/pages/BankReconciliation'))
const FinancialStatements = lazy(() => import('./views/accounting/FinancialStatements'))
const ReportsGeneration = lazy(() => import('./views/accounting/ReportsGeneration'))
const Cashbook = lazy(() => import('./components/Cashbook.jsx'))
const DemandSheet = lazy(() => import('./views/accounting/DemandSheet'))
const CorrectionManager = lazy(() => import('./views/admin/CorrectionManager.jsx'))

// --- System & Admin Utilities ---
const SystemSettings = lazy(() => import('./views/system/SystemSettings'))
const DatabasePurge = lazy(() => import('./views/admin/DatabasePurge.jsx'))

// --- ROUTES CONFIG ---
export const routes = [
  { path: '/', exact: true, name: 'Home' },
  { path: '/dashboard', name: 'Dashboard', element: Dashboard },

  // Accounts & Financials
  { path: '/accounts/shares', name: 'Share & Savings', element: ShareSavings },
  { path: '/accounts/loans', name: 'Active Loans', element: ActiveLoans },
  { path: '/profile', name: 'My Profile', element: UserProfile },
  { path: '/financials/year-end', name: 'Year-End Processing', element: YearEndProcessing },

  // Member Tools
  { path: '/my-accounts/passbooks', name: 'My Passbooks', element: MyPassbooks },
  { path: '/my-accounts/rd-passbook', name: 'RD Passbook', element: MyPassbooks },
  { path: '/my-accounts/loan-statement', name: 'Loan Statement', element: MyPassbooks },
  { path: '/my-accounts/loan-calculator', name: 'Loan Calculator', element: LoanCalculator },

  // Administration
  { path: '/admin/member-360', name: 'Member 360 Monitor', element: Member360Monitor },
  { path: '/admin/clearances', name: 'Financial Clearances', element: AdminClearanceDashboard },
  { path: '/admin/directory', name: 'Society Directory', element: SocietyDirectory },
  { path: '/admin/upload', name: 'Update Data', element: UpdateData },
  { path: '/admin/approvals', name: 'Pending Approvals', element: Approvals },
  { path: '/admin/master-journal', name: 'Master Journal', element: MasterJournal },
  { path: '/admin/database-purge', name: 'Database Purge Utility', element: DatabasePurge },

  // Loan Operations
  { path: '/loan-operations/process', name: 'Process Loans', element: ProcessLoans },
  { path: '/loan-operations/defaulters', name: 'Defaulter Management', element: DefaulterDashboard },
  { path: '/loan-operations/restructure', name: 'Restructure Loans', element: RestructureLoans },

  // Capital Management
  { path: '/capital/deposits-withdrawals', name: 'Deposits & Withdrawals', element: DepositsWithdrawals },
  { path: '/capital/incentive-engine', name: 'Incentive Engine', element: IncentiveEngine },

  // Accounting & Ledger
  { path: '/accounting/cashbook', name: 'Master Cashbook', element: Cashbook },
  { path: '/accounting/bank-reconciliation', name: 'Bank Reconciliation', element: BankReconciliation },
  { path: '/accounting/financial-statements', name: 'Financial Statements', element: FinancialStatements },
  { path: '/accounting/reports', name: 'Reports Generation', element: ReportsGeneration },
  { path: '/accounting/demand-sheet', name: 'Demand Sheet', element: DemandSheet },
  { path: '/accounting/correction-manager', name: 'Correction Manager', element: CorrectionManager },

  // System
  { path: '/system/settings', name: 'System Settings', element: SystemSettings }
]

export default routes
