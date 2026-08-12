import React from 'react'
import { CHeader, CContainer, CHeaderToggler, CHeaderNav } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilMenu } from '@coreui/icons'

import { useSelector, useDispatch } from 'react-redux'
import AppHeaderDropdown from './AppHeaderDropdown' 

const AppHeader = () => {
  const dispatch = useDispatch()
  const sidebarShow = useSelector((state) => state.sidebarShow)

  return (
    <CHeader position="sticky" className="mb-4 py-3" style={{ minHeight: '95px' }}>
      <CContainer fluid>
        
        {/* The Hamburger Menu Icon */}
        <CHeaderToggler 
          className="ps-1"
          aria-label="Toggle navigation"
          onClick={() => dispatch({ type: 'set', sidebarShow: !sidebarShow })}
        >
          <CIcon icon={cilMenu} size="lg" />
        </CHeaderToggler>

        {/* Centered Logo & Modern Header Title */}
        <div className="position-absolute start-50 translate-middle-x d-flex align-items-center" style={{ top: '6px' }}>
          <img 
            src="/logo.png" 
            alt="Mahadev Society Logo" 
            style={{ 
              height: '78px', 
              width: '78px',
              objectFit: 'contain',
              borderRadius: '50%',
              background: '#ffffff',
              padding: '3px',
              boxShadow: '0 6px 16px rgba(30, 60, 114, 0.2)'
            }} 
            className="me-3" 
          />
          <div className="d-flex flex-column justify-content-center">
            <h1 className="m-0 fw-bold" style={{ 
              fontFamily: "'Outfit', 'Poppins', sans-serif", 
              fontWeight: 800,
              fontSize: '2.4rem',
              letterSpacing: '0.8px',
              background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              lineHeight: 1.1
            }}>
              MAHADEV SOCIETY
            </h1>
            <span style={{ 
              fontFamily: "'Poppins', sans-serif", 
              fontSize: '0.95rem', 
              letterSpacing: '1.2px',
              color: '#444',
              fontWeight: 600,
              textTransform: 'uppercase',
              marginTop: '2px'
            }}>
              HPSEBL Shimla — Employees Co-operative
            </span>
          </div>
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