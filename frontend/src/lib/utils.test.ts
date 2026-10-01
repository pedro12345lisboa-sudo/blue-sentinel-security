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
      expect(formatDate(date, 'en-US')).toBe('January 15, 2024');
    });
  });

  describe('formatRelativeTime', () => {
    it('returns "Hoje" for today', () => {
      expect(formatRelativeTime(new Date())).toBe('Hoje');
    });

    it('returns "Ontem" for yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(formatRelativeTime(yesterday)).toBe('Ontem');
    });

    it('returns days ago for recent dates', () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      expect(formatRelativeTime(threeDaysAgo)).toBe('3 dias atrás');
    });

    it('returns weeks ago for older dates', () => {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      expect(formatRelativeTime(twoWeeksAgo)).toBe('2 semanas atrás');
    });

    it('returns months ago for older dates', () => {
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      expect(formatRelativeTime(twoMonthsAgo)).toBe('2 meses atrás');
    });

    it('returns years ago for very old dates', () => {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      expect(formatRelativeTime(twoYearsAgo)).toBe('2 anos atrás');
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