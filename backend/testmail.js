require('dotenv').config();
const { sendResetCode } = require('./utils/mailer');

sendResetCode(process.env.MAIL_USER, '123456')
  .then(() => console.log('Gửi OK, kiểm tra hộp thư (cả Spam)'))
  .catch((err) => console.error('LỖI:', err.code, err.message));