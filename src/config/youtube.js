const { google } = require('googleapis');
const config = require('./config');

// OAuth2 Client for YouTube API
const oauth2Client = new google.auth.OAuth2(
  config.google.clientId,
  config.google.clientSecret,
  config.google.redirectUri
);

// Required scopes for YouTube upload
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

// Generate OAuth URL for user authentication
const getAuthUrl = () => {
  // Use the same method that works in test-oauth.js
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    response_type: 'code' // Explicitly set response_type
  });
};

// Create YouTube service instance
const createYoutubeService = (tokens) => {
  const auth = new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
  );
  
  auth.setCredentials(tokens);
  
  return google.youtube({
    version: 'v3',
    auth
  });
};

module.exports = {
  oauth2Client,
  getAuthUrl,
  createYoutubeService,
  SCOPES
};