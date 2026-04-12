import { formatCurrency } from './utils/helpers';

test('formatCurrency returns naira-formatted value', () => {
  expect(formatCurrency(10000)).toContain('10,000');
});
