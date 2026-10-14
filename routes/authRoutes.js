const express = require('express');
const { loginForm, login, logout } = require('../controllers/authController');
const { requireGuest, requireAuth } = require('../middlewares/auth');

const router = express.Router();

router.get('/login', requireGuest, loginForm);
router.post('/login', requireGuest, login);
router.post('/logout', requireAuth, logout);

module.exports = router;
