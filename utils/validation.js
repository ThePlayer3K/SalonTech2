class ValidationError extends Error {}

function requiredText(value, label, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > maxLength) {
    throw new ValidationError(`Informe ${label} com até ${maxLength} caracteres.`);
  }
  return text;
}

module.exports = { ValidationError, requiredText };
