const express = require('express');
const { dashboard } = require('../controllers/dashboardController');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

router.get('/dashboard', requireAuth, dashboard);

module.exports = router;
