const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const { Client } = require('pg');

test('PostgreSQL: relatório financeiro e recorrência mensal', {
  skip: !process.env.TEST_DATABASE_URL, timeout: 60000
}, async (t) => {
  const config = {
    connectionString: process.env.TEST_DATABASE_URL,
    ssl: (process.env.TEST_DB_SSL || process.env.DB_SSL) === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 8000, statement_timeout: 10000
  };
  const schemaName = `salontech_financas_test_${randomBytes(8).toString('hex')}`;
  const rewrite = (sql) => sql.replaceAll('public.', `"${schemaName}".`);
  const client = new Client(config);
  await client.connect();
  const sql = (text, params) => client.query(rewrite(text), params);
  const db = require('../config/db');
  const originalQuery = db.query;
  db.query = sql;
  const Financa = require('../models/Financa');
  t.after(async () => {
    db.query = originalQuery;
    assert.match(schemaName, /^salontech_financas_test_[a-f0-9]{16}$/);
    try { await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`); }
    finally { await client.end(); }
  });
  await client.query(`CREATE SCHEMA "${schemaName}"`);
  await sql(fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8'));
  const migrations = fs.readdirSync(path.join(__dirname, '../migrations')).filter((name) => name.endsWith('.sql')).sort();
  for (const name of migrations) await sql(fs.readFileSync(path.join(__dirname, '../migrations', name), 'utf8'));
  const generate = async (date) => (await sql('SELECT public.gerar_despesas_fixas($1::date) AS criadas', [date])).rows[0].criadas;
  const expense = async (data, nome = 'Aluguel', tipo = 'fixo') => (await sql(
    'INSERT INTO public.despesa (nome, valor, tipo, data) VALUES ($1,100,$2,$3) RETURNING id', [nome, tipo, data]
  )).rows[0].id;
  const copies = async (id) => (await sql(`SELECT d.id, d.nome, d.valor, d.tipo, to_char(d.data, 'YYYY-MM-DD') AS data
    FROM public.despesa d JOIN public.despesa_recorrencia r ON r.id=d.recorrencia_id
    WHERE r.despesa_origem_id=$1 ORDER BY d.data, d.id`, [id])).rows;
  let root;

  await t.test('5 de novembro gera 5 de dezembro e execuções concorrentes não duplicam', async () => {
    root = await expense('2030-11-05');
    await expense('2030-11-05', 'Eventual', 'variavel');
    assert.equal(await generate('2030-11-30'), 0);
    assert.equal(await generate('2030-12-04'), 0);
    const clients = [new Client(config), new Client(config)];
    try {
      await Promise.all(clients.map((item) => item.connect()));
      const results = await Promise.all(clients.map((item) => item.query(rewrite("SELECT public.gerar_despesas_fixas('2030-12-05') AS criadas"))));
      assert.deepEqual(results.map((result) => result.rows[0].criadas).sort(), [0, 1]);
    } finally { await Promise.all(clients.map((item) => item.end())); }
    assert.deepEqual((await copies(root)).map((row) => row.data), ['2030-12-05']);
    assert.equal(await generate('2030-12-05'), 0);
    assert.equal((await sql('SELECT COUNT(*)::int AS total FROM public.despesa_recorrencia')).rows[0].total, 1);
  });
  await t.test('recupera meses pendentes e reaplicar a migration preserva o cursor', async () => {
    await generate('2031-03-05');
    assert.deepEqual((await copies(root)).map((row) => row.data), ['2030-12-05', '2031-01-05', '2031-02-05', '2031-03-05']);
    await sql(fs.readFileSync(path.join(__dirname, '../migrations/003-financas.sql'), 'utf8'));
    assert.equal(await generate('2031-03-05'), 0);
  });
  await t.test('edição e exclusão de cópias afetam somente o lançamento sem recriá-lo ou abrir novas séries', async () => {
    const rows = await copies(root);
    await sql("UPDATE public.despesa SET valor=150, nome='Ajuste mensal' WHERE id=$1", [rows[0].id]);
    await sql('DELETE FROM public.despesa WHERE id=$1', [rows[1].id]);
    assert.equal(await generate('2031-03-05'), 0);
    assert.equal((await copies(root)).length, 3);
    assert.equal((await copies(root))[0].valor, '150.00');
    assert.equal((await sql('SELECT COUNT(*)::int AS total FROM public.despesa_recorrencia')).rows[0].total, 1);
  });
  await t.test('alterar o original muda os próximos valores; tipo variável e exclusão encerram a geração', async () => {
    await sql("UPDATE public.despesa SET nome='Aluguel reajustado', valor=200 WHERE id=$1", [root]);
    await generate('2031-04-05');
    let rows = await copies(root);
    assert.equal(rows.at(-1).valor, '200.00');
    assert.equal(rows.at(-1).nome, 'Aluguel reajustado');
    assert.equal(rows[1].valor, '100.00');
    await sql("UPDATE public.despesa SET tipo='variavel' WHERE id=$1", [root]);
    await generate('2031-06-05');
    assert.equal((await copies(root)).length, rows.length);
    const ids = rows.map((row) => row.id);
    await sql('DELETE FROM public.despesa WHERE id=$1', [root]);
    await generate('2031-07-05');
    assert.equal((await sql('SELECT id FROM public.despesa WHERE id=ANY($1::int[])', [ids])).rows.length, ids.length);
    // Cópias órfãs continuam identificadas como cópias e não viram novos cadastros fixos.
    await sql("UPDATE public.despesa SET valor=210 WHERE id=$1", [ids[0]]);
    assert.equal((await sql('SELECT COUNT(*)::int AS total FROM public.despesa_recorrencia')).rows[0].total, 1);
  });
  await t.test('dias 29, 30 e 31 usam o último dia de fevereiro e retomam o dia original em março', async () => {
    for (const year of [2032, 2033]) {
      for (const day of [29, 30, 31]) {
        const id = await expense(`${year}-01-${day}`, `Dia ${day} em ${year}`);
        const febEnd = year === 2032 ? '29' : '28';
        await generate(`${year}-02-${Number(febEnd) - 1}`);
        assert.equal((await copies(id)).length, 0);
        await generate(`${year}-02-${febEnd}`);
        await generate(`${year}-03-${day}`);
        assert.deepEqual((await copies(id)).map((row) => row.data), [`${year}-02-${febEnd}`, `${year}-03-${day}`]);
        await sql("UPDATE public.despesa SET tipo='variavel' WHERE id=$1", [id]);
      }
    }
  });
  await t.test('despesa futura só gera cópias após seu mês; reativação não recupera meses desativados', async () => {
    const future = await expense('2040-12-20');
    await generate('2040-12-31');
    assert.equal((await copies(future)).length, 0);
    await generate('2041-01-19');
    assert.equal((await copies(future)).length, 0);
    await generate('2041-01-20');
    assert.equal((await copies(future)).length, 1);
    await sql("UPDATE public.despesa SET tipo='variavel' WHERE id=$1", [future]);
    const reactivated = await expense('2020-01-05', 'Reativada');
    await generate('2020-03-05');
    await sql("UPDATE public.despesa SET tipo='variavel' WHERE id=$1", [reactivated]);
    await generate('2020-06-05');
    await sql("UPDATE public.despesa SET tipo='fixo' WHERE id=$1", [reactivated]);
    await generate('2020-07-05');
    assert.equal((await copies(reactivated)).length, 2);
    const cursor = await sql(`SELECT ultima_competencia = date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date AS atual
      FROM public.despesa_recorrencia WHERE despesa_origem_id=$1`, [reactivated]);
    assert.equal(cursor.rows[0].atual, true);
    await sql("UPDATE public.despesa SET tipo='variavel' WHERE id=$1", [reactivated]);
  });
  await t.test('migration incorpora fixas legadas sem confundir comissões ou cópias', async () => {
    await sql('ALTER TABLE public.despesa DISABLE TRIGGER registrar_recorrencia_despesa');
    const legacy = await expense('2035-11-05', 'Fixa anterior à migration');
    await sql('ALTER TABLE public.despesa ENABLE TRIGGER registrar_recorrencia_despesa');
    const migration = fs.readFileSync(path.join(__dirname, '../migrations/003-financas.sql'), 'utf8');
    await sql(migration);
    await generate('2035-12-05');
    await sql(migration);
    assert.equal(await generate('2035-12-05'), 0);
    assert.equal((await copies(legacy)).length, 1);
    await sql("UPDATE public.despesa SET tipo='variavel' WHERE id=$1", [legacy]);
  });

  await t.test('conta de água de R$ 200 aparece em cada vencimento selecionado sem gravar previsões', async () => {
    const water = await expense('2038-10-05', 'Conta de água');
    await sql('UPDATE public.despesa SET valor=200 WHERE id=$1', [water]);
    const period = { dataInicio: '2038-11-01', dataFim: '2038-12-31' };
    const report = await Financa.relatorio(period);
    assert.deepEqual(report.resumo, { entradas: '0', despesas: '400.00', liquido: '-400.00', atendimentos: 0 });
    assert.deepEqual(report.despesas.map(({ nome, valor, data, prevista }) => ({ nome, valor, data, prevista })), [
      { nome: 'Conta de água', valor: '200.00', data: '2038-12-05', prevista: true },
      { nome: 'Conta de água', valor: '200.00', data: '2038-11-05', prevista: true }
    ]);
    assert.equal((await copies(water)).length, 0);
    const cursor = await sql("SELECT to_char(ultima_competencia, 'YYYY-MM-DD') AS mes FROM public.despesa_recorrencia WHERE despesa_origem_id=$1", [water]);
    assert.equal(cursor.rows[0].mes, '2038-10-01');

    const includingOriginal = await Financa.relatorio({ dataInicio: '2038-10-01', dataFim: '2038-12-31' });
    assert.equal(includingOriginal.resumo.despesas, '600.00');
    assert.equal(includingOriginal.despesas.length, 3);
    assert.equal(includingOriginal.despesas.filter((row) => row.prevista).length, 2);
    const partial = await Financa.relatorio({ dataInicio: '2038-11-06', dataFim: '2038-12-05' });
    assert.equal(partial.resumo.despesas, '200.00');
    assert.deepEqual(partial.despesas.map((row) => row.data), ['2038-12-05']);
    const beforeDue = await Financa.relatorio({ dataInicio: '2038-12-01', dataFim: '2038-12-04' });
    assert.equal(beforeDue.resumo.despesas, '0');
    assert.deepEqual(beforeDue.despesas, []);
    const beforeRegistration = await Financa.relatorio({ dataInicio: '2038-09-01', dataFim: '2038-09-30' });
    assert.deepEqual(beforeRegistration.despesas, []);

    await generate('2038-11-05');
    const generated = await Financa.relatorio(period);
    assert.equal(generated.resumo.despesas, '400.00');
    assert.equal(generated.despesas.length, 2);
    assert.equal(generated.despesas.filter((row) => row.prevista).length, 1);
    assert.equal(generated.despesas.find((row) => row.data === '2038-11-05').prevista, false);

    const [copy] = await copies(water);
    await sql("UPDATE public.despesa SET valor=250, data='2038-11-06' WHERE id=$1", [copy.id]);
    const edited = await Financa.relatorio({ dataInicio: '2038-11-06', dataFim: '2038-12-05' });
    assert.equal(edited.resumo.despesas, '450.00');
    assert.deepEqual(edited.despesas.map((row) => [row.data, row.valor]), [['2038-12-05', '200.00'], ['2038-11-06', '250.00']]);
    await sql('DELETE FROM public.despesa WHERE id=$1', [copy.id]);
    const removed = await Financa.relatorio(period);
    assert.equal(removed.resumo.despesas, '200.00');
    assert.deepEqual(removed.despesas.map((row) => row.data), ['2038-12-05']);
    await sql("UPDATE public.despesa SET tipo='variavel' WHERE id=$1", [water]);
    assert.deepEqual((await Financa.relatorio(period)).despesas, []);
    await sql('DELETE FROM public.despesa WHERE id=$1', [water]);
    assert.deepEqual((await Financa.relatorio(period)).despesas, []);
  });
  await t.test('previsões mantêm o dia original ao atravessar fevereiro e março', async () => {
    for (const year of [2044, 2045]) {
      const id = await expense(`${year}-01-31`, `Conta mensal ${year}`);
      const report = await Financa.relatorio({ dataInicio: `${year}-02-01`, dataFim: `${year}-03-31` });
      assert.deepEqual(report.despesas.map((row) => row.data), [`${year}-03-31`, `${year}-02-${year === 2044 ? '29' : '28'}`]);
      assert.ok(report.despesas.every((row) => row.prevista));
      assert.equal(report.resumo.despesas, '200.00');
      assert.equal((await copies(id)).length, 0);
      await sql("UPDATE public.despesa SET tipo='variavel' WHERE id=$1", [id]);
    }
  });

  await sql("INSERT INTO public.funcionario (id, nome) VALUES (1, 'Ana')");
  await sql("INSERT INTO public.cliente (id, nome) VALUES (1, 'Cliente teste')");
  await sql("INSERT INTO public.forma_pagamento (id, nome) VALUES (1, 'Pix'), (2, 'Cartão')");
  await sql(`INSERT INTO public.servico (id, nome, funcionario_id, duracao, categoria, valor, percentual_comissao)
    VALUES (1,'Corte',1,30,'Cabelo',80.01,25), (2,'Escova',1,30,'Cabelo',100,20)`);
  const book = async (data, situacao, servico = 1, pagamento = 1) => (await sql(`INSERT INTO public.agendamento
    (cliente_id, servico_id, forma_pag_id, situacao, data_hora, cadastro_token)
    VALUES (1,$1,$2,$3,$4,$5) RETURNING id`, [servico, pagamento, situacao, data, randomUUID()])).rows[0].id;

  await t.test('somente pagos entram; limites incluem todo o último dia e valores e comissões usam centavos', async () => {
    const first = await book('2026-06-01T00:00', 'pago');
    await book('2026-06-23T23:59', 'pago', 2, 2);
    await book('2026-06-20T10:00', 'pago');
    await book('2026-05-31T23:00', 'pago');
    await book('2026-06-24T00:30', 'pago');
    await book('2026-06-10T10:00', 'agendado');
    await book('2026-06-11T10:00', 'concluido');
    await book('2026-06-12T10:00', 'cancelado');
    await expense('2026-06-01', 'Energia', 'variavel');
    await expense('2026-06-23', 'Água', 'variavel');
    await expense('2026-06-24', 'Fora do período', 'variavel');
    // Mudanças no catálogo não reprecificam vendas anteriores.
    await sql('UPDATE public.servico SET valor=999 WHERE id=1');
    const period = { dataInicio: '2026-06-01', dataFim: '2026-06-23' };
    const report = await Financa.relatorio(period);
    assert.deepEqual(report.resumo, { entradas: '260.02', despesas: '260.00', liquido: '0.02', atendimentos: 3 });
    assert.deepEqual(report.servicos.map(({ nome, total, quantidade }) => ({ nome, total, quantidade })), [
      { nome: 'Corte', total: '160.02', quantidade: 2 }, { nome: 'Escova', total: '100.00', quantidade: 1 }
    ]);
    assert.deepEqual(report.pagamentos.map(({ nome, total }) => ({ nome, total })), [{ nome: 'Pix', total: '160.02' }, { nome: 'Cartão', total: '100.00' }]);
    assert.equal(report.despesas.length, 5);
    assert.equal(report.despesas.filter((row) => row.agendamento_id).length, 3);
    assert.ok(!report.despesas.some((row) => row.nome === 'Fora do período'));
    const oneDay = await Financa.relatorio({ dataInicio: '2026-06-23', dataFim: '2026-06-23' });
    assert.equal(oneDay.resumo.entradas, '100.00');
    await sql("UPDATE public.agendamento SET situacao='cancelado' WHERE id=$1", [first]);
    const reverted = await Financa.relatorio(period);
    assert.equal(reverted.resumo.entradas, '180.01');
    assert.equal(reverted.resumo.despesas, '240.00');
  });
  await t.test('período sem movimento retorna zeros e listas vazias; despesas sem receitas geram saldo negativo', async () => {
    const empty = await Financa.relatorio({ dataInicio: '2010-01-01', dataFim: '2010-01-31' });
    assert.deepEqual(empty, { resumo: { entradas: '0', despesas: '0', liquido: '0', atendimentos: 0 }, servicos: [], despesas: [], pagamentos: [] });
    await expense('2010-02-01', 'Gasto isolado', 'variavel');
    const negative = await Financa.relatorio({ dataInicio: '2010-02-01', dataFim: '2010-02-01' });
    assert.equal(negative.resumo.liquido, '-100.00');
    assert.equal(negative.servicos.length, 0);
    assert.equal(negative.despesas.length, 1);
  });
});
