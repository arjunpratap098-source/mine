const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// OAuth routes
router.get('/login', authController.initiateAuth);
router.get('/youtube/callback', authController.handleCallback);

// User management routes
router.get('/users', authController.getUsers);
router.put('/users/:userId/deactivate', authController.deactivateUser);

module.exports = router;