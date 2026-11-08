import { browserLanguage, pageLanguageFor } from './language';

describe('page languages', () => {
  it('should keep French and English, and show any other language in English', () => {
    expect(pageLanguageFor('fr-BE')).toBe('fr');
    expect(pageLanguageFor('EN')).toBe('en');
    expect(pageLanguageFor('nl')).toBe('en');
    expect(pageLanguageFor('')).toBeNull();
    expect(pageLanguageFor(null)).toBeNull();
  });

  it("should take the browser's first language the pages know, else French", () => {
    expect(browserLanguage(['nl-BE', 'en-GB', 'fr'])).toBe('en');
    expect(browserLanguage(['de'])).toBe('fr');
    expect(browserLanguage([])).toBe('fr');
  });
});
