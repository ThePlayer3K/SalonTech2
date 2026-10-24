const express = require('express');
const controller = require('../controllers/servicoController');
const { requireAuth, requireRole } = require('../middlewares/auth');

const router = express.Router();
router.use(requireAuth);
router.get('/', controller.index);
router.post('/', requireRole('admin', 'master'), controller.create);
router.post('/:id', requireRole('admin', 'master'), controller.update);
router.post('/:id/excluir', requireRole('admin', 'master'), controller.remove);

module.exports = router;
