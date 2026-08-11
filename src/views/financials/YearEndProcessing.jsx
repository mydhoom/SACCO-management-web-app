import React, { useState } from 'react'
import {
  CCard, CCardBody, CCardHeader, CCol, CRow, CButton, CFormInput, CFormSelect,
  CAlert, CSpinner, CTable, CTableHead, CTableRow, CTableHeaderCell, CTableBody, CTableDataCell
} from '@coreui/react'

const YearEndProcessing = () => {
  const [engineType, setEngineType] = useState('dividend')
  const [financialYear, setFinancialYear] = useState('')
  const [percentage, setPercentage] = useState('')
  
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [draftData, setDraftData] = useState(null)

  // ==========================================
  // MAKER: Generate Draft Batch
  // ==========================================
  const handleGenerateDraft = async () => {
    if (!financialYear) {
      setMessage({ type: 'danger', text: 'Financial Year is required.' })
      return
    }
    if (engineType === 'dividend' && !percentage) {
      setMessage({ type: 'danger', text: 'Dividend Percentage is required.' })
      return
    }

    setLoading(true)
    setMessage(null)
    setDraftData(null)

    try {
      const queryParams = new URLSearchParams({ financialYear })
      if (engineType === 'dividend') queryParams.append('dividendPercentage', percentage)

      const token = localStorage.getItem('adminToken') || localStorage.getItem('token') // Added fallback token check
      
      // The 's' automatically pluralizes to 'dividends', 'incentives', or 'interests'
      const response = await fetch(`http://localhost:5000/api/${engineType}s/draft?${queryParams.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (response.ok) {
        setDraftData(data)
        setMessage({ type: 'info', text: data.message })
      } else {
        setMessage({ type: 'danger', text: data.message || data.error })
      }
    } catch (error) {
      setMessage({ type: 'danger', text: 'Error connecting to the server.' })
    } finally {
      setLoading(false)
    }
  }

  // ==========================================
  // CHECKER: Approve & Post Batch
  // ==========================================
  const handleApproveAndPost = async () => {
    if (!window.confirm(`Are you sure you want to permanently post Batch ${draftData.batchId} to the Master Journal?`)) return

    setLoading(true)
    setMessage(null)

    try {
      const token = localStorage.getItem('adminToken') || localStorage.getItem('token')
      const response = await fetch(`http://localhost:5000/api/${engineType}s/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          batchId: draftData.batchId,
          transactions: draftData.fullBatch // Sending the full payload back to the checker!
        })
      })

      const data = await response.json()

      if (response.ok) {
        setMessage({ type: 'success', text: data.message })
        setDraftData(null) // Clear the screen on success
      } else {
        setMessage({ type: 'danger', text: data.message || data.error })
      }
    } catch (error) {
      setMessage({ type: 'danger', text: 'Error connecting to the server.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <CRow>
      <CCol xs={12}>
        <CCard className="mb-4">
          <CCardHeader>
            <strong>Year-End Processing</strong> <small>Maker-Checker Engine</small>
          </CCardHeader>
          <CCardBody>
            <p className="text-medium-emphasis small">
              Generate calculation drafts for society-wide dividends, share incentives, or RD interests. Drafts must be reviewed before final posting to the Master Journal.
            </p>

            {message && (
              <CAlert color={message.type} dismissible>
                {message.text}
              </CAlert>
            )}

            <div className="d-flex flex-wrap gap-3 align-items-end mb-4 bg-light p-3 rounded">
              <div>
                <label className="form-label small">Processing Engine</label>
                <CFormSelect value={engineType} onChange={(e) => { setEngineType(e.target.value); setDraftData(null); }}>
                  <option value="dividend">Annual Dividend (%)</option>
                  <option value="incentive">Share Incentive (10% Flat)</option>
                  {/* FIX 1: ADDED RD INTEREST ENGINE */}
                  <option value="interest">RD Interest (9% p.a.)</option> 
                </CFormSelect>
              </div>
              
              <div>
                <label className="form-label small">Financial Year</label>
                <CFormInput 
                  placeholder="e.g. 2025-2026" 
                  value={financialYear} 
                  onChange={(e) => setFinancialYear(e.target.value)} 
                />
              </div>

              {engineType === 'dividend' && (
                <div>
                  <label className="form-label small">Declared Rate (%)</label>
                  <CFormInput 
                    type="number" 
                    placeholder="e.g. 8.5" 
                    value={percentage} 
                    onChange={(e) => setPercentage(e.target.value)} 
                  />
                </div>
              )}

              <CButton color="primary" onClick={handleGenerateDraft} disabled={loading}>
                {loading ? <CSpinner size="sm" /> : 'Calculate Draft'}
              </CButton>
            </div>

            {/* DRAFT PREVIEW TABLE */}
            {draftData && draftData.preview && (
              <div className="mt-4 border-top pt-4">
                <h5 className="mb-3 text-primary">Draft Preview: {draftData.batchId}</h5>
                <p className="small text-muted">Showing {draftData.preview.length} of {draftData.draftCount} total generated transactions.</p>
                
                <CTable hover responsive align="middle" className="mb-4 border">
                  <CTableHead color="light">
                    <CTableRow>
                      <CTableHeaderCell>Vendor No.</CTableHeaderCell>
                      <CTableHeaderCell>Folio</CTableHeaderCell>
                      <CTableHeaderCell>Description</CTableHeaderCell>
                      <CTableHeaderCell className="text-end">Credit Amount</CTableHeaderCell>
                    </CTableRow>
                  </CTableHead>
                  <CTableBody>
                    {draftData.preview.map((row, index) => (
                      <CTableRow key={index}>
                        <CTableDataCell><strong>{row.vendorNo}</strong></CTableDataCell>
                        <CTableDataCell><span className="badge bg-secondary">{row.ledgerFolio}</span></CTableDataCell>
                        <CTableDataCell>{row.description}</CTableDataCell>
                        {/* FIX 2: CURRENCY FORMATTING */}
                        <CTableDataCell className="text-end text-success fw-bold">
                          + ₹{Number(row.amount).toLocaleString('en-IN')} 
                        </CTableDataCell>
                      </CTableRow>
                    ))}
                  </CTableBody>
                </CTable>

                <div className="d-flex justify-content-end">
                  <CButton color="success" size="lg" className="text-white" onClick={handleApproveAndPost} disabled={loading}>
                    {loading ? <CSpinner size="sm" /> : `Approve & Post ${draftData.draftCount} Records`}
                  </CButton>
                </div>
              </div>
            )}
          </CCardBody>
        </CCard>
      </CCol>
    </CRow>
  )
}

export default YearEndProcessing
