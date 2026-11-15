const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('node:path');
const Financa = require('../models/Financa');
const DespesasFixas = require('../services/despesasFixas');
const Usuario = require('../models/Usuario');
const { periodoPadrao } = require('../controllers/financaController');

test('período padrão usa a data do salão mesmo quando UTC já virou o mês', () => {
  assert.deepEqual(periodoPadrao(new Date('2026-12-01T02:59:59Z')), { dataInicio: '2026-11-01', dataFim: '2026-11-30' });
  assert.deepEqual(periodoPadrao(new Date('2026-12-01T03:00:00Z')), { dataInicio: '2026-12-01', dataFim: '2026-12-01' });
});

test('finanças: acesso, filtros, apresentação e falhas', async (t) => {
  const users = {
    admin: { id: 1, nome: 'Admin', papel: 'admin' },
    master: { id: 2, nome: 'Master de teste', papel: 'master' },
    profissional: { id: 3, nome: 'Ana', papel: 'profissional' }
  };
  t.mock.method(Usuario, 'buscarPorId', async (id) => Object.values(users).find((user) => user.id === id));
  const originalMaster = process.env.ADMIN_NAME;
  process.env.ADMIN_NAME = users.master.nome;
  let filters;
  let calls = [];
  let failure;
  let report = {
    resumo: { entradas: '80.00', despesas: '564.00', liquido: '-484.00', atendimentos: 1 },
    servicos: [{ id: 1, nome: 'Corte <teste>', total: '80.00', quantidade: 1 }],
    despesas: [{ id: 1, nome: 'Energia & água', valor: '564.00', data: '2026-06-23', tipo: 'fixo', recorrencia_id: 1 }],
    pagamentos: [{ id: 1, nome: 'Cartão de débito', total: '80.00', quantidade: 1 }]
  };
  t.mock.method(DespesasFixas, 'gerarPendentes', async () => { calls.push('recorrencia'); if (failure) throw failure; });
  t.mock.method(Financa, 'relatorio', async (period) => {
    calls.push('relatorio'); filters = period;
    if (failure) throw failure;
    return report;
  });
  const app = express();
  app.set('views', path.join(__dirname, '../views'));
  app.set('view engine', 'ejs');
  app.use((req, res, next) => { req.session = { user: users[req.get('x-test-role')] }; next(); });
  app.use('/financas', require('../routes/financaRoutes'));
  app.use((error, req, res, next) => res.status(500).send('Erro interno'));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (originalMaster === undefined) delete process.env.ADMIN_NAME;
    else process.env.ADMIN_NAME = originalMaster;
  });
  const request = (role, query = '') => fetch(`http://127.0.0.1:${server.address().port}/financas${query}`, {
    headers: { 'x-test-role': role || '' }, redirect: 'manual'
  });
  await t.test('apenas admin e master podem acessar os dados', async () => {
    const guest = await request(null);
    assert.equal(guest.status, 302);
    assert.equal(guest.headers.get('location'), '/login');
    assert.equal((await request('profissional')).status, 403);
    assert.deepEqual(calls, []);
  });
  await t.test('atualiza recorrências antes do relatório e apresenta dados escapados e saldo negativo', async () => {
    for (const role of ['admin', 'master']) {
      calls = [];
      const res = await request(role, '?dataInicio=2026-06-01&dataFim=2026-06-23');
      assert.equal(res.status, 200);
      assert.deepEqual(calls, ['recorrencia', 'relatorio']);
      assert.deepEqual(filters, { dataInicio: '2026-06-01', dataFim: '2026-06-23' });
      const html = await res.text();
      for (const value of ['80,00', '564,00', '484,00', 'Caixa líquido', 'negative', 'Cartão de débito', 'Corte &lt;teste&gt;', 'Energia &amp; água', 'Fixa automática', '23/06/2026']) assert.ok(html.includes(value), value);
      assert.ok(!html.includes('Corte <teste>'));
    }
  });
  await t.test('datas inválidas, vazias, duplicadas ou invertidas não consultam o banco', async () => {
    for (const query of [
      '?dataInicio=', '?dataFim=', '?dataInicio=2026-02-29', '?dataFim=2026-04-31',
      '?dataInicio=0000-01-01', '?dataInicio=2026-06-24&dataFim=2026-06-23',
      '?dataInicio=2026-06-01&dataInicio=2026-06-02', '?dataFim[x]=2026-06-23',
      '?dataInicio=%3Cscript%3Ealert(1)%3C%2Fscript%3E'
    ]) {
      calls = [];
      const res = await request('admin', query);
      assert.equal(res.status, 400, query);
      assert.deepEqual(calls, []);
      const html = await res.text();
      assert.match(html, /id="feedbackDialog" role="alertdialog"/);
      assert.ok(!html.includes('<script>alert(1)</script>'));
      assert.ok(!html.includes('aria-label="Resumo financeiro"'));
    }
  });
  await t.test('mostra cada vencimento da mesma despesa com data e identifica previsões incluídas no saldo', async () => {
    report = {
      resumo: { entradas: '0', despesas: '400.00', liquido: '-400.00', atendimentos: 0 },
      servicos: [], pagamentos: [], despesas: [
        { id: null, nome: 'Conta de água', valor: '200.00', tipo: 'fixo', data: '2038-12-05', recorrencia_id: 1, prevista: true },
        { id: 1, nome: 'Conta de água', valor: '200.00', tipo: 'fixo', data: '2038-11-05', recorrencia_id: 1, prevista: false }
      ]
    };
    const res = await request('admin', '?dataInicio=2038-11-01&dataFim=2038-12-31');
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.equal((html.match(/Conta de água/g) || []).length, 2);
    assert.equal((html.match(/200,00/g) || []).length, 2);
    for (const value of ['05/11/2038', '05/12/2038', '400,00', 'Despesas do período', 'Fixa prevista', 'Fixa automática', 'incluídas no total de despesas e no caixa líquido']) {
      assert.ok(html.includes(value), value);
    }
  });
  await t.test('abre o mês atual por padrão e mostra estados vazios sem erro', async () => {
    report = { resumo: { entradas: '0', despesas: '0', liquido: '0', atendimentos: 0 }, servicos: [], despesas: [], pagamentos: [] };
    const res = await request('admin');
    assert.equal(res.status, 200);
    assert.deepEqual(filters, periodoPadrao());
    const html = await res.text();
    for (const value of ['Nenhuma entrada no período.', 'Nenhuma despesa no período.', 'Nenhuma venda paga no período.', '0,00']) assert.ok(html.includes(value), value);
  });
  await t.test('saldo positivo recebe destaque e erros do banco seguem ao tratamento central', async () => {
    report.resumo.liquido = '10.00';
    assert.match(await (await request('admin')).text(), /class="positive"/);
    failure = new Error('Banco indisponível');
    assert.equal((await request('admin')).status, 500);
  });
});

test('rotina executa ao iniciar, evita sobreposição e se recupera de falhas', async (t) => {
  let tick;
  let stopped = false;
  let finish;
  let runs = 0;
  const errors = [];
  t.mock.method(global, 'setInterval', (fn, intervalo) => {
    assert.equal(intervalo, 60000);
    tick = fn;
    return { unref() {} };
  });
  t.mock.method(global, 'clearInterval', () => { stopped = true; });
  t.mock.method(DespesasFixas, 'gerarPendentes', () => {
    runs++;
    return new Promise((resolve, reject) => { finish = { resolve, reject }; });
  });
  const stop = DespesasFixas.iniciarRotina({ onError: (error) => errors.push(error.message) });
  assert.equal(runs, 1);
  await tick();
  assert.equal(runs, 1);
  finish.reject(new Error('Falha temporária'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(errors, ['Falha temporária']);
  const next = tick();
  assert.equal(runs, 2);
  finish.resolve(1);
  await next;
  stop();
  assert.ok(stopped);
});
