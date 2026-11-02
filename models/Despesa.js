const { query } = require('../config/db');

async function listar({ nome = '', dataInicio = '', dataFim = '' } = {}) {
  const conditions = [];
  const params = [];
  if (nome) {
    // Trata os curingas do LIKE como texto digitado pelo usuário.
    params.push(`%${nome.replace(/[\\%_]/g, '\\$&')}%`);
    conditions.push(`nome ILIKE $${params.length} ESCAPE E'\\\\'`);
  }
  if (dataInicio) {
    params.push(dataInicio);
    conditions.push(`data >= $${params.length}::date`);
  }
  if (dataFim) {
    params.push(dataFim);
    conditions.push(`data <= $${params.length}::date`);
  }
  const result = await query(
    `SELECT id, nome AS descricao, valor, tipo, to_char(data, 'YYYY-MM-DD') AS data
       FROM public.despesa
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY data DESC NULLS LAST, id DESC`,
    params
  );
  return result.rows;
}

async function criar({ descricao, valor, tipo, data }) {
  const result = await query(
    'INSERT INTO public.despesa (nome, valor, tipo, data) VALUES ($1, $2, $3, $4) RETURNING id',
    [descricao, valor, tipo, data]
  );
  return result.rows[0];
}

async function atualizar(id, { descricao, valor, tipo, data }) {
  const result = await query(
    'UPDATE public.despesa SET nome=$1, valor=$2, tipo=$3, data=$4 WHERE id=$5 RETURNING id',
    [descricao, valor, tipo, data, id]
  );
  return result.rows[0] || null;
}

async function excluir(id) {
  const result = await query('DELETE FROM public.despesa WHERE id=$1 RETURNING id', [id]);
  return result.rows[0] || null;
}

module.exports = { listar, criar, atualizar, excluir };
