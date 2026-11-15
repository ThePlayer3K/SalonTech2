const Agendamento = require('../models/Agendamento');
const Servico = require('../models/Servico');
const FormaPagamento = require('../models/FormaPagamento');
const { isAdmin } = require('../middlewares/auth');
const { ValidationError } = require('./catalogoController');
const { validId, parseDate, parseToken, formToken } = require('./formValidation');

const situacoes = {
  agendado: 'Agendado',
  pago: 'Pago',
  concluido: 'Concluído',
  cancelado: 'Cancelado'
};

function parseForm(body = {}) {
  if (!validId(body.cliente_id)) {
    throw new ValidationError('Selecione um cliente válido.');
  }
  if (!validId(body.servico_id)) {
    throw new ValidationError('Selecione um serviço válido.');
  }
  if (!validId(body.forma_pag_id)) {
    throw new ValidationError('Selecione uma forma de pagamento válida.');
  }

  validarSituacao(body.situacao);
  validarDataHora(body.data_hora);

  return {
    cliente_id: Number(body.cliente_id),
    servico_id: Number(body.servico_id),
    forma_pag_id: Number(body.forma_pag_id),
    data_hora: body.data_hora,
    situacao: body.situacao
  };
}

function validarSituacao(situacao) {
  if (typeof situacao !== 'string' || !Object.hasOwn(situacoes, situacao)) {
    throw new ValidationError('Selecione uma situação válida.');
  }
}

function validarDataHora(dataHora) {
  const formatoDataHora = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (typeof dataHora !== 'string' || !formatoDataHora.test(dataHora)) {
    throw new ValidationError('Informe uma data e hora válidas.');
  }

  parseDate(dataHora.slice(0, 10));
}

function podeGerenciarAgendamentos(user) {
  return isAdmin(user)
    || (user?.papel === 'profissional' && Boolean(user.funcionarioId));
}

async function renderPage(req, res, options = {}) {
  const user = req.session.user;
  const canManage = podeGerenciarAgendamentos(user);
  const [agendamentos, clientes, servicos, pagamentos] = await Promise.all([
    Agendamento.listar(user),
    canManage ? Agendamento.listarClientes() : [],
    canManage ? Servico.listar(user) : [],
    canManage ? FormaPagamento.listar() : []
  ]);
  const messages = {
    criado: 'Agendamento cadastrado.',
    atualizado: 'Agendamento atualizado.'
  };

  return res.status(options.status || 200).render('pages/agendamentos', {
    title: 'Agendamentos',
    user,
    canManage,
    agendamentos,
    clientes,
    servicos,
    pagamentos,
    situacoes,
    success: Object.hasOwn(messages, req.query.status || '') ? messages[req.query.status] : null,
    error: options.error || null,
    formData: options.formData || {},
    editingId: options.editingId || null,
    cadastroToken: formToken(options.editingId ? null : options.formData?.cadastro_token)
  });
}

async function handleError(error, req, res, next, options = {}) {
  let message;
  let status = 400;
  if (error instanceof ValidationError) {
    message = error.message;
  } else if (error.code === '23P01') {
    message = 'Conflito de horário: o profissional já possui outro agendamento durante esse período. Escolha outro horário.';
    status = 409;
  } else if (error.code === '40P01') {
    message = 'Outro agendamento foi alterado ao mesmo tempo. Verifique a agenda e tente salvar novamente.';
    status = 409;
  } else if (error.code === '23503') {
    message = 'O cliente, serviço ou forma de pagamento selecionado não está mais disponível. Atualize a seleção.';
    status = 409;
  } else if (error.code === '23514') {
    message = 'O serviço deve ter duração positiva, valor válido e comissão entre 0 e 100%. Verifique o cadastro.';
  } else {
    return next(error);
  }

  try {
    return await renderPage(req, res, { ...options, error: message, status });
  } catch (renderError) {
    return next(renderError);
  }
}

function forbidden(req, res) {
  if (podeGerenciarAgendamentos(req.session.user)) {
    return false;
  }

  res.status(403).render('pages/403', { title: 'Acesso negado' });
  return true;
}

async function index(req, res, next) {
  try {
    return await renderPage(req, res);
  } catch (error) {
    return next(error);
  }
}

function notFound(res) {
  return res.status(404).render('pages/404', { title: 'Agendamento não encontrado' });
}

async function create(req, res, next) {
  if (forbidden(req, res)) {
    return;
  }

  try {
    const agendamento = await Agendamento.criar(
      parseForm(req.body),
      parseToken(req.body?.cadastro_token),
      req.session.user
    );
    if (!agendamento) {
      throw new ValidationError('O serviço não foi encontrado ou não está disponível para seu perfil.');
    }

    return res.redirect('/agendamentos?status=criado');
  } catch (error) {
    return handleError(error, req, res, next, { formData: req.body });
  }
}

async function update(req, res, next) {
  if (forbidden(req, res)) {
    return;
  }
  if (!validId(req.params.id)) {
    return notFound(res);
  }

  try {
    const agendamento = await Agendamento.atualizar(
      Number(req.params.id),
      parseForm(req.body),
      req.session.user
    );
    if (!agendamento) {
      return notFound(res);
    }

    return res.redirect('/agendamentos?status=atualizado');
  } catch (error) {
    return handleError(error, req, res, next, {
      formData: req.body,
      editingId: Number(req.params.id)
    });
  }
}

async function denyRemoval(req, res, next) {
  let metodosPermitidos = '';
  if (req.path === '/') {
    metodosPermitidos = 'GET, POST';
  } else if (req.method === 'DELETE') {
    metodosPermitidos = 'POST';
  }
  res.set('Allow', metodosPermitidos);

  try {
    return await renderPage(req, res, {
      status: 405,
      error: 'Agendamentos são irremovíveis. Para liberar o horário, altere a situação para Cancelado.'
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { index, create, update, denyRemoval };
