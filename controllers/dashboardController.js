const { isAdmin } = require('../middlewares/auth');

function dashboard(req, res) {
  const user = req.session.user;
  const admin = isAdmin(user);
  const availableCards = [
    {
      href: '/clientes',
      label: 'Clientes',
      description: 'Cadastro e consulta de clientes.',
      adminOnly: true
    },
    {
      href: '/agendamentos',
      label: 'Agendamentos',
      description: 'Acesso à agenda do salão.'
    },
    {
      href: '/servicos',
      label: 'Serviços',
      description: 'Catálogo de serviços.'
    },
    {
      href: '/equipe',
      label: 'Equipe',
      description: 'Gerenciamento dos funcionários.',
      adminOnly: true
    },
    {
      href: '/produtos',
      label: 'Produtos',
      description: 'Catálogo e estoque.'
    },
    {
      href: '/despesas',
      label: 'Despesas',
      description: 'Registro de despesas do salão.',
      adminOnly: true
    },
    {
      href: '/pagamentos',
      label: 'Formas de pagamento',
      description: admin ? 'Gerenciamento de pagamentos.' : 'Consulta somente leitura.'
    },
    {
      href: '/financas',
      label: 'Finanças',
      description: 'Visão financeira do salão.',
      adminOnly: true
    }
  ];
  const cards = availableCards
    .filter((card) => admin || !card.adminOnly)
    .map(({ adminOnly, ...card }) => card);

  return res.render('pages/dashboard', { title: 'Dashboard', user, admin, cards });
}

module.exports = { dashboard };
