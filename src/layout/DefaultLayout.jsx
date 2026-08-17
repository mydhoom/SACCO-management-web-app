/**
 * DefaultLayout Component
 *
 * Main application layout wrapper with:
 * - AppSidebar, AppHeader, AppContent, AppFooter
 * - AiAssistant floating on every page
 * - InactivityTimer for auto-logout on 5 min idle
 * - Stored color theme applied on mount
 */

import React, { useEffect } from 'react'
import { AppContent, AppSidebar, AppFooter } from '../components/index'
import AppHeader from '../components/header/AppHeader'
import AiAssistant from '../components/AiAssistant/AiAssistant'
import InactivityTimer from '../components/InactivityTimer'
import { applyColorTheme, getStoredTheme } from '../utils/themeManager'

const DefaultLayout = () => {
  // Apply saved color theme on every layout mount
  useEffect(() => {
    const stored = getStoredTheme()
    applyColorTheme(stored.id)
  }, [])

  return (
    <div>
      <AppSidebar />
      <div className="wrapper d-flex flex-column min-vh-100">
        <AppHeader />
        <div className="body flex-grow-1">
          <AppContent />
        </div>
        <AppFooter />
      </div>
      {/* AI Financial Assistant — floating on every page */}
      <AiAssistant />
      {/* Auto-logout on 5 minutes of inactivity */}
      <InactivityTimer />
    </div>
  )
}

export default DefaultLayout
