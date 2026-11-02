const { randomUUID } = require('node:crypto');
const { ValidationError } = require('./catalogoController');

function validId(value) {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 2147483647;
}

function parseDate(value, label = 'uma data') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) {
    throw new ValidationError(`Informe ${label} válida.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ValidationError(`Informe ${label} válida.`);
  }
  return value;
}

function validToken(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseToken(value) {
  if (!validToken(value)) throw new ValidationError('Recarregue o formulário para iniciar um novo cadastro.');
  return value;
}

function formToken(value) {
  return validToken(value) ? value : randomUUID();
}

module.exports = { validId, parseDate, parseToken, formToken };
