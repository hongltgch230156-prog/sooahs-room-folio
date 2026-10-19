// backend/utils/mailer.js
const nodemailer = require('nodemailer');

let transporter;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
    });
  }
  return transporter;
}

async function sendResetCode(to, code) {
  await getTransporter().sendMail({
    from: process.env.MAIL_FROM || process.env.MAIL_USER,
    to,
    subject: `${code} là mã đặt lại mật khẩu Wondera của bạn`,
    text:
      `Mã xác nhận của bạn là: ${code}\n` +
      `Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px">
        <h2 style="color:#5a43a8;margin:0 0 12px">Wondera</h2>
        <p>Mã xác nhận đặt lại mật khẩu của bạn:</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>
        <p style="color:#666;font-size:13px">Mã có hiệu lực trong 10 phút.
        Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
      </div>`,
  });
}

module.exports = { sendResetCode };