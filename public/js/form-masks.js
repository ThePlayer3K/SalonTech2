function formatCpf(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/(\.\d{3})(\d{1,2})$/, '$1-$2');
}

function formatPhone(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 10) {
    return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  }
  return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

function formatCurrency(value) {
  const digits = value.replace(/\D/g, '').slice(0, 13);
  if (!digits) return '';
  return (Number(digits) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const masks = { cpf: formatCpf, phone: formatPhone, currency: formatCurrency };
  document.querySelectorAll('[data-mask]').forEach((input) => {
    const mask = masks[input.dataset.mask];
    if (!mask) return;
    input.value = mask(input.value);
    input.addEventListener('input', () => {
      input.value = mask(input.value);
    });
  });
});
