const { isAdmin } = require('../middlewares/auth');

function dashboard(req, res) {
  const user = req.session.user;
  const admin = isAdmin(user);
  const cards = [
    ...(admin ? [{ href: '/clientes', label: 'Clientes', description: 'Cadastro e consulta de clientes.' }] : []),
    { href: '/agendamentos', label: 'Agendamentos', description: 'Acesso à agenda do salão.' },
    { href: '/servicos', label: 'Serviços', description: 'Catálogo de serviços.' },
    ...(admin ? [{ href: '/equipe', label: 'Equipe', description: 'Gerenciamento dos funcionários.' }] : []),
    { href: '/produtos', label: 'Produtos', description: 'Catálogo e estoque.' },
    ...(admin ? [{ href: '/despesas', label: 'Despesas', description: 'Registro de despesas do salão.' }] : []),
    { href: '/pagamentos', label: 'Formas de pagamento', description: admin ? 'Gerenciamento de pagamentos.' : 'Consulta somente leitura.' },
    ...(admin ? [{ href: '/financas', label: 'Finanças', description: 'Visão financeira do salão.' }] : [])
  ];

  return res.render('pages/dashboard', { title: 'Dashboard', user, admin, cards });
}

module.exports = { dashboard };
