import { describe, it, expect } from 'vitest';
import {
  parseValidDate,
  formatEventDate,
  computeDaysUntil,
  deriveEventStatus,
  normalizeEventPresentation,
} from '../utils/eventPresentation';

describe('Truthful event presentation & non-fabrication', () => {
  it('parseValidDate parses valid date strings and returns null for invalid dates', () => {
    expect(parseValidDate('2026-10-24')).toBeInstanceOf(Date);
    expect(parseValidDate('invalid-date')).toBeNull();
    expect(parseValidDate(null)).toBeNull();
    expect(parseValidDate(undefined)).toBeNull();
  });

  it('formatEventDate formats dates reliably and handles fallback strings', () => {
    expect(formatEventDate('2026-05-15T00:00:00Z', false)).toMatch(/May 15/);
    expect(formatEventDate(null)).toBeNull();
    expect(formatEventDate('TBA')).toBeNull(); // cleanString treats 'TBA' as null
  });

  it('deriveEventStatus deterministically derives open, closing, upcoming, and closed', () => {
    // Past deadline
    expect(
      deriveEventStatus({ registration_deadline: '2020-01-01' }).key
    ).toBe('closed');

    // Closed lifecycle state
    expect(
      deriveEventStatus({ lifecycle_state: 'ended' }).key
    ).toBe('closed');

    // Closing soon (5 days or less)
    const closingDate = new Date();
    closingDate.setDate(closingDate.getDate() + 2);
    expect(
      deriveEventStatus({ registration_deadline: closingDate.toISOString() }).key
    ).toBe('closing');

    // Far future deadline -> open
    const openDate = new Date();
    openDate.setDate(openDate.getDate() + 30);
    expect(
      deriveEventStatus({ registration_deadline: openDate.toISOString() }).key
    ).toBe('open');
  });

  it('normalizeEventPresentation never fabricates missing fields', () => {
    const raw = {
      id: 'h-1',
      title: 'Real Hackathon',
      // no prize_pool, no team_size, no venue
    };

    const normalized = normalizeEventPresentation(raw);
    expect(normalized.title).toBe('Real Hackathon');
    expect(normalized.prizeLabel).toBeNull();
    expect(normalized.eligibilityLabel).toBeNull();
    expect(normalized.locationLabel).toBeNull();
    expect(normalized.description).toBeNull();
  });

  it('normalizeEventPresentation maps platform and format labels accurately', () => {
    const raw = {
      id: 'h-2',
      title: 'Devfolio Virtual Hack',
      source: 'devfolio',
      format: 'online',
      prize_pool: '$10,000',
      eligibility: 'Open to all students',
    };

    const normalized = normalizeEventPresentation(raw);
    expect(normalized.sourceLabel).toBe('Devfolio');
    expect(normalized.formatKey).toBe('online');
    expect(normalized.formatLabel).toBe('Online');
    expect(normalized.prizeLabel).toBe('$10,000');
    expect(normalized.eligibilityLabel).toBe('Open to all students');
  });

  it('normalizeEventPresentation cleans dummy strings like n/a, unknown, none, tba', () => {
    const raw = {
      id: 'h-3',
      title: 'Cleaned Hackathon',
      organizer: 'N/A',
      venue: 'unknown',
      prize_pool: 'none',
      eligibility: 'null',
    };

    const normalized = normalizeEventPresentation(raw);
    expect(normalized.organizer).toBeNull();
    expect(normalized.locationLabel).toBeNull();
    expect(normalized.prizeLabel).toBeNull();
    expect(normalized.eligibilityLabel).toBeNull();
  });
});
