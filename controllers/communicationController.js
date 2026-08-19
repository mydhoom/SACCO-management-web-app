// controllers/communicationController.js
const CommunicationThread = require("../models/CommunicationThread");
const User = require("../models/User");

// ─── POST /api/communication/threads  (member creates new ticket) ───────────
exports.createThread = async (req, res) => {
  try {
    const { subject, category, priority, content, attachmentUrl, attachmentName, attachmentType } = req.body;
    if (!subject || !content) {
      return res.status(400).json({ success: false, message: "subject and content are required." });
    }
    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    const role = (user.role || req.user.role || "member").toLowerCase();
    const thread = new CommunicationThread({
      memberId:   user._id,
      vendorNo:   user.vendorNo,
      memberName: user.name,
      subject:    subject.trim(),
      category:   category || "GENERAL_INQUIRY",
      priority:   priority || "NORMAL",
      status:     "OPEN",
      unreadByAdmin: 1,
      unreadByMember: 0,
      lastMessageAt: new Date(),
      lastMessageSnippet: content.substring(0, 100),
      messages: [{
        senderId:       user._id,
        senderName:     user.name,
        senderRole:     role,
        content:        content.trim(),
        attachmentUrl:  attachmentUrl  || null,
        attachmentName: attachmentName || null,
        attachmentType: attachmentType || null,
        readByAdmin:    false,
        readByMember:   true
      }]
    });
    await thread.save();
    return res.status(201).json({ success: true, message: "Query submitted successfully.", data: thread });
  } catch (err) {
    console.error("createThread:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/communication/threads  (member: own threads | admin: all) ─────
exports.getThreads = async (req, res) => {
  try {
    const { status, category, priority, search, page = 1, limit = 50 } = req.query;
    const role = (req.user?.role || "member").toLowerCase();
    const query = {};

    if (role === "member") {
      query.memberId = req.user.id || req.user._id;
    }
    if (status)   query.status   = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;
    if (search) {
      const q = new RegExp(search, "i");
      query.$or = [{ subject: q }, { memberName: q }, { vendorNo: q }, { ticketId: q }];
    }

    const threads = await CommunicationThread.find(query, { messages: 0 })
      .sort({ lastMessageAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await CommunicationThread.countDocuments(query);
    return res.status(200).json({ success: true, data: threads, total, page: Number(page) });
  } catch (err) {
    console.error("getThreads:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/communication/threads/:ticketId  (full thread + messages) ─────
exports.getThreadById = async (req, res) => {
  try {
    const thread = await CommunicationThread.findOne({ ticketId: req.params.ticketId });
    if (!thread) return res.status(404).json({ success: false, message: "Thread not found." });

    const role = (req.user?.role || "member").toLowerCase();
    const userId = (req.user.id || req.user._id).toString();

    // Member access control
    if (role === "member" && thread.memberId.toString() !== userId) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    // Mark messages as read
    let changed = false;
    if (role === "member") {
      thread.messages.forEach(m => { if (!m.readByMember) { m.readByMember = true; changed = true; } });
      if (changed) thread.unreadByMember = 0;
    } else {
      thread.messages.forEach(m => { if (!m.readByAdmin) { m.readByAdmin = true; changed = true; } });
      if (changed) thread.unreadByAdmin = 0;
    }
    if (changed) await thread.save();

    return res.status(200).json({ success: true, data: thread });
  } catch (err) {
    console.error("getThreadById:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/communication/threads/:ticketId/reply  (add a message) ────────
exports.replyToThread = async (req, res) => {
  try {
    const { content, attachmentUrl, attachmentName, attachmentType } = req.body;
    if ((!content || !content.trim()) && !attachmentUrl) {
      return res.status(400).json({ success: false, message: "Message content or attachment is required." });
    }
    const thread = await CommunicationThread.findOne({ ticketId: req.params.ticketId });
    if (!thread) return res.status(404).json({ success: false, message: "Thread not found." });
    if (thread.status === "CLOSED") {
      return res.status(400).json({ success: false, message: "Cannot reply to a closed ticket. Please raise a new query." });
    }

    const role = (req.user?.role || "member").toLowerCase();
    const userId = (req.user.id || req.user._id).toString();

    if (role === "member" && thread.memberId.toString() !== userId) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const user = await User.findById(req.user.id || req.user._id);
    const textContent = content ? content.trim() : "(Attachment)";

    thread.messages.push({
      senderId:       user._id,
      senderName:     user.name,
      senderRole:     role,
      content:        textContent,
      attachmentUrl:  attachmentUrl  || null,
      attachmentName: attachmentName || null,
      attachmentType: attachmentType || null,
      readByAdmin:    role !== "member",
      readByMember:   role === "member",
      createdAt:      new Date()
    });

    thread.lastMessageAt      = new Date();
    thread.lastMessageSnippet = textContent.substring(0, 100);

    if (role === "member") {
      thread.unreadByAdmin += 1;
      if (thread.status === "AWAITING_MEMBER" || thread.status === "RESOLVED") {
        thread.status = "IN_PROGRESS";
      }
    } else {
      thread.unreadByMember += 1;
      if (thread.status === "OPEN") {
        thread.status = "IN_PROGRESS";
      }
    }

    
    await thread.save();
    const savedMessage = thread.messages[thread.messages.length - 1];

    // ── AUTOMATED EMAIL NOTIFICATION ON ADMIN REPLY ──
    if (role !== "member") {
      User.findById(thread.memberId)
        .select('name email emailId vendorNo')
        .then((memberUser) => {
          const targetEmail = memberUser?.email || memberUser?.emailId;
          if (targetEmail) {
            const { sendHelpdeskReplyEmail } = require('../utils/emailService');
            sendHelpdeskReplyEmail({
              to: targetEmail,
              name: thread.memberName || memberUser?.name || 'Member',
              ticketNo: thread.ticketId,
              subject: thread.subject,
              userMessage: thread.messages[0]?.content || '',
              adminReply: textContent,
              adminName: req.user?.name || 'Society Administration',
            }).catch((err) => console.error('Automated Helpdesk Email Dispatch Error:', err.message));
          }
        })
        .catch((e) => console.error('Member lookup for email notification failed:', e.message));
    }

    return res.status(200).json({ success: true, message: "Reply sent.", data: savedMessage });
  } catch (err) {
    console.error("replyToThread:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PUT /api/communication/threads/:ticketId/status  (admin changes status) ─
exports.updateStatus = async (req, res) => {
  try {
    const { status, assignedTo } = req.body;
    const VALID = ["OPEN","IN_PROGRESS","AWAITING_MEMBER","RESOLVED","CLOSED"];
    if (!VALID.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Valid: ${VALID.join(", ")}` });
    }
    const thread = await CommunicationThread.findOne({ ticketId: req.params.ticketId });
    if (!thread) return res.status(404).json({ success: false, message: "Thread not found." });

    thread.status = status;
    if (assignedTo) thread.assignedTo = assignedTo;
    if (status === "RESOLVED" || status === "CLOSED") {
      const user = await User.findById(req.user.id || req.user._id);
      thread.resolvedAt = new Date();
      thread.resolvedBy = user?.name || req.user.name || "Admin";
      thread.unreadByMember += 1;
    }
    await thread.save();
    return res.status(200).json({ success: true, message: `Ticket ${status.toLowerCase()}.`, data: { status: thread.status } });
  } catch (err) {
    console.error("updateStatus:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/communication/unread-count  (badge counts for nav) ─────────────
exports.getUnreadCount = async (req, res) => {
  try {
    const role = (req.user?.role || "member").toLowerCase();
    let count = 0;
    if (role === "member") {
      const threads = await CommunicationThread.find({ memberId: req.user.id || req.user._id }, { unreadByMember: 1 });
      count = threads.reduce((s, t) => s + (t.unreadByMember || 0), 0);
    } else {
      const agg = await CommunicationThread.aggregate([
        { $match: { unreadByAdmin: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: "$unreadByAdmin" } } }
      ]);
      count = agg[0]?.total || 0;
    }
    return res.status(200).json({ success: true, count });
  } catch (err) {
    console.error("getUnreadCount:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};


// ─── GET /api/communication/email/status (Check SMTP Gateway & Configuration) ─
exports.getEmailStatus = async (req, res) => {
  try {
    const { verifyEmailConfig } = require("../utils/emailService");
    const isConfigured = !!(process.env.EMAIL_USER && (process.env.EMAIL_PASS || process.env.SMTP_HOST));
    const sender = process.env.EMAIL_USER || "mahadevsociety2026@gmail.com";
    const host = process.env.SMTP_HOST || "Gmail (Standard)";

    let liveStatus = { configured: isConfigured, host, sender };

    if (isConfigured && process.env.EMAIL_PASS) {
      const verification = await verifyEmailConfig();
      liveStatus = { ...liveStatus, ...verification };
    } else {
      liveStatus.message = "SMTP credentials pending in .env (Mock mode active - logs previews to console).";
    }

    return res.status(200).json({ success: true, status: liveStatus });
  } catch (error) {
    console.error("getEmailStatus Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ─── POST /api/communication/email/test (Dispatch a test email to target) ───
exports.sendTestEmail = async (req, res) => {
  try {
    const { sendTestEmail } = require("../utils/emailService");
    const targetEmail = req.body.toEmail || req.user?.email || process.env.EMAIL_USER || "mahadevsociety2026@gmail.com";
    const result = await sendTestEmail({ to: targetEmail });

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: result.mock
          ? `[Mock Email Dispatched] Logged preview for ${targetEmail}. (Add EMAIL_PASS in .env to send live emails)`
          : `✅ Live test email dispatched to ${targetEmail}!`,
        details: result,
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error || "Failed to dispatch test email. Please check your SMTP credentials.",
      });
    }
  } catch (error) {
    console.error("sendTestEmail Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ─── POST /api/communication/email/broadcast (Send circular to members) ────
exports.broadcastNotice = async (req, res) => {
  try {
    const { sendEmail } = require("../utils/emailService");
    const { subject, message, filterRole, circle } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ error: "Subject and message are required." });
    }

    const query = { status: "approved" };
    if (filterRole) query.role = filterRole;
    if (circle) query.circle = circle;

    const members = await User.find(query).select("name email emailId vendorNo");
    const validRecipients = members.filter((m) => m.email || m.emailId);

    if (validRecipients.length === 0) {
      return res.status(400).json({ error: "No approved members found with registered email addresses." });
    }

    let dispatchedCount = 0;
    for (const member of validRecipients) {
      const emailAddr = member.email || member.emailId;
      await sendEmail({
        to: emailAddr,
        subject: `📢 Society Notice: ${subject}`,
        text: message,
        html: `
          <div style="font-family: 'Segoe UI', sans-serif; padding: 24px; color: #1e293b; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0;">
            <h3 style="color: #0284c7; margin-top: 0;">📢 Mahadev Co-operative Society Circular</h3>
            <p>Dear <strong>${member.name}</strong> (Vendor: <code>${member.vendorNo}</code>),</p>
            <div style="background: #f8fafc; padding: 18px; border-radius: 8px; border-left: 4px solid #0284c7; margin: 18px 0; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${message}</div>
            <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">— Issued by Society Administration</p>
          </div>
        `,
      });
      dispatchedCount++;
    }

    return res.status(200).json({
      success: true,
      message: `Broadcast message sent/queued for ${dispatchedCount} members.`,
      dispatchedCount,
    });
  } catch (error) {
    console.error("broadcastNotice Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
