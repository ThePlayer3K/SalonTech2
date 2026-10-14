function placeholder(req, res) {
  const labels = {
    clientes: 'Clientes',
    agendamentos: 'Agendamentos',
    servicos: 'Serviços',
    equipe: 'Equipe',
    produtos: 'Produtos',
    despesas: 'Despesas',
    pagamentos: 'Pagamentos',
    financas: 'Finanças',
    usuarios: 'Usuários'
  };
  const resource = req.path.slice(1);

  return res.render('pages/placeholder', {
    title: labels[resource] || 'Em breve',
    resourceLabel: labels[resource] || 'Recurso',
    accessNote: resource === 'pagamentos' && req.session.user?.papel === 'profissional'
      ? 'Acesso somente para consulta.'
      : null
  });
}

module.exports = { placeholder };
