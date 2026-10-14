require('dotenv').config();

const Usuario = require('../models/Usuario');
const { pool } = require('../config/db');

async function main() {
  const nome = process.env.ADMIN_NAME;
  const senha = process.env.ADMIN_PASSWORD;

  if (!nome || !senha) {
    throw new Error('ADMIN_NAME e ADMIN_PASSWORD são obrigatórios.');
  }

  const existente = await Usuario.buscarPorLogin(nome);
  if (existente) {
    console.log(`Administrador ${nome} já existe. Nenhuma alteração foi feita.`);
    return;
  }

  await Usuario.criar({ nome, senha, papel: 'admin' });
  console.log(`Administrador ${nome} criado com sucesso.`);
}

main()
  .catch((error) => {
    console.error('Falha ao criar administrador:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
