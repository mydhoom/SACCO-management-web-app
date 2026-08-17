import React from 'react'
import { CNavItem, CNavTitle, CNavGroup } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { 
  cilDescription, cilSpeedometer, cilBriefcase, cilWallet, cilMoney, 
  cilFolderOpen, cilPeople, cilCloudUpload, cilUserPlus,
  cilBank, cilChartPie, cilCheckCircle, cilSpreadsheet, cilSettings,
  cilTrash, cilBook, cilPencil, cilWarning
} from '@coreui/icons'

const getNavItems = (currentUserRole) => [
  // ==========================================
  // EVERYONE: DASHBOARD
  // ==========================================
  {
    component: CNavItem,
    name: 'Dashboard',
    to: '/dashboard',
    icon: <CIcon icon={cilSpeedometer} customClassName="nav-icon" />,
  },

  // ==========================================
  // MEMBER ONLY: SECURE MEMBER FINANCIALS
  // ==========================================
  ...(currentUserRole === 'member' ? [
    {
      component: CNavTitle,
      name: 'My Financials',
    },
    {
      component: CNavGroup,
      name: 'My Passbooks',
      icon: <CIcon icon={cilFolderOpen} customClassName="nav-icon" />,
      items: [
        { component: CNavItem, name: 'RD & Savings Passbook', to: '/my-accounts/rd-passbook' },
        { component: CNavItem, name: 'Loan Statement', to: '/my-accounts/loan-statement' },
      ],
    },
    {
      component: CNavItem,
      name: 'Apply for a Loan',
      to: '/my-accounts/loan-calculator',
      icon: <CIcon icon={cilMoney} customClassName="nav-icon" />,
    }
  ] : []),

  // ==========================================
  // ADMIN & EXECUTIVE ONLY
  // ==========================================
  ...(currentUserRole === 'admin' || currentUserRole === 'executive' ? [
    {
      component: CNavTitle,
      name: 'Administration',
    },
    {
      component: CNavItem,
      name: 'Member 360 Monitor',
      to: '/admin/member-360',
      icon: <CIcon icon={cilPeople} customClassName="nav-icon" />,
      badge: { color: 'info', text: 'Live' },
    },
    {
      component: CNavItem,
      name: 'Pending Approvals',
      to: '/admin/approvals',
      icon: <CIcon icon={cilUserPlus} customClassName="nav-icon" />,
      badge: { color: 'danger', text: 'New' },
    },
    // ADD THIS NEW BUTTON RIGHT HERE:
    {
      component: CNavItem,
      name: 'Financial Clearances',
      to: '/admin/clearances',
      icon: <CIcon icon={cilCheckCircle} customClassName="nav-icon" />,
      badge: { color: 'warning', text: 'Action' },
    },
    {
      component: CNavItem,
      name: 'Master Journal',
      to: '/admin/master-journal',
      icon: <CIcon icon={cilBriefcase} customClassName="nav-icon" />,
    },
    // MOVED FROM MEMBER VIEW: Global Society Data
    {
      component: CNavItem,
      name: 'Global Share & Savings',
      to: '/accounts/shares',
      icon: <CIcon icon={cilWallet} customClassName="nav-icon" />,
    },
    {
      component: CNavItem,
      name: 'Global Active Loans',
      to: '/accounts/loans',
      icon: <CIcon icon={cilBank} customClassName="nav-icon" />,
    },
    {
      component: CNavItem,
      name: 'Society Directory',
      to: '/admin/directory',
      icon: <CIcon icon={cilPeople} customClassName="nav-icon" />,
    },
    {
      component: CNavGroup,
      name: 'Loan Operations',
      icon: <CIcon icon={cilBank} customClassName="nav-icon" />,
      items: [
        { component: CNavItem, name: 'Process New Loans', to: '/loan-operations/process' },
        { component: CNavItem, name: 'Defaulter Management', to: '/loan-operations/defaulters' },
        { component: CNavItem, name: 'Restructure & Adjust', to: '/loan-operations/restructure' },
      ],
    },
    {
      component: CNavGroup,
      name: 'Capital & Dividends',
      icon: <CIcon icon={cilChartPie} customClassName="nav-icon" />,
      items: [
        { component: CNavItem, name: 'Deposits & Withdrawals', to: '/capital/deposits-withdrawals' },
        { component: CNavItem, name: 'Dividend & Incentive Engine', to: '/capital/incentive-engine' },
        { component: CNavItem, name: 'Year-End Processing', to: '/financials/year-end' },
      ],
    },
    {
      component: CNavTitle,
      name: 'ACCOUNTING & LEDGER',
    },
    // ---> ADDED: CASHBOOK NAV ITEM <---
    {
      component: CNavItem,
      name: 'Master Cashbook',
      to: '/accounting/cashbook',
      icon: <CIcon icon={cilBook} customClassName="nav-icon" />,
    },
    {
      component: CNavItem,
      name: 'Bank Reconciliation',
      to: '/accounting/bank-reconciliation',
      icon: <CIcon icon={cilCheckCircle} customClassName="nav-icon" />,
    },
    {
        component: CNavItem,
        name: 'Demand Sheet (Payroll)', // <--- ADD THIS HERE
        to: '/accounting/demand-sheet',
        icon: <CIcon icon={cilSpreadsheet} customClassName="nav-icon" />,
      },
    {
      component: CNavItem,
      name: 'Financial Statements',
      to: '/accounting/financial-statements',
      icon: <CIcon icon={cilSpreadsheet} customClassName="nav-icon" />,
    },
    {
      component: CNavItem,
      name: 'Reports Generation',
      to: '/accounting/reports',
      icon: <CIcon icon={cilDescription} customClassName="nav-icon" />,
    },
    {
      component: CNavItem,
      name: 'Correction Manager',
      to: '/accounting/correction-manager',
      icon: <CIcon icon={cilPencil} customClassName="nav-icon" />,
    }
  ] : []),

  // ==========================================
  // ADMIN ONLY: SYSTEM & AUTOMATION
  // ==========================================
  ...(currentUserRole === 'admin' ? [
    {
      component: CNavTitle,
      name: 'SYSTEM & DATA',
    },
    {
      component: CNavItem,
      name: 'Update Data',
      to: '/admin/upload',
      icon: <CIcon icon={cilCloudUpload} customClassName="nav-icon" />,
    },
    {
      component: CNavItem,
      name: 'Duplicate Review',
      to: '/admin/duplicate-review',
      icon: <CIcon icon={cilWarning} customClassName="nav-icon text-warning" />,
    },
    {
      component: CNavItem,
      name: 'System Settings',
      to: '/system/settings',
      icon: <CIcon icon={cilSettings} customClassName="nav-icon" />,
    },
    // --- NEW: Data Purge Utility ---
    {
      component: CNavItem,
      name: 'Database Purge',
      to: '/admin/database-purge',
      icon: <CIcon icon={cilTrash} customClassName="nav-icon text-danger" />,
    }
  ] : [])
]

export default getNavItems