const { query } = require('../config/db');

async function listar() {
  const result = await query('SELECT id, nome FROM public.forma_pagamento ORDER BY nome, id');
  return result.rows;
}

async function criar({ nome }) {
  const result = await query('INSERT INTO public.forma_pagamento (nome) VALUES ($1) RETURNING id', [nome]);
  return result.rows[0];
}

async function atualizar(id, { nome }) {
  const result = await query('UPDATE public.forma_pagamento SET nome=$1 WHERE id=$2 RETURNING id', [nome, id]);
  return result.rows[0] || null;
}

async function excluir(id) {
  const result = await query('DELETE FROM public.forma_pagamento WHERE id=$1 RETURNING id', [id]);
  return result.rows[0] || null;
}

module.exports = { listar, criar, atualizar, excluir };
