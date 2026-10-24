const Produto = require('../models/Produto');
const { createCatalogoController, requiredText, ValidationError } = require('./catalogoController');

function parseForm(body) {
  const nome = requiredText(body.nome, 'o nome do produto', 120);
  const categoria = requiredText(body.categoria, 'a categoria', 80);
  const quantity = String(body.qtd_estoque ?? '').trim();
  if (!/^\d+$/.test(quantity) || !Number.isSafeInteger(Number(quantity)) || Number(quantity) > 2147483647) {
    throw new ValidationError('Informe uma quantidade inteira entre 0 e 2147483647.');
  }
  return { nome, categoria, qtd_estoque: Number(quantity) };
}

module.exports = createCatalogoController({
  model: Produto, basePath: '/produtos', title: 'Produtos', singular: 'produto',
  description: 'Cadastre produtos e mantenha a quantidade em estoque e a categoria atualizadas.',
  fields: [
    { name: 'nome', label: 'Nome', type: 'text', maxLength: 120 },
    { name: 'qtd_estoque', label: 'Quantidade', type: 'number', min: 0, max: 2147483647, step: 1 },
    { name: 'categoria', label: 'Categoria', type: 'text', maxLength: 80 }
  ],
  parseForm,
  canManage: (user) => ['admin', 'master', 'profissional'].includes(user?.papel)
});
