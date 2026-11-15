const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const Equipe = require('../models/Equipe');

test('equipe: transações, senhas e parâmetros de gravação', async (t) => {
  const originalConnect = db.pool.connect;
  const originalHash = bcrypt.hash;
  let calls;
  let hashes;
  let releases;
  let failAt;
  let failure;
  let duplicate;
  t.beforeEach(() => {
    calls = [];
    hashes = [];
    releases = 0;
    failAt = null;
    failure = null;
    duplicate = false;
  });
  db.pool.connect = async () => ({
    async query(sql, params) {
      calls.push({ sql, params });
      if (failAt?.test(sql)) throw failure;
      if (sql.includes('SELECT id')) return { rowCount: duplicate ? 1 : 0, rows: [] };
      return { rowCount: 1, rows: [{ id: 99 }] };
    },
    release() { releases++; }
  });
  bcrypt.hash = async (password, cost) => { hashes.push({ password, cost }); return 'senha-protegida'; };
  t.after(() => { db.pool.connect = originalConnect; bcrypt.hash = originalHash; });
  const data = { nome: "Pessoa ' teste", login: 'teste', senha: 'nova-senha', cpf: '', telefone: '', cargo: '', tipoPagamento: '', salario: 1000, papel: 'profissional' };

  await t.test('criação e edição preservam salário zero e distinguem ausência', async () => {
    for (const salario of [0, null]) {
      for (const editing of [false, true]) {
        const id = await Equipe.salvar({ ...data, salario, ...(editing ? { usuarioId: 7, funcionarioId: 17 } : {}) });
        const employeeWrite = calls.filter(({ sql }) => /^(INSERT INTO|UPDATE) public\.funcionario/.test(sql)).at(-1);
        assert.equal(employeeWrite.params[5], salario);
        assert.equal(id, editing ? 7 : 99);
      }
    }
    assert.equal(releases, 4);
  });
  await t.test('criação grava funcionário antes do usuário com hash e confirma a transação', async () => {
    await Equipe.salvar(data);
    assert.equal(calls[0].sql, 'BEGIN');
    assert.match(calls[1].sql, /SELECT id/);
    assert.match(calls[2].sql, /INSERT INTO public\.funcionario/);
    assert.match(calls[3].sql, /INSERT INTO public\.usuario/);
    assert.deepEqual(calls[3].params, ['teste', 'senha-protegida', 'F', 'profissional', 99]);
    assert.deepEqual(hashes, [{ password: data.senha, cost: 10 }]);
    assert.equal(calls.at(-1).sql, 'COMMIT');
    assert.equal(releases, 1);
    for (const { sql } of calls) assert.ok(!sql.includes(data.nome));
  });
  await t.test('edição sem senha mantém o hash; com senha cria novo hash', async () => {
    await Equipe.salvar({ ...data, usuarioId: 7, funcionarioId: 17, senha: '', papel: 'admin' });
    const unchangedPassword = calls.find(({ sql }) => sql.startsWith('UPDATE public.usuario'));
    assert.deepEqual(unchangedPassword.params, ['teste', 'admin', 'A', 7]);
    assert.ok(!unchangedPassword.sql.includes('senha='));
    assert.equal(hashes.length, 0);
    calls = [];
    await Equipe.salvar({ ...data, usuarioId: 7, funcionarioId: 17 });
    assert.deepEqual(calls.find(({ sql }) => sql.startsWith('UPDATE public.usuario')).params, ['teste', 'profissional', 'F', 7, 'senha-protegida']);
    assert.equal(hashes.length, 1);
    assert.equal(releases, 2);
  });
  await t.test('login duplicado reverte antes de qualquer gravação', async () => {
    duplicate = true;
    await assert.rejects(() => Equipe.salvar(data), /Este nome de usuário já está cadastrado/);
    assert.equal(calls.length, 3);
    assert.equal(calls.at(-1).sql, 'ROLLBACK');
    assert.equal(releases, 1);
  });
  await t.test('falha ao salvar usuário reverte funcionário e traduz conflitos conhecidos', async () => {
    failAt = /INSERT INTO public\.usuario/;
    failure = { code: '23505' };
    await assert.rejects(() => Equipe.salvar(data), /Este login ou CPF já está cadastrado/);
    assert.equal(calls.at(-1).sql, 'ROLLBACK');
    assert.ok(!calls.some(({ sql }) => sql === 'COMMIT'));
    assert.equal(releases, 1);
  });
  await t.test('exclusão remove usuário e funcionário na mesma transação', async () => {
    await Equipe.excluir(7, 17);
    assert.deepEqual(calls.map(({ sql }) => sql), ['BEGIN', 'DELETE FROM public.usuario WHERE id=$1', 'DELETE FROM public.funcionario WHERE id=$1', 'COMMIT']);
    assert.deepEqual(calls[1].params, [7]);
    assert.deepEqual(calls[2].params, [17]);
    assert.equal(releases, 1);
  });
  await t.test('vínculo impede exclusão e falhas inesperadas também revertem e liberam conexão', async () => {
    failAt = /DELETE FROM public\.funcionario/;
    failure = { code: '23503' };
    await assert.rejects(() => Equipe.excluir(7, 17), /há serviços ou agendamentos vinculados/);
    assert.equal(calls.at(-1).sql, 'ROLLBACK');
    assert.ok(!calls.some(({ sql }) => sql === 'COMMIT'));
    failure = new Error('Falha inesperada');
    failAt = /INSERT INTO public\.usuario/;
    await assert.rejects(() => Equipe.salvar(data), (error) => error === failure);
    assert.equal(calls.at(-1).sql, 'ROLLBACK');
    assert.equal(releases, 2);
  });
});
