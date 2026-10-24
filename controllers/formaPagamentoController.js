const FormaPagamento = require('../models/FormaPagamento');
const { isAdmin } = require('../middlewares/auth');
const { createCatalogoController, requiredText } = require('./catalogoController');

module.exports = createCatalogoController({
  model: FormaPagamento, basePath: '/pagamentos', title: 'Formas de pagamento', singular: 'forma de pagamento',
  description: 'Consulte as formas de pagamento aceitas pelo salão.',
  fields: [{ name: 'nome', label: 'Nome', type: 'text', maxLength: 80 }],
  parseForm: (body) => ({ nome: requiredText(body.nome, 'o nome da forma de pagamento', 80) }),
  canManage: isAdmin
});
