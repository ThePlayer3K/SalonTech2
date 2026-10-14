const Usuario = require('../models/Usuario');
const { getAccountRole } = require('../middlewares/auth');

function renderLogin(req, res, error = null, login = '') {
  return res.status(error ? 422 : 200).render('pages/login', {
    title: 'Entrar',
    error,
    login
  });
}

function getSafeReturnTo(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/dashboard';
}

function getSessionUser(usuario) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: null,
    funcionarioId: usuario.funcionario_id,
    papel: getAccountRole(usuario)
  };
}

async function loginForm(req, res) {
  return renderLogin(req, res);
}

async function login(req, res, next) {
  const loginValue = String(req.body.login || '').trim();
  const senha = String(req.body.senha || '');

  if (!loginValue || !senha) {
    return renderLogin(req, res, 'Usuário ou senha inválidos', loginValue);
  }

  try {
    const usuario = await Usuario.buscarPorLogin(loginValue);
    const isEnvMaster = usuario && getAccountRole(usuario) === 'master' &&
      senha === String(process.env.ADMIN_PASSWORD || '');
    const senhaValida = usuario
      ? isEnvMaster || await Usuario.verificarSenha(senha, usuario.senha)
      : false;

    if (!usuario || !senhaValida) {
      return renderLogin(req, res, 'Usuário ou senha inválidos', loginValue);
    }

    const returnTo = getSafeReturnTo(req.session.returnTo);
    await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
    req.session.user = getSessionUser(usuario);
    return req.session.save((error) => error ? next(error) : res.redirect(returnTo));
  } catch (error) {
    return next(error);
  }
}

function logout(req, res, next) {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('connect.sid');
    return res.redirect('/login');
  });
}

module.exports = { loginForm, login, logout };
