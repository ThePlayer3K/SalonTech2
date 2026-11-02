const Agendamento = require('../models/Agendamento');
const Servico = require('../models/Servico');
const FormaPagamento = require('../models/FormaPagamento');
const { isAdmin } = require('../middlewares/auth');
const { ValidationError } = require('./catalogoController');
const { validId, parseDate, parseToken, formToken } = require('./formValidation');

const situacoes = { agendado: 'Agendado', pago: 'Pago', concluido: 'Concluído', cancelado: 'Cancelado' };

function parseForm(body = {}) {
  if (!validId(body.cliente_id)) throw new ValidationError('Selecione um cliente válido.');
  if (!validId(body.servico_id)) throw new ValidationError('Selecione um serviço válido.');
  if (!validId(body.forma_pag_id)) throw new ValidationError('Selecione uma forma de pagamento válida.');
  if (typeof body.situacao !== 'string' || !Object.hasOwn(situacoes, body.situacao)) throw new ValidationError('Selecione uma situação válida.');
  if (typeof body.data_hora !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(body.data_hora)) {
    throw new ValidationError('Informe uma data e hora válidas.');
  }
  parseDate(body.data_hora.slice(0, 10));
  return {
    cliente_id: Number(body.cliente_id), servico_id: Number(body.servico_id),
    forma_pag_id: Number(body.forma_pag_id), data_hora: body.data_hora, situacao: body.situacao
  };
}

async function renderPage(req, res, options = {}) {
  const user = req.session.user;
  const canManage = isAdmin(user) || (user?.papel === 'profissional' && Boolean(user.funcionarioId));
  const [agendamentos, clientes, servicos, pagamentos] = await Promise.all([
    Agendamento.listar(user),
    canManage ? Agendamento.listarClientes() : [],
    canManage ? Servico.listar(user) : [],
    canManage ? FormaPagamento.listar() : []
  ]);
  const messages = { criado: 'Agendamento cadastrado.', atualizado: 'Agendamento atualizado.' };
  return res.status(options.status || 200).render('pages/agendamentos', {
    title: 'Agendamentos', user, canManage, agendamentos, clientes, servicos, pagamentos, situacoes,
    success: Object.hasOwn(messages, req.query.status || '') ? messages[req.query.status] : null,
    error: options.error || null, formData: options.formData || {}, editingId: options.editingId || null,
    cadastroToken: formToken(options.editingId ? null : options.formData?.cadastro_token)
  });
}

async function handleError(error, req, res, next, options = {}) {
  let message;
  let status = 400;
  if (error instanceof ValidationError) message = error.message;
  else if (error.code === '23P01') {
    message = 'Conflito de horário: o profissional já possui outro agendamento durante esse período. Escolha outro horário.';
    status = 409;
  } else if (error.code === '23503') {
    message = 'O cliente, serviço ou forma de pagamento selecionado não está mais disponível. Atualize a seleção.';
    status = 409;
  } else if (error.code === '23514') message = 'O serviço deve ter duração positiva, valor válido e comissão entre 0 e 100%. Verifique o cadastro.';
  else return next(error);
  try { return await renderPage(req, res, { ...options, error: message, status }); }
  catch (renderError) { return next(renderError); }
}

function forbidden(req, res) {
  if (isAdmin(req.session.user) || (req.session.user?.papel === 'profissional' && req.session.user.funcionarioId)) return false;
  res.status(403).render('pages/403', { title: 'Acesso negado' });
  return true;
}

async function index(req, res, next) {
  try { return await renderPage(req, res); }
  catch (error) { return next(error); }
}

async function create(req, res, next) {
  if (forbidden(req, res)) return;
  try {
    const record = await Agendamento.criar(parseForm(req.body), parseToken(req.body?.cadastro_token), req.session.user);
    if (!record) throw new ValidationError('O serviço não foi encontrado ou não está disponível para seu perfil.');
    return res.redirect('/agendamentos?status=criado');
  } catch (error) { return handleError(error, req, res, next, { formData: req.body }); }
}

async function update(req, res, next) {
  if (forbidden(req, res)) return;
  if (!validId(req.params.id)) return res.status(404).render('pages/404', { title: 'Agendamento não encontrado' });
  try {
    const record = await Agendamento.atualizar(Number(req.params.id), parseForm(req.body), req.session.user);
    if (!record) return res.status(404).render('pages/404', { title: 'Agendamento não encontrado' });
    return res.redirect('/agendamentos?status=atualizado');
  } catch (error) { return handleError(error, req, res, next, { formData: req.body, editingId: Number(req.params.id) }); }
}

async function denyRemoval(req, res, next) {
  res.set('Allow', req.path === '/' ? 'GET, POST' : req.method === 'DELETE' ? 'POST' : '');
  try {
    return await renderPage(req, res, { status: 405, error: 'Agendamentos são irremovíveis. Para liberar o horário, altere a situação para Cancelado.' });
  } catch (error) { return next(error); }
}

module.exports = { index, create, update, denyRemoval };
