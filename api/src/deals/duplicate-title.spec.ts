import { nextDuplicateTitle } from './duplicate-title';

describe('nextDuplicateTitle', () => {
  it('numbers copies of the original and of an existing copy', () => {
    expect(nextDuplicateTitle('Proposal', [])).toBe('Proposal copy 1');
    expect(nextDuplicateTitle('Proposal copy 1', [
      'Proposal copy 1', 'Proposal copy 2', 'Other copy 9',
    ])).toBe('Proposal copy 3');
  });

  it('ignores unrelated suffixes and keeps increasing after a deleted number', () => {
    expect(nextDuplicateTitle('Offer', [
      'Offer copy 2', 'Offer copy draft', 'Offer copy 20 extra',
    ])).toBe('Offer copy 3');
  });
});
