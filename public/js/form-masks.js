function formatCpf(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits.slice(0, 3)
    + (digits.length > 3 ? `.${digits.slice(3, 6)}` : '')
    + (digits.length > 6 ? `.${digits.slice(6, 9)}` : '')
    + (digits.length > 9 ? `-${digits.slice(9)}` : '');
}

function formatPhone(value) {
  let digits = value.replace(/\D/g, '');
  if (digits.length >= 12 && digits.startsWith('55')) digits = digits.slice(2);
  digits = digits.slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  const split = digits.length === 11 ? 5 : 4;
  const number = digits.slice(2);
  return `(${digits.slice(0, 2)}) ${number.slice(0, split)}`
    + (number.length > split ? `-${number.slice(split)}` : '');
}

function formatCurrency(value) {
  const digits = value.replace(/\D/g, '').slice(0, 15);
  if (!digits) return '';
  return (Number(digits) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Dados vindos do servidor e valores colados representam reais, não uma sequência de centavos.
function currencyFromValue(value) {
  const text = value.trim().replace(/^R\$\s*/, '');
  if (!text) return '';
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$|^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const grouped = /^\d{1,3}(?:\.\d{3})+$/.test(text);
  const number = Number(text.includes(',') || grouped ? text.replace(/\./g, '').replace(',', '.') : text);
  return number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercentage(value) {
  const text = value.replace(/[^\d.,]/g, '').replace(/\./g, ',');
  const separator = text.indexOf(',');
  const whole = (separator < 0 ? text : text.slice(0, separator)).replace(/^0+(?=\d)/, '');
  return separator < 0 ? whole : `${whole || '0'},${text.slice(separator + 1).replace(/\D/g, '').slice(0, 2)}`;
}

function formatInteger(value) {
  return value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
}

function validateMaskedNumber(input) {
  if (!['currency', 'percentage', 'integer'].includes(input.dataset.mask)) return;
  let message = '';
  if (input.value) {
    const pattern = input.dataset.mask === 'currency' ? /^\d{1,3}(?:\.\d{3})*,\d{2}$/
      : input.dataset.mask === 'percentage' ? /^\d+(?:,\d{1,2})?$/ : /^\d+$/;
    const number = Number(input.value.replace(/\./g, '').replace(',', '.'));
    const min = Number(input.dataset.min ?? 0);
    const max = Number(input.dataset.max ?? Infinity);
    if (!pattern.test(input.value) || !Number.isFinite(number)) message = 'Informe um número válido.';
    else if (number < min || number > max) {
      message = `Informe um valor entre ${min.toLocaleString('pt-BR')} e ${max.toLocaleString('pt-BR')}.`;
    }
  }
  input.setCustomValidity(message);
}

function restoreMaskedCaret(input, digitsToRight) {
  let position = input.value.length;
  let remaining = digitsToRight;
  while (position > 0 && remaining > 0) {
    position--;
    if (/\d/.test(input.value[position])) remaining--;
  }
  input.setSelectionRange(position, position);
}

function deleteAdjacentMaskedDigit(input, event, applyMask) {
  // Ao apagar ao lado de um separador, remove o dígito vizinho em vez de prender o cursor.
  if (!['cpf', 'phone', 'currency'].includes(input.dataset.mask) || input.selectionStart !== input.selectionEnd) return;
  const backward = event.inputType === 'deleteContentBackward';
  if (!backward && event.inputType !== 'deleteContentForward') return;

  let position = input.selectionStart + (backward ? -1 : 0);
  if (position < 0 || position >= input.value.length || /\d/.test(input.value[position])) return;
  while (position >= 0 && position < input.value.length && /\D/.test(input.value[position])) {
    position += backward ? -1 : 1;
  }
  if (position < 0 || position >= input.value.length) return;

  event.preventDefault();
  input.value = input.value.slice(0, position) + input.value.slice(position + 1);
  input.setSelectionRange(position, position);
  applyMask();
}

function pasteMaskedValue(input, event, applyMask) {
  const text = event.clipboardData?.getData('text');
  if (text == null) return;

  if (['cpf', 'phone'].includes(input.dataset.mask)) {
    event.preventDefault();
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    input.setSelectionRange(start + text.length, start + text.length);
    applyMask();
    return;
  }

  if (input.dataset.mask === 'integer' && !/^\d+$/.test(text.trim())) {
    event.preventDefault();
    return;
  }

  const entireValueSelected = input.selectionStart === 0 && input.selectionEnd === input.value.length;
  if (input.dataset.mask === 'currency' && entireValueSelected) {
    event.preventDefault();
    const value = currencyFromValue(text);
    if (value !== null) {
      input.value = value;
      input.setSelectionRange(value.length, value.length);
      validateMaskedNumber(input);
    }
  }
}

function initMaskedInput(input, masks) {
  const mask = masks[input.dataset.mask];
  if (!mask || input.readOnly || input.disabled) return;
  function applyMask(completeValue = false) {
    const raw = input.value;
    const caret = input.selectionStart;
    const digitsToRight = caret === null ? 0 : raw.slice(caret).replace(/\D/g, '').length;
    input.value = completeValue && input.dataset.mask === 'currency' ? (currencyFromValue(raw) ?? raw) : mask(raw);
    validateMaskedNumber(input);
    if (document.activeElement === input && caret !== null) {
      restoreMaskedCaret(input, digitsToRight);
    }
  }
  applyMask(true);
  input.addEventListener('input', (event) => {
    if (!event.isComposing) applyMask();
  });
  input.addEventListener('compositionend', () => applyMask());
  input.addEventListener('change', () => applyMask(true));
  input.addEventListener('blur', () => {
    if (input.dataset.mask === 'percentage') input.value = input.value.replace(/,$/, '');
    applyMask(true);
  });
  input.addEventListener('beforeinput', (event) => {
    if (input.dataset.mask === 'integer' && event.data && /\D/.test(event.data)) event.preventDefault();
    deleteAdjacentMaskedDigit(input, event, applyMask);
  });
  input.addEventListener('paste', (event) => {
    pasteMaskedValue(input, event, applyMask);
  });
  input.form?.addEventListener('reset', () => setTimeout(() => applyMask(true), 0));
}

document.addEventListener('DOMContentLoaded', () => {
  const masks = {
    cpf: formatCpf,
    phone: formatPhone,
    currency: formatCurrency,
    percentage: formatPercentage,
    integer: formatInteger
  };
  document.querySelectorAll('[data-mask]').forEach((input) => initMaskedInput(input, masks));
});
