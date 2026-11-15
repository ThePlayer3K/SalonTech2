const Financa = require('../models/Financa');
const DespesasFixas = require('../services/despesasFixas');
const { parseDate } = require('./formValidation');
const { ValidationError } = require('./catalogoController');

function periodoPadrao(agora = new Date()) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(agora).map(({ type, value }) => [type, value]));
  return { dataInicio: `${partes.year}-${partes.month}-01`, dataFim: `${partes.year}-${partes.month}-${partes.day}` };
}

function parsePeriodo(query) {
  const defaults = periodoPadrao();
  const filters = {};
  for (const key of ['dataInicio', 'dataFim']) {
    if (query[key] !== undefined && typeof query[key] !== 'string') {
      throw new ValidationError('Informe apenas uma data em cada campo do período.');
    }
    const value = query[key] === undefined ? defaults[key] : query[key].trim();
    filters[key] = parseDate(value, key === 'dataInicio' ? 'uma data inicial' : 'uma data final');
  }
  if (filters.dataInicio > filters.dataFim) throw new ValidationError('A data inicial deve ser anterior ou igual à data final.');
  return filters;
}

async function index(req, res, next) {
  let filters;
  try { filters = parsePeriodo(req.query); }
  catch (error) {
    if (!(error instanceof ValidationError)) return next(error);
    const defaults = periodoPadrao();
    return res.status(400).render('pages/financas', {
      title: 'Finanças', user: req.session.user, error: error.message, relatorio: null,
      filters: Object.fromEntries(['dataInicio', 'dataFim'].map((key) => [key,
        typeof req.query[key] === 'string' ? req.query[key] : defaults[key]]))
    });
  }
  try {
    await DespesasFixas.gerarPendentes();
    return res.render('pages/financas', {
      title: 'Finanças', user: req.session.user, filters, error: null,
      relatorio: await Financa.relatorio(filters)
    });
  } catch (error) { return next(error); }
}

module.exports = { index, periodoPadrao };
