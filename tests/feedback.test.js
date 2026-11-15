const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup({ feedback = false } = {}) {
  const listeners = {};
  const tasks = [];
  const nodes = new Map();
  class Element {
    attributes = {};
    listeners = {};
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    focus() { this.focused = true; }
    remove() { nodes.delete(this.id); }
    insertAdjacentElement(_, element) { nodes.set(element.id, element); }
  }
  class HTMLFormElement extends Element {
    method = 'post';
    dataset = { confirm: 'Excluir este cadastro? Esta ação não pode ser desfeita.' };
    isConnected = true;
    submissions = 0;
    button = { disabled: false, form: this };
    querySelectorAll() { return [this.button]; }
    querySelector() { return this.invalidField; }
    requestSubmit(submitter) {
      this.lastSubmitter = submitter;
      if (this.invalidField) {
        emit('invalid', { target: this.invalidField });
        return;
      }
      const event = emit('submit', { target: this, submitter });
      if (!event.defaultPrevented) this.submissions++;
    }
  }
  const message = new Element();
  const cancel = new Element();
  const accept = new Element();
  const dialog = new Element();
  dialog.querySelector = (selector) => ({ '#confirmMessage': message, '[data-confirm-cancel]': cancel, '[data-confirm-accept]': accept })[selector];
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; dialog.listeners.close(); };
  const feedbackDialog = new Element();
  const feedbackClose = new Element();
  feedbackDialog.querySelector = (selector) => selector === '[data-feedback-close]' ? feedbackClose : null;
  feedbackDialog.showModal = () => { feedbackDialog.open = true; };
  feedbackDialog.close = () => { feedbackDialog.open = false; };
  const document = {
    addEventListener(name, listener, capture) {
      (listeners[name] ||= []).push({ listener, capture: Boolean(capture) });
    },
    querySelector: (selector) => selector === '#confirmDialog' ? dialog : feedback ? feedbackDialog : null,
    querySelectorAll: () => [],
    createElement: () => new Element(),
    getElementById: (id) => nodes.get(id)
  };
  function emit(name, props = {}) {
    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...props };
    for (const capture of [true, false]) {
      for (const entry of listeners[name] || []) {
        if (entry.capture === capture) entry.listener(event);
      }
    }
    return event;
  }
  const context = vm.createContext({ document, HTMLFormElement, window: { addEventListener() {} }, queueMicrotask: (task) => tasks.push(task) });
  // Mesmo carregamento da página: bloqueio de duplo envio antes do módulo de feedback.
  for (const file of ['form-submit.js', 'feedback.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js', file), 'utf8'), context);
  }
  emit('DOMContentLoaded');
  return { HTMLFormElement, Element, dialog, message, cancel, accept, feedbackDialog, feedbackClose, emit, nodes, flush: () => { while (tasks.length) tasks.shift()(); } };
}

test('mensagem abre ao carregar e fecha com OK ou clique fora sem enviar formulários', () => {
  for (const backdrop of [false, true]) {
    const ui = setup({ feedback: true });
    const form = new ui.HTMLFormElement();
    assert.equal(ui.feedbackDialog.open, true);
    assert.equal(ui.dialog.open, undefined);
    ui.feedbackDialog.listeners.click({ target: ui.feedbackClose });
    assert.equal(ui.feedbackDialog.open, true);
    if (backdrop) ui.feedbackDialog.listeners.click({ target: ui.feedbackDialog });
    else ui.feedbackClose.listeners.click();
    assert.equal(ui.feedbackDialog.open, false);
    assert.equal(form.submissions, 0);
    form.requestSubmit(form.button);
    assert.equal(ui.dialog.open, true);
    ui.accept.listeners.click();
    assert.equal(form.submissions, 1);
  }
});

test('diálogo renderiza sucesso ou erro com texto escapado e sem expor erros internos', async () => {
  const ejs = require('ejs');
  const render = (data) => ejs.renderFile(path.join(__dirname, '../views/partials/feedback.ejs'), data);
  assert.doesNotMatch(await render({}), /id="feedbackDialog"/);
  assert.doesNotMatch(await render({ error: new Error('Detalhes internos') }), /Detalhes internos|id="feedbackDialog"/);
  const success = await render({ success: 'Agendamento cadastrado.' });
  assert.match(success, /feedback-success/);
  assert.match(success, /Agendamento cadastrado\./);
  assert.match(success, /data-feedback-close autofocus>OK/);
  const error = await render({ error: 'CPF <inválido>', success: 'Agendamento cadastrado.' });
  assert.match(error, /feedback-error/);
  assert.match(error, /role="alertdialog"/);
  assert.match(error, /CPF &lt;inválido&gt;/);
  assert.doesNotMatch(error, /CPF <inválido>|Agendamento cadastrado\./);
});

test('cancelar, Esc e clique fora nunca excluem nem bloqueiam o formulário', () => {
  const ui = setup();
  const form = new ui.HTMLFormElement();
  for (const close of [() => ui.cancel.listeners.click(), () => { ui.dialog.listeners.cancel(); ui.dialog.close(); }, () => ui.dialog.listeners.click({ target: ui.dialog })]) {
    form.requestSubmit(form.button);
    assert.equal(ui.dialog.open, true);
    assert.equal(ui.message.textContent, form.dataset.confirm);
    assert.equal(form.submissions, 0);
    assert.equal(form.button.disabled, false);
    assert.equal(form.dataset.submitting, undefined);
    close();
    ui.accept.listeners.click();
    assert.equal(form.submissions, 0);
    assert.equal(ui.dialog.open, false);
  }
});

test('confirmar envia uma única vez, preserva o botão e ativa o bloqueio somente após aceitar', () => {
  const ui = setup();
  const form = new ui.HTMLFormElement();
  form.requestSubmit(form.button);
  form.requestSubmit(form.button);
  ui.dialog.listeners.click({ target: ui.message });
  assert.equal(ui.dialog.open, true);
  assert.equal(form.submissions, 0);
  ui.accept.listeners.click();
  ui.accept.listeners.click();
  form.requestSubmit(form.button);
  assert.equal(form.submissions, 1);
  assert.equal(form.lastSubmitter, form.button);
  assert.equal(form.button.disabled, true);
  assert.equal(form.attributes['aria-busy'], 'true');
  assert.equal(ui.dialog.open, false);
});

test('outro formulário não substitui a exclusão pendente; formulários comuns enviam diretamente', () => {
  const ui = setup();
  const first = new ui.HTMLFormElement();
  const second = new ui.HTMLFormElement();
  first.requestSubmit(first.button);
  second.requestSubmit(second.button);
  ui.accept.listeners.click();
  assert.equal(first.submissions, 1);
  assert.equal(second.submissions, 0);
  const ordinary = new ui.HTMLFormElement();
  ordinary.dataset = {};
  ordinary.requestSubmit(ordinary.button);
  assert.equal(ordinary.submissions, 1);
});

test('erros ficam associados ao campo, sem duplicação, e desaparecem ao corrigir ou limpar', () => {
  const ui = setup();
  const field = new ui.Element();
  field.validity = { valid: false };
  field.validationMessage = 'Preencha este campo.';
  field.setAttribute('aria-describedby', 'ajuda');
  const details = { tagName: 'DETAILS', open: false };
  field.parentElement = details;
  const form = new ui.HTMLFormElement();
  field.form = form;
  form.invalidField = field;
  const event = ui.emit('invalid', { target: field });
  ui.emit('invalid', { target: field });
  ui.flush();
  assert.equal(event.defaultPrevented, true);
  assert.equal(field.focused, true);
  assert.equal(details.open, true);
  assert.equal(ui.nodes.size, 1);
  assert.equal([...ui.nodes.values()][0].textContent, 'Preencha este campo.');
  assert.match(field.getAttribute('aria-describedby'), /^ajuda field-error-/);
  assert.equal(field.getAttribute('aria-invalid'), 'true');
  field.validity.valid = true;
  ui.emit('input', { target: field });
  assert.equal(ui.nodes.size, 0);
  assert.equal(field.getAttribute('aria-describedby'), 'ajuda');
  assert.equal(field.getAttribute('aria-invalid'), null);
  field.validity.valid = false;
  ui.emit('invalid', { target: field });
  ui.emit('reset', { target: form });
  ui.flush();
  assert.equal(ui.nodes.size, 0);
});

test('revalidação após confirmar mantém os dados e exige nova confirmação na próxima tentativa', () => {
  const ui = setup();
  const form = new ui.HTMLFormElement();
  form.requestSubmit(form.button);
  const field = new ui.Element();
  field.form = form;
  field.validity = { valid: false };
  field.validationMessage = 'Campo obrigatório.';
  form.invalidField = field;
  ui.accept.listeners.click();
  assert.equal(form.submissions, 0);
  assert.equal(form.button.disabled, false);
  delete form.invalidField;
  form.requestSubmit(form.button);
  assert.equal(ui.dialog.open, true);
  assert.equal(form.submissions, 0);
});
