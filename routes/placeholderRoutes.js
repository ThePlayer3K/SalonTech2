const express = require('express');
const { placeholder } = require('../controllers/placeholderController');
const { requireAuth, requireRole } = require('../middlewares/auth');

const router = express.Router();

router.get('/agendamentos', requireAuth, placeholder);
router.get('/equipe', requireAuth, requireRole('admin', 'master'), require('../controllers/equipeController').index);
router.get('/despesas', requireAuth, requireRole('admin', 'master'), placeholder);
router.get('/financas', requireAuth, requireRole('admin', 'master'), placeholder);
router.post('/equipe', requireAuth, requireRole('admin', 'master'), require('../controllers/equipeController').create);
router.post('/equipe/:usuarioId', requireAuth, requireRole('admin', 'master'), require('../controllers/equipeController').update);
router.post('/equipe/:usuarioId/excluir', requireAuth, requireRole('admin', 'master'), require('../controllers/equipeController').remove);
router.get('/minha-conta', requireAuth, require('../controllers/equipeController').profile);
router.post('/minha-conta', requireAuth, require('../controllers/equipeController').update);
// Mantém compatibilidade com a rota administrativa já existente.
router.get('/usuarios', requireAuth, requireRole('admin', 'master'), (req, res) => res.redirect('/equipe'));

module.exports = router;
