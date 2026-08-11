import React from 'react'
import { CHeader, CContainer, CHeaderToggler, CHeaderNav } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilMenu } from '@coreui/icons'

// 1. We import the beautiful Avatar dropdown file you just showed me!
import AppHeaderDropdown from './AppHeaderDropdown' 

const AppHeader = () => {
  return (
    <CHeader position="sticky" className="mb-4">
      <CContainer fluid>
        
        {/* The Hamburger Menu Icon */}
        <CHeaderToggler className="ps-1">
          <CIcon icon={cilMenu} size="lg" />
        </CHeaderToggler>

        {/* Centered Logo & Cursive Text */}
        <div className="position-absolute start-50 translate-middle-x d-flex align-items-center" style={{ top: '10px' }}>
          <img src="/logo.png" alt="Mahadev Society Logo" height="42" className="me-2 drop-shadow" />
          <h2 className="m-0 text-primary" style={{ fontFamily: "'Great Vibes', cursive", fontWeight: 'bold' }}>
            Mahadev Society
          </h2>
        </div>

        {/* 2. We inject the Dropdown here instead of the flat text */}
        <CHeaderNav className="ms-auto">
          <AppHeaderDropdown />
        </CHeaderNav>

      </CContainer>
    </CHeader>
  )
}

export default AppHeader