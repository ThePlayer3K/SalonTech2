const Despesa = require('../models/Despesa');
const { requiredText, ValidationError } = require('./catalogoController');

function validId(value) {
  return /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) <= 2147483647;
}

function parseDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) {
    throw new ValidationError(`Informe ${label} válida.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ValidationError(`Informe ${label} válida.`);
  }
  return value;
}

function parseForm(body = {}) {
  const descricao = requiredText(body.descricao, 'a descrição da despesa', 120);
  const text = typeof body.valor === 'string' ? body.valor.trim() : '';
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$|^\d+(?:\.\d{1,2})?$/.test(text)) {
    throw new ValidationError('Informe um valor válido com até duas casas decimais.');
  }
  const grouped = /^\d{1,3}(?:\.\d{3})+$/.test(text);
  const number = Number(text.includes(',') || grouped ? text.replace(/\./g, '').replace(',', '.') : text);
  if (!Number.isFinite(number) || number < 0 || number > 99999999.99) {
    throw new ValidationError('Informe um valor entre R$ 0,00 e R$ 99.999.999,99.');
  }
  if (!['fixo', 'variavel'].includes(body.tipo)) throw new ValidationError('Selecione o tipo fixo ou variável.');
  return { descricao, valor: number.toFixed(2), tipo: body.tipo, data: parseDate(body.data, 'uma data') };
}

function filterValues(query = {}) {
  return Object.fromEntries(['nome', 'dataInicio', 'dataFim'].map((key) => [key, typeof query[key] === 'string' ? query[key].trim() : '']));
}

function parseFilters(query = {}) {
  const filters = filterValues(query);
  if (['nome', 'dataInicio', 'dataFim'].some((key) => query[key] !== undefined && typeof query[key] !== 'string')) {
    throw new ValidationError('Informe apenas um valor em cada campo de pesquisa.');
  }
  if (filters.nome.length > 120) throw new ValidationError('Pesquise por uma descrição com até 120 caracteres.');
  if (filters.dataInicio) parseDate(filters.dataInicio, 'uma data inicial');
  if (filters.dataFim) parseDate(filters.dataFim, 'uma data final');
  if (filters.dataInicio && filters.dataFim && filters.dataInicio > filters.dataFim) {
    throw new ValidationError('A data inicial deve ser anterior ou igual à data final.');
  }
  return filters;
}

async function renderPage(req, res, options = {}) {
  const filters = options.filters || parseFilters(req.query);
  const messages = { criado: 'Despesa cadastrada.', atualizado: 'Despesa atualizada.', excluido: 'Despesa removida.' };
  return res.status(options.status || 200).render('pages/despesas', {
    title: 'Despesas', user: req.session.user,
    despesas: options.invalidFilters ? [] : await Despesa.listar(filters),
    filters, invalidFilters: options.invalidFilters || false,
    success: Object.hasOwn(messages, req.query.status || '') ? messages[req.query.status] : null,
    error: options.error || null, formData: options.formData || {}, editingId: options.editingId || null
  });
}

async function handleError(error, req, res, next, options = {}) {
  if (!(error instanceof ValidationError)) return next(error);
  try { return await renderPage(req, res, { ...options, error: error.message, status: 400 }); }
  catch (renderError) { return next(renderError); }
}

function notFound(res) {
  return res.status(404).render('pages/404', { title: 'Despesa não encontrada' });
}

async function index(req, res, next) {
  let filters;
  try { filters = parseFilters(req.query); }
  catch (error) {
    return handleError(error, req, res, next, { filters: filterValues(req.query), invalidFilters: true });
  }
  try { return await renderPage(req, res, { filters }); }
  catch (error) { return next(error); }
}

async function create(req, res, next) {
  try {
    await Despesa.criar(parseForm(req.body));
    return res.redirect('/despesas?status=criado');
  } catch (error) { return handleError(error, req, res, next, { formData: req.body, filters: filterValues() }); }
}

async function update(req, res, next) {
  if (!validId(req.params.id)) return notFound(res);
  try {
    if (!await Despesa.atualizar(Number(req.params.id), parseForm(req.body))) return notFound(res);
    return res.redirect('/despesas?status=atualizado');
  } catch (error) {
    return handleError(error, req, res, next, { formData: req.body, editingId: Number(req.params.id), filters: filterValues() });
  }
}

async function remove(req, res, next) {
  if (!validId(req.params.id)) return notFound(res);
  try {
    if (!await Despesa.excluir(Number(req.params.id))) return notFound(res);
    return res.redirect('/despesas?status=excluido');
  } catch (error) { return next(error); }
}

module.exports = { index, create, update, remove };
