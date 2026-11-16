const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const Usuario = require('../models/Usuario');
const controller = require('../controllers/authController');
const { requireAuth, requireRole, getAccountRole } = require('../middlewares/auth');

test('autenticação: credenciais, sessões, retorno e permissões', async (t) => {
  const originalEnvironment = { ADMIN_NAME: process.env.ADMIN_NAME, ADMIN_PASSWORD: process.env.ADMIN_PASSWORD };
  process.env.ADMIN_NAME = 'Master de teste';
  process.env.ADMIN_PASSWORD = 'senha-do-ambiente';
  const initialUsers = [
    { id: 1, nome: 'ana', senha: 'hash-profissional', papel: 'profissional', funcionario_id: 11 },
    { id: 2, nome: 'admin', senha: 'hash-admin', papel: 'admin', funcionario_id: 12 },
    { id: 3, nome: 'Master de teste', senha: 'hash-master', papel: 'master', funcionario_id: 13 },
    { id: 4, nome: 'master-antigo', senha: 'hash-antigo', papel: 'master', funcionario_id: 14 }
  ];
  let users;
  let failure;
  let passwordChecks;
  t.beforeEach(() => {
    users = initialUsers.map((user) => ({ ...user }));
    failure = null;
    passwordChecks = [];
  });
  t.mock.method(Usuario, 'buscarPorLogin', async (nome) => {
    if (failure === 'login') throw new Error('Falha na consulta');
    return users.find((user) => user.nome === nome) || null;
  });
  t.mock.method(Usuario, 'buscarPorId', async (id) => {
    if (failure === 'refresh') throw new Error('Falha na atualização');
    return users.find((user) => user.id === id) || null;
  });
  t.mock.method(Usuario, 'verificarSenha', async (senha, hash) => {
    passwordChecks.push([senha, hash]);
    if (failure === 'password') throw new Error('Falha na verificação');
    return senha === ' senha válida ';
  });

  const store = new session.MemoryStore();
  const app = express();
  app.set('views', path.join(__dirname, '../views'));
  app.set('view engine', 'ejs');
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: 'segredo-apenas-de-teste', resave: false, saveUninitialized: false, store }));
  app.use(require('../routes/authRoutes'));
  app.get('/protegido', requireAuth, (req, res) => res.json({ user: req.session.user, local: res.locals.user }));
  app.get('/admin', requireAuth, requireRole('admin', 'master'), (req, res) => res.send('permitido'));
  // Exercita o retorno pela sessão real, sem aceitar esse parâmetro na aplicação.
  app.get('/definir-retorno', (req, res) => { req.session.returnTo = req.query.value; res.send('ok'); });
  app.use((error, req, res, next) => res.status(500).send('Erro interno'));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    store.clear();
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function client() {
    return {
      cookie: '',
      async request(url, body) {
        const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
          method: body === undefined ? 'GET' : 'POST',
          headers: { cookie: this.cookie },
          body: body === undefined ? undefined : new URLSearchParams(body),
          redirect: 'manual'
        });
        const cookie = response.headers.get('set-cookie');
        if (cookie) this.cookie = cookie.split(';')[0];
        return response;
      },
      login(nome = 'ana', senha = ' senha válida ') { return this.request('/login', { login: nome, senha }); }
    };
  }

  await t.test('formulário e credenciais inválidas mantêm a mensagem e escapam o usuário', async () => {
    const browser = client();
    assert.equal((await browser.request('/login')).status, 200);
    for (const [login, senha] of [['', 'senha'], ['ana', ''], ['<script>teste</script>', 'errada'], ['ana', 'errada']]) {
      const response = await browser.login(login, senha);
      assert.equal(response.status, 422);
      const html = await response.text();
      assert.match(html, /Usuário ou senha inválidos/);
      assert.ok(!html.includes('<script>teste</script>'));
    }
    assert.equal((await browser.request('/protegido')).status, 302);
  });

  await t.test('login regenera a sessão, preserva a senha e retorna à URL originalmente pedida', async () => {
    const browser = client();
    assert.equal((await browser.request('/protegido?origem=agenda')).headers.get('location'), '/login');
    const previousCookie = browser.cookie;
    const response = await browser.login('  ana  ');
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/protegido?origem=agenda');
    assert.notEqual(browser.cookie, previousCookie);
    assert.deepEqual(passwordChecks, [[' senha válida ', 'hash-profissional']]);
    const data = await (await browser.request('/protegido')).json();
    assert.deepEqual(data.user, { id: 1, nome: 'ana', email: null, funcionarioId: 11, papel: 'profissional' });
    assert.deepEqual(data.local, data.user);
    const oldSession = client();
    oldSession.cookie = previousCookie;
    assert.equal((await oldSession.request('/protegido')).status, 302);
  });

  await t.test('master aceita a senha do ambiente e a do hash; outros perfis não ganham esse acesso', async () => {
    const master = client();
    assert.equal((await master.login('Master de teste', 'senha-do-ambiente')).status, 302);
    assert.deepEqual(passwordChecks, []);
    assert.equal((await (await master.request('/protegido')).json()).user.papel, 'master');
    assert.equal((await client().login('Master de teste')).status, 302);
    assert.equal(passwordChecks.length, 1);
    assert.equal((await client().login('ana', 'senha-do-ambiente')).status, 422);
    const formerMaster = client();
    await formerMaster.login('master-antigo');
    assert.equal((await (await formerMaster.request('/protegido')).json()).user.papel, 'admin');
  });

  await t.test('retornos externos e ambiguidades de barras e controles voltam ao dashboard', async () => {
    for (const value of [
      'https://example.invalid', '//example.invalid', '/\\example.invalid', '/\\\\example.invalid',
      '/\t/example.invalid', '/\r/example.invalid', '/\n/example.invalid', '/\u0000/example.invalid', ''
    ]) {
      const browser = client();
      await browser.request(`/definir-retorno?${new URLSearchParams({ value })}`);
      const response = await browser.login();
      assert.equal(response.headers.get('location'), '/dashboard', JSON.stringify(value));
    }
    for (const value of ['/clientes?nome=A%20B', '/agendamentos', '/minha-conta', '/']) {
      const browser = client();
      await browser.request(`/definir-retorno?${new URLSearchParams({ value })}`);
      assert.equal((await browser.login()).headers.get('location'), value);
    }
  });

  await t.test('sessão atualiza o perfil e destrói o acesso quando a conta deixa de existir', async () => {
    const browser = client();
    await browser.login('admin');
    assert.equal((await browser.request('/admin')).status, 200);
    users[1].papel = 'profissional';
    users[1].nome = 'novo-login';
    assert.equal((await browser.request('/admin')).status, 403);
    assert.equal((await (await browser.request('/protegido')).json()).user.nome, 'novo-login');
    users = users.filter((user) => user.id !== 2);
    assert.equal((await browser.request('/protegido')).headers.get('location'), '/login');
    assert.equal(browser.cookie, 'connect.sid=');
  });

  await t.test('usuário autenticado não reabre login e logout encerra a sessão', async () => {
    const browser = client();
    await browser.login();
    assert.equal((await browser.request('/login')).headers.get('location'), '/dashboard');
    assert.equal((await browser.login()).headers.get('location'), '/dashboard');
    assert.equal((await browser.request('/logout', {})).headers.get('location'), '/login');
    assert.equal(browser.cookie, 'connect.sid=');
    assert.equal((await browser.request('/protegido')).status, 302);
  });

  await t.test('falhas de consulta, senha e atualização seguem ao tratamento central', async () => {
    for (const mode of ['login', 'password']) {
      failure = mode;
      assert.equal((await client().login()).status, 500);
    }
    failure = null;
    const browser = client();
    await browser.login();
    failure = 'refresh';
    assert.equal((await browser.request('/protegido')).status, 500);
  });
});

test('falhas ao regenerar, salvar ou destruir sessão não redirecionam como sucesso', async (t) => {
  t.mock.method(Usuario, 'buscarPorLogin', async () => ({ id: 1, nome: 'ana', senha: 'hash', papel: 'profissional' }));
  t.mock.method(Usuario, 'verificarSenha', async () => true);
  for (const failingOperation of ['regenerate', 'save', 'destroy']) {
    const error = new Error(`Falha em ${failingOperation}`);
    const calls = [];
    const req = { body: { login: 'ana', senha: 'senha' }, session: {} };
    for (const operation of ['regenerate', 'save', 'destroy']) {
      req.session[operation] = (callback) => { calls.push(operation); callback(operation === failingOperation ? error : null); };
    }
    const res = { redirect: () => assert.fail('Não deve redirecionar'), clearCookie: () => assert.fail('Não deve limpar cookie') };
    const next = (received) => { assert.equal(received, error); calls.push('next'); };
    if (failingOperation === 'destroy') controller.logout(req, res, next);
    else await controller.login(req, res, next);
    assert.deepEqual(calls, failingOperation === 'save' ? ['regenerate', 'save', 'next'] : [failingOperation, 'next']);
  }
});

test('papéis legados e identificação master mantêm as regras existentes', (t) => {
  const previous = process.env.ADMIN_NAME;
  t.after(() => {
    if (previous === undefined) delete process.env.ADMIN_NAME;
    else process.env.ADMIN_NAME = previous;
  });
  process.env.ADMIN_NAME = '  Máster  ';
  assert.equal(getAccountRole({ nome: 'MÁSTER', tipo: 'F' }), 'master');
  assert.equal(getAccountRole({ nome: 'outra conta', papel: 'master' }), 'admin');
  assert.equal(getAccountRole({ tipo: 'A' }), 'admin');
  assert.equal(getAccountRole({ tipo: 'F' }), 'profissional');
  assert.equal(getAccountRole(null), 'profissional');
});
