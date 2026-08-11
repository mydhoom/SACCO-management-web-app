import React, { useState, useRef } from 'react';
import { hpseblOrgStructure } from '../../utils/hpseblStructure';
// Import icons for our new buttons
import CIcon from '@coreui/icons-react';
import { cilImage, cilCamera } from '@coreui/icons';

// Using the default avatar as a placeholder until they upload one
import avatar8 from './../../assets/images/avatars/8.jpg'; 

const UserProfile = () => {
  // --- 1. STATE MANAGEMENT ---
  const [formData, setFormData] = useState({
    phone: '',
    address: '',
    designation: '',
    circle: '',
    division: '',
    subDivision: '',
    bankName: '',
    branchName: '',
    accountNumber: '',
    ifscCode: ''
  });

  // New state to hold the currently displayed photo
  const [previewPhoto, setPreviewPhoto] = useState(avatar8);
  const [photoFile, setPhotoFile] = useState(null); // This holds the actual file for the server later

  const [message, setMessage] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);

  // References to connect our custom buttons to the hidden file inputs
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // --- 2. CASCADING DROPDOWN LOGIC ---
  const circles = Object.keys(hpseblOrgStructure);
  const divisions = formData.circle ? Object.keys(hpseblOrgStructure[formData.circle]) : [];
  const subDivisions = formData.division && formData.circle ? hpseblOrgStructure[formData.circle][formData.division] : [];

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleCircleChange = (e) => {
    setFormData({ ...formData, circle: e.target.value, division: '', subDivision: '' });
  };

  const handleDivisionChange = (e) => {
    setFormData({ ...formData, division: e.target.value, subDivision: '' });
  };

  // --- 3. PHOTO HANDLING LOGIC ---
  const handlePhotoSelection = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPhotoFile(file); // Save file for the backend upload later
      
      // Create a temporary local URL to show a preview immediately
      const imageUrl = URL.createObjectURL(file);
      setPreviewPhoto(imageUrl);
    }
  };

  // --- 4. RAZORPAY IFSC MAGIC ---
  const handleIfscChange = async (e) => {
    const code = e.target.value.toUpperCase();
    setFormData((prev) => ({ ...prev, ifscCode: code }));

    if (code.length === 11) {
      try {
        const response = await fetch(`https://ifsc.razorpay.com/${code}`);
        if (response.ok) {
          const data = await response.json();
          setFormData((prev) => ({
            ...prev,
            bankName: data.BANK,
            branchName: data.BRANCH
          }));
          setMessage({ type: 'success', text: 'Bank details auto-filled successfully!' });
        } else {
          setMessage({ type: 'danger', text: 'Invalid IFSC Code. Please check again.' });
        }
      } catch (error) {
        console.error("Error fetching IFSC details:", error);
      }
    }
  };

  // --- 5. FORM SUBMISSION WITH CLOUDINARY ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage({ type: '', text: '' });

    try {
      let finalImageUrl = previewPhoto; // Default to existing photo if they didn't pick a new one

      // --- CLOUDINARY UPLOAD BLOCK ---
      if (photoFile) {
        const imageFormData = new FormData();
        imageFormData.append("file", photoFile);
        
        // PASTE YOUR PRESET NAME AND CLOUD NAME HERE:
        imageFormData.append("upload_preset", "ml_default"); 
        imageFormData.append("cloud_name", "wh9h0wvu");

        // Upload directly to Cloudinary
        const cloudinaryRes = await fetch("https://api.cloudinary.com/v1_1/wh9h0wvu/image/upload", {
          method: "POST",
          body: imageFormData,
        });

        const cloudData = await cloudinaryRes.json();
        
        if (cloudData.secure_url) {
          finalImageUrl = cloudData.secure_url; // Grab the permanent URL!
        } else {
          throw new Error("Failed to upload image to cloud.");
        }
      }

      // --- BACKEND SUBMISSION BLOCK ---
      const token = localStorage.getItem('token'); 
      
      // Combine the existing form data with the new permanent image URL
      const payload = {
        ...formData,
        profilePictureUrl: finalImageUrl // FIX: Matched exactly to the backend schema name
      };

      const response = await fetch('http://localhost:5000/api/auth/profile/update', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: 'Profile and photo updated successfully!' });
        // --- NEW: Save the updated data and broadcast the signal to the Header ---
        localStorage.setItem('userName', data.user.name);
        localStorage.setItem('userAvatar', data.user.profilePictureUrl);
        window.dispatchEvent(new Event('profileUpdated'));
      } else {
        setMessage({ type: 'danger', text: data.message || 'Error updating profile.' });
      }
    } catch (error) {
      console.error("Submission error:", error);
      setMessage({ type: 'danger', text: 'Server error. Please try again later.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mt-4">
      <div className="card shadow-sm">
        <div className="card-header bg-primary text-white">
          <h4 className="mb-0">Update Member Profile</h4>
        </div>
        <div className="card-body">
          {message.text && (
            <div className={`alert alert-${message.type}`} role="alert">
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            
            {/* --- PROFILE PHOTO SECTION --- */}
            <div className="d-flex flex-column align-items-center mb-4 pb-4 border-bottom">
              <img 
                src={previewPhoto} 
                alt="Profile Preview" 
                className="rounded-circle mb-3 shadow-sm" 
                style={{ width: '130px', height: '130px', objectFit: 'cover', border: '3px solid #dee2e6' }} 
              />
              
              {/* Hidden Inputs */}
              <input type="file" accept="image/*" ref={galleryInputRef} className="d-none" onChange={handlePhotoSelection} />
              <input type="file" accept="image/*" capture="user" ref={cameraInputRef} className="d-none" onChange={handlePhotoSelection} />

              <div className="d-flex gap-2">
                <button type="button" className="btn btn-outline-primary btn-sm px-3" onClick={() => galleryInputRef.current.click()}>
                  <CIcon icon={cilImage} className="me-1" /> Gallery
                </button>
                <button type="button" className="btn btn-outline-secondary btn-sm px-3" onClick={() => cameraInputRef.current.click()}>
                  <CIcon icon={cilCamera} className="me-1" /> Camera
                </button>
              </div>
            </div>

            {/* --- PERSONAL DETAILS --- */}
            <h5 className="mb-3 text-secondary border-bottom pb-2">Personal Details</h5>
            <div className="row mb-4">
              <div className="col-md-6 mb-3">
                <label className="form-label">Phone Number</label>
                <input type="text" className="form-control" name="phone" value={formData.phone} onChange={handleInputChange} placeholder="Enter 10-digit mobile number" />
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Home Address</label>
                <input type="text" className="form-control" name="address" value={formData.address} onChange={handleInputChange} placeholder="Enter full residential address" />
              </div>
            </div>

            {/* --- PROFESSIONAL DETAILS --- */}
            <h5 className="mb-3 text-secondary border-bottom pb-2">Professional Details</h5>
            <div className="row mb-4">
              <div className="col-md-6 mb-3">
                <label className="form-label">Designation</label>
                <input type="text" className="form-control bg-light text-muted" name="designation" value={formData.designation} readOnly placeholder="e.g., Junior Engineer, Foreman" />
              </div>
              
              <div className="col-md-6 mb-3">
                <label className="form-label">Operation Circle</label>
                <select className="form-select bg-light text-muted" name="circle" value={formData.circle} disabled>
                  <option value="">Select Circle...</option>
                  {circles.map(circle => (
                    <option key={circle} value={circle}>{circle}</option>
                  ))}
                </select>
              </div>

              <div className="col-md-6 mb-3">
                <label className="form-label">Division</label>
                <select className="form-select bg-light text-muted" name="division" value={formData.division} disabled>
                  <option value="">Select Division...</option>
                  {divisions.map(div => (
                    <option key={div} value={div}>{div}</option>
                  ))}
                </select>
              </div>

              <div className="col-md-6 mb-3">
                <label className="form-label">Sub-Division</label>
                <select className="form-select bg-light text-muted" name="subDivision" value={formData.subDivision} disabled>
                  <option value="">Select Sub-Division...</option>
                  {subDivisions.map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* --- BANKING DETAILS --- */}
            <h5 className="mb-3 text-secondary border-bottom pb-2">Banking Details</h5>
            <div className="row mb-4">
              <div className="col-md-6 mb-3">
                <label className="form-label">IFSC Code <small className="text-muted">(Auto-fills Bank & Branch)</small></label>
                <input type="text" className="form-control text-uppercase" name="ifscCode" value={formData.ifscCode} onChange={handleIfscChange} placeholder="e.g., SBIN0000718" maxLength="11" />
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Account Number</label>
                <input type="text" className="form-control" name="accountNumber" value={formData.accountNumber} onChange={handleInputChange} placeholder="Enter account number" />
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Bank Name</label>
                <input type="text" className="form-control bg-light text-dark" style={{ color: '#000', fontWeight: '500' }} name="bankName" value={formData.bankName} readOnly placeholder="Auto-filled from IFSC" />
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Branch Name</label>
                <input type="text" className="form-control bg-light text-dark" style={{ color: '#000', fontWeight: '500' }} name="branchName" value={formData.branchName} readOnly placeholder="Auto-filled from IFSC" />
              </div>
            </div>

            <div className="d-flex justify-content-end">
              <button type="submit" className="btn btn-primary px-4" disabled={isLoading}>
                {isLoading ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
