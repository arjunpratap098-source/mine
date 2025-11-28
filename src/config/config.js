module.exports = {
  server: {
    port: process.env.PORT || 4000,
    env: process.env.NODE_ENV || 'development'
  },
  mainServer: {
    url: process.env.MAIN_SERVER_URL || 'http://localhost:3000',
    endpoints: {
      nextVideo: '/api/videos/next',
      markDownloaded: '/api/videos/:id/downloaded'
    }
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI
  },
  email: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    reportEmail: process.env.REPORT_EMAIL
  },
  upload: {
    scheduleTime: process.env.UPLOAD_SCHEDULE_TIME || '17:30',
    timezone: process.env.TIMEZONE || 'Asia/Kolkata'
  },
  youtube: {
    privacy: process.env.YOUTUBE_PRIVACY || 'public',
    category: process.env.YOUTUBE_CATEGORY || '24',
    tags: (process.env.YOUTUBE_TAGS || 'shorts,funny,comedy,movies').split(',')
  }
};