const bcrypt = require('bcryptjs');
const { query } = require('../config/db');

async function buscarPorLogin(login) {
  const result = await query(
    `SELECT id, nome, senha, tipo, papel, funcionario_id
       FROM public.usuario
      WHERE nome = $1`,
    [String(login).trim()]
  );
  return result.rows[0] || null;
}

async function buscarPorId(id) {
  const result = await query(
    `SELECT id, nome, tipo, papel, funcionario_id
       FROM public.usuario
      WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function criar({ nome, senha, papel = 'profissional', funcionarioId = null }) {
  if (!funcionarioId) throw new Error('Todo usuário precisa estar vinculado a um funcionário.');
  const senhaHash = await bcrypt.hash(senha, 10);

  try {
    const result = await query(
      `INSERT INTO public.usuario (nome, senha, tipo, papel, funcionario_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nome, tipo, papel, funcionario_id`,
      [String(nome).trim(), senhaHash, papel === 'profissional' ? 'F' : 'A', papel, funcionarioId]
    );
    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') {
      throw new Error('Usuário já cadastrado ou funcionário já vinculado');
    }
    throw error;
  }
}

function verificarSenha(senhaPura, hash) {
  return bcrypt.compare(senhaPura, hash);
}

async function listarTodos() {
  const result = await query(
    `SELECT id, nome, tipo, papel, funcionario_id
       FROM public.usuario
      ORDER BY nome`
  );
  return result.rows;
}

module.exports = { buscarPorLogin, buscarPorId, criar, verificarSenha, listarTodos };
