import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  CAvatar,
  CDropdown,
  CDropdownDivider,
  CDropdownHeader,
  CDropdownItem,
  CDropdownMenu,
  CDropdownToggle,
  CAlert,
} from '@coreui/react'
import { cilSettings, cilUser, cilAccountLogout } from '@coreui/icons'
import CIcon from '@coreui/icons-react'

import avatar8 from './../../assets/images/avatars/8.jpg'

const AppHeaderDropdown = () => {
  const navigate = useNavigate()
  const location = useLocation()

  const [profileData, setProfileData] = useState({
    name: 'HPSEBL Member',
    avatar: avatar8,
  })

  const [sessionExpiredBanner, setSessionExpiredBanner] = useState(false)

  const loadProfileData = () => {
    const savedName = localStorage.getItem('userName')
    const savedAvatar = localStorage.getItem('userAvatar')
    setProfileData({
      name: savedName || 'HPSEBL Member',
      avatar: savedAvatar || avatar8,
    })
  }

  useEffect(() => {
    loadProfileData()
    window.addEventListener('profileUpdated', loadProfileData)
    return () => window.removeEventListener('profileUpdated', loadProfileData)
  }, [])

  // Show "Session Expired" banner when redirected with ?reason=timeout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('reason') === 'timeout') {
      setSessionExpiredBanner(true)
    }
  }, [location])

  const handleLogout = (e) => {
    e.preventDefault()
    localStorage.removeItem('adminToken')
    localStorage.removeItem('token')
    localStorage.removeItem('userName')
    localStorage.removeItem('userAvatar')
    navigate('/login')
  }

  return (
    <>
      {sessionExpiredBanner && (
        <CAlert
          color="warning"
          className="mb-0 py-1 px-3 rounded-0 text-center"
          style={{ fontSize: '0.82rem', borderBottom: '2px solid #f59e0b' }}
          dismissible
          onClose={() => setSessionExpiredBanner(false)}
        >
          ⏱ Your session expired due to inactivity. Please log in again.
        </CAlert>
      )}

      <CDropdown variant="nav-item">
        <CDropdownToggle
          placement="bottom-end"
          className="py-0 d-flex align-items-center"
          caret={false}
          style={{ cursor: 'pointer' }}
        >
          <span className="me-2 fw-semibold text-decoration-none" style={{ color: 'inherit' }}>
            {profileData.name}
          </span>
          <CAvatar src={profileData.avatar} size="md" alt="User Profile" />
        </CDropdownToggle>

        <CDropdownMenu className="pt-0" placement="bottom-end">
          <CDropdownHeader className="bg-light fw-semibold py-2">Account</CDropdownHeader>

          <CDropdownItem href="#/profile">
            <CIcon icon={cilUser} className="me-2" />
            Profile
          </CDropdownItem>

          {/* Settings now links to the actual system settings page */}
          <CDropdownItem href="#/system/settings">
            <CIcon icon={cilSettings} className="me-2" />
            Settings
          </CDropdownItem>

          <CDropdownDivider />

          <CDropdownItem
            onClick={handleLogout}
            style={{ cursor: 'pointer' }}
            className="text-danger fw-semibold"
          >
            <CIcon icon={cilAccountLogout} className="me-2" />
            Logout
          </CDropdownItem>
        </CDropdownMenu>
      </CDropdown>
    </>
  )
}

export default AppHeaderDropdown