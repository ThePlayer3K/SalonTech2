const express = require('express');
const controller = require('../controllers/produtoController');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();
router.use(requireAuth);
router.get('/', controller.index);
router.post('/', controller.create);
router.post('/:id', controller.update);
router.post('/:id/excluir', controller.remove);

module.exports = router;
