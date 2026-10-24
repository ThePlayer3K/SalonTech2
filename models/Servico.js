const { query } = require('../config/db');
const { isAdmin } = require('../middlewares/auth');

async function listar(user) {
  const admin = isAdmin(user);
  if (!admin && (user?.papel !== 'profissional' || !user.funcionarioId)) return [];
  const result = await query(
    `SELECT s.id, s.nome, s.funcionario_id, f.nome AS funcionario_nome,
            s.categoria, s.valor, s.percentual_comissao, s.duracao
       FROM public.servico s
       JOIN public.funcionario f ON f.id = s.funcionario_id
       ${admin ? '' : 'WHERE s.funcionario_id = $1'}
      ORDER BY s.nome, s.id`,
    admin ? [] : [user.funcionarioId]
  );
  return result.rows;
}

async function listarFuncionarios() {
  const result = await query('SELECT id, nome FROM public.funcionario ORDER BY nome, id');
  return result.rows;
}

async function funcionarioExiste(id) {
  const result = await query('SELECT id FROM public.funcionario WHERE id=$1', [id]);
  return result.rows.length > 0;
}

async function criar({ nome, funcionario_id, categoria, valor, percentual_comissao, duracao }) {
  const result = await query(
    `INSERT INTO public.servico (nome, funcionario_id, categoria, valor, percentual_comissao, duracao)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [nome, funcionario_id, categoria, valor, percentual_comissao, duracao]
  );
  return result.rows[0];
}

async function atualizar(id, { nome, funcionario_id, categoria, valor, percentual_comissao, duracao }) {
  const result = await query(
    `UPDATE public.servico SET nome=$1, funcionario_id=$2, categoria=$3,
     valor=$4, percentual_comissao=$5, duracao=$6 WHERE id=$7 RETURNING id`,
    [nome, funcionario_id, categoria, valor, percentual_comissao, duracao, id]
  );
  return result.rows[0] || null;
}

async function excluir(id) {
  const result = await query('DELETE FROM public.servico WHERE id=$1 RETURNING id', [id]);
  return result.rows[0] || null;
}

module.exports = { listar, listarFuncionarios, funcionarioExiste, criar, atualizar, excluir };
