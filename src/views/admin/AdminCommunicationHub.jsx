import React, { useState, useEffect, useRef, useCallback } from "react"
import {
  CCard, CCardBody, CCardHeader, CRow, CCol, CButton, CSpinner,
  CFormInput, CFormTextarea, CFormSelect, CInputGroup, CInputGroupText,
  CBadge, CAlert, CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter
} from "@coreui/react"
import CIcon from "@coreui/icons-react"
import {
  cilEnvelopeOpen, cilSend, cilX, cilSearch, cilReload,
  cilTag, cilClock, cilCheckCircle, cilPeople, cilFilter,
  cilPaperclip, cilDescription
} from "@coreui/icons"

const API = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "http://localhost:5000"

const CATEGORIES = [
  { value: "", label: "All Categories" },
  { value: "LOAN_QUERY", label: "Loan Query" },
  { value: "RD_QUERY", label: "RD / Savings" },
  { value: "DEMAND_RECOVERY", label: "Demand Recovery" },
  { value: "PASSBOOK_QUERY", label: "Passbook" },
  { value: "KYC_UPDATE", label: "KYC / Profile" },
  { value: "SHARE_CAPITAL", label: "Share Capital" },
  { value: "WITHDRAWAL_REQUEST", label: "Withdrawal" },
  { value: "GENERAL_INQUIRY", label: "General Inquiry" },
  { value: "COMPLAINT", label: "Complaint" },
  { value: "OTHER", label: "Other" },
]

const CANNED = [
  "Your request has been received and is under review.",
  "Please visit the branch office with your passbook for further processing.",
  "Your payment has been posted to the Master Journal. Please check your passbook.",
  "Your loan details have been updated. Please review your loan statement.",
  "Please ensure your KYC documents are submitted before the next due date.",
  "This matter has been escalated to the accounts team and will be resolved within 2 working days.",
]

const STATUS_META = {
  OPEN:            { color: "warning",  label: "Open",           icon: "🟡" },
  IN_PROGRESS:     { color: "primary",  label: "In Progress",    icon: "🔵" },
  AWAITING_MEMBER: { color: "info",     label: "Awaiting Member",icon: "⏳" },
  RESOLVED:        { color: "success",  label: "Resolved",       icon: "🟢" },
  CLOSED:          { color: "secondary",label: "Closed",         icon: "⚫" },
}

const PRIORITY_META = {
  LOW:    { color: "secondary", label: "Low" },
  NORMAL: { color: "info",      label: "Normal" },
  HIGH:   { color: "warning",   label: "High" },
  URGENT: { color: "danger",    label: "Urgent" },
}

const fmt = (d) => d ? new Date(d).toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "—"
const fmtShort = (d) => d ? new Date(d).toLocaleString("en-IN", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" }) : "—"

const MessageBubble = ({ msg, onPreviewImage }) => {
  const isAdmin = msg.senderRole !== "member"
  const isImage = msg.attachmentUrl && (
    msg.attachmentType?.startsWith("image/") ||
    /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(msg.attachmentUrl) ||
    msg.attachmentUrl.startsWith("data:image/")
  )

  return (
    <div style={{ display:"flex", justifyContent: isAdmin ? "flex-end" : "flex-start", marginBottom: 12 }}>
      <div style={{
        maxWidth: "76%",
        padding: "10px 14px",
        borderRadius: isAdmin ? "18px 18px 4px 18px" : "4px 18px 18px 18px",
        background: isAdmin ? "linear-gradient(135deg,#1e293b,#334155)" : "#f3f4f8",
        color: isAdmin ? "#fff" : "#1e293b",
        boxShadow: "0 1px 4px rgba(0,0,0,0.10)",
        fontSize: 14, lineHeight: 1.55
      }}>
        <div style={{ fontWeight:600, fontSize:11, marginBottom:3, opacity:0.75 }}>
          {isAdmin ? `${msg.senderName} (${msg.senderRole})` : msg.senderName}
        </div>
        {msg.content && msg.content !== "(Attachment)" && (
          <div style={{ whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{msg.content}</div>
        )}

        {/* Attachment */}
        {msg.attachmentUrl && (
          <div style={{ marginTop: 8 }}>
            {isImage ? (
              <div>
                <img
                  src={msg.attachmentUrl}
                  alt={msg.attachmentName || "Screenshot"}
                  style={{ maxHeight: 180, maxWidth: "100%", borderRadius: 8, cursor: "pointer", objectFit: "cover", border: isAdmin ? "1px solid rgba(255,255,255,0.3)" : "1px solid #cbd5e1" }}
                  onClick={() => onPreviewImage(msg.attachmentUrl, msg.attachmentName)}
                  title="Click to zoom screenshot"
                />
                <div style={{ fontSize: 10, marginTop: 2, opacity: 0.8 }}>📷 {msg.attachmentName || "Screenshot (click to zoom)"}</div>
              </div>
            ) : (
              <a
                href={msg.attachmentUrl}
                download={msg.attachmentName || "document"}
                target="_blank"
                rel="noreferrer"
                className={`btn btn-sm d-inline-flex align-items-center gap-1 mt-1 ${isAdmin ? "btn-light text-dark" : "btn-outline-primary"}`}
                style={{ fontSize: 11, padding: "3px 8px" }}
              >
                <CIcon icon={cilDescription} />
                <span>{msg.attachmentName || "View Attachment"}</span>
              </a>
            )}
          </div>
        )}

        <div style={{ fontSize:10, marginTop:5, opacity:0.65, textAlign:"right" }}>{fmtShort(msg.createdAt)}</div>
      </div>
    </div>
  )
}

const AdminCommunicationHub = () => {
  const token = localStorage.getItem("adminToken") || localStorage.getItem("token")

  const [threads,        setThreads]        = useState([])
  const [active,         setActive]         = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [loadingMsg,     setLoadingMsg]     = useState(false)
  const [replyText,      setReplyText]      = useState("")
  const [replyAttachUrl, setReplyAttachUrl] = useState(null)
  const [replyAttachName,setReplyAttachName]= useState("")
  const [replyAttachType,setReplyAttachType]= useState("")
  const [sending,        setSending]        = useState(false)
  const [search,         setSearch]         = useState("")
  const [statusF,        setStatusF]        = useState("")
  const [categoryF,  setCategoryF]  = useState("")
  const [priorityF,  setPriorityF]  = useState("")
  const [totalUnread,setTotalUnread]= useState(0)
  const [previewImage, setPreviewImage] = useState(null)
  const chatEndRef = useRef(null)
  const fileInputRef = useRef(null)

  // Stats for summary banner
  const stats = {
    open:       threads.filter(t => t.status === "OPEN").length,
    inProgress: threads.filter(t => t.status === "IN_PROGRESS").length,
    awaiting:   threads.filter(t => t.status === "AWAITING_MEMBER").length,
    resolved:   threads.filter(t => t.status === "RESOLVED").length,
  }

  const loadThreads = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (search)    p.set("search", search)
      if (statusF)   p.set("status", statusF)
      if (categoryF) p.set("category", categoryF)
      if (priorityF) p.set("priority", priorityF)
      const res  = await fetch(`${API}/api/communication/threads?${p}&limit=50`, { headers:{ Authorization:`Bearer ${token}` } })
      const data = await res.json()
      if (data.success && Array.isArray(data.data)) {
        setThreads(data.data)
        setTotalUnread(data.data.reduce((s, t) => s + (t.unreadByAdmin || 0), 0))
      }
    } catch {}
    finally { setLoading(false) }
  }, [token, search, statusF, categoryF, priorityF])

  const openThread = async (ticketId) => {
    setLoadingMsg(true)
    try {
      const res  = await fetch(`${API}/api/communication/threads/${ticketId}`, { headers:{ Authorization:`Bearer ${token}` } })
      const data = await res.json()
      if (data.success) {
        setActive(data.data)
        setThreads(prev => prev.map(t => t.ticketId === ticketId ? { ...t, unreadByAdmin: 0 } : t))
        setTotalUnread(prev => Math.max(0, prev - (threads.find(t => t.ticketId === ticketId)?.unreadByAdmin || 0)))
      }
    } catch {}
    finally { setLoadingMsg(false) }
  }

  const handleFile = (file) => {
    if (!file) return
    if (file.size > 15 * 1024 * 1024) {
      alert("File size exceeds 15MB limit.")
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      setReplyAttachUrl(e.target.result)
      setReplyAttachName(file.name)
      setReplyAttachType(file.type || "application/octet-stream")
    }
    reader.readAsDataURL(file)
  }

  const handlePaste = (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const blob = items[i].getAsFile()
        handleFile(blob)
        break
      }
    }
  }

  const sendReply = async (text) => {
    const msg = text !== undefined ? text : replyText
    if ((!msg.trim() && !replyAttachUrl) || !active) return
    setSending(true)
    try {
      const res  = await fetch(`${API}/api/communication/threads/${active.ticketId}/reply`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify({
          content: msg.trim(),
          attachmentUrl: replyAttachUrl,
          attachmentName: replyAttachName,
          attachmentType: replyAttachType
        })
      })
      const data = await res.json()
      if (data.success) {
        setActive(prev => ({
          ...prev,
          messages:[...prev.messages, data.data],
          status: prev.status === "OPEN" ? "IN_PROGRESS" : prev.status
        }))
        setReplyText("")
        setReplyAttachUrl(null)
        setReplyAttachName("")
        setReplyAttachType("")
        loadThreads()
      }
    } catch {}
    finally { setSending(false) }
  }

  const changeStatus = async (status) => {
    if (!active) return
    try {
      const res  = await fetch(`${API}/api/communication/threads/${active.ticketId}/status`, {
        method:"PUT",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify({ status })
      })
      const data = await res.json()
      if (data.success) {
        setActive(prev => ({ ...prev, status }))
        setThreads(prev => prev.map(t => t.ticketId === active.ticketId ? { ...t, status } : t))
      }
    } catch {}
  }

  useEffect(() => { loadThreads() }, [loadThreads])
  useEffect(() => { if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior:"smooth" }) }, [active?.messages?.length])

  return (
    <CRow className="g-3">
      <CCol xs={12}>
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div>
            <h4 className="mb-0 fw-bold d-flex align-items-center gap-2" style={{ color:"#f72585" }}>
              <CIcon icon={cilEnvelopeOpen} size="lg" /> Communication &amp; Helpdesk Center
            </h4>
            <p className="text-muted small mb-0 mt-1">Manage all member queries, complaints, and requests with full screenshot and file support.</p>
          </div>
          <div className="d-flex gap-2">
            {totalUnread > 0 && <CBadge color="danger" className="px-3 py-2 fs-6">{totalUnread} Unread</CBadge>}
            <CButton color="secondary" variant="outline" size="sm" onClick={loadThreads}><CIcon icon={cilReload} /></CButton>
          </div>
        </div>
      </CCol>

      {/* ── Stats Banner ── */}
      <CCol xs={12}>
        <div className="d-flex flex-wrap gap-3">
          {[
            { label:"Open",            val: stats.open,       color:"#f59e0b", bg:"rgba(245,158,11,0.08)" },
            { label:"In Progress",     val: stats.inProgress, color:"#3b82f6", bg:"rgba(59,130,246,0.08)" },
            { label:"Awaiting Member", val: stats.awaiting,   color:"#06b6d4", bg:"rgba(6,182,212,0.08)" },
            { label:"Resolved",        val: stats.resolved,   color:"#10b981", bg:"rgba(16,185,129,0.08)" },
          ].map(({ label, val, color, bg }) => (
            <div key={label} className="border rounded px-4 py-2 text-center flex-grow-1" style={{ background:bg, borderColor:color+"40" }}>
              <div style={{ color, fontWeight:700, fontSize:22 }}>{val}</div>
              <div className="text-muted" style={{ fontSize:11 }}>{label}</div>
            </div>
          ))}
        </div>
      </CCol>

      {/* ── Left: Thread List ── */}
      <CCol xs={12} md={4} xl={3}>
        <CCard className="shadow-sm" style={{ borderTop:"3px solid #f72585" }}>
          <CCardHeader className="py-2 bg-white">
            <CInputGroup size="sm" className="mb-2">
              <CInputGroupText><CIcon icon={cilSearch} /></CInputGroupText>
              <CFormInput placeholder="Search name, vendor, ticket..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && loadThreads()} />
              {search && <CButton color="secondary" variant="outline" onClick={() => setSearch("")}><CIcon icon={cilX} /></CButton>}
            </CInputGroup>
            <div className="d-flex gap-1 mb-1 flex-wrap">
              {["","OPEN","IN_PROGRESS","AWAITING_MEMBER","RESOLVED","CLOSED"].map(s => (
                <CButton key={s || "all"} size="sm" color={statusF === s ? "primary" : "secondary"} variant={statusF === s ? undefined : "outline"} className="px-2 py-0" style={{ fontSize:10 }} onClick={() => setStatusF(s)}>
                  {s === "" ? "All" : STATUS_META[s]?.label}
                </CButton>
              ))}
            </div>
            <div className="d-flex gap-2">
              <CFormSelect size="sm" value={categoryF} onChange={e => setCategoryF(e.target.value)} style={{ fontSize:11 }}>
                {CATEGORIES.map(c => <option key={c.value || "all-cats"} value={c.value}>{c.label}</option>)}
              </CFormSelect>
              <CFormSelect size="sm" value={priorityF} onChange={e => setPriorityF(e.target.value)} style={{ fontSize:11, minWidth:90 }}>
                <option value="">Priority</option>
                <option value="URGENT">Urgent</option>
                <option value="HIGH">High</option>
                <option value="NORMAL">Normal</option>
                <option value="LOW">Low</option>
              </CFormSelect>
            </div>
          </CCardHeader>
          <CCardBody className="p-0" style={{ overflowY:"auto", maxHeight:"65vh" }}>
            {loading ? (
              <div className="text-center py-5"><CSpinner color="primary" size="sm" /></div>
            ) : threads.length === 0 ? (
              <div className="text-center text-muted py-5 px-3">
                <div style={{ fontSize:36 }}>📭</div>
                <p className="mt-2 small">No threads match your filter.</p>
              </div>
            ) : threads.map(t => {
              const sm = STATUS_META[t.status] || STATUS_META.OPEN
              const pm = PRIORITY_META[t.priority] || PRIORITY_META.NORMAL
              const isActive = active?.ticketId === t.ticketId
              return (
                <div key={t.ticketId} onClick={() => openThread(t.ticketId)}
                  style={{
                    padding:"10px 12px", cursor:"pointer", borderBottom:"1px solid #f0f0f0",
                    background: isActive ? "rgba(247,37,133,0.06)" : t.unreadByAdmin > 0 ? "rgba(247,37,133,0.03)" : "#fff",
                    borderLeft: isActive ? "3px solid #f72585" : "3px solid transparent",
                    transition:"all 0.15s"
                  }}>
                  <div className="d-flex justify-content-between align-items-start mb-1">
                    <div>
                      <div className="fw-semibold text-truncate" style={{ maxWidth:160, fontSize:13 }}>{t.subject}</div>
                      <div className="text-primary fw-bold" style={{ fontSize:11 }}>{t.memberName} <span className="text-muted fw-normal">· {t.vendorNo}</span></div>
                    </div>
                    <div className="d-flex flex-column gap-1 align-items-end">
                      <CBadge color={sm.color} style={{ fontSize:8 }}>{sm.icon} {sm.label}</CBadge>
                      <CBadge color={pm.color} style={{ fontSize:8 }}>{pm.label}</CBadge>
                    </div>
                  </div>
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="text-muted" style={{ fontSize:10, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"70%" }}>{t.lastMessageSnippet}</span>
                    {t.unreadByAdmin > 0 && <CBadge color="danger" shape="rounded-pill" style={{ fontSize:9 }}>{t.unreadByAdmin} new</CBadge>}
                  </div>
                  <div className="text-muted" style={{ fontSize:10, marginTop:2 }}>{fmtShort(t.lastMessageAt)}</div>
                </div>
              )
            })}
          </CCardBody>
        </CCard>
      </CCol>

      {/* ── Right: Chat + Actions ── */}
      <CCol xs={12} md={8} xl={9}>
        {!active ? (
          <CCard className="shadow-sm d-flex align-items-center justify-content-center" style={{ minHeight:450, borderTop:"3px solid #e2e8f0" }}>
            <div className="text-center text-muted p-5">
              <div style={{ fontSize:64 }}>📨</div>
              <h5 className="mt-3">Select a member query to begin</h5>
              <p className="small">Click any thread on the left to open the full conversation.</p>
            </div>
          </CCard>
        ) : loadingMsg ? (
          <CCard className="shadow-sm" style={{ minHeight:450 }}><div className="text-center py-5"><CSpinner color="primary" /></div></CCard>
        ) : (
          <div className="d-flex flex-column gap-2" style={{ height:"100%" }}>
            {/* Thread header */}
            <CCard className="shadow-sm" style={{ borderTop:"3px solid #f72585" }}>
              <CCardHeader className="py-2 bg-white">
                <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                  <div>
                    <h6 className="mb-1 fw-bold">{active.subject}</h6>
                    <div className="d-flex gap-2 flex-wrap align-items-center">
                      <CIcon icon={cilPeople} style={{ color:"#4361ee" }} />
                      <span className="fw-semibold text-primary">{active.memberName}</span>
                      <span className="text-muted small">({active.vendorNo})</span>
                      <code style={{ fontSize:11 }}>{active.ticketId}</code>
                      <CBadge color={STATUS_META[active.status]?.color}>{STATUS_META[active.status]?.icon} {STATUS_META[active.status]?.label}</CBadge>
                      <CBadge color={PRIORITY_META[active.priority]?.color} style={{ fontSize:10 }}><CIcon icon={cilTag} />{PRIORITY_META[active.priority]?.label}</CBadge>
                      <span className="text-muted" style={{ fontSize:11 }}><CIcon icon={cilClock} /> {fmt(active.createdAt)}</span>
                    </div>
                  </div>
                  {/* Status controls */}
                  <div className="d-flex gap-1 flex-wrap">
                    {active.status !== "IN_PROGRESS" && active.status !== "CLOSED" && (
                      <CButton size="sm" color="primary" variant="outline" onClick={() => changeStatus("IN_PROGRESS")} style={{ fontSize:11 }}>Mark In Progress</CButton>
                    )}
                    {active.status !== "AWAITING_MEMBER" && active.status !== "CLOSED" && (
                      <CButton size="sm" color="info" variant="outline" onClick={() => changeStatus("AWAITING_MEMBER")} style={{ fontSize:11 }}>Awaiting Member</CButton>
                    )}
                    {active.status !== "RESOLVED" && active.status !== "CLOSED" && (
                      <CButton size="sm" color="success" variant="outline" onClick={() => changeStatus("RESOLVED")} style={{ fontSize:11 }}>
                        <CIcon icon={cilCheckCircle} className="me-1" />Resolve
                      </CButton>
                    )}
                    {active.status !== "CLOSED" && (
                      <CButton size="sm" color="danger" variant="outline" onClick={() => changeStatus("CLOSED")} style={{ fontSize:11 }}>Close</CButton>
                    )}
                    {(active.status === "RESOLVED" || active.status === "CLOSED") && (
                      <CButton size="sm" color="warning" variant="outline" onClick={() => changeStatus("OPEN")} style={{ fontSize:11 }}>Reopen</CButton>
                    )}
                    <CButton size="sm" color="secondary" variant="outline" onClick={() => openThread(active.ticketId)}><CIcon icon={cilReload} /></CButton>
                  </div>
                </div>
                {active.resolvedAt && (
                  <div className="mt-2 p-2 rounded bg-success bg-opacity-10 border border-success border-opacity-25 small text-success">
                    <CIcon icon={cilCheckCircle} className="me-1" /> Resolved by {active.resolvedBy} on {fmt(active.resolvedAt)}
                  </div>
                )}
              </CCardHeader>
            </CCard>

            {/* Messages */}
            <CCard className="shadow-sm flex-grow-1">
              <CCardBody className="p-3" style={{ overflowY:"auto", minHeight:280, maxHeight:"42vh", background:"#f8f9ff" }}>
                {active.messages.map((msg, idx) => (
                  <MessageBubble
                    key={msg._id || msg.createdAt || idx}
                    msg={msg}
                    onPreviewImage={(url, name) => setPreviewImage({ url, name })}
                  />
                ))}
                <div ref={chatEndRef} />
              </CCardBody>
            </CCard>

            {/* Canned replies */}
            <CCard className="shadow-sm">
              <CCardHeader className="py-1 bg-light" style={{ fontSize:11, color:"#64748b" }}>
                <CIcon icon={cilFilter} style={{ marginRight:4 }} />Quick Replies (click to use)
              </CCardHeader>
              <CCardBody className="py-2 px-3">
                <div className="d-flex flex-wrap gap-1">
                  {CANNED.map((c, i) => (
                    <CButton key={i} size="sm" color="secondary" variant="outline" style={{ fontSize:11, maxWidth:300, textAlign:"left", height:"auto", whiteSpace:"normal" }}
                      onClick={() => sendReply(c)}>
                      {c.substring(0, 60)}{c.length > 60 ? "…" : ""}
                    </CButton>
                  ))}
                </div>
              </CCardBody>
            </CCard>

            {/* Reply box */}
            {active.status !== "CLOSED" ? (
              <CCard className="shadow-sm">
                <CCardBody className="p-2">
                  {/* Reply attachment badge */}
                  {replyAttachUrl && (
                    <div className="d-flex align-items-center gap-2 mb-2 p-2 bg-light rounded border">
                      {replyAttachType?.startsWith("image/") || replyAttachUrl.startsWith("data:image/") ? (
                        <img src={replyAttachUrl} alt="Preview" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4 }} />
                      ) : (
                        <CIcon icon={cilDescription} />
                      )}
                      <span className="small text-truncate flex-grow-1">{replyAttachName || "Attachment ready"}</span>
                      <CButton size="sm" color="danger" variant="ghost" onClick={() => { setReplyAttachUrl(null); setReplyAttachName(""); setReplyAttachType(""); }}>
                        <CIcon icon={cilX} />
                      </CButton>
                    </div>
                  )}

                  <div className="d-flex gap-2 align-items-end">
                    <CButton
                      color="secondary"
                      variant="outline"
                      title="Attach file or screenshot"
                      style={{ borderRadius: 10, height: 48 }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <CIcon icon={cilPaperclip} />
                    </CButton>
                    <input
                      type="file"
                      ref={fileInputRef}
                      style={{ display: "none" }}
                      accept="image/*,.pdf,.doc,.docx"
                      onChange={e => handleFile(e.target.files?.[0])}
                    />

                    <CFormTextarea
                      rows={2}
                      placeholder="Type your reply to the member... (Tip: Paste screenshot with Ctrl+V)"
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onPaste={handlePaste}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                      style={{ resize:"none", borderRadius:10, fontSize:14 }}
                    />
                    <CButton
                      className="text-white fw-bold"
                      style={{ background:"linear-gradient(135deg,#f72585,#7209b7)", border:"none", borderRadius:10, minWidth:52, height:48 }}
                      onClick={() => sendReply()}
                      disabled={sending || (!replyText.trim() && !replyAttachUrl)}
                    >
                      {sending ? <CSpinner size="sm" /> : <CIcon icon={cilSend} />}
                    </CButton>
                  </div>
                  <div className="text-muted" style={{ fontSize:10, marginTop:3 }}>Enter to send · Shift+Enter for new line · Paste screenshot with Ctrl+V</div>
                </CCardBody>
              </CCard>
            ) : (
              <CCard className="shadow-sm">
                <CCardBody className="text-center text-muted py-2 small">
                  This ticket is closed. Reopen it to send a reply.
                </CCardBody>
              </CCard>
            )}
          </div>
        )}
      </CCol>

      {/* Image Lightbox Modal */}
      {previewImage && (
        <CModal visible onClose={() => setPreviewImage(null)} size="xl" alignment="center">
          <CModalHeader>
            <CModalTitle className="fw-bold">{previewImage.name || "Attachment Preview"}</CModalTitle>
          </CModalHeader>
          <CModalBody className="text-center p-2 bg-dark">
            <img src={previewImage.url} alt="Full preview" style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain" }} />
          </CModalBody>
          <CModalFooter>
            <a href={previewImage.url} download={previewImage.name || "screenshot.png"} className="btn btn-primary btn-sm">Download</a>
            <CButton color="secondary" size="sm" onClick={() => setPreviewImage(null)}>Close</CButton>
          </CModalFooter>
        </CModal>
      )}
    </CRow>
  )
}

export default AdminCommunicationHub
