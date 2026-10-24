const { query } = require('../config/db');

async function listar() {
  const result = await query('SELECT id, nome, cpf, telefone, email FROM public.cliente ORDER BY nome, id');
  return result.rows;
}

async function criar({ nome, cpf, telefone, email }) {
  const result = await query(
    'INSERT INTO public.cliente (nome, cpf, telefone, email) VALUES ($1, $2, $3, $4) RETURNING id',
    [nome, cpf || null, telefone || null, email || null]
  );
  return result.rows[0];
}

async function atualizar(id, { nome, cpf, telefone, email }) {
  const result = await query(
    'UPDATE public.cliente SET nome=$1, cpf=$2, telefone=$3, email=$4 WHERE id=$5 RETURNING id',
    [nome, cpf || null, telefone || null, email || null, id]
  );
  return result.rows[0] || null;
}

async function excluir(id) {
  const result = await query('DELETE FROM public.cliente WHERE id=$1 RETURNING id', [id]);
  return result.rows[0] || null;
}

module.exports = { listar, criar, atualizar, excluir };
