function requireAuth(req, res, next) {
  if (req.session.user) return next();

  req.session.returnTo = req.originalUrl;
  return res.redirect('/login');
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
  return user?.papel === 'admin';
}

function isProfissional(user) {
  return user?.papel === 'profissional';
}

module.exports = { requireAuth, requireGuest, requireRole, isAdmin, isProfissional };
