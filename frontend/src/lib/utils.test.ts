import { formatDate, formatRelativeTime, readingTime, slugify, truncate, debounce, throttle } from './utils';

describe('Utils', () => {
  describe('formatDate', () => {
    it('formats date in pt-BR locale', () => {
      const date = new Date(2024, 0, 15);
      expect(formatDate(date)).toBe('15 de janeiro de 2024');
    });

    it('accepts string dates', () => {
      expect(formatDate(new Date(2024, 0, 15))).toBe('15 de janeiro de 2024');
    });

    it('supports different locales', () => {
      const date = new Date(2024, 0, 15);
      expect(formatDate(date, 'en')).toBe('January 15, 2024');
    });
  });

  describe('formatRelativeTime', () => {
    const now = new Date(2024, 5, 15, 12, 0, 0);

    it('formats the current moment', () => {
      expect(formatRelativeTime(now, 'pt-BR', now)).toBe('este minuto');
      expect(formatRelativeTime(now, 'en', now)).toBe('this minute');
    });

    it('formats yesterday per locale', () => {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      expect(formatRelativeTime(yesterday, 'pt-BR', now)).toBe('ontem');
      expect(formatRelativeTime(yesterday, 'en', now)).toBe('yesterday');
    });

    it('formats days ago per locale', () => {
      const threeDaysAgo = new Date(now);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      expect(formatRelativeTime(threeDaysAgo, 'pt-BR', now)).toBe('há 3 dias');
      expect(formatRelativeTime(threeDaysAgo, 'en', now)).toBe('3 days ago');
    });

    it('formats weeks ago per locale', () => {
      const twoWeeksAgo = new Date(now);
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      expect(formatRelativeTime(twoWeeksAgo, 'pt-BR', now)).toBe('há 2 semanas');
      expect(formatRelativeTime(twoWeeksAgo, 'en', now)).toBe('2 weeks ago');
    });

    it('formats months ago per locale', () => {
      const twoMonthsAgo = new Date(now);
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      expect(formatRelativeTime(twoMonthsAgo, 'pt-BR', now)).toBe('há 2 meses');
      expect(formatRelativeTime(twoMonthsAgo, 'en', now)).toBe('2 months ago');
    });

    it('formats years ago per locale', () => {
      const twoYearsAgo = new Date(now);
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      expect(formatRelativeTime(twoYearsAgo, 'pt-BR', now)).toBe('há 2 anos');
      expect(formatRelativeTime(twoYearsAgo, 'en', now)).toBe('2 years ago');
    });

    it('defaults to pt-BR', () => {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      expect(formatRelativeTime(yesterday, undefined, now)).toBe('ontem');
    });
  });

  describe('readingTime', () => {
    it('calculates reading time for short text', () => {
      const text = 'This is a short text with ten words total.';
      expect(readingTime(text)).toBe(1);
    });

    it('calculates reading time for longer text', () => {
      const text = 'word '.repeat(400); // 400 words
      expect(readingTime(text)).toBe(2);
    });

    it('returns at least 1 minute', () => {
      expect(readingTime('')).toBe(1);
      expect(readingTime('one')).toBe(1);
    });
  });

  describe('slugify', () => {
    it('converts to lowercase', () => {
      expect(slugify('Hello World')).toBe('hello-world');
    });

    it('removes accents', () => {
      expect(slugify('Olá Mundo')).toBe('ola-mundo');
    });

    it('replaces special chars with hyphens', () => {
      expect(slugify('Hello @ World!')).toBe('hello-world');
    });

    it('collapses multiple hyphens', () => {
      expect(slugify('Hello   World')).toBe('hello-world');
    });

    it('trims leading/trailing hyphens', () => {
      expect(slugify('---Hello World---')).toBe('hello-world');
    });
  });

  describe('truncate', () => {
    it('returns original if shorter than limit', () => {
      expect(truncate('Hi', 10)).toBe('Hi');
    });

    it('truncates and adds ellipsis', () => {
      expect(truncate('Hello World', 8)).toBe('Hello...'); // corta na última palavra
    });

    it('handles exact length', () => {
      expect(truncate('Hello', 5)).toBe('Hello');
    });
  });

  describe('debounce', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('delays function execution', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);
      
      debounced('a');
      debounced('b');
      debounced('c');
      
      expect(fn).not.toHaveBeenCalled();
      
      vi.advanceTimersByTime(100);
      
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('c');
    });
  });

  describe('throttle', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('limits function execution rate', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);
      
      throttled('a');
      throttled('b');
      throttled('c');
      
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('a');
      
      vi.advanceTimersByTime(100);
      
      throttled('d');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenCalledWith('d');
    });
  });
});