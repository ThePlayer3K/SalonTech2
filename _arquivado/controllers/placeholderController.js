function placeholder(req, res) {
  const labels = {
    produtos: 'Produtos',
    agendamentos: 'Agendamentos',
    servicos: 'Serviços',
    usuarios: 'Usuários'
  };
  const resource = req.path.slice(1);
  const admin = req.session.user?.papel === 'admin';

  // TODO: filtrar por profissional_id quando o papel for 'profissional'.
  return res.render('pages/placeholder', {
    title: labels[resource] || 'Em breve',
    resourceLabel: labels[resource] || 'Recurso',
    accessNote: resource === 'agendamentos' || resource === 'servicos'
      ? admin ? 'A visualização será de todos os registros.' : 'A visualização será somente dos seus registros.'
      : null
  });
}

module.exports = { placeholder };
