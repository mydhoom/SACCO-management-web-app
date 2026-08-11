import React from 'react'
import { CSidebar, CSidebarBrand, CSidebarNav, CSidebarToggler } from '@coreui/react'
import { useSelector, useDispatch } from 'react-redux'
import { AppSidebarNav } from './AppSidebarNav'
import getNavItems from '../_nav' 

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
    >
      <CSidebarBrand className="d-none d-md-flex align-items-center" to="/" style={{ textDecoration: 'none', padding: '1rem', background: '#1e3c72' }}>
        <img src="/logo.png" alt="Logo" style={{ height: '40px', width: '40px', marginRight: '10px', borderRadius: '50%', objectFit: 'cover', background: 'white' }} />
        <h6 className="m-0 text-white fw-bold">MAHADEV SOCIETY</h6>
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