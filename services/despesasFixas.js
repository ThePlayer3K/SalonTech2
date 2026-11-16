const db = require('../config/db');

async function gerarPendentes() {
  const result = await db.query('SELECT public.gerar_despesas_fixas() AS criadas');
  return result.rows[0].criadas;
}

function iniciarRotina({
  intervalo = 60000,
  onError = (error) => console.error('Falha ao gerar despesas fixas:', error)
} = {}) {
  let executando = false;
  async function executar() {
    if (executando) {
      return;
    }

    executando = true;
    try {
      await module.exports.gerarPendentes();
    } catch (error) {
      onError(error);
    } finally {
      executando = false;
    }
  }

  void executar();
  const temporizador = setInterval(executar, intervalo);
  temporizador.unref();
  return () => clearInterval(temporizador);
}

module.exports = { gerarPendentes, iniciarRotina };
