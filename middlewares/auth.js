const Usuario = require('../models/Usuario');

function getAccountRole(account) {
  const masterName = String(process.env.ADMIN_NAME || '').trim().toLocaleLowerCase('pt-BR');
  const accountName = String(account?.nome || '').trim().toLocaleLowerCase('pt-BR');
  if (masterName && accountName === masterName) return 'master';
  const storedRole = account?.papel || (account?.tipo === 'A' ? 'admin' : 'profissional');
  return storedRole === 'master' ? 'admin' : storedRole;
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }

  Usuario.buscarPorId(req.session.user.id)
    .then((usuario) => {
      if (!usuario) {
        return req.session.destroy(() => {
          res.clearCookie('connect.sid');
          res.redirect('/login');
        });
      }
      req.session.user = {
        ...req.session.user,
        id: usuario.id,
        nome: usuario.nome,
        papel: getAccountRole(usuario),
        funcionarioId: usuario.funcionario_id
      };
      res.locals.user = req.session.user;
      return next();
    })
    .catch(next);
}

function requireGuest(req, res, next) {
  if (req.session.user) return res.redirect('/dashboard');
  return next();
}

function requireRole(...papeis) {
  return (req, res, next) => {
    if (!req.session.user || !papeis.includes(req.session.user.papel)) {
      return res.status(403).render('pages/403', { title: 'Acesso negado' });
    }
    return next();
  };
}

function isAdmin(user) {
  return user?.papel === 'master' || user?.papel === 'admin';
}

function isMaster(user) {
  return user?.papel === 'master';
}

function isProfissional(user) {
  return user?.papel === 'profissional';
}

module.exports = { requireAuth, requireGuest, requireRole, isAdmin, isMaster, isProfissional, getAccountRole };
