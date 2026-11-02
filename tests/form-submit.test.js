const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('formulários bloqueiam duplo envio e recuperam os botões ao voltar pelo navegador', () => {
  const listeners = {};
  class HTMLFormElement {
    method = 'post';
    dataset = {};
    buttons = [{ disabled: false }];
    attributes = {};
    setAttribute(key, value) { this.attributes[key] = value; }
    removeAttribute(key) { delete this.attributes[key]; }
    querySelectorAll() { return this.buttons; }
  }
  const form = new HTMLFormElement();
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/form-submit.js'), 'utf8'), {
    HTMLFormElement,
    document: { addEventListener: (name, listener) => { listeners[name] = listener; }, querySelectorAll: () => [form] },
    window: { addEventListener: (name, listener) => { listeners[name] = listener; } }
  });
  const event = () => ({ target: form, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } });
  const first = event();
  listeners.submit(first);
  assert.equal(first.defaultPrevented, false);
  assert.equal(form.buttons[0].disabled, true);
  assert.equal(form.attributes['aria-busy'], 'true');
  const second = event();
  listeners.submit(second);
  assert.equal(second.defaultPrevented, true);
  listeners.pageshow();
  assert.equal(form.buttons[0].disabled, false);
  assert.equal(form.dataset.submitting, undefined);
  const canceled = event();
  canceled.defaultPrevented = true;
  listeners.submit(canceled);
  assert.equal(form.buttons[0].disabled, false);
  form.method = 'get';
  listeners.submit(event());
  assert.equal(form.dataset.submitting, undefined);
});
