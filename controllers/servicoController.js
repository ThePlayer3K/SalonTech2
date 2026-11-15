const Servico = require('../models/Servico');
const { isAdmin } = require('../middlewares/auth');
const { requiredText, ValidationError } = require('./catalogoController');

function validId(value) {
  return /^[1-9]\d*$/.test(String(value))
    && Number.isSafeInteger(Number(value))
    && Number(value) <= 2147483647;
}

function normalizarDecimal(valor, rotulo, limite, aceitaMilhares = false) {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  const formatoMonetarioBrasileiro = /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/;
  const formatoDecimalComPonto = /^\d+(?:\.\d{1,2})?$/;
  const formatoDecimalSimples = /^\d+(?:[.,]\d{1,2})?$/;
  const formatoValido = aceitaMilhares
    ? formatoMonetarioBrasileiro.test(texto) || formatoDecimalComPonto.test(texto)
    : formatoDecimalSimples.test(texto);

  if (!formatoValido) {
    throw new ValidationError(`Informe ${rotulo} válido com até duas casas decimais.`);
  }

  // Sem vírgula, pontos seguidos de grupos de três dígitos representam milhares.
  const possuiMilhares = aceitaMilhares && /^\d{1,3}(?:\.\d{3})+$/.test(texto);
  let textoNormalizado = texto;
  if (texto.includes(',') || possuiMilhares) {
    textoNormalizado = texto.replace(/\./g, '').replace(',', '.');
  }

  const numero = Number(textoNormalizado);
  if (!Number.isFinite(numero) || numero < 0 || numero > limite) {
    throw new ValidationError(`Informe ${rotulo} entre 0 e ${limite.toLocaleString('pt-BR')}.`);
  }

  return numero.toFixed(2);
}

async function parseForm(body = {}) {
  const nome = requiredText(body.nome, 'o nome do serviço', 120);
  const categoria = requiredText(body.categoria, 'a categoria', 80);
  if (!validId(body.funcionario_id)) {
    throw new ValidationError('Selecione um funcionário responsável válido.');
  }
  if (!validId(body.duracao)) {
    throw new ValidationError('Informe uma duração inteira e maior que zero, em minutos.');
  }

  const valor = normalizarDecimal(body.valor, 'um valor', 99999999.99, true);
  const percentual_comissao = normalizarDecimal(body.percentual_comissao, 'um percentual de comissão', 100);
  const funcionario_id = Number(body.funcionario_id);
  const funcionarioEncontrado = await Servico.funcionarioExiste(funcionario_id);
  if (!funcionarioEncontrado) {
    throw new ValidationError('O funcionário selecionado não foi encontrado.');
  }

  return {
    nome,
    categoria,
    funcionario_id,
    valor,
    percentual_comissao,
    duracao: Number(body.duracao)
  };
}

async function renderPage(req, res, options = {}) {
  const user = req.session.user;
  const canManage = isAdmin(user);
  const [servicos, funcionarios] = await Promise.all([
    Servico.listar(user),
    canManage ? Servico.listarFuncionarios() : Promise.resolve([])
  ]);
  const messages = {
    criado: 'Serviço cadastrado.',
    atualizado: 'Serviço atualizado.',
    excluido: 'Serviço removido.'
  };

  return res.status(options.status || 200).render('pages/servicos', {
    title: 'Serviços',
    user,
    canManage,
    servicos,
    funcionarios,
    success: Object.hasOwn(messages, req.query.status || '') ? messages[req.query.status] : null,
    error: options.error || null,
    formData: options.formData || {},
    editingId: options.editingId || null
  });
}

async function handleError(error, req, res, next, options = {}) {
  let message;
  let status = 400;
  if (error instanceof ValidationError) {
    message = error.message;
  } else if (error.code === '23503') {
    if (options.removing) {
      message = 'Não é possível excluir este serviço porque há agendamentos vinculados.';
    } else {
      message = 'O funcionário selecionado não está mais disponível. Selecione outro responsável.';
    }
    status = 409;
  } else {
    return next(error);
  }

  try {
    return await renderPage(req, res, { ...options, error: message, status });
  } catch (renderError) {
    return next(renderError);
  }
}

function notFound(res) {
  return res.status(404).render('pages/404', { title: 'Serviço não encontrado' });
}

async function index(req, res, next) {
  try {
    return await renderPage(req, res);
  } catch (error) {
    return next(error);
  }
}

async function create(req, res, next) {
  try {
    const dadosServico = await parseForm(req.body);
    await Servico.criar(dadosServico);
    return res.redirect('/servicos?status=criado');
  } catch (error) {
    return handleError(error, req, res, next, { formData: req.body });
  }
}

async function update(req, res, next) {
  if (!validId(req.params.id)) {
    return notFound(res);
  }

  try {
    const servicoId = Number(req.params.id);
    const dadosServico = await parseForm(req.body);
    const servicoAtualizado = await Servico.atualizar(servicoId, dadosServico);
    if (!servicoAtualizado) {
      return notFound(res);
    }

    return res.redirect('/servicos?status=atualizado');
  } catch (error) {
    return handleError(error, req, res, next, {
      formData: req.body,
      editingId: Number(req.params.id)
    });
  }
}

async function remove(req, res, next) {
  if (!validId(req.params.id)) {
    return notFound(res);
  }

  try {
    const servicoExcluido = await Servico.excluir(Number(req.params.id));
    if (!servicoExcluido) {
      return notFound(res);
    }

    return res.redirect('/servicos?status=excluido');
  } catch (error) {
    return handleError(error, req, res, next, { removing: true });
  }
}

module.exports = { index, create, update, remove };
