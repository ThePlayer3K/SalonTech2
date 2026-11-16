const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth');
const controller = require('../controllers/equipeController');

const router = express.Router();

router.get('/equipe', requireAuth, requireRole('admin', 'master'), controller.index);
router.post('/equipe', requireAuth, requireRole('admin', 'master'), controller.create);
router.post('/equipe/:usuarioId', requireAuth, requireRole('admin', 'master'), controller.update);
router.post('/equipe/:usuarioId/excluir', requireAuth, requireRole('admin', 'master'), controller.remove);
router.get('/minha-conta', requireAuth, controller.profile);
router.post('/minha-conta', requireAuth, controller.update);
// Mantém compatibilidade com a rota administrativa já existente.
router.get('/usuarios', requireAuth, requireRole('admin', 'master'), (req, res) => res.redirect('/equipe'));

module.exports = router;
