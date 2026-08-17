import React from 'react'
import { CSidebar, CSidebarBrand, CSidebarNav, CSidebarToggler } from '@coreui/react'
import { useSelector, useDispatch } from 'react-redux'
import { AppSidebarNav } from './AppSidebarNav'
import getNavItems from '../_nav'
import CIcon from '@coreui/icons-react'
import { cilSpeedometer } from '@coreui/icons'

const AppSidebar = () => {
  const dispatch = useDispatch()
  const unfoldable = useSelector((state) => state.sidebarUnfoldable)
  const sidebarShow = useSelector((state) => state.sidebarShow)

  const userRole = localStorage.getItem('userRole') || 'member'
  const navigation = getNavItems(userRole)

  return (
    <CSidebar
      position="fixed"
      colorScheme="dark"
      unfoldable={unfoldable}
      visible={sidebarShow}
      onVisibleChange={(visible) => {
        dispatch({ type: 'set', sidebarShow: visible })
      }}
      style={{ '--cui-sidebar-bg': 'var(--app-sidebar-bg, #1c2536)' }}
    >
      {/* Brand: full name when expanded, compact emblem when narrow */}
      <CSidebarBrand
        className="d-none d-md-flex align-items-center"
        to="/"
        style={{
          textDecoration: 'none',
          padding: unfoldable ? '0.75rem 0' : '1rem',
          background: 'var(--app-primary-gradient, linear-gradient(135deg, #1e3c72 0%, #2a5298 100%))',
          justifyContent: unfoldable ? 'center' : 'flex-start',
          minHeight: '64px',
          overflow: 'hidden',
          transition: 'all 0.3s ease',
        }}
      >
        <img
          src="/logo.png"
          alt="Logo"
          style={{
            height: unfoldable ? '36px' : '38px',
            width: unfoldable ? '36px' : '38px',
            marginRight: unfoldable ? '0' : '10px',
            borderRadius: '50%',
            objectFit: 'cover',
            background: 'white',
            flexShrink: 0,
            transition: 'all 0.3s ease',
          }}
        />
        {!unfoldable && (
          <h6 className="m-0 text-white fw-bold" style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
            MAHADEV SOCIETY
          </h6>
        )}
      </CSidebarBrand>

      <CSidebarNav>
        <AppSidebarNav items={navigation} />
      </CSidebarNav>

      <CSidebarToggler
        className="d-none d-lg-flex"
        onClick={() => dispatch({ type: 'set', sidebarUnfoldable: !unfoldable })}
      />
    </CSidebar>
  )
}

export default React.memo(AppSidebar)