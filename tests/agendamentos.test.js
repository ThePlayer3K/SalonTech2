const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const express = require('express');
const Agendamento = require('../models/Agendamento');
const Servico = require('../models/Servico');
const FormaPagamento = require('../models/FormaPagamento');
const Usuario = require('../models/Usuario');

test('agendamentos: formulários, acesso, validação e erros de conflito', async (t) => {
  const models = [Agendamento, Servico, FormaPagamento];
  const originals = models.map((model) => ({ ...model }));
  const originalBuscar = Usuario.buscarPorId;
  const originalMaster = process.env.ADMIN_NAME;
  process.env.ADMIN_NAME = 'Master de teste';
  const users = {
    admin: { id: 1, nome: 'Admin', papel: 'admin', funcionario_id: 10 },
    master: { id: 2, nome: 'Master de teste', papel: 'master', funcionario_id: 20 },
    profissional: { id: 3, nome: 'Ana', papel: 'profissional', funcionario_id: 30 },
    semVinculo: { id: 4, nome: 'Sem vínculo', papel: 'profissional' }
  };
  const services = [
    { id: 1, nome: 'Corte', funcionario_id: 30, funcionario_nome: 'Ana', valor: '100.00', percentual_comissao: '20.00', duracao: 60 },
    { id: 2, nome: 'Escova', funcionario_id: 40, funcionario_nome: 'Bia', valor: '80.00', percentual_comissao: '25.00', duracao: 30 }
  ];
  let rows = services.map((service) => ({
    id: service.id, cliente_id: 1, cliente_nome: 'Cliente <teste>', servico_id: service.id, servico_nome: service.nome,
    funcionario_id: service.funcionario_id, funcionario_nome: service.funcionario_nome, forma_pag_id: 1,
    pagamento_nome: 'Pix', situacao: 'agendado', data_hora: '2026-11-03T10:00', fim: '2026-11-03T11:00',
    duracao: service.duracao, valor_total: service.valor, percentual_comissao: service.percentual_comissao
  }));
  let failure = null;
  let writes = 0;
  let lastData;
  const admin = (user) => ['admin', 'master'].includes(user.papel);
  Usuario.buscarPorId = async (id) => Object.values(users).find((user) => user.id === id);
  Agendamento.listar = async (user) => admin(user) ? rows : rows.filter((row) => row.funcionario_id === user.funcionarioId);
  Agendamento.listarClientes = async () => [{ id: 1, nome: 'Cliente <teste>' }];
  FormaPagamento.listar = async () => [{ id: 1, nome: 'Pix' }];
  Servico.listar = async (user) => admin(user) ? services : services.filter((service) => service.funcionario_id === user.funcionarioId);
  Agendamento.criar = async (data, token, user) => {
    if (failure) throw failure;
    const service = services.find((service) => service.id === data.servico_id && (admin(user) || service.funcionario_id === user.funcionarioId));
    if (!service) return null;
    writes++;
    lastData = { data, token, user };
    return { id: 3 };
  };
  Agendamento.atualizar = async (id, data, user) => {
    if (failure) throw failure;
    const row = rows.find((row) => row.id === id && (admin(user) || row.funcionario_id === user.funcionarioId));
    if (!row) return null;
    writes++;
    Object.assign(row, data);
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
  app.use('/agendamentos', require('../routes/agendamentoRoutes'));
  app.use((error, req, res, next) => res.status(500).send('Erro interno'));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    models.forEach((model, i) => Object.assign(model, originals[i]));
    Usuario.buscarPorId = originalBuscar;
    if (originalMaster === undefined) delete process.env.ADMIN_NAME;
    else process.env.ADMIN_NAME = originalMaster;
  });
  const request = (role, suffix = '', body, method) => fetch(`http://127.0.0.1:${server.address().port}/agendamentos${suffix}`, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { 'x-test-role': role || '', 'content-type': 'application/x-www-form-urlencoded' },
    body: body === undefined ? undefined : new URLSearchParams(body), redirect: 'manual'
  });
  const data = { cliente_id: '1', servico_id: '1', forma_pag_id: '1', data_hora: '2026-11-03T10:00', situacao: 'agendado', cadastro_token: randomUUID() };

  await t.test('visitantes não acessam consultas, cadastro, edição nem tentativa de exclusão', async () => {
    for (const [suffix, body] of [['', undefined], ['', data], ['/1', data], ['/1/excluir', {}]]) {
      const res = await request(null, suffix, body);
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/login');
    }
    assert.equal(writes, 0);
  });
  await t.test('admin e master veem todos os agendamentos e opções do banco; nomes são escapados', async () => {
    for (const role of ['admin', 'master']) {
      const res = await request(role);
      assert.equal(res.status, 200);
      const html = await res.text();
      for (const text of ['Ana', 'Bia', 'Pix', 'Concluído', 'Cancelado', 'Pago', 'Agendado', '03/11/2026 às 10:00']) assert.ok(html.includes(text), text);
      for (const field of Object.keys(data)) assert.ok(html.includes(`name="${field}"`), field);
      assert.ok(html.includes('Cliente &lt;teste&gt;'));
      assert.ok(!html.includes('Cliente <teste>'));
      assert.ok(!html.includes('Excluir agendamento'));
    }
  });
  await t.test('profissional vê e altera apenas sua agenda e só seleciona seus serviços', async () => {
    const html = await (await request('profissional')).text();
    assert.match(html, /Ana/);
    assert.ok(!html.includes('Bia'));
    assert.equal((await request('profissional', '/2', data)).status, 404);
    assert.equal((await request('profissional', '', { ...data, servico_id: '2' })).status, 400);
    assert.equal((await request('profissional', '/1', data)).status, 302);
    assert.equal((await request('semVinculo', '', data)).status, 403);
    assert.ok(!(await (await request('semVinculo')).text()).includes('Adicionar agendamento'));
  });
  await t.test('cadastro normaliza IDs e preserva a hora local do salão', async () => {
    for (const role of ['admin', 'master', 'profissional']) {
      const res = await request(role, '', data);
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/agendamentos?status=criado');
      assert.deepEqual(lastData.data, { cliente_id: 1, servico_id: 1, forma_pag_id: 1, situacao: 'agendado', data_hora: '2026-11-03T10:00' });
      assert.equal(lastData.token, data.cadastro_token);
    }
  });
  await t.test('valida campos obrigatórios, datas, horas e situação antes de gravar', async () => {
    const before = writes;
    const invalid = {
      cliente_id: ['', '-1', '2147483648'], servico_id: ['', 'abc'], forma_pag_id: ['', '0'],
      situacao: ['', 'excluido', 'PAGO', 'toString'],
      data_hora: ['', '2026-02-29T10:00', '2026-04-31T10:00', '2026-11-03T24:00', '2026-11-03T10:60', '2026-11-03T10:00Z', '0000-01-01T10:00']
    };
    for (const [field, values] of Object.entries(invalid)) {
      for (const value of values) {
        for (const suffix of ['', '/1']) assert.equal((await request('admin', suffix, { ...data, [field]: value })).status, 400, `${field}: ${value}`);
      }
    }
    assert.equal((await request('admin', '', { ...data, cadastro_token: '' })).status, 400);
    assert.equal(writes, before);
  });
  await t.test('conflito retorna 409 e mantém a edição e o horário digitado', async () => {
    failure = { code: '23P01' };
    try {
      for (const suffix of ['', '/1']) {
        const res = await request('admin', suffix, { ...data, data_hora: '2026-11-03T10:30' });
        assert.equal(res.status, 409);
        const html = await res.text();
        assert.match(html, /Conflito de horário/);
        assert.match(html, /value="2026-11-03T10:30"/);
        if (suffix) assert.match(html, /class="team-edit" open/);
      }
    } finally { failure = null; }
  });
  await t.test('cadastros removidos e duração inválida retornam mensagens úteis', async () => {
    try {
      failure = { code: '23503' };
      const res = await request('admin', '', data);
      assert.equal(res.status, 409);
      assert.match(await res.text(), /não está mais disponível/);
      failure = { code: '23514' };
      const duration = await request('admin', '', data);
      assert.equal(duration.status, 400);
      assert.match(await duration.text(), /duração positiva/);
    } finally { failure = null; }
  });
  await t.test('permite todas as quatro situações e edição não exige novo token', async () => {
    for (const situacao of ['agendado', 'pago', 'concluido', 'cancelado']) {
      const res = await request('master', '/1', { ...data, situacao, cadastro_token: '' });
      assert.equal(res.status, 302);
      assert.equal(rows[0].situacao, situacao);
    }
  });
  await t.test('IDs inválidos e registros ausentes retornam 404', async () => {
    for (const id of ['abc', '0', '-1', '2147483648', '999']) assert.equal((await request('admin', `/${id}`, data)).status, 404);
  });
  await t.test('exclusão é recusada por POST e DELETE sem alterar nenhum registro', async () => {
    const before = writes;
    for (const [suffix, method] of [['/1/excluir', 'POST'], ['/1', 'DELETE'], ['', 'DELETE']]) {
      const res = await request('admin', suffix, {}, method);
      assert.equal(res.status, 405);
      assert.match(await res.text(), /Agendamentos são irremovíveis/);
    }
    assert.equal(writes, before);
  });
  await t.test('falhas inesperadas seguem ao tratamento central', async () => {
    failure = new Error('Banco indisponível');
    try { assert.equal((await request('admin', '', data)).status, 500); }
    finally { failure = null; }
  });
});
