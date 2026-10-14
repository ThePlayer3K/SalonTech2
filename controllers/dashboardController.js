const { isAdmin } = require('../middlewares/auth');

function dashboard(req, res) {
  const user = req.session.user;
  const admin = isAdmin(user);
  const cards = admin
    ? [
        { href: '/produtos', label: 'Produtos', description: 'Catálogo e estoque.' },
        { href: '/agendamentos', label: 'Agendamentos', description: 'Visualização de todos os atendimentos.' },
        { href: '/servicos', label: 'Serviços', description: 'Catálogo completo de serviços.' },
        { href: '/usuarios', label: 'Usuários', description: 'Gerenciamento da equipe.' }
      ]
    : [
        { href: '/produtos', label: 'Produtos', description: 'Consulta somente leitura.' },
        { href: '/agendamentos', label: 'Meus agendamentos', description: 'Atendimentos vinculados ao seu perfil.' },
        { href: '/servicos', label: 'Meus serviços', description: 'Serviços vinculados ao seu perfil.' }
      ];

  return res.render('pages/dashboard', { title: 'Dashboard', user, admin, cards });
}

module.exports = { dashboard };
