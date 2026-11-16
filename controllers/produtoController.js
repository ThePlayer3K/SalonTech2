const Produto = require('../models/Produto');
const { createCatalogoController } = require('./catalogoController');
const { requiredText, ValidationError } = require('../utils/validation');

function parseForm(body) {
  const nome = requiredText(body.nome, 'o nome do produto', 120);
  const categoria = requiredText(body.categoria, 'a categoria', 80);
  const qtd_estoque = normalizarQuantidadeEstoque(body.qtd_estoque);
  return { nome, categoria, qtd_estoque };
}

function normalizarQuantidadeEstoque(valor) {
  const texto = String(valor ?? '').trim();
  const quantidade = Number(texto);
  if (!/^\d+$/.test(texto) || !Number.isSafeInteger(quantidade) || quantidade > 2147483647) {
    throw new ValidationError('Informe uma quantidade inteira entre 0 e 2147483647.');
  }
  return quantidade;
}

module.exports = createCatalogoController({
  model: Produto,
  basePath: '/produtos',
  title: 'Produtos',
  singular: 'produto',
  description: 'Cadastre produtos e mantenha a quantidade em estoque e a categoria atualizadas.',
  fields: [
    {
      name: 'nome',
      label: 'Nome',
      type: 'text',
      maxLength: 120
    },
    {
      name: 'qtd_estoque',
      label: 'Quantidade',
      type: 'text',
      mask: 'integer',
      inputmode: 'numeric',
      min: 0,
      max: 2147483647,
      maxLength: 10
    },
    {
      name: 'categoria',
      label: 'Categoria',
      type: 'text',
      maxLength: 80
    }
  ],
  parseForm,
  canManage: (user) => ['admin', 'master', 'profissional'].includes(user?.papel)
});
