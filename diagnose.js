require('dotenv').config();

console.log('=== Configuration Diagnostic ===\n');

console.log('1. Environment Variables:');
console.log('   GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? '✓ Set' : '✗ Missing');
console.log('   GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? '✓ Set' : '✗ Missing');
console.log('   GOOGLE_REDIRECT_URI:', process.env.GOOGLE_REDIRECT_URI || '✗ Missing');
console.log('   MONGODB_URI:', process.env.MONGODB_URI ? '✓ Set' : '✗ Missing');
console.log('   EMAIL_USER:', process.env.EMAIL_USER || '✗ Missing');
console.log('   EMAIL_PASS:', process.env.EMAIL_PASS ? '✓ Set' : '✗ Missing');
console.log('   MAIN_SERVER_URL:', process.env.MAIN_SERVER_URL || '✗ Missing');

console.log('\n2. OAuth URL Generation Test:');
try {
  const { google } = require('googleapis');
  
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  
  const SCOPES = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  
  console.log('   ✓ OAuth URL generated successfully');
  console.log('\n3. Generated URL:');
  console.log(authUrl);
  
  console.log('\n4. URL Analysis:');
  console.log('   Contains response_type?', authUrl.includes('response_type=code') ? '✓ Yes' : '✗ No');
  console.log('   Contains client_id?', authUrl.includes('client_id=') ? '✓ Yes' : '✗ No');
  console.log('   Contains redirect_uri?', authUrl.includes('redirect_uri=') ? '✓ Yes' : '✗ No');
  console.log('   Contains scope?', authUrl.includes('scope=') ? '✓ Yes' : '✗ No');
  
} catch (error) {
  console.log('   ✗ Error:', error.message);
}

console.log('\n=== End Diagnostic ===');