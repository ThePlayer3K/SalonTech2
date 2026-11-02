const { query } = require('../config/db');
const { isAdmin } = require('../middlewares/auth');

async function listar(user) {
  const admin = isAdmin(user);
  if (!admin && !user?.funcionarioId) return [];
  const result = await query(
    `SELECT a.id, a.cliente_id, c.nome AS cliente_nome, a.servico_id, s.nome AS servico_nome,
            a.funcionario_id, f.nome AS funcionario_nome, a.forma_pag_id, p.nome AS pagamento_nome,
            a.situacao, a.valor_total, a.percentual_comissao, a.duracao,
            to_char(a.data_hora, 'YYYY-MM-DD"T"HH24:MI') AS data_hora,
            to_char(a.data_hora + a.duracao * interval '1 minute', 'YYYY-MM-DD"T"HH24:MI') AS fim
       FROM public.agendamento a
       JOIN public.cliente c ON c.id = a.cliente_id
       JOIN public.servico s ON s.id = a.servico_id
       JOIN public.funcionario f ON f.id = a.funcionario_id
       JOIN public.forma_pagamento p ON p.id = a.forma_pag_id
       ${admin ? '' : 'WHERE a.funcionario_id = $1'}
      ORDER BY a.data_hora DESC, a.id DESC`,
    admin ? [] : [user.funcionarioId]
  );
  return result.rows;
}

async function listarClientes() {
  const result = await query('SELECT id, nome FROM public.cliente ORDER BY nome, id');
  return result.rows;
}

async function criar({ cliente_id, servico_id, data_hora, forma_pag_id, situacao }, cadastroToken, user) {
  const result = await query(
    `INSERT INTO public.agendamento (cliente_id, servico_id, data_hora, forma_pag_id, situacao, cadastro_token)
     SELECT $1, s.id, $3::timestamp, $4, $5, $6::uuid FROM public.servico s
      WHERE s.id = $2 AND ($7::boolean OR s.funcionario_id = $8)
     ON CONFLICT (cadastro_token) DO UPDATE SET cadastro_token = EXCLUDED.cadastro_token
       WHERE public.agendamento.cliente_id = EXCLUDED.cliente_id
         AND ($7::boolean OR public.agendamento.funcionario_id = $8)
     RETURNING id`,
    [cliente_id, servico_id, data_hora, forma_pag_id, situacao, cadastroToken, isAdmin(user), user?.funcionarioId || null]
  );
  return result.rows[0] || null;
}

async function atualizar(id, { cliente_id, servico_id, data_hora, forma_pag_id, situacao }, user) {
  const result = await query(
    `UPDATE public.agendamento a
        SET cliente_id=$1, servico_id=$2, data_hora=$3::timestamp, forma_pag_id=$4, situacao=$5
      WHERE a.id=$6 AND ($7::boolean OR a.funcionario_id=$8)
        AND (a.servico_id=$2 OR EXISTS (
          SELECT 1 FROM public.servico s WHERE s.id=$2 AND ($7::boolean OR s.funcionario_id=$8)
        )) RETURNING a.id`,
    [cliente_id, servico_id, data_hora, forma_pag_id, situacao, id, isAdmin(user), user?.funcionarioId || null]
  );
  return result.rows[0] || null;
}

module.exports = { listar, listarClientes, criar, atualizar };
