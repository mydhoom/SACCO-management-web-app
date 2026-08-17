/**
 * duplicateDetector.js
 *
 * Client-side duplicate detection engine for SACCO data uploads.
 *
 * Detects duplicates across two contexts:
 *  1. WITHIN the batch being uploaded (intra-batch duplicates)
 *  2. AGAINST existing server data (inter-batch / historical duplicates)
 *
 * Duplicate rules by upload type:
 *
 *  "shares" — Same Vendor_No + Transaction_Date + Share_Deduction
 *  "loans"  — Same Vendor_No + Transaction_Date + Total_EMI_Amount + Loan_ID
 *  "master" — Same Vendor_No (member already exists)
 *
 * Returns a structured array of DuplicateFlag objects:
 * {
 *   id:            string (unique flag ID)
 *   type:          'INTRA_BATCH' | 'EXISTING_RECORD'
 *   severity:      'HIGH' | 'MEDIUM' | 'LOW'
 *   rowIndex:      number   (0-based index in processedData)
 *   incomingRow:   object   (the new row being uploaded)
 *   conflictRow:   object   (the row it conflicts with)
 *   reason:        string   (human-readable explanation)
 *   matchFields:   string[] (which fields matched)
 *   status:        'PENDING' | 'ACCEPTED' | 'REJECTED'
 *   adminNote:     string
 * }
 */

const STORAGE_KEY = 'sacco_duplicate_queue'

// ─── Normalizer ───────────────────────────────────────────────────────────────
const normDate = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt)) return String(d).trim()
  return dt.toISOString().split('T')[0]
}

const normNum = (n) => Math.round(Number(String(n).replace(/[₹,\s]/g, '')) || 0)

const normStr = (s) => String(s || '').trim().toUpperCase()

// ─── Key builders per upload type ────────────────────────────────────────────
const buildKey = (row, type) => {
  if (type === 'shares') {
    return `${normStr(row.Vendor_No)}|${normDate(row.Transaction_Date)}|${normNum(row.Share_Deduction)}|${normNum(row.RD_Deduction)}`
  }
  if (type === 'loans') {
    return `${normStr(row.Vendor_No)}|${normDate(row.Transaction_Date)}|${normNum(row.Total_EMI_Amount)}|${normStr(row.Loan_ID)}`
  }
  if (type === 'master') {
    return `${normStr(row.Vendor_No)}`
  }
  // Generic fallback
  return JSON.stringify(row)
}

const getMatchFields = (type) => {
  if (type === 'shares') return ['Vendor_No', 'Transaction_Date', 'Share_Deduction', 'RD_Deduction']
  if (type === 'loans')  return ['Vendor_No', 'Transaction_Date', 'Total_EMI_Amount', 'Loan_ID']
  if (type === 'master') return ['Vendor_No']
  return []
}

const describeRow = (row, type) => {
  if (type === 'shares') return `${row.Member_Name || row.Vendor_No} | Date: ${row.Transaction_Date} | Share: ₹${normNum(row.Share_Deduction)} | RD: ₹${normNum(row.RD_Deduction)}`
  if (type === 'loans')  return `${row.Member_Name || row.Vendor_No} | ${row.Loan_ID} | Date: ${row.Transaction_Date} | EMI: ₹${normNum(row.Total_EMI_Amount)}`
  if (type === 'master') return `${row.Full_Name || row.Vendor_No} | Emp: ${row.Vendor_No}`
  return JSON.stringify(row).slice(0, 80)
}

// ─── 1. INTRA-BATCH: detect duplicates within the same uploaded file ──────────
export const detectIntraBatchDuplicates = (processedData, type) => {
  const seen = new Map() // key → first occurrence index
  const flags = []

  processedData.forEach((row, idx) => {
    if (!row._selected || !row._isValid) return
    const key = buildKey(row, type)
    if (seen.has(key)) {
      const firstIdx = seen.get(key)
      flags.push({
        id: `INTRA-${idx}-${firstIdx}`,
        type: 'INTRA_BATCH',
        severity: 'HIGH',
        rowIndex: idx,
        incomingRow: row,
        conflictRow: processedData[firstIdx],
        conflictRowIndex: firstIdx,
        reason: `This row is an exact duplicate of Row #${firstIdx + 1} in the same file.`,
        matchFields: getMatchFields(type),
        description: describeRow(row, type),
        status: 'PENDING',
        adminNote: '',
      })
    } else {
      seen.set(key, idx)
    }
  })

  return flags
}

// ─── 2. INTER-BATCH: compare against existing server records ─────────────────
export const detectInterBatchDuplicates = async (processedData, type, apiBase) => {
  const flags = []
  const token = localStorage.getItem('adminToken')

  // Only check valid, selected rows
  const candidateRows = processedData.filter(r => r._selected && r._isValid)
  if (candidateRows.length === 0) return []

  try {
    const res = await fetch(`${apiBase}/api/admin/duplicate-check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ rows: candidateRows, type }),
    })

    if (!res.ok) {
      console.warn('Server duplicate check returned', res.status, '— falling back to local-only detection.')
      return []
    }

    const { duplicates } = await res.json()
    // Server returns: [{ rowIndex, existingRecord, matchFields, severity }]
    duplicates.forEach(d => {
      flags.push({
        id: `EXIST-${d.rowIndex}-${Date.now()}`,
        type: 'EXISTING_RECORD',
        severity: d.severity || 'HIGH',
        rowIndex: d.rowIndex,
        incomingRow: candidateRows[d.rowIndex],
        conflictRow: d.existingRecord,
        reason: `A matching record already exists in the database.`,
        matchFields: d.matchFields || getMatchFields(type),
        description: describeRow(candidateRows[d.rowIndex], type),
        status: 'PENDING',
        adminNote: '',
      })
    })
  } catch (err) {
    console.warn('Duplicate check API unreachable — skipping server comparison:', err.message)
    // Graceful degradation: intra-batch detection still works
  }

  return flags
}

// ─── 3. FULL DETECTION PIPELINE ──────────────────────────────────────────────
/**
 * Run full duplicate detection (intra-batch + inter-batch).
 * Saves results to localStorage under STORAGE_KEY for the review queue.
 * @returns {DuplicateFlag[]}
 */
export const runDuplicateDetection = async (processedData, type, apiBase) => {
  const intra = detectIntraBatchDuplicates(processedData, type)
  const inter = await detectInterBatchDuplicates(processedData, type, apiBase)
  const all = [...intra, ...inter]

  // Persist queue to localStorage for the review screen
  const existing = getStoredQueue()
  const newQueue = [
    ...existing.filter(f => f.status !== 'PENDING'), // keep resolved items
    ...all.map(f => ({
      ...f,
      uploadType: type,
      detectedAt: new Date().toISOString(),
    })),
  ]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newQueue))

  return all
}

// ─── 4. QUEUE MANAGEMENT (localStorage) ─────────────────────────────────────
export const getStoredQueue = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

export const updateFlagStatus = (flagId, status, adminNote = '') => {
  const queue = getStoredQueue()
  const updated = queue.map(f =>
    f.id === flagId ? { ...f, status, adminNote, resolvedAt: new Date().toISOString() } : f
  )
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  window.dispatchEvent(new CustomEvent('duplicateQueueUpdated', { detail: updated }))
  return updated
}

export const clearResolvedFlags = () => {
  const queue = getStoredQueue().filter(f => f.status === 'PENDING')
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  return queue
}

export const getPendingCount = () => getStoredQueue().filter(f => f.status === 'PENDING').length
