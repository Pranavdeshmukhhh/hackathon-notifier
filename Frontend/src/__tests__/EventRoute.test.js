import { describe, expect, it } from 'vitest';
import { eventHash, eventShareUrl, readEventRoute } from '../utils/eventRoute';

describe('Event route links', () => {
  it('retains existing homepage and terms anchors', () => {
    expect(readEventRoute('#terms').view).toBe('terms');
    expect(readEventRoute('#events').view).toBe('radar');
    expect(readEventRoute('#event/malformed')).toEqual({ view: 'event', id: 'malformed' });
  });
  it('creates stable identifier links and rejects unsafe identifiers', () => {
    expect(eventHash('ABCDEF0123456789ABCDEF01')).toBe('#event/abcdef0123456789abcdef01');
    expect(eventHash('../../admin')).toBeNull();
  });
  it('shares only the event without query data or deployment-specific path rewrites', () => {
    expect(eventShareUrl('abcdef0123456789abcdef01', 'https://example.com/app/?q=web&lat=12&lng=34#events')).toBe('https://example.com/app/#event/abcdef0123456789abcdef01');
  });
});
