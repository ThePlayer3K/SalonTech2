const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const Usuario = require('../models/Usuario');
const Produto = require('../models/Produto');
const FormaPagamento = require('../models/FormaPagamento');

test('produtos e pagamentos: operações e permissões por perfil', async (t) => {
  const originalBuscar = Usuario.buscarPorId;
  const originalMaster = process.env.ADMIN_NAME;
  process.env.ADMIN_NAME = 'Master de teste';
  const users = {
    admin: { id: 1, nome: 'Admin', papel: 'admin' },
    master: { id: 2, nome: 'Master de teste', papel: 'master' },
    profissional: { id: 3, nome: 'Profissional', papel: 'profissional' }
  };
  Usuario.buscarPorId = async (id) => Object.values(users).find((user) => user.id === id);
  const originals = [Produto, FormaPagamento].map((model) => ({ ...model }));
  const stores = [Produto, FormaPagamento].map((model) => {
    const state = { rows: [], writes: 0, failure: null, listFailure: false, nextId: 1 };
    model.listar = async () => {
      if (state.listFailure) throw new Error('Falha de consulta');
      return state.rows;
    };
    model.criar = async (data) => {
      if (state.failure) throw state.failure;
      state.writes++;
      const row = { ...data, id: state.nextId++ };
      state.rows.push(row);
      return row;
    };
    model.atualizar = async (id, data) => {
      if (state.failure) throw state.failure;
      const row = state.rows.find((item) => item.id === id);
      if (!row) return null;
      state.writes++;
      Object.assign(row, data);
      return row;
    };
    model.excluir = async (id) => {
      if (state.failure) throw state.failure;
      const row = state.rows.find((item) => item.id === id);
      if (!row) return null;
      state.writes++;
      state.rows = state.rows.filter((item) => item.id !== id);
      return row;
    };
    return state;
  });
  const app = express();
  app.set('views', path.join(__dirname, '../views'));
  app.set('view engine', 'ejs');
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    const user = users[req.get('x-test-role')];
    req.session = { user: user ? { ...user } : null };
    next();
  });
  app.use('/produtos', require('../routes/produtoRoutes'));
  app.use('/pagamentos', require('../routes/formaPagamentoRoutes'));
  app.use((error, req, res, next) => res.status(500).send('Erro interno'));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    [Produto, FormaPagamento].forEach((model, i) => Object.assign(model, originals[i]));
    Usuario.buscarPorId = originalBuscar;
    if (originalMaster === undefined) delete process.env.ADMIN_NAME;
    else process.env.ADMIN_NAME = originalMaster;
  });
  const request = (role, route, body) => fetch(`http://127.0.0.1:${server.address().port}${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'x-test-role': role || '', 'content-type': 'application/x-www-form-urlencoded' },
    body: body === undefined ? undefined : new URLSearchParams(body), redirect: 'manual'
  });
  const product = { nome: ' Shampoo ', qtd_estoque: '0', categoria: ' Cabelos ' };

  await t.test('visitantes não acessam nenhuma operação', async () => {
    for (const base of ['/produtos', '/pagamentos']) {
      for (const [suffix, body] of [['', undefined], ['', {}], ['/1', {}], ['/1/excluir', {}]]) {
        const res = await request(null, base + suffix, body);
        assert.equal(res.status, 302);
        assert.equal(res.headers.get('location'), '/login');
      }
    }
    assert.deepEqual(stores.map((state) => state.writes), [0, 0]);
  });
  await t.test('todos os perfis podem criar, editar e excluir produtos', async () => {
    for (const role of Object.keys(users)) {
      assert.equal((await request(role, '/produtos')).status, 200);
      assert.equal((await request(role, '/produtos', product)).status, 302);
      const row = stores[0].rows.at(-1);
      assert.deepEqual(row, { id: row.id, nome: 'Shampoo', qtd_estoque: 0, categoria: 'Cabelos' });
      assert.equal((await request(role, `/produtos/${row.id}`, { ...product, nome: 'Condicionador', qtd_estoque: '12' })).status, 302);
      assert.equal(row.qtd_estoque, 12);
      const html = await (await request(role, '/produtos')).text();
      assert.match(html, /Condicionador/);
      assert.match(html, /Cabelos/);
      assert.equal((await request(role, `/produtos/${row.id}/excluir`, {})).status, 302);
    }
  });
  await t.test('produto exige nome, categoria e quantidade inteira válida', async () => {
    const before = stores[0].writes;
    for (const quantity of ['', '-1', '1.5', '1e2', 'abc', '2147483648']) {
      assert.equal((await request('profissional', '/produtos', { ...product, qtd_estoque: quantity })).status, 400);
    }
    for (const body of [{ ...product, nome: ' ' }, { ...product, categoria: '' },
      { ...product, nome: 'a'.repeat(121) }, { ...product, categoria: 'a'.repeat(81) }]) {
      assert.equal((await request('admin', '/produtos', body)).status, 400);
    }
    assert.equal(stores[0].writes, before);
  });
  await t.test('administradores e master gerenciam formas de pagamento', async () => {
    for (const role of ['admin', 'master']) {
      assert.equal((await request(role, '/pagamentos', { nome: ' Pix ' })).status, 302);
      const row = stores[1].rows.at(-1);
      assert.equal(row.nome, 'Pix');
      assert.equal((await request(role, `/pagamentos/${row.id}`, { nome: 'Cartão' })).status, 302);
      assert.equal(row.nome, 'Cartão');
      const html = await (await request(role, '/pagamentos')).text();
      assert.match(html, /Adicionar forma de pagamento/);
      assert.match(html, /Editar forma de pagamento/);
      assert.equal((await request(role, `/pagamentos/${row.id}/excluir`, {})).status, 302);
    }
    assert.equal((await request('admin', '/pagamentos', { nome: 'Pix' })).status, 302);
  });
  await t.test('profissional vê pagamentos sem formulários e não pode alterar por POST', async () => {
    const res = await request('profissional', '/pagamentos');
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Pix/);
    assert.match(html, /apenas a consulta/);
    assert.ok(!html.includes('Adicionar forma de pagamento'));
    assert.ok(!html.includes('Editar forma de pagamento'));
    assert.ok(!html.includes('Excluir forma de pagamento'));
    assert.ok(!html.includes('action="/pagamentos'));
    const before = stores[1].writes;
    for (const route of ['/pagamentos', '/pagamentos/1', '/pagamentos/1/excluir']) {
      assert.equal((await request('profissional', route, { nome: 'Tentativa' })).status, 403);
    }
    assert.equal(stores[1].writes, before);
  });
  await t.test('pagamento exige nome de até 80 caracteres', async () => {
    for (const nome of ['', ' ', 'a'.repeat(81)]) {
      assert.equal((await request('admin', '/pagamentos', { nome })).status, 400);
    }
  });
  await t.test('edição inválida mantém dados digitados e escapa HTML', async () => {
    await request('admin', '/produtos', product);
    const row = stores[0].rows.at(-1);
    const res = await request('admin', `/produtos/${row.id}`, { ...product, nome: '<script>alert(1)</script>', qtd_estoque: '-1' });
    assert.equal(res.status, 400);
    const html = await res.text();
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.match(html, /class="team-edit" open/);
    assert.equal(row.nome, 'Shampoo');
  });
  await t.test('pagamento vinculado a agendamentos não pode ser excluído', async () => {
    stores[1].failure = { code: '23503' };
    const id = stores[1].rows[0].id;
    const res = await request('master', `/pagamentos/${id}/excluir`, {});
    assert.equal(res.status, 409);
    assert.match(await res.text(), /registros vinculados/);
    assert.equal(stores[1].rows.length, 1);
    stores[1].failure = null;
  });
  await t.test('IDs inválidos e ausentes retornam 404 nas duas features', async () => {
    for (const base of ['/produtos', '/pagamentos']) {
      for (const id of ['abc', '-1', '0', '2147483648', '999']) {
        assert.equal((await request('admin', `${base}/${id}`, product)).status, 404);
        assert.equal((await request('admin', `${base}/${id}/excluir`, {})).status, 404);
      }
    }
  });
  await t.test('erros inesperados são encaminhados ao tratamento central', async () => {
    stores[0].failure = new Error('Falha de gravação');
    assert.equal((await request('admin', '/produtos', product)).status, 500);
    stores[0].failure = null;
    stores[1].listFailure = true;
    assert.equal((await request('admin', '/pagamentos')).status, 500);
    stores[1].listFailure = false;
  });
});

test('modelos de produtos e pagamentos usam parâmetros SQL', async (t) => {
  const db = require('../config/db');
  const originalQuery = db.query;
  const calls = [];
  const paths = ['../models/Produto', '../models/FormaPagamento'].map(require.resolve);
  const modules = paths.map((filename) => require.cache[filename]);
  db.query = async (sql, params) => { calls.push({ sql, params }); return { rows: [{ id: 7 }] }; };
  paths.forEach((filename) => delete require.cache[filename]);
  t.after(() => {
    db.query = originalQuery;
    paths.forEach((filename, i) => { require.cache[filename] = modules[i]; });
  });
  const nome = "Nome ' especial";
  const modelProduct = require('../models/Produto');
  const modelPayment = require('../models/FormaPagamento');
  await modelProduct.criar({ nome, qtd_estoque: 0, categoria: 'Categoria' });
  await modelProduct.atualizar(7, { nome, qtd_estoque: 4, categoria: 'Categoria' });
  await modelProduct.excluir(7);
  await modelProduct.listar();
  await modelPayment.criar({ nome });
  await modelPayment.atualizar(7, { nome });
  await modelPayment.excluir(7);
  await modelPayment.listar();
  assert.deepEqual(calls[0].params, [nome, 0, 'Categoria']);
  assert.deepEqual(calls[1].params, [nome, 4, 'Categoria', 7]);
  assert.deepEqual(calls[4].params, [nome]);
  assert.deepEqual(calls[5].params, [nome, 7]);
  for (const { sql } of calls) assert.ok(!sql.includes(nome));
});
