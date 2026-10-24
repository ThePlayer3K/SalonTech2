class ValidationError extends Error {}

function requiredText(value, label, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > maxLength) throw new ValidationError(`Informe ${label} com até ${maxLength} caracteres.`);
  return text;
}

function createCatalogoController({ model, basePath, title, singular, description, fields, parseForm, canManage }) {
  const messages = { criado: 'Cadastro realizado.', atualizado: 'Alterações salvas.', excluido: 'Cadastro removido.' };

  async function renderPage(req, res, options = {}) {
    return res.status(options.status || 200).render('pages/catalogo', {
      title, singular, description, fields, basePath,
      user: req.session.user,
      canManage: canManage(req.session.user),
      records: await model.listar(),
      success: Object.hasOwn(messages, req.query.status || '') ? messages[req.query.status] : null,
      error: options.error || null,
      formData: options.formData || {},
      editingId: options.editingId || null
    });
  }

  async function handleError(error, req, res, next, options = {}) {
    let message;
    let status = 400;
    if (error instanceof ValidationError) message = error.message;
    else if (error.code === '23503') {
      message = 'Não é possível excluir este cadastro porque há registros vinculados a ele.';
      status = 409;
    } else return next(error);
    try { return await renderPage(req, res, { ...options, error: message, status }); }
    catch (renderError) { return next(renderError); }
  }

  function notFound(res) {
    return res.status(404).render('pages/404', { title: 'Cadastro não encontrado' });
  }

  function validId(value) {
    return /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) <= 2147483647;
  }

  function forbidden(req, res) {
    if (canManage(req.session.user)) return false;
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
      await model.criar(parseForm(req.body || {}));
      return res.redirect(`${basePath}?status=criado`);
    } catch (error) { return handleError(error, req, res, next, { formData: req.body }); }
  }

  async function update(req, res, next) {
    if (forbidden(req, res)) return;
    if (!validId(req.params.id)) return notFound(res);
    try {
      const record = await model.atualizar(Number(req.params.id), parseForm(req.body || {}));
      if (!record) return notFound(res);
      return res.redirect(`${basePath}?status=atualizado`);
    } catch (error) { return handleError(error, req, res, next, { formData: req.body, editingId: Number(req.params.id) }); }
  }

  async function remove(req, res, next) {
    if (forbidden(req, res)) return;
    if (!validId(req.params.id)) return notFound(res);
    try {
      if (!await model.excluir(Number(req.params.id))) return notFound(res);
      return res.redirect(`${basePath}?status=excluido`);
    } catch (error) { return handleError(error, req, res, next); }
  }

  return { index, create, update, remove };
}

module.exports = { createCatalogoController, requiredText, ValidationError };
