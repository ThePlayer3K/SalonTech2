const Cliente = require('../models/Cliente');

class ValidationError extends Error {}

function parseForm(body = {}) {
  const data = Object.fromEntries(['nome', 'cpf', 'telefone', 'email'].map((key) => [key, String(body[key] || '').trim()]));
  if (!data.nome || data.nome.length > 120) throw new ValidationError('Informe o nome do cliente com até 120 caracteres.');
  if (data.cpf) {
    const digits = data.cpf.replace(/[.\-\s]/g, '');
    if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) throw new ValidationError('Informe um CPF válido.');
    for (let size = 9; size <= 10; size++) {
      let sum = 0;
      for (let i = 0; i < size; i++) sum += Number(digits[i]) * (size + 1 - i);
      const digit = (sum * 10 % 11) % 10;
      if (digit !== Number(digits[size])) throw new ValidationError('Informe um CPF válido.');
    }
    data.cpf = digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (data.telefone) {
    const digits = data.telefone.replace(/[()\-\s]/g, '');
    if (!/^\d{10,11}$/.test(digits)) throw new ValidationError('Informe um telefone com DDD e 10 ou 11 dígitos.');
    data.telefone = digits.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3');
  }
  if (data.email && (data.email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))) {
    throw new ValidationError('Informe um e-mail válido com até 255 caracteres.');
  }
  return data;
}

async function renderPage(req, res, options = {}) {
  const messages = { criado: 'Cliente cadastrado.', atualizado: 'Cliente atualizado.', excluido: 'Cliente removido.' };
  return res.status(options.status || 200).render('pages/clientes', {
    title: 'Clientes', user: req.session.user,
    clientes: await Cliente.listar(),
    error: options.error || null,
    success: messages[req.query.status] || null,
    formData: options.formData || {},
    editingId: options.editingId || null
  });
}

async function index(req, res, next) {
  try { return await renderPage(req, res); }
  catch (error) { return next(error); }
}

function validId(value) {
  return /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) <= 2147483647;
}

function notFound(res) {
  return res.status(404).render('pages/404', { title: 'Cliente não encontrado' });
}

async function handleError(error, req, res, next, options = {}) {
  let message;
  let status = 400;
  if (error instanceof ValidationError) message = error.message;
  else if (error.code === '23505') { message = 'Este CPF já está cadastrado para outro cliente.'; status = 409; }
  else if (error.code === '23503') { message = 'Não é possível remover este cliente porque há agendamentos vinculados.'; status = 409; }
  else return next(error);
  try { return await renderPage(req, res, { ...options, error: message, status }); }
  catch (renderError) { return next(renderError); }
}

async function create(req, res, next) {
  try {
    await Cliente.criar(parseForm(req.body));
    return res.redirect('/clientes?status=criado');
  } catch (error) { return handleError(error, req, res, next, { formData: req.body }); }
}

async function update(req, res, next) {
  if (!validId(req.params.id)) return notFound(res);
  try {
    const cliente = await Cliente.atualizar(Number(req.params.id), parseForm(req.body));
    if (!cliente) return notFound(res);
    return res.redirect('/clientes?status=atualizado');
  } catch (error) { return handleError(error, req, res, next, { formData: req.body, editingId: Number(req.params.id) }); }
}

async function remove(req, res, next) {
  if (!validId(req.params.id)) return notFound(res);
  try {
    const cliente = await Cliente.excluir(Number(req.params.id));
    if (!cliente) return notFound(res);
    return res.redirect('/clientes?status=excluido');
  } catch (error) { return handleError(error, req, res, next); }
}

module.exports = { index, create, update, remove };
