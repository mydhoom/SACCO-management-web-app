import React, { useState, useEffect, useRef, useCallback } from "react"
import {
  CCard, CCardBody, CCardHeader, CRow, CCol, CButton, CSpinner,
  CFormInput, CFormTextarea, CFormSelect, CInputGroup, CInputGroupText,
  CBadge, CAlert, CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter
} from "@coreui/react"
import CIcon from "@coreui/icons-react"
import {
  cilEnvelopeClosed, cilEnvelopeOpen, cilSend, cilPlus,
  cilX, cilSearch, cilReload, cilTag, cilClock, cilCheckCircle
} from "@coreui/icons"

const API = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "http://localhost:5000"

const CATEGORIES = [
  { value: "LOAN_QUERY",          label: "Loan Query" },
  { value: "RD_QUERY",            label: "RD / Savings Query" },
  { value: "DEMAND_RECOVERY",     label: "Demand Recovery" },
  { value: "PASSBOOK_QUERY",      label: "Passbook Query" },
  { value: "KYC_UPDATE",          label: "KYC / Profile Update" },
  { value: "SHARE_CAPITAL",       label: "Share Capital" },
  { value: "WITHDRAWAL_REQUEST",  label: "Withdrawal Request" },
  { value: "GENERAL_INQUIRY",     label: "General Inquiry" },
  { value: "COMPLAINT",           label: "Complaint" },
  { value: "OTHER",               label: "Other" },
]

const STATUS_META = {
  OPEN:            { color: "warning",  label: "Open",             icon: "🟡" },
  IN_PROGRESS:     { color: "primary",  label: "In Progress",      icon: "🔵" },
  AWAITING_MEMBER: { color: "info",     label: "Awaiting You",     icon: "⏳" },
  RESOLVED:        { color: "success",  label: "Resolved",         icon: "🟢" },
  CLOSED:          { color: "secondary",label: "Closed",           icon: "⚫" },
}

const PRIORITY_META = {
  LOW:    { color: "secondary", label: "Low" },
  NORMAL: { color: "info",      label: "Normal" },
  HIGH:   { color: "warning",   label: "High" },
  URGENT: { color: "danger",    label: "Urgent" },
}

const fmt = (d) => d ? new Date(d).toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "—"
const fmtShort = (d) => d ? new Date(d).toLocaleString("en-IN", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" }) : "—"

// ── Chat Message Bubble ──────────────────────────────────────────────────────
const MessageBubble = ({ msg, isSelf }) => (
  <div style={{ display:"flex", justifyContent: isSelf ? "flex-end" : "flex-start", marginBottom: 10 }}>
    <div style={{
      maxWidth: "78%",
      padding: "10px 14px",
      borderRadius: isSelf ? "18px 18px 4px 18px" : "4px 18px 18px 18px",
      background: isSelf ? "linear-gradient(135deg,#4361ee,#7209b7)" : "#f3f4f8",
      color: isSelf ? "#fff" : "#1e293b",
      boxShadow: "0 1px 4px rgba(0,0,0,0.10)",
      fontSize: 14, lineHeight: 1.55
    }}>
      <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 3, opacity: 0.75 }}>
        {isSelf ? "You" : msg.senderName}
      </div>
      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg.content}</div>
      <div style={{ fontSize: 10, marginTop: 5, opacity: 0.6, textAlign: "right" }}>{fmtShort(msg.createdAt)}</div>
    </div>
  </div>
)

// ── New Ticket Modal ─────────────────────────────────────────────────────────
const NewTicketModal = ({ onClose, onCreated, token }) => {
  const [subject,  setSubject]  = useState("")
  const [category, setCategory] = useState("GENERAL_INQUIRY")
  const [priority, setPriority] = useState("NORMAL")
  const [content,  setContent]  = useState("")
  const [busy,     setBusy]     = useState(false)
  const [err,      setErr]      = useState("")

  const submit = async () => {
    if (!subject.trim() || !content.trim()) { setErr("Subject and message are required."); return }
    setBusy(true); setErr("")
    try {
      const res  = await fetch(`${API}/api/communication/threads`, {
        method: "POST",
        headers: { "Content-Type":"application/json", "Authorization":`Bearer ${token}` },
        body: JSON.stringify({ subject: subject.trim(), category, priority, content: content.trim() })
      })
      const data = await res.json()
      if (data.success) { onCreated(data.data); onClose() }
      else setErr(data.message || "Failed to submit query.")
    } catch { setErr("Server error. Please try again.") }
    finally { setBusy(false) }
  }

  return (
    <CModal visible onClose={onClose} size="lg" alignment="center">
      <CModalHeader style={{ background:"linear-gradient(135deg,#4361ee,#7209b7)", color:"#fff" }}>
        <CModalTitle className="text-white fw-bold d-flex align-items-center gap-2">
          <CIcon icon={cilEnvelopeClosed} /> New Query / Helpdesk Ticket
        </CModalTitle>
      </CModalHeader>
      <CModalBody className="p-4">
        {err && <CAlert color="danger" className="py-2">{err}</CAlert>}
        <div className="mb-3">
          <label className="form-label fw-semibold">Subject <span className="text-danger">*</span></label>
          <CFormInput placeholder="Brief subject of your query..." value={subject} onChange={e => setSubject(e.target.value)} />
        </div>
        <div className="d-flex gap-3 mb-3">
          <div className="flex-grow-1">
            <label className="form-label fw-semibold">Category</label>
            <CFormSelect value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </CFormSelect>
          </div>
          <div style={{ minWidth: 140 }}>
            <label className="form-label fw-semibold">Priority</label>
            <CFormSelect value={priority} onChange={e => setPriority(e.target.value)}>
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </CFormSelect>
          </div>
        </div>
        <div className="mb-2">
          <label className="form-label fw-semibold">Your Message <span className="text-danger">*</span></label>
          <CFormTextarea rows={5} placeholder="Describe your query in detail..." value={content} onChange={e => setContent(e.target.value)} />
          <div className="text-muted small text-end mt-1">{content.length} chars</div>
        </div>
      </CModalBody>
      <CModalFooter>
        <CButton className="text-white fw-bold px-4" style={{ background:"linear-gradient(135deg,#4361ee,#7209b7)", border:"none" }} onClick={submit} disabled={busy}>
          {busy ? <><CSpinner size="sm" className="me-2" />Submitting...</> : <><CIcon icon={cilSend} className="me-2" />Submit Query</>}
        </CButton>
        <CButton color="secondary" variant="outline" onClick={onClose} disabled={busy}>Cancel</CButton>
      </CModalFooter>
    </CModal>
  )
}

// ── Main Member Helpdesk View ────────────────────────────────────────────────
const MemberHelpdesk = () => {
  const token      = localStorage.getItem("adminToken") || localStorage.getItem("token")
  const userStr    = localStorage.getItem("user") || localStorage.getItem("adminUser") || "{}"
  const currentUser = (() => { try { return JSON.parse(userStr) } catch { return {} } })()

  const [threads,    setThreads]    = useState([])
  const [active,     setActive]     = useState(null)   // full thread with messages
  const [loading,    setLoading]    = useState(true)
  const [loadingMsg, setLoadingMsg] = useState(false)
  const [replyText,  setReplyText]  = useState("")
  const [sending,    setSending]    = useState(false)
  const [showNew,    setShowNew]    = useState(false)
  const [search,     setSearch]     = useState("")
  const [filter,     setFilter]     = useState("")
  const chatEndRef = useRef(null)

  const loadThreads = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search)    params.set("search", search)
      if (filter)    params.set("status", filter)
      const res  = await fetch(`${API}/api/communication/threads?${params}`, { headers:{ "Authorization":`Bearer ${token}` } })
      const data = await res.json()
      if (data.success) setThreads(data.data)
    } catch {}
    finally { setLoading(false) }
  }, [token, search, filter])

  const openThread = async (ticketId) => {
    setLoadingMsg(true)
    try {
      const res  = await fetch(`${API}/api/communication/threads/${ticketId}`, { headers:{ "Authorization":`Bearer ${token}` } })
      const data = await res.json()
      if (data.success) {
        setActive(data.data)
        // refresh thread list to clear unread badge
        setThreads(prev => prev.map(t => t.ticketId === ticketId ? { ...t, unreadByMember: 0 } : t))
      }
    } catch {}
    finally { setLoadingMsg(false) }
  }

  const sendReply = async () => {
    if (!replyText.trim() || !active) return
    setSending(true)
    try {
      const res  = await fetch(`${API}/api/communication/threads/${active.ticketId}/reply`, {
        method: "POST",
        headers: { "Content-Type":"application/json", "Authorization":`Bearer ${token}` },
        body: JSON.stringify({ content: replyText.trim() })
      })
      const data = await res.json()
      if (data.success) {
        setActive(prev => ({ ...prev, messages: [...prev.messages, data.data], status: prev.status === "RESOLVED" ? "IN_PROGRESS" : prev.status }))
        setReplyText("")
        loadThreads()
      }
    } catch {}
    finally { setSending(false) }
  }

  useEffect(() => { loadThreads() }, [loadThreads])
  useEffect(() => { if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior:"smooth" }) }, [active?.messages?.length])

  return (
    <CRow className="g-3">
      <CCol xs={12}>
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
          <h4 className="mb-0 fw-bold d-flex align-items-center gap-2" style={{ color:"#4361ee" }}>
            <CIcon icon={cilEnvelopeOpen} size="lg" /> My Helpdesk & Messages
          </h4>
          <CButton className="text-white fw-bold" style={{ background:"linear-gradient(135deg,#4361ee,#7209b7)", border:"none" }} onClick={() => setShowNew(true)}>
            <CIcon icon={cilPlus} className="me-1" /> New Query
          </CButton>
        </div>
        <p className="text-muted small mb-3">Communicate directly with the Society Admin. Track all your queries, responses, and status updates here.</p>
      </CCol>

      {/* ── Left: Thread List ── */}
      <CCol xs={12} md={4} lg={3}>
        <CCard className="shadow-sm h-100" style={{ borderTop:"3px solid #4361ee" }}>
          <CCardHeader className="py-2 bg-white">
            <CInputGroup size="sm" className="mb-2">
              <CInputGroupText><CIcon icon={cilSearch} /></CInputGroupText>
              <CFormInput placeholder="Search tickets..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && loadThreads()} />
              {search && <CButton color="secondary" variant="outline" onClick={() => { setSearch(""); }}><CIcon icon={cilX} /></CButton>}
            </CInputGroup>
            <div className="d-flex gap-1 flex-wrap">
              {["","OPEN","IN_PROGRESS","AWAITING_MEMBER","RESOLVED"].map(s => (
                <CButton key={s} size="sm" color={filter === s ? "primary" : "secondary"} variant={filter === s ? undefined : "outline"} className="px-2 py-0" style={{ fontSize:11 }} onClick={() => setFilter(s)}>
                  {s === "" ? "All" : STATUS_META[s]?.label}
                </CButton>
              ))}
            </div>
          </CCardHeader>
          <CCardBody className="p-0" style={{ overflowY:"auto", maxHeight:"60vh" }}>
            {loading ? (
              <div className="text-center py-5"><CSpinner color="primary" size="sm" /></div>
            ) : threads.length === 0 ? (
              <div className="text-center text-muted py-5 px-3">
                <div style={{ fontSize:36 }}>📭</div>
                <p className="mt-2 small">No queries yet. Tap <strong>+ New Query</strong> to reach out to the admin.</p>
              </div>
            ) : threads.map(t => {
              const sm = STATUS_META[t.status] || STATUS_META.OPEN
              const isActive = active?.ticketId === t.ticketId
              return (
                <div key={t.ticketId} onClick={() => openThread(t.ticketId)}
                  style={{
                    padding:"10px 12px", cursor:"pointer", borderBottom:"1px solid #f0f0f0",
                    background: isActive ? "linear-gradient(135deg,rgba(67,97,238,0.08),rgba(114,9,183,0.06))" : t.unreadByMember > 0 ? "rgba(67,97,238,0.04)" : "#fff",
                    borderLeft: isActive ? "3px solid #4361ee" : "3px solid transparent",
                    transition:"all 0.15s"
                  }}>
                  <div className="d-flex justify-content-between align-items-start">
                    <span className="fw-semibold text-truncate" style={{ maxWidth:"70%", fontSize:13 }}>{t.subject}</span>
                    <CBadge color={sm.color} style={{ fontSize:9 }}>{sm.icon} {sm.label}</CBadge>
                  </div>
                  <div className="text-muted" style={{ fontSize:11, marginTop:2 }}>
                    {t.ticketId} · {CATEGORIES.find(c => c.value === t.category)?.label || t.category}
                  </div>
                  <div className="d-flex justify-content-between align-items-center mt-1">
                    <span className="text-muted" style={{ fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"75%" }}>{t.lastMessageSnippet}</span>
                    {t.unreadByMember > 0 && <CBadge color="danger" shape="rounded-pill" style={{ fontSize:9 }}>{t.unreadByMember}</CBadge>}
                  </div>
                  <div className="text-muted" style={{ fontSize:10, marginTop:2 }}>{fmtShort(t.lastMessageAt)}</div>
                </div>
              )
            })}
          </CCardBody>
        </CCard>
      </CCol>

      {/* ── Right: Chat Thread ── */}
      <CCol xs={12} md={8} lg={9}>
        {!active ? (
          <CCard className="shadow-sm h-100 d-flex align-items-center justify-content-center" style={{ minHeight:400, borderTop:"3px solid #e2e8f0" }}>
            <div className="text-center text-muted p-5">
              <div style={{ fontSize:64 }}>💬</div>
              <h5 className="mt-3">Select a query to view the conversation</h5>
              <p className="small">Or create a new query using the button above.</p>
            </div>
          </CCard>
        ) : loadingMsg ? (
          <CCard className="shadow-sm" style={{ minHeight:400 }}>
            <div className="text-center py-5"><CSpinner color="primary" /></div>
          </CCard>
        ) : (
          <CCard className="shadow-sm" style={{ borderTop:`3px solid ${STATUS_META[active.status]?.color === "success" ? "#06d6a0" : "#4361ee"}` }}>
            {/* Thread header */}
            <CCardHeader className="py-3 bg-white">
              <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                <div>
                  <h6 className="mb-1 fw-bold">{active.subject}</h6>
                  <div className="d-flex gap-2 flex-wrap align-items-center">
                    <code style={{ fontSize:11 }}>{active.ticketId}</code>
                    <CBadge color={STATUS_META[active.status]?.color || "secondary"}>{STATUS_META[active.status]?.icon} {STATUS_META[active.status]?.label}</CBadge>
                    <CBadge color={PRIORITY_META[active.priority]?.color || "info"} style={{ fontSize:10 }}>
                      <CIcon icon={cilTag} style={{ marginRight:3 }} />{PRIORITY_META[active.priority]?.label}
                    </CBadge>
                    <span className="text-muted" style={{ fontSize:11 }}>
                      <CIcon icon={cilClock} style={{ marginRight:3 }} />{fmt(active.createdAt)}
                    </span>
                  </div>
                </div>
                <CButton color="secondary" variant="outline" size="sm" onClick={() => openThread(active.ticketId)}>
                  <CIcon icon={cilReload} />
                </CButton>
              </div>
              {active.resolvedAt && (
                <div className="mt-2 p-2 rounded bg-success bg-opacity-10 border border-success border-opacity-25 small text-success">
                  <CIcon icon={cilCheckCircle} className="me-1" />
                  Resolved by {active.resolvedBy} on {fmt(active.resolvedAt)}
                </div>
              )}
            </CCardHeader>

            {/* Messages */}
            <CCardBody className="p-3" style={{ overflowY:"auto", minHeight:320, maxHeight:"50vh", background:"#f8f9ff" }}>
              {active.messages.map((msg) => (
                <MessageBubble
                  key={msg._id}
                  msg={msg}
                  isSelf={msg.senderRole === "member"}
                />
              ))}
              <div ref={chatEndRef} />
            </CCardBody>

            {/* Reply box */}
            {active.status !== "CLOSED" ? (
              <div className="p-3 border-top bg-white">
                <div className="d-flex gap-2 align-items-end">
                  <CFormTextarea
                    rows={2}
                    placeholder={active.status === "RESOLVED" ? "Send a message to reopen this ticket..." : "Type your reply..."}
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                    style={{ resize:"none", borderRadius:10, fontSize:14 }}
                  />
                  <CButton
                    className="text-white fw-bold"
                    style={{ background:"linear-gradient(135deg,#4361ee,#7209b7)", border:"none", borderRadius:10, minWidth:52, height:60 }}
                    onClick={sendReply}
                    disabled={sending || !replyText.trim()}
                  >
                    {sending ? <CSpinner size="sm" /> : <CIcon icon={cilSend} />}
                  </CButton>
                </div>
                <div className="text-muted" style={{ fontSize:10, marginTop:4 }}>Press Enter to send · Shift+Enter for new line</div>
              </div>
            ) : (
              <div className="p-3 border-top bg-light text-center text-muted small">
                This ticket is closed. Please raise a new query if you need further assistance.
              </div>
            )}
          </CCard>
        )}
      </CCol>

      {/* New Ticket Modal */}
      {showNew && <NewTicketModal token={token} onClose={() => setShowNew(false)} onCreated={() => loadThreads()} />}

      <style>{`
        .helpdesk-thread-list::-webkit-scrollbar { width: 4px; }
        .helpdesk-thread-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
      `}</style>
    </CRow>
  )
}

export default MemberHelpdesk
