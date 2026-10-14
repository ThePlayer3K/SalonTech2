const bcrypt = require('bcryptjs');
const { pool, query } = require('../config/db');

async function listar() {
  const result = await query(
    `SELECT f.id AS funcionario_id, f.nome, f.cpf, f.telefone, f.cargo,
            f.tipo_pagamento, f.salario, u.id AS usuario_id,
            u.nome AS login,
            CASE WHEN lower(u.nome) = lower($1) THEN 'master' WHEN u.papel = 'master' THEN 'admin' ELSE u.papel END AS papel
       FROM public.funcionario f
       JOIN public.usuario u ON u.funcionario_id = f.id
      ORDER BY CASE WHEN lower(u.nome) = lower($1) THEN 0 WHEN u.papel = 'admin' OR u.papel = 'master' THEN 1 ELSE 2 END, f.nome`,
    [String(process.env.ADMIN_NAME || '')]
  );
  return result.rows;
}

async function buscarPorUsuario(usuarioId) {
  const result = await query(
    `SELECT f.id AS funcionario_id, f.nome, f.cpf, f.telefone, f.cargo,
            f.tipo_pagamento, f.salario, u.id AS usuario_id,
            u.nome AS login,
            CASE WHEN lower(u.nome) = lower($2) THEN 'master' WHEN u.papel = 'master' THEN 'admin' ELSE u.papel END AS papel
       FROM public.funcionario f
       JOIN public.usuario u ON u.funcionario_id = f.id
      WHERE u.id = $1`, [usuarioId, String(process.env.ADMIN_NAME || '')]
  );
  return result.rows[0] || null;
}

async function salvar({ usuarioId, funcionarioId, nome, login, senha, cpf, telefone, cargo, tipoPagamento, salario, papel }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let userId = usuarioId;
    let employeeId = funcionarioId;
    const duplicate = await client.query(
      `SELECT id FROM public.usuario WHERE lower(nome) = lower($1) AND id IS DISTINCT FROM $2 LIMIT 1`,
      [login, userId || null]
    );
    if (duplicate.rowCount) throw new Error('Este nome de usuário já está cadastrado.');
    if (userId) {
      await client.query(
        `UPDATE public.funcionario SET nome=$1, cpf=$2, telefone=$3, cargo=$4,
         tipo_pagamento=$5, salario=$6 WHERE id=$7`,
        [nome, cpf || null, telefone || null, cargo || null, tipoPagamento || null, salario || null, employeeId]
      );
      const params = [login, papel, papel === 'profissional' ? 'F' : 'A', userId];
      let sql = `UPDATE public.usuario SET nome=$1, papel=$2, tipo=$3 WHERE id=$4`;
      if (senha) {
        params.push(await bcrypt.hash(senha, 10));
        sql = `UPDATE public.usuario SET nome=$1, papel=$2, tipo=$3, senha=$5 WHERE id=$4`;
      }
      await client.query(sql, params);
    } else {
      const employee = await client.query(
        `INSERT INTO public.funcionario (nome, cpf, telefone, cargo, tipo_pagamento, salario)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [nome, cpf || null, telefone || null, cargo || null, tipoPagamento || null, salario || null]
      );
      employeeId = employee.rows[0].id;
      await client.query(
        `INSERT INTO public.usuario (nome, senha, tipo, papel, funcionario_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [login, await bcrypt.hash(senha, 10), papel === 'profissional' ? 'F' : 'A', papel, employeeId]
      );
    }
    await client.query('COMMIT');
    return userId || employeeId;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw new Error('Este login ou CPF já está cadastrado.');
    if (error.code === '23503') throw new Error('Não é possível excluir este funcionário porque há serviços ou agendamentos vinculados.');
    throw error;
  } finally {
    client.release();
  }
}

async function excluir(usuarioId, funcionarioId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM public.usuario WHERE id=$1', [usuarioId]);
    await client.query('DELETE FROM public.funcionario WHERE id=$1', [funcionarioId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23503') throw new Error('Não é possível excluir este funcionário porque há serviços ou agendamentos vinculados.');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { listar, buscarPorUsuario, salvar, excluir };
