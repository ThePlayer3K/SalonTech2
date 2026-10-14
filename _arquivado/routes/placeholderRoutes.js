const express = require('express');
const { placeholder } = require('../controllers/placeholderController');
const { requireAuth, requireRole } = require('../middlewares/auth');

const router = express.Router();

router.get('/produtos', requireAuth, placeholder);
router.get('/agendamentos', requireAuth, placeholder);
router.get('/servicos', requireAuth, placeholder);
router.get('/usuarios', requireAuth, requireRole('admin'), placeholder);

module.exports = router;
