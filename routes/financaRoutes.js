const express = require('express');
const { index } = require('../controllers/financaController');
const { requireAuth, requireRole } = require('../middlewares/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin', 'master'));
router.get('/', index);

module.exports = router;
