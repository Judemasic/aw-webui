const color = require('~/util/color');

const testClasses = [
  {
    name: ['Test', 'Subtest'],
    rule: { type: 'regex', pattern: 'subtest' },
    data: { color: '#F00' },
  },
  {
    name: ['Test', 'Subtest', 'Subsubtest'],
    rule: { type: 'regex', pattern: 'subsubtest' },
  },
];

test('returns parent category color as fallback', () => {
  const _color = color.getColorFromCategory(testClasses[1], testClasses);
  expect(_color).toEqual('#F00');
});

// Combined colours its blocks by category now, via getCategoryColorForLabel. The
// combined track's label is the app name alone, which is what these pin.
const labelClasses = [
  { name: ['Work'], rule: { type: 'regex', regex: 'vim|Ghidra' }, data: { color: '#A5D6A7' } },
  { name: ['Work', 'Deep'], rule: { type: 'regex', regex: 'Ghidra' } },
  { name: ['Comms'], rule: { type: 'regex', regex: 'Slack' }, data: { color: '#80CBC4' } },
];

test('an app label takes its category colour', () => {
  expect(color.getCategoryColorForLabel('vim', labelClasses)).toEqual('#A5D6A7');
  expect(color.getCategoryColorForLabel('Slack', labelClasses)).toEqual('#80CBC4');
});

test('a subcategory with no colour of its own inherits its parent', () => {
  // Deepest match wins, and Deep sets no colour, so it must come out as Work's.
  expect(color.getCategoryColorForLabel('Ghidra', labelClasses)).toEqual('#A5D6A7');
});

test('an uncategorised label does not collapse into one colour', () => {
  // Two unmatched apps must stay distinguishable, otherwise every uncategorised
  // block in the day becomes the same block.
  const a = color.getCategoryColorForLabel('SomeUnknownApp', labelClasses);
  const b = color.getCategoryColorForLabel('AnotherUnknownApp', labelClasses);
  expect(a).not.toEqual(b);
});

test('an empty label does not throw', () => {
  expect(typeof color.getCategoryColorForLabel('', labelClasses)).toEqual('string');
  expect(typeof color.getCategoryColorForLabel(null, labelClasses)).toEqual('string');
});
