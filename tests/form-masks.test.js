const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/js/form-masks.js'), 'utf8');

function browser(fields = []) {
  const listeners = {};
  const timers = [];
  const document = {
    activeElement: null,
    addEventListener(name, callback) { listeners[name] = callback; },
    querySelectorAll() { return fields; }
  };
  const context = vm.createContext({ document, setTimeout: (callback) => timers.push(callback) });
  vm.runInContext(source, context);
  listeners.DOMContentLoaded();
  return { context, document, timers };
}

class Input {
  constructor(mask, value = '', constraints = {}) {
    this.dataset = { mask, ...constraints };
    this.listeners = {};
    this.resetListeners = [];
    this.form = { addEventListener: (name, callback) => { if (name === 'reset') this.resetListeners.push(callback); } };
    this.value = value;
  }
  set value(value) { this.text = value; this.setSelectionRange(value.length, value.length); }
  get value() { return this.text; }
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  setCustomValidity(message) { this.error = message; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  fire(name, data = {}) {
    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...data };
    this.listeners[name]?.(event);
    return event;
  }
  type(value, caret = value.length) {
    this.value = value;
    this.setSelectionRange(caret, caret);
    this.fire('input');
  }
  paste(text) { return this.fire('paste', { clipboardData: { getData: () => text } }); }
}

test('CPF e telefone são formatados progressivamente sem perder dígitos', () => {
  const { context } = browser();
  const cpf = ['', '1', '12', '123', '123.4', '123.45', '123.456', '123.456.7', '123.456.78', '123.456.789', '123.456.789-0', '123.456.789-01'];
  for (let size = 0; size <= 11; size++) assert.equal(context.formatCpf('12345678901'.slice(0, size)), cpf[size]);
  assert.equal(context.formatCpf('123.456.789-01abc99'), '123.456.789-01');
  for (const [value, expected] of [
    ['', ''], ['1', '(1'], ['11', '(11'], ['119', '(11) 9'], ['113456', '(11) 3456'],
    ['1134567', '(11) 3456-7'], ['1134567890', '(11) 3456-7890'], ['11987654321', '(11) 98765-4321'],
    ['+55 (11) 98765-4321', '(11) 98765-4321'], ['55987654321', '(55) 98765-4321']
  ]) assert.equal(context.formatPhone(value), expected, value);
});

test('valores salvos e colados mantêm reais e centavos, inclusive inteiros e zero', () => {
  const values = [
    ['', ''], ['200', '200,00'], ['200.00', '200,00'], ['200.5', '200,50'], ['0', '0,00'],
    ['0.01', '0,01'], ['1234.56', '1.234,56'], ['1.234,56', '1.234,56'], ['1.234', '1.234,00'],
    ['R$ 200,50', '200,50'], ['99999999.99', '99.999.999,99']
  ];
  for (const [value, expected] of values) {
    const input = new Input('currency', value, { min: '0', max: '99999999.99' });
    browser([input]);
    assert.equal(input.value, expected, value);
    assert.equal(input.error, '', value);
    input.setSelectionRange(0, input.value.length);
    assert.ok(input.paste(value).defaultPrevented);
    assert.equal(input.value, expected, `colagem: ${value}`);
  }
  const invalid = new Input('currency', '-100', { min: '0', max: '99999999.99' });
  browser([invalid]);
  assert.equal(invalid.value, '-100');
  assert.ok(invalid.error);
});

test('digitação monetária, edição no meio e exclusão junto a separadores preservam o cursor', () => {
  const input = new Input('currency', '', { min: '0', max: '99999999.99' });
  const { document } = browser([input]);
  document.activeElement = input;
  for (const [value, expected] of [['1', '0,01'], ['0,012', '0,12'], ['0,123', '1,23'], ['123456', '1.234,56']]) {
    input.type(value);
    assert.equal(input.value, expected);
    assert.equal(input.selectionStart, expected.length);
  }
  input.type('1.934,56', 3);
  assert.equal(input.value, '1.934,56');
  assert.equal(input.selectionStart, 3);
  input.setSelectionRange(2, 2);
  assert.ok(input.fire('beforeinput', { inputType: 'deleteContentBackward' }).defaultPrevented);
  assert.equal(input.value, '934,56');
  assert.equal(input.selectionStart, 0);
  input.type('10000000000');
  assert.ok(input.error, 'valor acima do limite não pode ser enviado');
  input.type('');
  assert.equal(input.value, '');
  assert.equal(input.error, '');
});

test('percentuais aceitam vírgula ou ponto, duas casas decimais e validam o intervalo de 0 a 100', () => {
  const input = new Input('percentage', '35.50', { min: '0', max: '100' });
  browser([input]);
  assert.equal(input.value, '35,50');
  for (const [value, expected] of [['12.345', '12,34'], [',5', '0,5'], ['0', '0'], ['100,00', '100,00']]) {
    input.type(value);
    assert.equal(input.value, expected);
    assert.equal(input.error, '');
  }
  input.type('100,01');
  assert.ok(input.error);
  input.type('35,');
  input.fire('blur');
  assert.equal(input.value, '35');
  assert.equal(input.error, '');
});

test('estoque e duração aceitam somente inteiros e respeitam seus limites', () => {
  const quantity = new Input('integer', '0', { min: '0', max: '2147483647' });
  const duration = new Input('integer', '0', { min: '1', max: '2147483647' });
  browser([quantity, duration]);
  assert.equal(quantity.error, '');
  assert.ok(duration.error);
  duration.type('0030');
  assert.equal(duration.value, '30');
  assert.equal(duration.error, '');
  quantity.type('2147483647');
  assert.equal(quantity.error, '');
  quantity.type('2147483648');
  assert.ok(quantity.error);
  for (const data of ['.', ',', 'e', '-', '+']) assert.ok(quantity.fire('beforeinput', { data }).defaultPrevented);
  quantity.type('12');
  for (const value of ['1.5', '1,5', '1e2', '-5']) {
    assert.ok(quantity.paste(value).defaultPrevented);
    assert.equal(quantity.value, '12', 'colagem inválida não transforma quantidades');
  }
});

test('colagem de CPF e telefone é tratada antes do limite de caracteres do campo', () => {
  const cpf = new Input('cpf');
  const phone = new Input('phone');
  browser([cpf, phone]);
  assert.ok(cpf.paste('123.456.789-01').defaultPrevented);
  assert.equal(cpf.value, '123.456.789-01');
  assert.ok(phone.paste('+55 (11) 98765-4321').defaultPrevented);
  assert.equal(phone.value, '(11) 98765-4321');
});

test('restaurar o formulário preserva valores monetários e campos de consulta ficam intactos', () => {
  const salary = new Input('currency', '200');
  const readonly = new Input('currency', 'R$ 200,00');
  readonly.readOnly = true;
  const freeText = new Input('unknown', 'Shampoo 3 em 1 — ação & brilho');
  const { timers } = browser([salary, readonly, freeText]);
  salary.type('98765');
  salary.resetListeners.forEach((callback) => callback());
  salary.value = '200'; // O navegador restaura o valor original após o evento reset.
  timers.forEach((callback) => callback());
  assert.equal(salary.value, '200,00');
  assert.equal(readonly.value, 'R$ 200,00');
  assert.equal(freeText.value, 'Shampoo 3 em 1 — ação & brilho');
  assert.deepEqual(Object.keys(readonly.listeners), []);
});
