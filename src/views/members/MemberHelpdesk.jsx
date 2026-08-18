import React, { useState, useEffect, useRef, useCallback } from "react"
import {
  CCard, CCardBody, CCardHeader, CRow, CCol, CButton, CSpinner,
  CFormInput, CFormTextarea, CFormSelect, CInputGroup, CInputGroupText,
  CBadge, CAlert, CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter
} from "@coreui/react"
import CIcon from "@coreui/icons-react"
import {
  cilEnvelopeClosed, cilEnvelopeOpen, cilSend, cilPlus,
  cilX, cilSearch, cilReload, cilTag, cilClock, cilCheckCircle,
  cilPaperclip, cilImage, cilDescription
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
const MessageBubble = ({ msg, isSelf, onPreviewImage }) => {
  const isImage = msg.attachmentUrl && (
    msg.attachmentType?.startsWith("image/") ||
    /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(msg.attachmentUrl) ||
    msg.attachmentUrl.startsWith("data:image/")
  )

  return (
    <div style={{ display:"flex", justifyContent: isSelf ? "flex-end" : "flex-start", marginBottom: 12 }}>
      <div style={{
        maxWidth: "78%",
        padding: "10px 14px",
        borderRadius: isSelf ? "18px 18px 4px 18px" : "4px 18px 18px 18px",
        background: isSelf ? "linear-gradient(135deg,#4361ee,#7209b7)" : "#f3f4f8",
        color: isSelf ? "#fff" : "#1e293b",
        boxShadow: "0 1px 4px rgba(0,0,0,0.10)",
        fontSize: 14, lineHeight: 1.55
      }}>
        <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4, opacity: 0.75 }}>
          {isSelf ? "You" : msg.senderName}
        </div>
        {msg.content && msg.content !== "(Attachment)" && (
          <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg.content}</div>
        )}

        {/* Attachment Display */}
        {msg.attachmentUrl && (
          <div style={{ marginTop: 8 }}>
            {isImage ? (
              <div>
                <img
                  src={msg.attachmentUrl}
                  alt={msg.attachmentName || "Attached screenshot"}
                  style={{ maxHeight: 180, maxWidth: "100%", borderRadius: 8, cursor: "pointer", objectFit: "cover", border: isSelf ? "1px solid rgba(255,255,255,0.3)" : "1px solid #cbd5e1" }}
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
                className={`btn btn-sm d-inline-flex align-items-center gap-1 mt-1 ${isSelf ? "btn-light text-primary" : "btn-outline-primary"}`}
                style={{ fontSize: 11, padding: "3px 8px" }}
              >
                <CIcon icon={cilDescription} />
                <span>{msg.attachmentName || "View Attachment"}</span>
              </a>
            )}
          </div>
        )}

        <div style={{ fontSize: 10, marginTop: 5, opacity: 0.65, textAlign: "right" }}>{fmtShort(msg.createdAt)}</div>
      </div>
    </div>
  )
}

// ── New Ticket Modal ─────────────────────────────────────────────────────────
const NewTicketModal = ({ onClose, onCreated, token }) => {
  const [subject,        setSubject]        = useState("")
  const [category,       setCategory]       = useState("GENERAL_INQUIRY")
  const [priority,       setPriority]       = useState("NORMAL")
  const [content,        setContent]        = useState("")
  const [attachmentUrl,  setAttachmentUrl]  = useState(null)
  const [attachmentName, setAttachmentName] = useState("")
  const [attachmentType, setAttachmentType] = useState("")
  const [busy,           setBusy]           = useState(false)
  const [err,            setErr]            = useState("")
  const fileInputRef = useRef(null)

  const handleFile = (file) => {
    if (!file) return
    if (file.size > 15 * 1024 * 1024) {
      setErr("File size exceeds 15MB limit.")
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      setAttachmentUrl(e.target.result)
      setAttachmentName(file.name)
      setAttachmentType(file.type || "application/octet-stream")
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

  const submit = async () => {
    if (!subject.trim() || (!content.trim() && !attachmentUrl)) {
      setErr("Subject and message (or attachment) are required.")
      return
    }
    setBusy(true); setErr("")
    try {
      const res  = await fetch(`${API}/api/communication/threads`, {
        method: "POST",
        headers: { "Content-Type":"application/json", "Authorization":`Bearer ${token}` },
        body: JSON.stringify({
          subject: subject.trim(),
          category,
          priority,
          content: content.trim() || "(Screenshot/File attached)",
          attachmentUrl,
          attachmentName,
          attachmentType
        })
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
        <div className="d-flex gap-3 mb-3 flex-wrap">
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
        <div className="mb-3">
          <label className="form-label fw-semibold">Your Message</label>
          <CFormTextarea
            rows={4}
            placeholder="Describe your query in detail... (Tip: You can press Ctrl+V here to paste a screenshot directly!)"
            value={content}
            onChange={e => setContent(e.target.value)}
            onPaste={handlePaste}
          />
        </div>

        {/* Attachment preview / upload */}
        <div className="p-3 border rounded bg-light mb-3">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <span className="fw-semibold small d-flex align-items-center gap-1">
              <CIcon icon={cilPaperclip} /> Attach File or Screenshot
            </span>
            <CButton size="sm" color="primary" variant="outline" onClick={() => fileInputRef.current?.click()}>
              Browse File...
            </CButton>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              accept="image/*,.pdf,.doc,.docx"
              onChange={e => handleFile(e.target.files?.[0])}
            />
          </div>
          {attachmentUrl ? (
            <div className="d-flex align-items-center gap-3 bg-white p-2 rounded border">
              {attachmentType?.startsWith("image/") || attachmentUrl.startsWith("data:image/") ? (
                <img src={attachmentUrl} alt="Preview" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4 }} />
              ) : (
                <CIcon icon={cilDescription} size="xl" className="text-primary" />
              )}
              <div className="flex-grow-1 text-truncate small">
                <strong>{attachmentName || "Attached file"}</strong>
              </div>
              <CButton size="sm" color="danger" variant="outline" onClick={() => { setAttachmentUrl(null); setAttachmentName(""); setAttachmentType(""); }}>
                <CIcon icon={cilX} />
              </CButton>
            </div>
          ) : (
            <div className="text-muted" style={{ fontSize: 11 }}>
              Supported: Images (PNG, JPG, WebP), PDFs, Documents (Max 15MB). You can also paste screenshots directly.
            </div>
          )}
        </div>

        {/* 🤖 Instant AI Assistant Option */}
        <div className="p-3 rounded mb-1" style={{ background: "linear-gradient(135deg, rgba(67,97,238,0.08), rgba(114,9,183,0.08))", border: "1px dashed #4361ee" }}>
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div>
              <strong className="d-flex align-items-center gap-1 text-primary" style={{ fontSize: 13 }}>
                🤖 Want an instant answer without waiting?
              </strong>
              <div className="text-muted small" style={{ fontSize: 12 }}>
                For general queries about policies, loan interest, RD rules, or bylaws, our AI Financial Advisor can answer in 2 seconds!
              </div>
            </div>
            <CButton
              size="sm"
              color="info"
              className="text-white fw-bold d-flex align-items-center gap-1 shadow-sm"
              onClick={() => {
                const q = (subject ? subject + ": " : "") + (content || "General query regarding society schemes");
                window.dispatchEvent(new CustomEvent('openAiAssistantWithQuery', { detail: { query: q } }))
              }}
            >
              Ask AI Assistant First
            </CButton>
          </div>
        </div>
      </CModalBody>
      <CModalFooter className="d-flex justify-content-between">
        <CButton color="secondary" variant="ghost" onClick={onClose} disabled={busy}>Cancel</CButton>
        <div className="d-flex gap-2">
          <CButton className="text-white fw-bold px-4 shadow-sm" style={{ background:"linear-gradient(135deg,#4361ee,#7209b7)", border:"none" }} onClick={submit} disabled={busy}>
            {busy ? <><CSpinner size="sm" className="me-2" />Submitting...</> : <><CIcon icon={cilSend} className="me-2" />Submit to Society Executives</>}
          </CButton>
        </div>
      </CModalFooter>
    </CModal>
  )
}

// ── Main Member Helpdesk View ────────────────────────────────────────────────
const MemberHelpdesk = () => {
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
  const [showNew,        setShowNew]        = useState(false)
  const [search,         setSearch]         = useState("")
  const [filter,         setFilter]         = useState("")
  const [previewImage,   setPreviewImage]   = useState(null)
  const chatEndRef       = useRef(null)
  const replyFileInputRef= useRef(null)

  const loadThreads = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set("search", search)
      if (filter) params.set("status", filter)
      const res  = await fetch(`${API}/api/communication/threads?${params}`, { headers:{ "Authorization":`Bearer ${token}` } })
      const data = await res.json()
      if (data.success && Array.isArray(data.data)) {
        setThreads(data.data)
      }
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
        setThreads(prev => prev.map(t => t.ticketId === ticketId ? { ...t, unreadByMember: 0 } : t))
      }
    } catch {}
    finally { setLoadingMsg(false) }
  }

  const handleReplyFile = (file) => {
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

  const handleReplyPaste = (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const blob = items[i].getAsFile()
        handleReplyFile(blob)
        break
      }
    }
  }

  const sendReply = async () => {
    if ((!replyText.trim() && !replyAttachUrl) || !active) return
    setSending(true)
    try {
      const res  = await fetch(`${API}/api/communication/threads/${active.ticketId}/reply`, {
        method: "POST",
        headers: { "Content-Type":"application/json", "Authorization":`Bearer ${token}` },
        body: JSON.stringify({
          content: replyText.trim(),
          attachmentUrl: replyAttachUrl,
          attachmentName: replyAttachName,
          attachmentType: replyAttachType
        })
      })
      const data = await res.json()
      if (data.success) {
        setActive(prev => ({
          ...prev,
          messages: [...prev.messages, data.data],
          status: prev.status === "RESOLVED" ? "IN_PROGRESS" : prev.status
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

  useEffect(() => { loadThreads() }, [loadThreads])
  useEffect(() => { if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior:"smooth" }) }, [active?.messages?.length])

  return (
    <CRow className="g-3">
      <CCol xs={12}>
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
          <div>
            <h4 className="mb-0 fw-bold d-flex align-items-center gap-2" style={{ color:"#4361ee" }}>
              <CIcon icon={cilEnvelopeOpen} size="lg" /> Member Helpdesk &amp; Communication
            </h4>
            <p className="text-muted small mb-0 mt-1">Communicate directly with Society Executive Officers &amp; Admins. Track queries and get resolution updates.</p>
          </div>
          <CButton className="text-white fw-bold shadow-sm" style={{ background:"linear-gradient(135deg,#4361ee,#7209b7)", border:"none" }} onClick={() => setShowNew(true)}>
            <CIcon icon={cilPlus} className="me-1" /> New Query
          </CButton>
        </div>

        {/* 🤖 Instant AI Self-Service Banner */}
        <CCard className="border-0 shadow-sm mb-3" style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)", color: "#fff", borderRadius: 12 }}>
          <CCardBody className="p-3">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
              <div>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <span style={{ fontSize: 20 }}>🤖</span>
                  <strong className="fs-6 text-white">Instant AI Financial Advisor (24/7 Self-Service)</strong>
                  <CBadge color="info" className="px-2">Instant Answers</CBadge>
                </div>
                <div className="small text-white-50">
                  Ask our AI Assistant for instant answers to society rules, loan eligibility, RD schemes, and bylaws without waiting for staff review!
                </div>
              </div>
              <CButton
                size="sm"
                color="light"
                className="fw-bold px-3 shadow-sm text-primary"
                onClick={() => window.dispatchEvent(new CustomEvent('openAiAssistant'))}
              >
                Open AI Chat 💬
              </CButton>
            </div>

            {/* Quick Question Chips */}
            <div className="d-flex gap-2 flex-wrap mt-3 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }}>
              <span className="small text-white-50 d-flex align-items-center">Popular Topics:</span>
              {[
                "What is the maximum loan limit and interest rate?",
                "How is monthly RD interest calculated?",
                "What documents are needed for KYC update?",
                "How to apply for a loan foreclosure?"
              ].map((question, qIdx) => (
                <button
                  key={qIdx}
                  type="button"
                  className="btn btn-sm btn-outline-light rounded-pill py-0 px-2 text-start"
                  style={{ fontSize: 11, borderColor: "rgba(255,255,255,0.3)" }}
                  onClick={() => window.dispatchEvent(new CustomEvent('openAiAssistantWithQuery', { detail: { query: question } }))}
                >
                  ⚡ {question}
                </button>
              ))}
            </div>
          </CCardBody>
        </CCard>
      </CCol>

      {/* ── Left: Thread List ── */}
      <CCol xs={12} md={4} lg={3}>
        <CCard className="shadow-sm h-100" style={{ borderTop:"3px solid #4361ee" }}>
          <CCardHeader className="py-2 bg-white">
            <CInputGroup size="sm" className="mb-2">
              <CInputGroupText><CIcon icon={cilSearch} /></CInputGroupText>
              <CFormInput placeholder="Search tickets..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && loadThreads()} />
              {search && <CButton color="secondary" variant="outline" onClick={() => setSearch("")}><CIcon icon={cilX} /></CButton>}
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
            <CCardBody className="p-3" style={{ overflowY:"auto", minHeight:300, maxHeight:"48vh", background:"#f8f9ff" }}>
              {active.messages.map((msg, idx) => (
                <MessageBubble
                  key={msg._id || msg.createdAt || idx}
                  msg={msg}
                  isSelf={msg.senderRole === "member"}
                  onPreviewImage={(url, name) => setPreviewImage({ url, name })}
                />
              ))}
              <div ref={chatEndRef} />
            </CCardBody>

            {/* Reply box */}
            {active.status !== "CLOSED" ? (
              <div className="p-3 border-top bg-white">
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
                    title="Attach image or file"
                    style={{ borderRadius: 10, height: 48 }}
                    onClick={() => replyFileInputRef.current?.click()}
                  >
                    <CIcon icon={cilPaperclip} />
                  </CButton>
                  <input
                    type="file"
                    ref={replyFileInputRef}
                    style={{ display: "none" }}
                    accept="image/*,.pdf,.doc,.docx"
                    onChange={e => handleReplyFile(e.target.files?.[0])}
                  />

                  <CFormTextarea
                    rows={2}
                    placeholder={active.status === "RESOLVED" ? "Send a message to reopen this ticket... (Ctrl+V to paste screenshot)" : "Type your reply... (Tip: Paste screenshot with Ctrl+V)"}
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onPaste={handleReplyPaste}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                    style={{ resize:"none", borderRadius:10, fontSize:14 }}
                  />
                  <CButton
                    className="text-white fw-bold"
                    style={{ background:"linear-gradient(135deg,#4361ee,#7209b7)", border:"none", borderRadius:10, minWidth:52, height:48 }}
                    onClick={sendReply}
                    disabled={sending || (!replyText.trim() && !replyAttachUrl)}
                  >
                    {sending ? <CSpinner size="sm" /> : <CIcon icon={cilSend} />}
                  </CButton>
                </div>
                <div className="text-muted" style={{ fontSize:10, marginTop:4 }}>Press Enter to send · Shift+Enter for new line · Paste screenshot with Ctrl+V</div>
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

export default MemberHelpdesk
