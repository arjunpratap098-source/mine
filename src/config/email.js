const nodemailer = require('nodemailer');
const config = require('./config');

// Gmail SMTP transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: config.email.user,
    pass: config.email.pass
  }
});

// Verify email configuration on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('Email configuration error:', error);
  } else {
    console.log('Email service ready');
  }
});

module.exports = transporter;