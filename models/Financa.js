const db = require('../config/db');

async function relatorio({ dataInicio, dataFim }) {
  // Um único snapshot e cálculos NUMERIC no banco mantêm totais e listas consistentes.
  // entradas considera apenas agendamentos pagos, incluindo todos os horários do último dia.
  // gastos_previstos projeta somente competências posteriores ao cursor da recorrência,
  // preservando cópias editadas/excluídas. O vencimento se ajusta aos meses mais curtos.
  // As previsões não são gravadas: gastos as reúne aos lançamentos cadastrados para
  // que totais e detalhamento incluam os mesmos vencimentos no período selecionado.
  const result = await db.query(
    `WITH entradas AS (
       SELECT a.servico_id, COALESCE(s.nome, 'Serviço não informado') AS servico,
              a.forma_pag_id, COALESCE(p.nome, 'Pagamento não informado') AS pagamento, a.valor_total
         FROM public.agendamento a
         LEFT JOIN public.servico s ON s.id = a.servico_id
         LEFT JOIN public.forma_pagamento p ON p.id = a.forma_pag_id
        WHERE a.situacao = 'pago'
          AND a.data_hora >= $1::date AND a.data_hora < $2::date + interval '1 day'
     ), gastos_cadastrados AS (
       SELECT id, nome, valor, tipo, data, agendamento_id, recorrencia_id, false AS prevista FROM public.despesa
        WHERE data >= $1::date AND data <= $2::date
     ), gastos_previstos AS (
       SELECT NULL::integer AS id, d.nome, d.valor, 'fixo' AS tipo, v.data,
              NULL::integer AS agendamento_id, r.id AS recorrencia_id, true AS prevista
         FROM public.despesa_recorrencia r
         JOIN public.despesa d ON d.id = r.despesa_origem_id AND d.tipo = 'fixo'
         CROSS JOIN LATERAL generate_series(
           GREATEST(r.ultima_competencia + interval '1 month',
                    date_trunc('month', d.data::timestamp) + interval '1 month',
                    date_trunc('month', $1::timestamp)),
           date_trunc('month', $2::timestamp), interval '1 month'
         ) AS m(mes)
         CROSS JOIN LATERAL (
           SELECT m.mes::date + (LEAST(EXTRACT(day FROM d.data)::int,
             EXTRACT(day FROM m.mes + interval '1 month - 1 day')::int) - 1) AS data
         ) v
        WHERE v.data >= $1::date AND v.data <= $2::date
          AND NOT EXISTS (
            SELECT 1 FROM public.despesa existente
             WHERE existente.recorrencia_id = r.id AND existente.competencia = m.mes::date
          )
     ), gastos AS (
       SELECT * FROM gastos_cadastrados
       UNION ALL
       SELECT * FROM gastos_previstos
     ), totais AS (
       SELECT COALESCE((SELECT SUM(valor_total) FROM entradas), 0) AS entradas,
              COALESCE((SELECT SUM(valor) FROM gastos), 0) AS despesas
     )
     SELECT json_build_object('entradas', entradas::text, 'despesas', despesas::text,
              'liquido', (entradas - despesas)::text,
              'atendimentos', (SELECT COUNT(*)::int FROM entradas)) AS resumo,
       COALESCE((SELECT json_agg(t ORDER BY t.total::numeric DESC, t.nome, t.id) FROM (
         SELECT servico_id AS id, servico AS nome, SUM(valor_total)::text AS total, COUNT(*)::int AS quantidade
           FROM entradas GROUP BY servico_id, servico
       ) t), '[]'::json) AS servicos,
       COALESCE((SELECT json_agg(t ORDER BY t.data DESC, t.id DESC NULLS LAST, t.recorrencia_id) FROM (
         SELECT id, nome, valor::text AS valor, tipo, to_char(data, 'YYYY-MM-DD') AS data,
                agendamento_id, recorrencia_id, prevista FROM gastos
       ) t), '[]'::json) AS despesas,
       COALESCE((SELECT json_agg(t ORDER BY t.total::numeric DESC, t.nome, t.id) FROM (
         SELECT forma_pag_id AS id, pagamento AS nome, SUM(valor_total)::text AS total, COUNT(*)::int AS quantidade
           FROM entradas GROUP BY forma_pag_id, pagamento
       ) t), '[]'::json) AS pagamentos
     FROM totais`,
    [dataInicio, dataFim]
  );
  return result.rows[0];
}

module.exports = { relatorio };
