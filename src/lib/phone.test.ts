import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PHONE_LENGTH,
  clampPhoneInput,
  formatPhone,
  isValidPhone,
  normalisePhone,
  optionalPhoneField,
  phoneField,
} from './phone';

test('every way of writing the same number normalises to ten bare digits', () => {
  for (const written of [
    '9833440021',
    '+919833440021',
    '+91 98334 40021',
    '91 9833440021',
    '0091-9833440021',
    '09833440021',
    '(98334) 40021',
    '  9833440021  ',
  ]) {
    assert.equal(normalisePhone(written), '9833440021', written);
  }
});

test('a number is valid only at exactly ten digits', () => {
  assert.equal(PHONE_LENGTH, 10);
  assert.ok(isValidPhone('9833440021'));
  assert.ok(isValidPhone('+91 98334 40021'));
  assert.ok(!isValidPhone('983344002'), 'nine digits');
  assert.ok(!isValidPhone('98334400211'), 'eleven digits');
  assert.ok(!isValidPhone(''));
  assert.ok(!isValidPhone('not a number'));
  assert.ok(!isValidPhone(null));
});

test('typing is clamped to what can still become a valid number', () => {
  assert.equal(clampPhoneInput('98a33b44c0021x'), '9833440021', 'letters never land in the field');
  assert.equal(clampPhoneInput('9833440021999'), '9833440021', 'an eleventh digit is not accepted');
  assert.equal(clampPhoneInput('+91 98334 40021'), '9833440021', 'a pasted number loses its country code');
  assert.equal(clampPhoneInput('0091-9833440021'), '9833440021');
  assert.equal(clampPhoneInput('09833440021'), '9833440021');
  assert.equal(clampPhoneInput('letters only'), '');
});

test('a number keyed in one character at a time ends up correct', () => {
  for (const typed of ['+919833440021', '9833440021', '09833440021', '+91 98334 40021']) {
    let field = '';
    for (const character of typed) field = clampPhoneInput(field + character);
    assert.equal(field, '9833440021', `typing ${typed}`);
  }
});

test('a ten-digit number that itself begins 91 is left alone', () => {
  assert.equal(clampPhoneInput('9123456789'), '9123456789');
  assert.equal(normalisePhone('9123456789'), '9123456789');
  assert.ok(isValidPhone('9123456789'));
});

test('the required field accepts any written form and returns the bare digits', () => {
  assert.equal(phoneField.parse('+91 98334 40021'), '9833440021');
  assert.equal(phoneField.safeParse('12345').success, false);
  assert.equal(phoneField.safeParse('').success, false);
  const failure = phoneField.safeParse('12345');
  assert.match(failure.success ? '' : failure.error.issues[0].message, /10-digit/);
});

test('the optional field treats an empty form field as "not provided"', () => {
  assert.equal(optionalPhoneField.parse(''), undefined);
  assert.equal(optionalPhoneField.parse(undefined), undefined);
  assert.equal(optionalPhoneField.parse('09833440021'), '9833440021');
  assert.equal(optionalPhoneField.safeParse('123').success, false);
});

test('display grouping leaves anything unrecognised alone', () => {
  assert.equal(formatPhone('9833440021'), '98334 40021');
  assert.equal(formatPhone('+919833440021'), '98334 40021');
  assert.equal(formatPhone(''), '');
  assert.equal(formatPhone(null), '');
  assert.equal(formatPhone('extension 42'), 'extension 42');
});
