/**
 * Manual Test Script for YouTube Auto-Uploader
 * 
 * Usage: node test-upload.js
 * 
 * This script manually triggers the upload job for testing purposes
 */

require('dotenv').config();
const connectDB = require('./src/config/database');
const uploadJob = require('./src/jobs/uploadJob');
const logger = require('./src/utils/logger');

const runTest = async () => {
  try {
    logger.info('========================================');
    logger.info('MANUAL TEST - YouTube Auto-Uploader');
    logger.info('========================================');

    // Connect to database
    await connectDB();
    logger.info('✅ Database connected');

    // Wait 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Run upload job
    logger.info('🚀 Starting upload job...');
    await uploadJob.runNow();

    logger.info('========================================');
    logger.info('✅ Test completed!');
    logger.info('Check your email for the report');
    logger.info('========================================');

    process.exit(0);
  } catch (error) {
    logger.error('❌ Test failed:', error);
    process.exit(1);
  }
};

runTest();