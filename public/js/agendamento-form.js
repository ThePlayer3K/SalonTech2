document.addEventListener('DOMContentLoaded', () => {
  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  document.querySelectorAll('[data-agendamento-form]').forEach((form) => {
    const service = form.querySelector('[name="servico_id"]');
    const professional = form.querySelector('[data-profissional-servico]');
    const duration = form.querySelector('[data-duracao-servico]');
    const price = form.querySelector('[data-valor-servico]');
    const updateServiceDetails = () => {
      const selected = service.selectedOptions[0]?.dataset;
      professional.value = selected?.profissional || '';
      duration.value = selected?.duracao || '';
      const value = selected?.valor;
      price.value = value != null && value !== '' && Number.isFinite(Number(value)) ? currency.format(Number(value)) : '';
    };
    service.addEventListener('change', updateServiceDetails);
    updateServiceDetails();
  });
});
