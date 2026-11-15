const Cliente = require('../models/Cliente');

class ValidationError extends Error {}

function parseForm(body = {}) {
  const dados = {
    nome: String(body.nome || '').trim(),
    cpf: String(body.cpf || '').trim(),
    telefone: String(body.telefone || '').trim(),
    email: String(body.email || '').trim()
  };

  validarNome(dados.nome);
  dados.cpf = normalizarCpf(dados.cpf);
  dados.telefone = normalizarTelefone(dados.telefone);
  validarEmail(dados.email);

  return dados;
}

function validarNome(nome) {
  if (!nome || nome.length > 120) {
    throw new ValidationError('Informe o nome do cliente com até 120 caracteres.');
  }
}

function calcularDigitoVerificadorCpf(digitos, quantidadeDigitos) {
  let soma = 0;
  for (let indice = 0; indice < quantidadeDigitos; indice++) {
    const peso = quantidadeDigitos + 1 - indice;
    soma += Number(digitos[indice]) * peso;
  }
  return (soma * 10 % 11) % 10;
}

function normalizarCpf(cpf) {
  if (!cpf) return '';

  const digitos = cpf.replace(/[.\-\s]/g, '');
  if (!/^\d{11}$/.test(digitos) || /^(\d)\1{10}$/.test(digitos)) {
    throw new ValidationError('Informe um CPF válido.');
  }

  // O segundo dígito verificador também considera o primeiro no cálculo.
  for (let quantidadeDigitos = 9; quantidadeDigitos <= 10; quantidadeDigitos++) {
    const digitoEsperado = calcularDigitoVerificadorCpf(digitos, quantidadeDigitos);
    if (digitoEsperado !== Number(digitos[quantidadeDigitos])) {
      throw new ValidationError('Informe um CPF válido.');
    }
  }

  return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function normalizarTelefone(telefone) {
  if (!telefone) return '';

  const digitos = telefone.replace(/[()\-\s]/g, '');
  if (!/^\d{10,11}$/.test(digitos)) {
    throw new ValidationError('Informe um telefone com DDD e 10 ou 11 dígitos.');
  }

  return digitos.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3');
}

function validarEmail(email) {
  if (email && (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new ValidationError('Informe um e-mail válido com até 255 caracteres.');
  }
}

async function renderPage(req, res, options = {}) {
  const messages = {
    criado: 'Cliente cadastrado.',
    atualizado: 'Cliente atualizado.',
    excluido: 'Cliente removido.'
  };

  return res.status(options.status || 200).render('pages/clientes', {
    title: 'Clientes',
    user: req.session.user,
    clientes: await Cliente.listar(),
    error: options.error || null,
    success: messages[req.query.status] || null,
    formData: options.formData || {},
    editingId: options.editingId || null
  });
}

async function index(req, res, next) {
  try {
    return await renderPage(req, res);
  } catch (error) {
    return next(error);
  }
}

function validId(value) {
  return /^[1-9]\d*$/.test(String(value))
    && Number.isSafeInteger(Number(value))
    && Number(value) <= 2147483647;
}

function notFound(res) {
  return res.status(404).render('pages/404', { title: 'Cliente não encontrado' });
}

async function handleError(error, req, res, next, options = {}) {
  let message;
  let status = 400;
  if (error instanceof ValidationError) {
    message = error.message;
  } else if (error.code === '23505') {
    message = 'Este CPF já está cadastrado para outro cliente.';
    status = 409;
  } else if (error.code === '23503') {
    message = 'Não é possível remover este cliente porque há agendamentos vinculados.';
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

async function create(req, res, next) {
  try {
    await Cliente.criar(parseForm(req.body));
    return res.redirect('/clientes?status=criado');
  } catch (error) {
    return handleError(error, req, res, next, { formData: req.body });
  }
}

async function update(req, res, next) {
  if (!validId(req.params.id)) {
    return notFound(res);
  }

  try {
    const cliente = await Cliente.atualizar(Number(req.params.id), parseForm(req.body));
    if (!cliente) {
      return notFound(res);
    }
    return res.redirect('/clientes?status=atualizado');
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
    const cliente = await Cliente.excluir(Number(req.params.id));
    if (!cliente) {
      return notFound(res);
    }
    return res.redirect('/clientes?status=excluido');
  } catch (error) {
    return handleError(error, req, res, next);
  }
}

module.exports = { index, create, update, remove };
