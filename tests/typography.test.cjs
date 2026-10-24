const test = require('node:test');
const assert = require('node:assert/strict');
const { commonTrailingPseudos } = require('@tailwindcss/typography/src/utils.js');
test('patched selector parser preserves typography pseudo-element extraction', () => {
  assert.deepEqual(commonTrailingPseudos('a::before, b::before'), ['::before', 'a, b']);
  assert.deepEqual(commonTrailingPseudos('a::before, b::after'), [null, 'a::before, b::after']);
  assert.deepEqual(commonTrailingPseudos('code:not(pre code)'), [null, 'code:not(pre code)']);
});
