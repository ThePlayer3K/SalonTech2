const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const Equipe = require('../models/Equipe');
const Usuario = require('../models/Usuario');

test('equipe: permissões, credenciais, salários e edição da própria conta', async (t) => {
  const originalModel = { ...Equipe };
  const originalBuscar = Usuario.buscarPorId;
  const originalMaster = process.env.ADMIN_NAME;
  process.env.ADMIN_NAME = 'Master de teste';
  const fixtures = [
    { usuario_id: 1, funcionario_id: 11, nome: 'Master', login: 'Master de teste', papel: 'master' },
    { usuario_id: 2, funcionario_id: 12, nome: 'Administrador', login: 'admin', papel: 'admin' },
    { usuario_id: 3, funcionario_id: 13, nome: 'Outro administrador', login: 'outro-admin', papel: 'admin' },
    { usuario_id: 4, funcionario_id: 14, nome: 'Ana', login: 'ana', papel: 'profissional', cpf: '529.982.247-25', telefone: '(11) 98765-4321', cargo: 'Cabeleireira', tipo_pagamento: 'Mensal', salario: 0 },
    { usuario_id: 5, funcionario_id: 15, nome: 'Bia', login: 'bia', papel: 'profissional', salario: 1200 }
  ];
  let people;
  let writes;
  let failure;
  let savedSessions;
  t.beforeEach(() => {
    people = fixtures.map((person) => ({ ...person }));
    writes = [];
    failure = null;
    savedSessions = [];
  });
  Usuario.buscarPorId = async (id) => {
    const person = people.find((row) => row.usuario_id === id);
    return person && { id, nome: person.login, papel: person.papel, funcionario_id: person.funcionario_id };
  };
  Equipe.listar = async () => people;
  Equipe.buscarPorUsuario = async (id) => people.find((person) => person.usuario_id === id) || null;
  Equipe.salvar = async (data) => {
    if (failure) throw failure;
    writes.push({ ...data });
    let person = people.find((row) => row.usuario_id === data.usuarioId);
    if (!person) {
      const id = Math.max(...people.map((row) => row.usuario_id)) + 1;
      person = { usuario_id: id, funcionario_id: id + 10 };
      people.push(person);
    }
    Object.assign(person, { nome: data.nome, login: data.login, papel: data.papel, cpf: data.cpf, telefone: data.telefone, cargo: data.cargo, tipo_pagamento: data.tipoPagamento, salario: data.salario });
    return person.usuario_id;
  };
  Equipe.excluir = async (usuarioId, funcionarioId) => {
    if (failure) throw failure;
    writes.push({ usuarioId, funcionarioId, removing: true });
    people = people.filter((person) => person.usuario_id !== usuarioId);
  };
  const app = express();
  app.set('views', path.join(__dirname, '../views'));
  app.set('view engine', 'ejs');
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    const id = Number(req.get('x-test-user'));
    req.session = {
      user: id ? { id } : null,
      save(callback) { savedSessions.push({ ...this.user }); callback(); }
    };
    next();
  });
  app.use('/', require('../routes/placeholderRoutes'));
  app.use((error, req, res, next) => res.status(500).send('Erro interno'));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    Object.assign(Equipe, originalModel);
    Usuario.buscarPorId = originalBuscar;
    if (originalMaster === undefined) delete process.env.ADMIN_NAME;
    else process.env.ADMIN_NAME = originalMaster;
  });
  const request = (userId, route, body) => fetch(`http://127.0.0.1:${server.address().port}${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'x-test-user': String(userId || ''), 'content-type': 'application/x-www-form-urlencoded' },
    body: body === undefined ? undefined : new URLSearchParams(body),
    redirect: 'manual'
  });
  const data = { nome: ' Pessoa de teste ', login: ' novo-login ', senha: 'senha-de-teste', papel: 'profissional', salario: '1.234,56' };

  await t.test('visitantes não acessam equipe nem minha conta', async () => {
    for (const [route, body] of [['/equipe', undefined], ['/equipe', data], ['/equipe/4', data], ['/equipe/4/excluir', {}], ['/minha-conta', undefined], ['/minha-conta', data]]) {
      const res = await request(null, route, body);
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/login');
    }
    assert.equal(writes.length, 0);
  });
  await t.test('profissionais consultam a própria conta e não gerenciam a equipe', async () => {
    for (const [route, body] of [['/equipe', undefined], ['/equipe', data], ['/equipe/4', data], ['/equipe/5/excluir', {}]]) {
      assert.equal((await request(4, route, body)).status, 403);
    }
    const html = await (await request(4, '/minha-conta')).text();
    assert.match(html, /Minha conta/);
    assert.match(html, /value="Ana"\s+readonly/);
    assert.ok(!html.includes('name="salario"'));
    assert.equal(writes.length, 0);
  });
  await t.test('master é protegido, inclusive quando identificado pelo login do ambiente', async () => {
    assert.equal((await request(1, '/minha-conta')).status, 403);
    assert.equal((await request(1, '/minha-conta', data)).status, 403);
    for (const userId of [1, 2]) {
      for (const route of ['/equipe/1', '/equipe/1/excluir']) {
        assert.equal((await request(userId, route, data)).status, 403);
      }
    }
    people[0].papel = 'admin';
    assert.equal((await request(1, '/equipe/1', data)).status, 403);
    assert.equal((await request(1, '/equipe/1/excluir', {})).status, 403);
    assert.equal(writes.length, 0);
  });
  await t.test('admin edita a si e profissionais; somente master gerencia outros administradores', async () => {
    assert.equal((await request(2, '/equipe/3', data)).status, 403);
    assert.equal((await request(2, '/equipe/3/excluir', {})).status, 403);
    assert.equal((await request(2, '/equipe/2', { ...data, papel: 'admin', senha: '' })).status, 302);
    assert.equal(savedSessions.length, 1);
    assert.equal(savedSessions[0].nome, 'novo-login');
    assert.equal(savedSessions[0].papel, 'admin');
    assert.equal(writes[0].senha, '');
    assert.equal((await request(2, '/equipe/4', data)).status, 302);
    assert.equal(savedSessions.length, 1);
    assert.equal((await request(1, '/equipe/3', { ...data, papel: 'admin' })).status, 302);
    assert.equal((await request(1, '/equipe/3/excluir', {})).status, 302);
    assert.equal((await request(2, '/equipe/5/excluir', {})).status, 302);
  });
  await t.test('minha conta preserva dados profissionais, ignora outro ID no corpo e atualiza a sessão', async () => {
    const original = { ...people[3] };
    const res = await request(4, '/minha-conta', { ...data, usuarioId: '5', nome: 'Alterado', cpf: 'outro', telefone: 'outro', cargo: 'outro', tipoPagamento: 'outro', salario: '999' });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/minha-conta?salvo=1');
    const saved = writes[0];
    assert.equal(saved.usuarioId, 4);
    assert.equal(saved.funcionarioId, 14);
    for (const key of ['nome', 'cpf', 'telefone', 'cargo', 'salario']) assert.equal(saved[key], original[key]);
    assert.equal(saved.tipoPagamento, original.tipo_pagamento);
    assert.equal(savedSessions[0].nome, 'novo-login');
    assert.equal((await request(4, '/minha-conta', { ...data, papel: 'admin' })).status, 403);
    assert.equal(writes.length, 1);
  });
  await t.test('credenciais inválidas não são gravadas e mensagens são escapadas', async () => {
    for (const body of [{ ...data, nome: '' }, { ...data, login: '' }, { ...data, papel: 'master' }, { ...data, senha: 'curta' }]) {
      const res = await request(2, '/equipe', body);
      assert.equal(res.status, 200);
      assert.match(await res.text(), /id="feedbackDialog" role="alertdialog"/);
    }
    const edited = await request(2, '/equipe/4', { ...data, senha: 'curta' });
    assert.match(await edited.text(), /A nova senha precisa ter pelo menos 8 caracteres/);
    failure = new Error('Login <indisponível>');
    const duplicate = await request(2, '/equipe', data);
    assert.match(await duplicate.text(), /Login &lt;indisponível&gt;/);
    assert.equal(writes.length, 0);
  });
  await t.test('salário aceita milhares, decimais, ausência e zero na criação e edição', async () => {
    for (const [salario, expected] of [['1.234', 1234], ['1.234.567', 1234567], ['1.234,56', 1234.56], ['1234.56', 1234.56], ['12.34', 12.34], ['R$ 200,50', 200.5], ['', null], ['0', 0], ['0,00', 0]]) {
      for (const route of ['/equipe', '/equipe/4']) {
        const res = await request(2, route, { ...data, salario });
        assert.equal(res.status, 302, `${route}: ${salario}`);
        assert.equal(writes.at(-1).salario, expected, salario);
      }
    }
  });
  await t.test('salário rejeita letras, agrupamentos inválidos, negativos e casas decimais extras', async () => {
    for (const salario of ['abc', 'abc123', 'R$', '1e3', '-1', '1,234', '12.34.567', '1.23,45', 'NaN', 'Infinity', '12.3456']) {
      for (const route of ['/equipe', '/equipe/4']) {
        const res = await request(2, route, { ...data, salario });
        assert.equal(res.status, 200);
        assert.match(await res.text(), /Informe um salário válido/);
      }
    }
    assert.equal(writes.length, 0);
  });
  await t.test('contas ausentes são recusadas e falhas com código chegam ao tratamento central', async () => {
    assert.equal((await request(2, '/equipe/999', data)).status, 403);
    assert.equal((await request(2, '/equipe/999/excluir', {})).status, 403);
    failure = { code: 'XX000' };
    for (const route of ['/equipe', '/equipe/4', '/equipe/4/excluir']) assert.equal((await request(2, route, data)).status, 500);
    assert.equal(writes.length, 0);
  });
  await t.test('listagem respeita os controles por perfil e mantém o alias de usuários', async () => {
    for (const userId of [1, 2]) {
      const html = await (await request(userId, '/equipe')).text();
      assert.match(html, /Conta protegida pelo ambiente/);
      assert.match(html, /Adicionar funcionário/);
      assert.ok(!html.includes('action="/equipe/1"'));
      if (userId === 2) assert.ok(!html.includes('action="/equipe/3"'));
      else assert.ok(html.includes('action="/equipe/3"'));
    }
    const res = await request(2, '/usuarios');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/equipe');
  });
});
