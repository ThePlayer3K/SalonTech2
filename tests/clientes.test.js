const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const Cliente = require('../models/Cliente');
const Usuario = require('../models/Usuario');
const db = require('../config/db');

test('cadastro de clientes: permissões, formulários e operações', async (t) => {
  const originalModel = { ...Cliente };
  const originalBuscar = Usuario.buscarPorId;
  const originalMaster = process.env.ADMIN_NAME;
  process.env.ADMIN_NAME = 'Master de teste';
  const users = {
    admin: { id: 1, nome: 'Administrador', papel: 'admin' },
    master: { id: 2, nome: 'Master de teste', papel: 'master' },
    profissional: { id: 3, nome: 'Profissional', papel: 'profissional' }
  };
  let clientes = [];
  let writes = 0;
  let failure = null;
  Cliente.listar = async () => clientes;
  Cliente.criar = async (data) => {
    if (failure) throw failure;
    writes++;
    const cliente = { id: clientes.length + 1, ...data };
    clientes.push(cliente);
    return cliente;
  };
  Cliente.atualizar = async (id, data) => {
    if (failure) throw failure;
    const cliente = clientes.find((item) => item.id === id);
    if (!cliente) return null;
    writes++;
    Object.assign(cliente, data);
    return cliente;
  };
  Cliente.excluir = async (id) => {
    if (failure) throw failure;
    const cliente = clientes.find((item) => item.id === id);
    if (!cliente) return null;
    writes++;
    clientes = clientes.filter((item) => item.id !== id);
    return cliente;
  };
  Usuario.buscarPorId = async (id) => Object.values(users).find((user) => user.id === id);
  const app = express();
  app.set('views', path.join(__dirname, '../views'));
  app.set('view engine', 'ejs');
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    const user = users[req.get('x-test-role')];
    req.session = { user: user ? { ...user } : null };
    next();
  });
  app.use('/clientes', require('../routes/clienteRoutes'));
  app.use((error, req, res, next) => res.status(500).send('Erro interno'));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    Object.assign(Cliente, originalModel);
    Usuario.buscarPorId = originalBuscar;
    if (originalMaster === undefined) delete process.env.ADMIN_NAME;
    else process.env.ADMIN_NAME = originalMaster;
  });
  const request = (role, route = '', data) => fetch(`http://127.0.0.1:${server.address().port}/clientes${route}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { 'x-test-role': role || '', 'content-type': 'application/x-www-form-urlencoded' },
    body: data === undefined ? undefined : new URLSearchParams(data),
    redirect: 'manual'
  });

  await t.test('visitantes são direcionados ao login em todas as operações', async () => {
    for (const [route, body] of [['', undefined], ['', {}], ['/1', {}], ['/1/excluir', {}]]) {
      const response = await request(null, route, body);
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), '/login');
    }
    assert.equal(writes, 0);
  });
  await t.test('profissionais não podem consultar, criar, editar nem excluir', async () => {
    for (const [route, body] of [['', undefined], ['', {}], ['/1', {}], ['/1/excluir', {}]]) {
      assert.equal((await request('profissional', route, body)).status, 403);
    }
    assert.equal(writes, 0);
  });
  await t.test('administradores e master acessam o formulário e o estado vazio', async () => {
    for (const role of ['admin', 'master']) {
      const response = await request(role);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /Nenhum cliente cadastrado/);
      for (const name of ['nome', 'cpf', 'telefone', 'email']) assert.ok(html.includes(`name="${name}"`));
    }
  });
  await t.test('valida dados no servidor sem gravar', async () => {
    for (const body of [{}, { nome: 'A', cpf: '11111111111' }, { nome: 'A', cpf: '52998224724' },
      { nome: 'A', telefone: '123' }, { nome: 'A', email: 'invalido' }, { nome: 'a'.repeat(121) }]) {
      assert.equal((await request('admin', '', body)).status, 400);
    }
    assert.equal(writes, 0);
  });
  await t.test('cadastra, normaliza e lista os quatro dados', async () => {
    const response = await request('admin', '', { nome: ' Maria Silva ', cpf: '52998224725', telefone: '11987654321', email: 'maria@example.com' });
    assert.equal(response.status, 302);
    assert.deepEqual(clientes[0], { id: 1, nome: 'Maria Silva', cpf: '529.982.247-25', telefone: '(11) 98765-4321', email: 'maria@example.com' });
    const html = await (await request('admin')).text();
    for (const value of Object.values(clientes[0]).slice(1)) assert.ok(html.includes(value));
  });
  await t.test('master edita o cadastro', async () => {
    assert.equal((await request('master', '/1', { nome: 'Maria Souza', email: 'novo@example.com' })).status, 302);
    assert.equal(clientes[0].nome, 'Maria Souza');
    assert.equal(clientes[0].email, 'novo@example.com');
    assert.equal(clientes[0].cpf, '');
  });
  await t.test('erros preservam os dados de edição e escapam HTML', async () => {
    const response = await request('admin', '/1', { nome: '<script>alert(1)</script>', email: 'invalido' });
    assert.equal(response.status, 400);
    const html = await response.text();
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.equal(clientes[0].nome, 'Maria Souza');
  });
  await t.test('CPF duplicado e exclusão com vínculo retornam mensagens claras', async () => {
    failure = { code: '23505' };
    const duplicate = await request('admin', '', { nome: 'Outra pessoa' });
    assert.equal(duplicate.status, 409);
    assert.match(await duplicate.text(), /CPF já está cadastrado/);
    failure = { code: '23503' };
    const linked = await request('admin', '/1/excluir', {});
    assert.equal(linked.status, 409);
    assert.match(await linked.text(), /agendamentos vinculados/);
    assert.equal(clientes.length, 1);
    failure = null;
  });
  await t.test('IDs inválidos e registros ausentes retornam 404', async () => {
    for (const id of ['abc', '0', '-1', '999999999999999999999', '999']) {
      assert.equal((await request('admin', `/${id}`, { nome: 'Teste' })).status, 404);
      assert.equal((await request('admin', `/${id}/excluir`, {})).status, 404);
    }
  });
  await t.test('falhas inesperadas seguem ao tratamento de erro', async () => {
    failure = new Error('Falha de conexão');
    assert.equal((await request('admin', '', { nome: 'Teste' })).status, 500);
    failure = null;
  });
  await t.test('master remove um cliente', async () => {
    assert.equal((await request('master', '/1/excluir', {})).status, 302);
    assert.equal(clientes.length, 0);
  });
});

test('modelo usa parâmetros SQL e converte contatos vazios em NULL', async (t) => {
  const originalQuery = db.query;
  const modulePath = require.resolve('../models/Cliente');
  const originalModule = require.cache[modulePath];
  const calls = [];
  db.query = async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [{ id: 1 }] };
  };
  delete require.cache[modulePath];
  const model = require('../models/Cliente');
  t.after(() => { db.query = originalQuery; require.cache[modulePath] = originalModule; });
  const nome = "Cliente ' especial";
  await model.criar({ nome, cpf: '', telefone: '', email: '' });
  await model.atualizar(1, { nome, cpf: '', telefone: '', email: '' });
  await model.excluir(1);
  await model.listar();
  assert.deepEqual(calls[0].params, [nome, null, null, null]);
  assert.deepEqual(calls[1].params, [nome, null, null, null, 1]);
  assert.deepEqual(calls[2].params, [1]);
  for (const { sql } of calls) assert.ok(!sql.includes(nome));
});
