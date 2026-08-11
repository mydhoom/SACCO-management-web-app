import React from 'react'
import AdminDashboard from './AdminDashboard'
import MemberDashboard from './MemberDashboard'

const Dashboard = () => {
  // 1. Fetch the exact key shown in your screenshot
  const userRole = localStorage.getItem('userRole') || 'member'

  // 2. Traffic Cop Logic: Route to the correct view
  if (userRole === 'admin' || userRole === 'executive') {
    return <AdminDashboard />
  }

  // 3. Render the member view for everyone else
  return <MemberDashboard />
}

export default Dashboard