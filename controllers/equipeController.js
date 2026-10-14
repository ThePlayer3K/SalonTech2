const Equipe = require('../models/Equipe');
const { isAdmin, isMaster } = require('../middlewares/auth');

function renderPage(res, req, people, options = {}) {
  return res.render('pages/equipe', {
    title: options.selfOnly ? 'Minha conta' : 'Equipe e usuários',
    user: req.session.user,
    people,
    selfOnly: Boolean(options.selfOnly),
    error: options.error || req.query.erro || null,
    success: options.success || (req.query.salvo ? 'Alterações salvas.' : null)
  });
}

async function index(req, res, next) {
  try { return renderPage(res, req, await Equipe.listar()); }
  catch (error) { return next(error); }
}

async function profile(req, res, next) {
  try {
    if (isMaster(req.session.user)) return res.status(403).render('pages/403', { title: 'Acesso negado' });
    const person = await Equipe.buscarPorUsuario(req.session.user.id);
    if (!person) return res.status(404).render('pages/404', { title: 'Conta não encontrada' });
    return renderPage(res, req, [person], { selfOnly: true });
  } catch (error) { return next(error); }
}

function parseForm(body, existing = null) {
  const login = String(body.login || '').trim();
  const nome = String(body.nome || '').trim();
  const papel = String(body.papel || existing?.papel || 'profissional');
  const senha = String(body.senha || '');
  if (!nome || !login) throw new Error('Nome do funcionário e usuário são obrigatórios.');
  if (!['admin', 'profissional'].includes(papel)) throw new Error('Perfil de acesso inválido.');
  if (!existing && senha.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  if (senha && senha.length < 8) throw new Error('A nova senha precisa ter pelo menos 8 caracteres.');
  const salaryInput = String(body.salario || '').trim();
  const normalizedSalary = salaryInput.includes(',')
    ? salaryInput.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
    : salaryInput.replace(/[^\d.-]/g, '');
  const salario = salaryInput ? Number(normalizedSalary) : null;
  if (salario !== null && (!Number.isFinite(salario) || salario < 0)) throw new Error('Informe um salário válido.');
  return {
    nome, login, senha, papel,
    cpf: String(body.cpf || '').trim(),
    telefone: String(body.telefone || '').trim(),
    cargo: String(body.cargo || '').trim(),
    tipoPagamento: String(body.tipoPagamento || '').trim(),
    salario
  };
}

function canManageTarget(actor, target) {
  const masterLogin = String(process.env.ADMIN_NAME || '').trim().toLocaleLowerCase('pt-BR');
  const targetLogin = String(target?.login || '').trim().toLocaleLowerCase('pt-BR');
  if (!target || target.papel === 'master' || (masterLogin && targetLogin === masterLogin)) return false;
  if (isMaster(actor)) return true;
  if (actor.papel === 'admin') return target.papel !== 'admin' || Number(target.usuario_id) === Number(actor.id);
  return false;
}

async function create(req, res, next) {
  try {
    if (!isAdmin(req.session.user)) return res.status(403).render('pages/403', { title: 'Acesso negado' });
    const data = parseForm(req.body);
    await Equipe.salvar(data);
    return res.redirect('/equipe?salvo=1');
  } catch (error) {
    if (!error.code) return renderPage(res, req, await Equipe.listar(), { error: error.message });
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    const targetId = Number(req.params.usuarioId || req.session.user.id);
    const target = await Equipe.buscarPorUsuario(targetId);
    const selfRequest = req.path === '/minha-conta';
    if (!target || (selfRequest && targetId !== Number(req.session.user.id)) ||
        (!selfRequest && !canManageTarget(req.session.user, target)) ||
        (selfRequest && isMaster(req.session.user))) {
      return res.status(403).render('pages/403', { title: 'Acesso negado' });
    }

    const data = parseForm(req.body, target);
    if (selfRequest) {
      Object.assign(data, {
        nome: target.nome, cpf: target.cpf || '', telefone: target.telefone || '',
        cargo: target.cargo || '', tipoPagamento: target.tipo_pagamento || '', salario: target.salario
      });
    }
    if (target.papel === 'master' || (req.session.user.papel === 'profissional' && data.papel !== target.papel)) {
      return res.status(403).render('pages/403', { title: 'Acesso negado' });
    }
    await Equipe.salvar({ ...data, usuarioId: target.usuario_id, funcionarioId: target.funcionario_id });
    if (selfRequest || Number(req.session.user.id) === Number(target.usuario_id)) {
      req.session.user.nome = data.login;
      req.session.user.papel = data.papel;
      await new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
    }
    return res.redirect(`${selfRequest ? '/minha-conta' : '/equipe'}?salvo=1`);
  } catch (error) {
    if (!error.code) {
      const selfOnly = req.path === '/minha-conta';
      const people = selfOnly
        ? [await Equipe.buscarPorUsuario(req.session.user.id)].filter(Boolean)
        : await Equipe.listar();
      return renderPage(res, req, people, { selfOnly, error: error.message });
    }
    return next(error);
  }
}

async function remove(req, res, next) {
  try {
    if (!isAdmin(req.session.user)) return res.status(403).render('pages/403', { title: 'Acesso negado' });
    const target = await Equipe.buscarPorUsuario(Number(req.params.usuarioId));
    if (!canManageTarget(req.session.user, target)) return res.status(403).render('pages/403', { title: 'Acesso negado' });
    await Equipe.excluir(target.usuario_id, target.funcionario_id);
    return res.redirect('/equipe?salvo=1');
  } catch (error) {
    if (!error.code) return renderPage(res, req, await Equipe.listar(), { error: error.message });
    return next(error);
  }
}

module.exports = { index, profile, create, update, remove };
