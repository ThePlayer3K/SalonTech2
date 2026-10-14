require('dotenv').config();

const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

async function main() {
  const nome = String(process.env.ADMIN_NAME || '').trim();
  const senha = process.env.ADMIN_PASSWORD;
  if (!nome || !senha) throw new Error('ADMIN_NAME e ADMIN_PASSWORD são obrigatórios.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE public.usuario SET papel = 'admin' WHERE papel = 'master' AND lower(nome) <> lower($1)`, [nome]);
    const existing = await client.query('SELECT id, funcionario_id FROM public.usuario WHERE nome = $1 ORDER BY id LIMIT 1 FOR UPDATE', [nome]);
    const senhaHash = await bcrypt.hash(senha, 10);

    if (existing.rowCount) {
      let funcionarioId = existing.rows[0].funcionario_id;
      if (!funcionarioId) {
        const employee = await client.query(
          `INSERT INTO public.funcionario (nome, cargo) VALUES ($1, 'Administrador master') RETURNING id`, [nome]
        );
        funcionarioId = employee.rows[0].id;
      }
      await client.query(`UPDATE public.funcionario SET cargo = 'Administrador master' WHERE id = $1`, [funcionarioId]);
      await client.query(
        `UPDATE public.usuario SET senha = $1, tipo = 'A', papel = 'master', funcionario_id = $2 WHERE id = $3`,
        [senhaHash, funcionarioId, existing.rows[0].id]
      );
      console.log(`Conta master ${nome} sincronizada com o ambiente.`);
    } else {
      const employee = await client.query(
        `INSERT INTO public.funcionario (nome, cargo) VALUES ($1, 'Administrador master') RETURNING id`, [nome]
      );
      await client.query(
        `INSERT INTO public.usuario (nome, senha, tipo, papel, funcionario_id) VALUES ($1, $2, 'A', 'master', $3)`,
        [nome, senhaHash, employee.rows[0].id]
      );
      console.log(`Conta master ${nome} criada com sucesso.`);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error('Falha ao sincronizar administrador master:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
