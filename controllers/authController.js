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
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard';
  }

  // Navegadores tratam barras invertidas como barras e ignoram alguns controles na URL.
  if (/[\\\u0000-\u001f\u007f]/.test(value)) {
    return '/dashboard';
  }

  return value;
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

async function verificarCredenciais(usuario, senha) {
  if (!usuario) {
    return false;
  }

  const masterDoAmbiente = getAccountRole(usuario) === 'master';
  const senhaDoAmbiente = senha === String(process.env.ADMIN_PASSWORD || '');
  if (masterDoAmbiente && senhaDoAmbiente) {
    return true;
  }

  return Usuario.verificarSenha(senha, usuario.senha);
}

function regenerarSessao(session) {
  return new Promise((resolve, reject) => {
    session.regenerate((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function login(req, res, next) {
  const loginValue = String(req.body.login || '').trim();
  const senha = String(req.body.senha || '');

  if (!loginValue || !senha) {
    return renderLogin(req, res, 'Usuário ou senha inválidos', loginValue);
  }

  try {
    const usuario = await Usuario.buscarPorLogin(loginValue);
    const senhaValida = await verificarCredenciais(usuario, senha);

    if (!usuario || !senhaValida) {
      return renderLogin(req, res, 'Usuário ou senha inválidos', loginValue);
    }

    const returnTo = getSafeReturnTo(req.session.returnTo);
    await regenerarSessao(req.session);
    req.session.user = getSessionUser(usuario);
    return req.session.save((error) => {
      if (error) {
        return next(error);
      }
      return res.redirect(returnTo);
    });
  } catch (error) {
    return next(error);
  }
}

function logout(req, res, next) {
  req.session.destroy((error) => {
    if (error) {
      return next(error);
    }
    res.clearCookie('connect.sid');
    return res.redirect('/login');
  });
}

module.exports = { loginForm, login, logout };
