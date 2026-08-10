const nodemailer = require('nodemailer');
require('dotenv').config();

// Create a transporter using SMTP (defaulting to Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-society@gmail.com', // Replace via .env
    pass: process.env.EMAIL_PASS || 'your-app-password',      // Replace via .env
  },
});

// A standard HTML wrapper for branded emails
const getHtmlTemplate = (title, content) => `
  <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
    <div style="background-color: #1e293b; padding: 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">Mahadev Society</h1>
      <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 14px;">Co-operative Thrift & Credit Society</p>
    </div>
    <div style="padding: 32px; background-color: #ffffff; color: #334155; line-height: 1.6;">
      <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">${title}</h2>
      ${content}
    </div>
    <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">
      This is an automated system notification. Please do not reply directly to this email.<br>
      © ${new Date().getFullYear()} Mahadev Co-operative Society
    </div>
  </div>
`;

exports.sendWelcomeEmail = async (email, name, vendorNo, plainPassword) => {
  if (!email) return;
  
  const content = `
    <p>Dear <strong>${name}</strong>,</p>
    <p>Welcome to the Mahadev Co-operative Society! Your member account has been successfully approved and created.</p>
    <div style="background-color: #f1f5f9; padding: 16px; border-radius: 6px; margin: 24px 0;">
      <p style="margin: 0 0 8px 0;"><strong>Your Login Credentials:</strong></p>
      <ul style="margin: 0; padding-left: 20px;">
        <li>Vendor No: <strong>${vendorNo}</strong></li>
        <li>Temporary Password: <strong>${plainPassword}</strong></li>
      </ul>
    </div>
    <p>For security purposes, you will be prompted to change your temporary password immediately upon your first login.</p>
    <p style="margin-top: 24px;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" style="background-color: #3b82f6; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Login to your Dashboard</a>
    </p>
  `;

  try {
    await transporter.sendMail({
      from: `"Mahadev Society" <${process.env.EMAIL_USER || 'noreply@mahadevsociety.com'}>`,
      to: email,
      subject: 'Welcome to Mahadev Society - Your Account is Ready',
      html: getHtmlTemplate('Account Activated', content)
    });
    console.log(`Welcome email sent to ${email}`);
  } catch (error) {
    console.error(`Failed to send welcome email to ${email}:`, error);
  }
};

exports.sendLoanNotification = async (email, name, amount, status) => {
  if (!email) return;

  const isApproved = status.toLowerCase() === 'approved';
  const color = isApproved ? '#10b981' : '#ef4444';
  const statusText = isApproved ? 'Approved' : 'Rejected';

  const content = `
    <p>Dear <strong>${name}</strong>,</p>
    <p>We are writing to inform you about the status of your recent loan application.</p>
    <div style="background-color: #f1f5f9; border-left: 4px solid ${color}; padding: 16px; margin: 24px 0;">
      <p style="margin: 0 0 8px 0;"><strong>Loan Application Status:</strong></p>
      <p style="margin: 0; font-size: 18px;">
        <span style="color: ${color}; font-weight: bold; text-transform: uppercase;">${statusText}</span>
      </p>
      ${isApproved ? `<p style="margin: 8px 0 0 0;">Approved Amount: <strong>₹${new Intl.NumberFormat('en-IN').format(amount)}</strong></p>` : ''}
    </div>
    <p>${isApproved 
      ? 'The funds will be disbursed to your registered bank account shortly. You can track your EMI schedule and outstanding balance directly from your Member Dashboard.' 
      : 'If you have any questions regarding this decision, please contact the society administrators.'}</p>
  `;

  try {
    await transporter.sendMail({
      from: `"Mahadev Society" <${process.env.EMAIL_USER || 'noreply@mahadevsociety.com'}>`,
      to: email,
      subject: `Loan Application ${statusText}`,
      html: getHtmlTemplate('Loan Application Update', content)
    });
  } catch (error) {
    console.error(`Failed to send loan notification to ${email}:`, error);
  }
};

exports.sendReceipt = async (email, name, amount, category, entryType) => {
  if (!email) return;

  const isCredit = entryType.toUpperCase() === 'CREDIT';
  const formattedAmount = `₹${new Intl.NumberFormat('en-IN').format(amount)}`;
  const displayCategory = category.replace(/_/g, ' ');

  const content = `
    <p>Dear <strong>${name}</strong>,</p>
    <p>A new transaction has been successfully recorded in your account.</p>
    
    <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 24px 0; text-align: center;">
      <div style="font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Transaction Amount</div>
      <div style="font-size: 32px; font-weight: 700; color: ${isCredit ? '#10b981' : '#ef4444'};">
        ${isCredit ? '+' : '-'}${formattedAmount}
      </div>
      <div style="margin-top: 12px; display: inline-block; padding: 4px 12px; background-color: #e2e8f0; border-radius: 100px; font-size: 12px; font-weight: 600; color: #475569;">
        ${displayCategory}
      </div>
    </div>
    
    <p>You can view your updated balances and full transaction history by logging into the Member Portal.</p>
  `;

  try {
    await transporter.sendMail({
      from: `"Mahadev Society" <${process.env.EMAIL_USER || 'noreply@mahadevsociety.com'}>`,
      to: email,
      subject: `Transaction Receipt - ${displayCategory}`,
      html: getHtmlTemplate('Transaction E-Receipt', content)
    });
  } catch (error) {
    console.error(`Failed to send receipt to ${email}:`, error);
  }
};
