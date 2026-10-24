const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('node:path');
const Servico = require('../models/Servico');
const Usuario = require('../models/Usuario');

test('serviços: cadastro administrativo e consulta pessoal', async (t) => {
  const original = { ...Servico };
  const originalBuscar = Usuario.buscarPorId;
  const originalMaster = process.env.ADMIN_NAME;
  process.env.ADMIN_NAME = 'Master de teste';
  const users = {
    admin: { id: 1, nome: 'Admin', papel: 'admin', funcionario_id: 10 },
    master: { id: 2, nome: 'Master de teste', papel: 'master', funcionario_id: 20 },
    profissional: { id: 3, nome: 'Ana', papel: 'profissional', funcionario_id: 30 },
    outro: { id: 4, nome: 'Bia', papel: 'profissional', funcionario_id: 40 },
    semVinculo: { id: 5, nome: 'Sem vínculo', papel: 'profissional' }
  };
  const funcionarios = [{ id: 30, nome: 'Ana' }, { id: 40, nome: 'Bia' }];
  let rows = [
    { id: 1, nome: 'Corte da Ana', funcionario_id: 30, funcionario_nome: 'Ana', categoria: 'Cabelo', valor: '80.00', percentual_comissao: '25.00', duracao: 30 },
    { id: 2, nome: 'Corte da Bia', funcionario_id: 40, funcionario_nome: 'Bia', categoria: 'Cabelo', valor: '90.00', percentual_comissao: '30.00', duracao: 40 }
  ];
  let writes = 0;
  let failure = null;
  let lastUser;
  let employeeLists = 0;
  Usuario.buscarPorId = async (id) => Object.values(users).find((user) => user.id === id);
  Servico.listar = async (user) => {
    lastUser = user;
    return ['admin', 'master'].includes(user.papel) ? rows : rows.filter((row) => row.funcionario_id === user.funcionarioId);
  };
  Servico.listarFuncionarios = async () => { employeeLists++; return funcionarios; };
  Servico.funcionarioExiste = async (id) => funcionarios.some((person) => person.id === id);
  Servico.criar = async (data) => {
    if (failure) throw failure;
    writes++;
    const row = { id: 3, ...data, funcionario_nome: funcionarios.find((person) => person.id === data.funcionario_id).nome };
    rows.push(row);
    return row;
  };
  Servico.atualizar = async (id, data) => {
    if (failure) throw failure;
    const row = rows.find((item) => item.id === id);
    if (!row) return null;
    writes++;
    Object.assign(row, data);
    return row;
  };
  Servico.excluir = async (id) => {
    if (failure) throw failure;
    const row = rows.find((item) => item.id === id);
    if (!row) return null;
    writes++;
    rows = rows.filter((item) => item.id !== id);
    return row;
  };
  const app = express();
  app.set('views', path.join(__dirname, '../views'));
  app.set('view engine', 'ejs');
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    const user = users[req.get('x-test-role')];
    req.session = { user: user ? { ...user, funcionarioId: 999 } : null };
    next();
  });
  app.use('/servicos', require('../routes/servicoRoutes'));
  app.use((error, req, res, next) => res.status(500).send('Erro interno'));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    Object.assign(Servico, original);
    Usuario.buscarPorId = originalBuscar;
    if (originalMaster === undefined) delete process.env.ADMIN_NAME;
    else process.env.ADMIN_NAME = originalMaster;
  });
  const request = (role, suffix = '', body) => fetch(`http://127.0.0.1:${server.address().port}/servicos${suffix}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'x-test-role': role || '', 'content-type': 'application/x-www-form-urlencoded' },
    body: body === undefined ? undefined : new URLSearchParams(body), redirect: 'manual'
  });
  const data = { nome: ' Escova ', funcionario_id: '30', categoria: ' Cabelo ', valor: '1.234,56', percentual_comissao: '35,50', duracao: '45' };

  await t.test('visitantes não acessam listagem nem operações', async () => {
    for (const [suffix, body] of [['', undefined], ['', data], ['/1', data], ['/1/excluir', {}]]) {
      const res = await request(null, suffix, body);
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/login');
    }
    assert.equal(writes, 0);
  });
  await t.test('profissionais veem somente seus serviços e não recebem formulário nem lista de funcionários', async () => {
    const before = employeeLists;
    for (const [role, own, other] of [['profissional', 'Corte da Ana', 'Corte da Bia'], ['outro', 'Corte da Bia', 'Corte da Ana']]) {
      const res = await request(role, '?funcionarioId=40&funcionario_id=40');
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes(own));
      assert.ok(!html.includes(other));
      assert.ok(!html.includes('Adicionar serviço'));
      assert.ok(!html.includes('Editar serviço'));
      assert.ok(!html.includes('Excluir serviço'));
      assert.equal(lastUser.funcionarioId, users[role].funcionario_id);
    }
    const empty = await (await request('semVinculo')).text();
    assert.match(empty, /Nenhum serviço vinculado/);
    assert.equal(employeeLists, before);
  });
  await t.test('profissionais não alteram nem seus próprios serviços', async () => {
    for (const suffix of ['', '/1', '/2', '/1/excluir', '/2/excluir']) {
      assert.equal((await request('profissional', suffix, data)).status, 403);
    }
    assert.equal(writes, 0);
  });
  await t.test('administrador e master consultam todos e recebem os seis campos', async () => {
    for (const role of ['admin', 'master']) {
      const res = await request(role);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /Corte da Ana/);
      assert.match(html, /Corte da Bia/);
      for (const field of Object.keys(data)) assert.ok(html.includes(`name="${field}"`));
    }
  });
  await t.test('cadastro normaliza dados, valor e comissão', async () => {
    const res = await request('admin', '', data);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/servicos?status=criado');
    assert.deepEqual(rows.at(-1), { id: 3, nome: 'Escova', funcionario_id: 30, funcionario_nome: 'Ana', categoria: 'Cabelo', valor: '1234.56', percentual_comissao: '35.50', duracao: 45 });
  });
  await t.test('administradores alteram serviços de qualquer funcionário e trocam responsável', async () => {
    assert.equal((await request('admin', '/2', { ...data, funcionario_id: '30' })).status, 302);
    assert.equal(rows.find((row) => row.id === 2).funcionario_id, 30);
    assert.equal((await request('master', '/1', { ...data, funcionario_id: '40', valor: '0', percentual_comissao: '100' })).status, 302);
    assert.equal(rows[0].funcionario_id, 40);
    assert.equal(rows[0].valor, '0.00');
    assert.equal(rows[0].percentual_comissao, '100.00');
  });
  await t.test('valida campos obrigatórios, limites numéricos e existência do responsável', async () => {
    const before = writes;
    const invalid = { nome: ['', 'a'.repeat(121)], categoria: ['', 'a'.repeat(81)], funcionario_id: ['', '-1', '999'],
      valor: ['', '-1', 'abc', '1,234', '100000000', 'Infinity'], percentual_comissao: ['', '-1', '100.01', '1.234'],
      duracao: ['', '0', '-1', '1.5', '2147483648'] };
    for (const [field, values] of Object.entries(invalid)) {
      for (const value of values) assert.equal((await request('admin', '', { ...data, [field]: value })).status, 400, `${field}: ${value}`);
    }
    assert.equal(writes, before);
  });
  await t.test('edição inválida preserva os dados digitados e escapa HTML', async () => {
    const res = await request('admin', '/1', { ...data, nome: '<script>alert(1)</script>', duracao: '0' });
    assert.equal(res.status, 400);
    const html = await res.text();
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.match(html, /class="team-edit" open/);
  });
  await t.test('IDs inválidos ou ausentes retornam 404', async () => {
    for (const id of ['abc', '0', '-1', '2147483648', '999']) {
      assert.equal((await request('admin', `/${id}`, data)).status, 404);
      assert.equal((await request('admin', `/${id}/excluir`, {})).status, 404);
    }
  });
  await t.test('agendamentos bloqueiam exclusão e funcionário removido gera erro de vínculo', async () => {
    failure = { code: '23503' };
    const res = await request('master', '/1/excluir', {});
    assert.equal(res.status, 409);
    assert.match(await res.text(), /agendamentos vinculados/);
    const save = await request('admin', '', data);
    assert.equal(save.status, 409);
    assert.match(await save.text(), /não está mais disponível/);
    failure = null;
  });
  await t.test('falhas inesperadas chegam ao tratamento central', async () => {
    failure = new Error('Banco indisponível');
    assert.equal((await request('admin', '', data)).status, 500);
    failure = null;
  });
  await t.test('administradores e master excluem serviços', async () => {
    assert.equal((await request('admin', '/1/excluir', {})).status, 302);
    assert.equal((await request('master', '/2/excluir', {})).status, 302);
    assert.deepEqual(rows.map((row) => row.id), [3]);
  });
});

test('modelo filtra serviços no SQL pelo funcionário e parametriza gravações', async (t) => {
  const db = require('../config/db');
  const originalQuery = db.query;
  const filename = require.resolve('../models/Servico');
  const originalModule = require.cache[filename];
  const calls = [];
  db.query = async (sql, params) => { calls.push({ sql, params }); return { rows: [{ id: 1 }] }; };
  delete require.cache[filename];
  const model = require('../models/Servico');
  t.after(() => { db.query = originalQuery; require.cache[filename] = originalModule; });
  await model.listar({ papel: 'profissional', funcionarioId: 30 });
  assert.match(calls[0].sql, /WHERE s\.funcionario_id = \$1/);
  assert.deepEqual(calls[0].params, [30]);
  await model.listar({ papel: 'admin' });
  assert.ok(!calls[1].sql.includes('WHERE'));
  await model.listar({ papel: 'master' });
  assert.ok(!calls[2].sql.includes('WHERE'));
  const count = calls.length;
  assert.deepEqual(await model.listar({ papel: 'profissional' }), []);
  assert.deepEqual(await model.listar({ papel: 'desconhecido', funcionarioId: 30 }), []);
  assert.equal(calls.length, count);
  const data = { nome: "Corte ' especial", funcionario_id: 30, categoria: 'Cabelo', valor: '80.50', percentual_comissao: '25.00', duracao: 30 };
  await model.criar(data);
  assert.deepEqual(calls.at(-1).params, [data.nome, 30, 'Cabelo', '80.50', '25.00', 30]);
  await model.atualizar(1, data);
  assert.deepEqual(calls.at(-1).params, [data.nome, 30, 'Cabelo', '80.50', '25.00', 30, 1]);
  await model.excluir(1);
  assert.deepEqual(calls.at(-1).params, [1]);
  await model.funcionarioExiste(30);
  assert.deepEqual(calls.at(-1).params, [30]);
  for (const { sql } of calls) assert.ok(!sql.includes(data.nome));
});
