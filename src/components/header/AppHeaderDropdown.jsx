import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CAvatar,
  CDropdown,
  CDropdownDivider,
  CDropdownHeader,
  CDropdownItem,
  CDropdownMenu,
  CDropdownToggle,
} from '@coreui/react'
import {
  cilSettings,
  cilUser,
  cilAccountLogout,
} from '@coreui/icons'
import CIcon from '@coreui/icons-react'

import avatar8 from './../../assets/images/avatars/8.jpg'

const AppHeaderDropdown = () => {
  const navigate = useNavigate();
  
  // 1. Set up state to hold the name and avatar
  const [profileData, setProfileData] = useState({
    name: "HPSEBL Member",
    avatar: avatar8
  });

  // 2. Function to load data from Local Storage
  const loadProfileData = () => {
    const savedName = localStorage.getItem('userName');
    const savedAvatar = localStorage.getItem('userAvatar');
    
    setProfileData({
      name: savedName || "HPSEBL Member", // Fallback name
      avatar: savedAvatar || avatar8      // Fallback avatar
    });
  };

  // 3. Run this when the header loads AND whenever a photo is uploaded
  useEffect(() => {
    loadProfileData(); 
    
    // Listen for our custom broadcast signal from the Profile page
    window.addEventListener('profileUpdated', loadProfileData);
    
    // Cleanup listener when component closes
    return () => window.removeEventListener('profileUpdated', loadProfileData);
  }, []);

  return (
    <CDropdown variant="nav-item">
      
      <CDropdownToggle placement="bottom-end" className="py-0 d-flex align-items-center" caret={false} style={{ cursor: 'pointer' }}>
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
        
        <CDropdownItem href="#">
          <CIcon icon={cilSettings} className="me-2" />
          Settings
        </CDropdownItem>
        
        <CDropdownDivider />
        
        <CDropdownItem 
          onClick={(e) => {
            e.preventDefault();
            // Clear all tokens and profile data on logout
            localStorage.removeItem('adminToken');
            localStorage.removeItem('token');
            localStorage.removeItem('userName');
            localStorage.removeItem('userAvatar');
            navigate('/login'); 
          }}
          style={{ cursor: 'pointer' }}
          className="text-danger fw-semibold"
        >
          <CIcon icon={cilAccountLogout} className="me-2" />
          Logout
        </CDropdownItem>
        
      </CDropdownMenu>
    </CDropdown>
  )
}

export default AppHeaderDropdown