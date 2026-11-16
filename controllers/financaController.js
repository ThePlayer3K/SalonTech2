const Financa = require('../models/Financa');
const DespesasFixas = require('../services/despesasFixas');
const { parseDate } = require('./formValidation');
const { ValidationError } = require('./catalogoController');

function periodoPadrao(agora = new Date()) {
  const formatadorData = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const partesData = Object.fromEntries(
    formatadorData.formatToParts(agora).map(({ type, value }) => [type, value])
  );

  return {
    dataInicio: `${partesData.year}-${partesData.month}-01`,
    dataFim: `${partesData.year}-${partesData.month}-${partesData.day}`
  };
}

function parsePeriodo(query) {
  const periodoInicial = periodoPadrao();
  const periodo = {};

  for (const campo of ['dataInicio', 'dataFim']) {
    if (query[campo] !== undefined && typeof query[campo] !== 'string') {
      throw new ValidationError('Informe apenas uma data em cada campo do período.');
    }

    const valor = query[campo] === undefined ? periodoInicial[campo] : query[campo].trim();
    const descricao = campo === 'dataInicio' ? 'uma data inicial' : 'uma data final';
    periodo[campo] = parseDate(valor, descricao);
  }

  if (periodo.dataInicio > periodo.dataFim) {
    throw new ValidationError('A data inicial deve ser anterior ou igual à data final.');
  }

  return periodo;
}

async function index(req, res, next) {
  let periodo;
  try {
    periodo = parsePeriodo(req.query);
  } catch (error) {
    if (!(error instanceof ValidationError)) {
      return next(error);
    }

    const periodoInicial = periodoPadrao();
    return res.status(400).render('pages/financas', {
      title: 'Finanças',
      user: req.session.user,
      error: error.message,
      relatorio: null,
      filters: {
        dataInicio: typeof req.query.dataInicio === 'string' ? req.query.dataInicio : periodoInicial.dataInicio,
        dataFim: typeof req.query.dataFim === 'string' ? req.query.dataFim : periodoInicial.dataFim
      }
    });
  }

  try {
    await DespesasFixas.gerarPendentes();
    return res.render('pages/financas', {
      title: 'Finanças',
      user: req.session.user,
      filters: periodo,
      error: null,
      relatorio: await Financa.relatorio(periodo)
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { index, periodoPadrao };
