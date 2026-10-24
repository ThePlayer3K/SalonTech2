const { query } = require('../config/db');

async function listar() {
  const result = await query('SELECT id, nome, qtd_estoque, categoria FROM public.produto ORDER BY nome, id');
  return result.rows;
}

async function criar({ nome, qtd_estoque, categoria }) {
  const result = await query(
    'INSERT INTO public.produto (nome, qtd_estoque, categoria) VALUES ($1, $2, $3) RETURNING id',
    [nome, qtd_estoque, categoria]
  );
  return result.rows[0];
}

async function atualizar(id, { nome, qtd_estoque, categoria }) {
  const result = await query(
    'UPDATE public.produto SET nome=$1, qtd_estoque=$2, categoria=$3 WHERE id=$4 RETURNING id',
    [nome, qtd_estoque, categoria, id]
  );
  return result.rows[0] || null;
}

async function excluir(id) {
  const result = await query('DELETE FROM public.produto WHERE id=$1 RETURNING id', [id]);
  return result.rows[0] || null;
}

module.exports = { listar, criar, atualizar, excluir };
