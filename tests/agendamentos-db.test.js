const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { Client } = require('pg');

// Usa apenas um schema isolado. Nunca insere dados nas tabelas da aplicação.
test('PostgreSQL: comissões, conflitos concorrentes, histórico e idempotência', {
  skip: !process.env.TEST_DATABASE_URL,
  timeout: 60000
}, async (t) => {
  const config = {
    connectionString: process.env.TEST_DATABASE_URL,
    ssl: (process.env.TEST_DB_SSL || process.env.DB_SSL) === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 8000,
    statement_timeout: 10000
  };
  const schemaName = `salontech_test_${randomBytes(8).toString('hex')}`;
  const prefix = `"${schemaName}".`;
  const rewrite = (sql) => sql.replaceAll('public.', prefix);
  const client = new Client(config);
  const db = require('../config/db');
  const originalQuery = db.query;
  const filenames = ['../models/Agendamento', '../models/Despesa'].map(require.resolve);
  const originalModules = filenames.map((filename) => require.cache[filename]);
  await client.connect();
  t.after(async () => {
    db.query = originalQuery;
    filenames.forEach((filename, index) => {
      if (originalModules[index]) require.cache[filename] = originalModules[index];
      else delete require.cache[filename];
    });
    // O nome é gerado internamente e validado antes da remoção do schema de teste.
    assert.match(schemaName, /^salontech_test_[a-f0-9]{16}$/);
    try { await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`); }
    finally { await client.end(); }
  });
  await client.query(`CREATE SCHEMA "${schemaName}"`);
  await client.query('BEGIN');
  try {
    await client.query(rewrite(fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8')));
    const migration = rewrite(fs.readFileSync(path.join(__dirname, '../migrations/002-agendamentos.sql'), 'utf8'));
    await client.query(migration);
    await client.query(migration);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  const sql = (text, params) => client.query(rewrite(text), params);
  db.query = sql;
  filenames.forEach((filename) => delete require.cache[filename]);
  const Agendamento = require('../models/Agendamento');
  const Despesa = require('../models/Despesa');
  await sql("INSERT INTO public.funcionario (id, nome) VALUES (1, 'Ana'), (2, 'Bia')");
  await sql("INSERT INTO public.cliente (id, nome) VALUES (1, 'Cliente teste')");
  await sql("INSERT INTO public.forma_pagamento (id, nome) VALUES (1, 'Pix')");
  await sql(`INSERT INTO public.servico (id, nome, funcionario_id, duracao, categoria, valor, percentual_comissao)
    VALUES (1, 'Corte', 1, 60, 'Cabelo', 100.05, 25), (2, 'Escova', 1, 30, 'Cabelo', 80, 20),
           (3, 'Manicure', 2, 30, 'Unhas', 50, 10), (4, 'Inválido', 1, NULL, 'Cabelo', 10, 10)`);
  const admin = { papel: 'admin', funcionarioId: 1 };
  const professional = { papel: 'profissional', funcionarioId: 1 };
  const body = (date, situacao = 'agendado', servico_id = 1) => ({ cliente_id: 1, servico_id, data_hora: date, forma_pag_id: 1, situacao });
  const book = (date, situacao = 'agendado', service = 1, token = randomUUID()) => Agendamento.criar(body(date, situacao, service), token, admin);
  const commission = async (id) => (await sql('SELECT * FROM public.despesa WHERE agendamento_id=$1', [id])).rows;
  let first;

  await t.test('pago gera uma única comissão arredondada em centavos e alterações pagas a sincronizam', async () => {
    first = await book('2026-11-03T10:00', 'pago');
    let rows = await commission(first.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].nome, 'Comissão de Ana');
    assert.equal(rows[0].valor, '25.01');
    assert.equal(rows[0].tipo, 'variavel');
    await Agendamento.atualizar(first.id, body('2026-11-03T10:00', 'pago'), admin);
    assert.equal((await commission(first.id)).length, 1);
    await Agendamento.atualizar(first.id, body('2026-11-03T10:00', 'pago', 3), admin);
    rows = await commission(first.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].nome, 'Comissão de Bia');
    assert.equal(rows[0].valor, '5.00');
    await Agendamento.atualizar(first.id, body('2026-11-03T10:00', 'pago'), admin);
  });
  await t.test('qualquer saída de pago remove apenas a comissão vinculada; voltar a pago a recria', async () => {
    const manual = await Despesa.criar({ descricao: 'Comissão de Ana', valor: '1.00', tipo: 'variavel', data: '2026-11-03' }, randomUUID());
    for (const situacao of ['agendado', 'concluido', 'cancelado']) {
      await Agendamento.atualizar(first.id, body('2026-11-03T10:00', situacao), admin);
      assert.equal((await commission(first.id)).length, 0);
      assert.equal((await sql('SELECT id FROM public.despesa WHERE id=$1', [manual.id])).rows.length, 1);
      await Agendamento.atualizar(first.id, body('2026-11-03T10:00', 'pago'), admin);
      assert.equal((await commission(first.id)).length, 1);
    }
  });
  await t.test('comissões não podem ser editadas ou excluídas diretamente', async () => {
    const [row] = await commission(first.id);
    await assert.rejects(Despesa.atualizar(row.id, { descricao: 'Alterada', valor: '0.00', tipo: 'fixo', data: '2026-11-03' }), { constraint: 'despesa_comissao_automatica' });
    await assert.rejects(Despesa.excluir(row.id), { constraint: 'despesa_comissao_automatica' });
    assert.equal((await commission(first.id))[0].valor, '25.01');
  });
  await t.test('bloqueia sobreposições pelo profissional, incluindo outro serviço e cruzamento da meia-noite', async () => {
    for (const date of ['2026-11-03T09:30', '2026-11-03T10:00', '2026-11-03T10:59']) {
      await assert.rejects(book(date), { code: '23P01' });
    }
    await assert.rejects(book('2026-11-03T10:30', 'agendado', 2), { code: '23P01' });
    await book('2026-11-04T23:30');
    await assert.rejects(book('2026-11-05T00:15', 'agendado', 2), { code: '23P01' });
    await book('2026-11-05T00:30', 'agendado', 2);
  });
  await t.test('permite horários consecutivos e profissionais diferentes; cancelado libera e reativação valida conflito', async () => {
    await book('2026-11-03T11:00');
    await book('2026-11-03T10:00', 'agendado', 3);
    const canceled = await book('2026-11-03T10:30', 'cancelado', 2);
    await assert.rejects(Agendamento.atualizar(canceled.id, body('2026-11-03T10:30', 'agendado', 2), admin), { code: '23P01' });
    const freed = await book('2026-11-06T10:00');
    await Agendamento.atualizar(freed.id, body('2026-11-06T10:00', 'cancelado'), admin);
    await book('2026-11-06T10:00', 'agendado', 2);
  });
  await t.test('falha de conflito não altera o agendamento pago nem sua comissão', async () => {
    const other = await book('2026-11-07T10:00', 'pago');
    await assert.rejects(Agendamento.atualizar(other.id, body('2026-11-03T10:30', 'agendado'), admin), { code: '23P01' });
    const saved = (await Agendamento.listar(admin)).find((row) => row.id === other.id);
    assert.equal(saved.situacao, 'pago');
    assert.equal(saved.data_hora, '2026-11-07T10:00');
    assert.equal((await commission(other.id)).length, 1);
  });
  await t.test('DELETE e TRUNCATE são bloqueados pelo próprio banco', async () => {
    await assert.rejects(sql('DELETE FROM public.agendamento WHERE id=$1', [first.id]), { code: '23514' });
    await assert.rejects(sql('TRUNCATE public.agendamento CASCADE'), { code: '23514' });
    assert.ok((await Agendamento.listar(admin)).some((row) => row.id === first.id));
  });
  await t.test('snapshot mantém duração, profissional, valor e comissão contratados ao editar o catálogo', async () => {
    const saved = await book('2026-11-08T10:00');
    await sql('UPDATE public.servico SET valor=999, duracao=5, percentual_comissao=99, funcionario_id=2 WHERE id=1');
    try {
      await Agendamento.atualizar(saved.id, body('2026-11-08T10:00', 'pago'), admin);
      const row = (await Agendamento.listar(admin)).find((item) => item.id === saved.id);
      assert.equal(row.funcionario_id, 1);
      assert.equal(row.duracao, 60);
      assert.equal(row.valor_total, '100.05');
      assert.equal((await commission(saved.id))[0].valor, '25.01');
    } finally { await sql('UPDATE public.servico SET valor=100.05, duracao=60, percentual_comissao=25, funcionario_id=1 WHERE id=1'); }
  });
  await t.test('valida referências e duração e aplica o escopo de profissional nas consultas e gravações', async () => {
    await assert.rejects(book('2026-11-09T10:00', 'pago', 4), { code: '23514' });
    await assert.rejects(Agendamento.criar({ ...body('2026-11-09T10:00'), cliente_id: 999 }, randomUUID(), admin), { code: '23503' });
    assert.equal(await Agendamento.criar(body('2026-11-09T10:00', 'agendado', 3), randomUUID(), professional), null);
    const other = await book('2026-11-09T10:00', 'agendado', 3);
    assert.equal(await Agendamento.atualizar(other.id, body('2026-11-09T11:00', 'pago'), professional), null);
    assert.equal(await Agendamento.atualizar(first.id, body('2026-11-09T11:00', 'pago', 3), professional), null);
    assert.ok((await Agendamento.listar(professional)).every((row) => row.funcionario_id === 1));
    assert.deepEqual(await Agendamento.listar({ papel: 'profissional' }), []);
  });
  await t.test('repetir o token de cadastro mantém um agendamento e uma comissão', async () => {
    const token = randomUUID();
    const a = await book('2026-11-10T10:00', 'pago', 1, token);
    const b = await book('2026-11-10T10:00', 'pago', 1, token);
    assert.equal(a.id, b.id);
    assert.equal((await commission(a.id)).length, 1);
  });
  await t.test('cliques concorrentes na despesa geram apenas uma linha; novo formulário permite despesa igual', async () => {
    const token = randomUUID();
    const data = { descricao: 'Duplicidade teste', valor: '10.00', tipo: 'fixo', data: '2026-11-02' };
    const clients = [new Client(config), new Client(config)];
    try {
      await Promise.all(clients.map((item) => item.connect()));
      const query = rewrite(`INSERT INTO public.despesa (nome, valor, tipo, data, cadastro_token) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (cadastro_token) DO UPDATE SET cadastro_token=EXCLUDED.cadastro_token RETURNING id`);
      const results = await Promise.all(clients.map((item) => item.query(query, [data.descricao, data.valor, data.tipo, data.data, token])));
      assert.equal(results[0].rows[0].id, results[1].rows[0].id);
      const repeated = await Despesa.criar(data, token);
      assert.equal(repeated.id, results[0].rows[0].id);
      const another = await Despesa.criar(data, randomUUID());
      assert.notEqual(another.id, repeated.id);
      assert.equal((await sql('SELECT id FROM public.despesa WHERE cadastro_token=$1', [token])).rows.length, 1);
    } finally { await Promise.all(clients.map((item) => item.end())); }
  });
  await t.test('reservas simultâneas conflitantes aceitam só uma e não deixam comissão órfã', async () => {
    const clients = [new Client(config), new Client(config)];
    try {
      await Promise.all(clients.map((item) => item.connect()));
      const query = rewrite(`INSERT INTO public.agendamento (cliente_id, servico_id, data_hora, forma_pag_id, situacao, cadastro_token)
        VALUES (1,$1,'2026-11-11T10:00',1,'pago',$2) RETURNING id`);
      const results = await Promise.allSettled(clients.map((item, i) => item.query(query, [i + 1, randomUUID()])));
      assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
      assert.equal(results.find((item) => item.status === 'rejected').reason.code, '23P01');
      const id = results.find((item) => item.status === 'fulfilled').value.rows[0].id;
      assert.equal((await commission(id)).length, 1);
      assert.equal((await sql("SELECT id FROM public.agendamento WHERE data_hora='2026-11-11T10:00'")).rows.length, 1);
    } finally { await Promise.all(clients.map((item) => item.end())); }
  });
});
