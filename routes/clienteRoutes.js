const express = require('express');
const controller = require('../controllers/clienteController');
const { requireAuth, requireRole } = require('../middlewares/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin', 'master'));
router.get('/', controller.index);
router.post('/', controller.create);
router.post('/:id', controller.update);
router.post('/:id/excluir', controller.remove);

module.exports = router;
