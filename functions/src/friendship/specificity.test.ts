import { isGenericAppreciation } from './specificity';

describe('isGenericAppreciation', () => {
  it.each([
    'thanks',
    'love you',
    'thanks so much',
    'you are the best',
    'love you so much',
    'thanks!',
    'so sweet',
    'awesome',
  ])('flags %p as generic', (text) => {
    expect(isGenericAppreciation(text)).toBe(true);
  });

  it.each([
    'thanks for picking up the kids today',
    'I loved how patient you were with my mom on the phone',
    'you noticed I was tired and started dinner — that meant a lot',
    'the way you laughed at my dumb joke this morning made my day',
  ])('does NOT flag specific %p', (text) => {
    expect(isGenericAppreciation(text)).toBe(false);
  });

  it('does not flag blank text (empty input is not "generic")', () => {
    expect(isGenericAppreciation('')).toBe(false);
    expect(isGenericAppreciation('   ')).toBe(false);
  });

  it('handles punctuation', () => {
    expect(isGenericAppreciation('thanks!!!')).toBe(true);
    expect(isGenericAppreciation('you, the best!')).toBe(true);
  });

  it('passes once sufficient length is reached even with stopwords', () => {
    // 25+ chars triggers the length escape hatch — we trust the user
    // had enough room to be specific even if the word distribution
    // is heavy on stopwords.
    expect(
      isGenericAppreciation('thanks so much for everything you do today'),
    ).toBe(false);
  });
});
