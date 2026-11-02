const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const Despesa = require('../models/Despesa');
const Usuario = require('../models/Usuario');

test('despesas: CRUD, pesquisa e permissões', async (t) => {
  const original = { ...Despesa };
  const originalBuscar = Usuario.buscarPorId;
  const originalMaster = process.env.ADMIN_NAME;
  process.env.ADMIN_NAME = 'Master de teste';
  const users = {
    admin: { id: 1, nome: 'Admin', papel: 'admin' },
    master: { id: 2, nome: 'Master de teste', papel: 'master' },
    profissional: { id: 3, nome: 'Profissional', papel: 'profissional' }
  };
  let rows = [
    { id: 1, descricao: 'Aluguel do salão', valor: '1500.00', tipo: 'fixo', data: '2026-11-01' },
    { id: 2, descricao: 'Compra de produtos', valor: '250.50', tipo: 'variavel', data: '2026-11-02' },
    { id: 3, descricao: 'Aluguel de equipamento', valor: '100.00', tipo: 'variavel', data: '2026-12-01' }
  ];
  let nextId = 4;
  let writes = 0;
  let lists = 0;
  let failure = null;
  let lastFilters;
  let lastToken;
  Usuario.buscarPorId = async (id) => Object.values(users).find((user) => user.id === id);
  Despesa.listar = async (filters) => {
    if (failure && failure.constraint !== 'despesa_comissao_automatica') throw failure;
    lists++;
    lastFilters = filters;
    return rows.filter((row) => (!filters.nome || row.descricao.toLowerCase().includes(filters.nome.toLowerCase()))
      && (!filters.dataInicio || row.data >= filters.dataInicio) && (!filters.dataFim || row.data <= filters.dataFim));
  };
  Despesa.criar = async (data, token) => {
    if (failure) throw failure;
    lastToken = token;
    writes++;
    const row = { id: nextId++, ...data };
    rows.push(row);
    return row;
  };
  Despesa.atualizar = async (id, data) => {
    if (failure) throw failure;
    const row = rows.find((item) => item.id === id);
    if (!row) return null;
    writes++;
    Object.assign(row, data);
    return row;
  };
  Despesa.excluir = async (id) => {
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
    req.session = { user: user ? { ...user } : null };
    next();
  });
  app.use('/despesas', require('../routes/despesaRoutes'));
  app.use((error, req, res, next) => res.status(500).send('Erro interno'));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    Object.assign(Despesa, original);
    Usuario.buscarPorId = originalBuscar;
    if (originalMaster === undefined) delete process.env.ADMIN_NAME;
    else process.env.ADMIN_NAME = originalMaster;
  });
  const request = (role, suffix = '', body) => fetch(`http://127.0.0.1:${server.address().port}/despesas${suffix}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'x-test-role': role || '', 'content-type': 'application/x-www-form-urlencoded' },
    body: body === undefined ? undefined : new URLSearchParams(body), redirect: 'manual'
  });
  const data = { descricao: ' Energia elétrica ', valor: '1.234,56', tipo: 'variavel', data: '2026-11-02', cadastro_token: randomUUID() };

  await t.test('visitantes são direcionados ao login e profissionais não acessam nenhuma operação', async () => {
    for (const role of [null, 'profissional']) {
      for (const [suffix, body] of [['', undefined], ['?nome=Aluguel', undefined], ['', data], ['/1', data], ['/1/excluir', {}]]) {
        const res = await request(role, suffix, body);
        assert.equal(res.status, role ? 403 : 302);
        if (!role) assert.equal(res.headers.get('location'), '/login');
      }
    }
    assert.equal(writes, 0);
    assert.equal(lists, 0);
  });
  await t.test('admin e master consultam descrição, valor, tipo e data com formulários e pesquisa', async () => {
    for (const role of ['admin', 'master']) {
      const res = await request(role);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /Aluguel do salão/);
      assert.match(html, /Compra de produtos/);
      assert.match(html, /01\/11\/2026/);
      assert.match(html, /Fixo/);
      assert.match(html, /Variável/);
      for (const field of [...Object.keys(data), 'nome', 'dataInicio', 'dataFim']) assert.ok(html.includes(`name="${field}"`));
    }
  });
  await t.test('pesquisa por parte da descrição ignora maiúsculas e preserva o termo digitado', async () => {
    const res = await request('admin', '?nome=%20ALUGUEL%20');
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Aluguel do salão/);
    assert.match(html, /Aluguel de equipamento/);
    assert.ok(!html.includes('Compra de produtos'));
    assert.equal(lastFilters.nome, 'ALUGUEL');
    assert.match(html, /value="ALUGUEL"/);
  });
  await t.test('pesquisa por período inclui os dois limites e permite apenas uma data', async () => {
    const html = await (await request('admin', '?dataInicio=2026-11-01&dataFim=2026-11-02')).text();
    assert.match(html, /Aluguel do salão/);
    assert.match(html, /Compra de produtos/);
    assert.ok(!html.includes('Aluguel de equipamento'));
    const from = await (await request('admin', '?dataInicio=2026-12-01')).text();
    assert.match(from, /Aluguel de equipamento/);
    assert.ok(!from.includes('Aluguel do salão'));
    const until = await (await request('master', '?dataFim=2026-11-01')).text();
    assert.match(until, /Aluguel do salão/);
    assert.ok(!until.includes('Compra de produtos'));
  });
  await t.test('combina nome e intervalo; informa resultados vazios e oferece limpar filtros', async () => {
    const html = await (await request('admin', '?nome=Aluguel&dataInicio=2026-11-01&dataFim=2026-11-30')).text();
    assert.match(html, /Aluguel do salão/);
    assert.ok(!html.includes('Aluguel de equipamento'));
    assert.ok(!html.includes('Compra de produtos'));
    const empty = await (await request('admin', '?nome=inexistente')).text();
    assert.match(empty, /Nenhuma despesa encontrada/);
    assert.match(empty, /href="\/despesas">Limpar filtros/);
  });
  await t.test('rejeita períodos invertidos, datas inexistentes e filtros repetidos sem consultar o banco', async () => {
    const before = lists;
    for (const query of ['dataInicio=2026-11-02&dataFim=2026-11-01', 'dataInicio=2026-02-30', 'dataFim=2026-13-01',
      'dataInicio=0000-01-01', 'dataFim=01-11-2026', 'nome=a&nome=b', 'dataInicio=a&dataInicio=b', `nome=${'a'.repeat(121)}`]) {
      const res = await request('admin', `?${query}`);
      assert.equal(res.status, 400, query);
      const html = await res.text();
      assert.match(html, /role="alert"/);
      assert.ok(!html.includes('Nenhuma despesa encontrada'));
    }
    assert.equal(lists, before);
  });
  await t.test('cadastra e normaliza descrição e reais, aceitando tipos fixo e variável', async () => {
    const res = await request('admin', '', data);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/despesas?status=criado');
    assert.deepEqual(rows.at(-1), { id: 4, descricao: 'Energia elétrica', valor: '1234.56', tipo: 'variavel', data: '2026-11-02' });
    assert.equal(lastToken, data.cadastro_token);
    assert.equal((await request('master', '', { ...data, tipo: 'fixo', valor: '99999999.99', data: '2024-02-29' })).status, 302);
    assert.equal(rows.at(-1).tipo, 'fixo');
    assert.equal(rows.at(-1).valor, '99999999.99');
  });
  await t.test('formulário possui token por cadastro e rejeita envios sem token válido', async () => {
    const first = await (await request('admin')).text();
    const second = await (await request('admin')).text();
    const token = (html) => html.match(/name="cadastro_token" value="([^"]+)"/)[1];
    assert.notEqual(token(first), token(second));
    const before = writes;
    for (const value of ['', 'invalid']) assert.equal((await request('admin', '', { ...data, cadastro_token: value })).status, 400);
    assert.equal(writes, before);
    const invalid = await request('admin', '', { ...data, valor: '-1' });
    assert.equal(token(await invalid.text()), data.cadastro_token);
  });
  await t.test('comissões automáticas não oferecem edição e retornam conflito se alteradas por POST', async () => {
    rows.push({ id: 99, descricao: 'Comissão de Ana', valor: '20.00', tipo: 'variavel', data: '2026-11-02', agendamento_id: 10 });
    const html = await (await request('admin')).text();
    assert.match(html, /Comissão automática do agendamento #10/);
    assert.ok(!html.includes('action="/despesas/99"'));
    assert.ok(!html.includes('action="/despesas/99/excluir"'));
    failure = { code: '23514', constraint: 'despesa_comissao_automatica' };
    for (const [suffix, body] of [['/99', data], ['/99/excluir', {}]]) {
      const res = await request('admin', suffix, body);
      assert.equal(res.status, 409);
      assert.match(await res.text(), /pela situação do agendamento/);
    }
    failure = null;
    rows = rows.filter((row) => row.id !== 99);
  });
  await t.test('edita todos os campos e aceita formatos monetários brasileiros sem arredondar casas extras', async () => {
    for (const [valor, expected] of [['0', '0.00'], ['1234.56', '1234.56'], ['1.234', '1234.00'], ['1.234.567', '1234567.00'], ['12,3', '12.30']]) {
      const res = await request('master', '/1', { descricao: 'Aluguel atualizado', valor, tipo: 'variavel', data: '2026-12-15' });
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/despesas?status=atualizado');
      assert.deepEqual(rows[0], { id: 1, descricao: 'Aluguel atualizado', valor: expected, tipo: 'variavel', data: '2026-12-15' });
    }
  });
  await t.test('valida obrigatoriedade, limites, tipos e datas reais antes de gravar', async () => {
    const before = writes;
    const invalid = {
      descricao: ['', ' ', 'a'.repeat(121)], valor: ['', '-1', 'abc', '1,234', '1234.567', '100000000', 'Infinity', '1e2'],
      tipo: ['', 'outro', 'FIXO'], data: ['', '2026-02-29', '2026-04-31', '2026-13-01', '0000-01-01', '2026-1-1', '2026-11-02T00:00:00Z']
    };
    for (const [field, values] of Object.entries(invalid)) {
      for (const value of values) {
        for (const suffix of ['', '/1']) assert.equal((await request('admin', suffix, { ...data, [field]: value })).status, 400, `${field}: ${value}`);
      }
    }
    assert.equal(writes, before);
  });
  await t.test('edição inválida preserva os dados e escapa HTML no formulário e na pesquisa', async () => {
    const res = await request('admin', '/1', { ...data, descricao: '<script>alert(1)</script>', valor: '-1' });
    assert.equal(res.status, 400);
    const html = await res.text();
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.match(html, /class="team-edit" open/);
    assert.match(html, /value="-1"/);
    const search = await (await request('admin', '?nome=%3Cscript%3Ealert(1)%3C%2Fscript%3E')).text();
    assert.ok(!search.includes('<script>alert(1)</script>'));
    assert.ok(search.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  });
  await t.test('IDs inválidos e ausentes retornam 404', async () => {
    for (const id of ['abc', '-1', '0', '2147483648', '999']) {
      assert.equal((await request('admin', `/${id}`, data)).status, 404);
      assert.equal((await request('master', `/${id}/excluir`, {})).status, 404);
    }
  });
  await t.test('falhas do banco seguem para o tratamento central', async () => {
    failure = new Error('Banco indisponível');
    for (const [suffix, body] of [['', undefined], ['', data], ['/1', data], ['/1/excluir', {}]]) {
      assert.equal((await request('admin', suffix, body)).status, 500);
    }
    failure = null;
  });
  await t.test('admin e master excluem despesas e a listagem vazia é apresentada', async () => {
    for (const row of [...rows]) {
      const res = await request(row.id % 2 ? 'admin' : 'master', `/${row.id}/excluir`, {});
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/despesas?status=excluido');
    }
    assert.equal(rows.length, 0);
    assert.match(await (await request('admin')).text(), /Nenhuma despesa cadastrada/);
  });
});

test('modelo de despesas parametriza filtros, escapa curingas e grava os quatro campos', async (t) => {
  const db = require('../config/db');
  const originalQuery = db.query;
  const filename = require.resolve('../models/Despesa');
  const originalModule = require.cache[filename];
  const calls = [];
  db.query = async (sql, params) => { calls.push({ sql, params }); return { rows: [{ id: 1 }] }; };
  delete require.cache[filename];
  const model = require('../models/Despesa');
  t.after(() => { db.query = originalQuery; require.cache[filename] = originalModule; });
  await model.listar();
  assert.ok(!calls.at(-1).sql.includes('WHERE'));
  assert.match(calls.at(-1).sql, /to_char\(data, 'YYYY-MM-DD'\)/);
  const nome = "Aluguel ' 100%_\\";
  await model.listar({ nome, dataInicio: '2026-11-01', dataFim: '2026-11-30' });
  assert.match(calls.at(-1).sql, /nome ILIKE \$1/);
  assert.match(calls.at(-1).sql, /data >= \$2::date AND data <= \$3::date/);
  assert.deepEqual(calls.at(-1).params, ["%Aluguel ' 100\\%\\_\\\\%", '2026-11-01', '2026-11-30']);
  await model.listar({ dataFim: '2026-11-30' });
  assert.match(calls.at(-1).sql, /data <= \$1::date/);
  assert.deepEqual(calls.at(-1).params, ['2026-11-30']);
  const data = { descricao: nome, valor: '1234.56', tipo: 'fixo', data: '2026-11-02' };
  const token = randomUUID();
  await model.criar(data, token);
  assert.deepEqual(calls.at(-1).params, [nome, '1234.56', 'fixo', '2026-11-02', token]);
  assert.match(calls.at(-1).sql, /ON CONFLICT \(cadastro_token\)/);
  await model.atualizar(1, data);
  assert.deepEqual(calls.at(-1).params, [nome, '1234.56', 'fixo', '2026-11-02', 1]);
  await model.excluir(1);
  assert.deepEqual(calls.at(-1).params, [1]);
  for (const { sql } of calls) assert.ok(!sql.includes(nome));
  db.query = async () => ({ rows: [] });
  delete require.cache[filename];
  const empty = require('../models/Despesa');
  assert.equal(await empty.atualizar(999, data), null);
  assert.equal(await empty.excluir(999), null);
});
