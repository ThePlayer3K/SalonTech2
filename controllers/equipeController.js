const Equipe = require('../models/Equipe');
const { isAdmin, isMaster } = require('../middlewares/auth');

function renderPage(res, req, people, options = {}) {
  return res.render('pages/equipe', {
    title: options.selfOnly ? 'Minha conta' : 'Equipe e usuários',
    user: req.session.user,
    people,
    selfOnly: Boolean(options.selfOnly),
    error: options.error || req.query.erro || null,
    success: options.success || (req.query.salvo ? 'Alterações salvas.' : null)
  });
}

async function index(req, res, next) {
  try {
    const people = await Equipe.listar();
    return renderPage(res, req, people);
  } catch (error) {
    return next(error);
  }
}

async function profile(req, res, next) {
  try {
    if (isMaster(req.session.user)) {
      return acessoNegado(res);
    }

    const person = await Equipe.buscarPorUsuario(req.session.user.id);
    if (!person) {
      return res.status(404).render('pages/404', { title: 'Conta não encontrada' });
    }

    return renderPage(res, req, [person], { selfOnly: true });
  } catch (error) {
    return next(error);
  }
}

function parseForm(body, existing = null) {
  const login = String(body.login || '').trim();
  const nome = String(body.nome || '').trim();
  const papel = String(body.papel || existing?.papel || 'profissional');
  const senha = String(body.senha || '');
  validarCredenciais({ nome, login, papel, senha }, existing);
  const salario = normalizarSalario(body.salario);

  return {
    nome,
    login,
    senha,
    papel,
    cpf: String(body.cpf || '').trim(),
    telefone: String(body.telefone || '').trim(),
    cargo: String(body.cargo || '').trim(),
    tipoPagamento: String(body.tipoPagamento || '').trim(),
    salario
  };
}

function validarCredenciais({ nome, login, papel, senha }, contaExistente) {
  if (!nome || !login) {
    throw new Error('Nome do funcionário e usuário são obrigatórios.');
  }
  if (!['admin', 'profissional'].includes(papel)) {
    throw new Error('Perfil de acesso inválido.');
  }
  if (!contaExistente && senha.length < 8) {
    throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  }
  if (senha && senha.length < 8) {
    throw new Error('A nova senha precisa ter pelo menos 8 caracteres.');
  }
}

function normalizarSalario(valor) {
  const entrada = String(valor ?? '').trim();
  if (!entrada) return null;

  const texto = entrada.replace(/^R\$\s*/, '');
  const formatoBrasileiro = /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/;
  const formatoDecimalComPonto = /^\d+(?:\.\d{1,2})?$/;
  if (!formatoBrasileiro.test(texto) && !formatoDecimalComPonto.test(texto)) {
    throw new Error('Informe um salário válido.');
  }

  const possuiMilhares = /^\d{1,3}(?:\.\d{3})+$/.test(texto);
  let textoNormalizado = texto;
  // Pontos de agrupamento são removidos; o ponto decimal é mantido.
  if (texto.includes(',') || possuiMilhares) {
    textoNormalizado = texto.replace(/\./g, '').replace(',', '.');
  }

  const salario = Number(textoNormalizado);
  if (!Number.isFinite(salario) || salario < 0) {
    throw new Error('Informe um salário válido.');
  }
  return salario;
}

function podeGerenciarConta(ator, conta) {
  const loginDoMaster = String(process.env.ADMIN_NAME || '').trim().toLocaleLowerCase('pt-BR');
  const loginDaConta = String(conta?.login || '').trim().toLocaleLowerCase('pt-BR');
  const contaProtegida = conta?.papel === 'master' || (loginDoMaster && loginDaConta === loginDoMaster);

  if (!conta || contaProtegida) {
    return false;
  }
  if (isMaster(ator)) {
    return true;
  }
  if (ator.papel === 'admin') {
    const propriaConta = Number(conta.usuario_id) === Number(ator.id);
    return conta.papel !== 'admin' || propriaConta;
  }
  return false;
}

function podeEditarConta(ator, conta, edicaoPropria, usuarioId) {
  if (!conta) return false;
  if (edicaoPropria) {
    return usuarioId === Number(ator.id) && !isMaster(ator);
  }
  return podeGerenciarConta(ator, conta);
}

function acessoNegado(res) {
  return res.status(403).render('pages/403', { title: 'Acesso negado' });
}

async function atualizarSessaoDaConta(sessao, dados) {
  sessao.user.nome = dados.login;
  sessao.user.papel = dados.papel;
  await new Promise((resolve, reject) => {
    sessao.save((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function create(req, res, next) {
  try {
    if (!isAdmin(req.session.user)) {
      return acessoNegado(res);
    }

    const dados = parseForm(req.body);
    await Equipe.salvar(dados);
    return res.redirect('/equipe?salvo=1');
  } catch (error) {
    if (!error.code) {
      return renderPage(res, req, await Equipe.listar(), { error: error.message });
    }
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    const usuarioId = Number(req.params.usuarioId || req.session.user.id);
    const conta = await Equipe.buscarPorUsuario(usuarioId);
    const edicaoPropria = req.path === '/minha-conta';
    if (!podeEditarConta(req.session.user, conta, edicaoPropria, usuarioId)) {
      return acessoNegado(res);
    }

    const dados = parseForm(req.body, conta);
    if (edicaoPropria) {
      // Minha conta permite alterar credenciais, preservando os dados profissionais.
      Object.assign(dados, {
        nome: conta.nome,
        cpf: conta.cpf || '',
        telefone: conta.telefone || '',
        cargo: conta.cargo || '',
        tipoPagamento: conta.tipo_pagamento || '',
        salario: conta.salario
      });
    }
    const alteracaoDePerfilProibida = req.session.user.papel === 'profissional' && dados.papel !== conta.papel;
    if (conta.papel === 'master' || alteracaoDePerfilProibida) {
      return acessoNegado(res);
    }

    await Equipe.salvar({
      ...dados,
      usuarioId: conta.usuario_id,
      funcionarioId: conta.funcionario_id
    });
    const contaDaSessao = Number(req.session.user.id) === Number(conta.usuario_id);
    if (edicaoPropria || contaDaSessao) {
      await atualizarSessaoDaConta(req.session, dados);
    }

    return res.redirect(`${edicaoPropria ? '/minha-conta' : '/equipe'}?salvo=1`);
  } catch (error) {
    if (!error.code) {
      const selfOnly = req.path === '/minha-conta';
      let people;
      if (selfOnly) {
        const person = await Equipe.buscarPorUsuario(req.session.user.id);
        people = [person].filter(Boolean);
      } else {
        people = await Equipe.listar();
      }
      return renderPage(res, req, people, { selfOnly, error: error.message });
    }
    return next(error);
  }
}

async function remove(req, res, next) {
  try {
    if (!isAdmin(req.session.user)) {
      return acessoNegado(res);
    }

    const conta = await Equipe.buscarPorUsuario(Number(req.params.usuarioId));
    if (!podeGerenciarConta(req.session.user, conta)) {
      return acessoNegado(res);
    }

    await Equipe.excluir(conta.usuario_id, conta.funcionario_id);
    return res.redirect('/equipe?salvo=1');
  } catch (error) {
    if (!error.code) {
      return renderPage(res, req, await Equipe.listar(), { error: error.message });
    }
    return next(error);
  }
}

module.exports = { index, profile, create, update, remove };
