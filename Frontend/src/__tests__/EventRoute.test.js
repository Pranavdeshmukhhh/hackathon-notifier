import { describe, expect, it } from 'vitest';
import {
  getEventIdFromUrl,
  buildEventShareUrl,
  pushEventRoute,
} from '../utils/eventRoute';

describe('Event route links & history preservation', () => {
  it('extracts event ID from query parameter ?event=...', () => {
    const loc = { search: '?event=hack-123', pathname: '/' };
    expect(getEventIdFromUrl(loc)).toBe('hack-123');
  });

  it('extracts event ID from fallback query ?id=...', () => {
    const loc = { search: '?id=hack-456', pathname: '/' };
    expect(getEventIdFromUrl(loc)).toBe('hack-456');
  });

  it('extracts event ID from pathname /events/:id', () => {
    const loc = { search: '', pathname: '/events/my-hackathon' };
    expect(getEventIdFromUrl(loc)).toBe('my-hackathon');
  });

  it('returns null when no event parameter is present', () => {
    const loc = { search: '?q=ai', pathname: '/' };
    expect(getEventIdFromUrl(loc)).toBeNull();
  });

  it('buildEventShareUrl sets or clears event query parameter', () => {
    const loc = { href: 'https://example.com/directory?q=ai' };
    const shareUrl = buildEventShareUrl('hack-999', loc);
    expect(shareUrl).toContain('event=hack-999');

    const clearUrl = buildEventShareUrl(null, { href: 'https://example.com/directory?event=hack-999' });
    expect(clearUrl).not.toContain('event=');
  });

  it('pushEventRoute updates window history without breaking state', () => {
    if (typeof window !== 'undefined') {
      pushEventRoute('event-xyz');
      expect(window.location.search).toContain('event=event-xyz');
      pushEventRoute(null);
      expect(window.location.search).not.toContain('event=');
    }
  });
});
