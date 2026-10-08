import { describe, it, expect } from 'vitest';
import { listedText, safeRegistrationUrl, eventFormat, eventLocation, eventTeam, eventDeadline } from '../utils/eventPresentation';

describe('Truthful event presentation', () => {
  it.each([null, undefined, 'TBA', 'Not specified', 'N/A', {}, NaN])('treats %s as unknown', value => expect(listedText(value)).toBe(''));
  it.each(['javascript:alert(1)', 'data:text/html,test', 'https://user:secret@example.com', '/relative'])('rejects unsafe registration URL %s', value => expect(safeRegistrationUrl(value)).toBeNull());
  it.each([['Virtual', 'Online'], ['Online + Hybrid', 'Hybrid'], ['Onsite', 'In person'], ['In-person', 'In person'], [null, 'Not listed']])('normalizes format %s', (value, expected) => expect(eventFormat(value)).toBe(expected));
  it('does not guess missing location and removes duplicate mode/venue text', () => {
    expect(eventLocation({})).toBe('Not listed');
    expect(eventLocation({ mode: 'Virtual' })).toBe('Online');
    expect(eventLocation({ mode: 'Hybrid', location: 'Hybrid' })).toBe('Not listed');
    expect(eventLocation({ venue: 'Campus', location: 'Campus, Pune, Offline' })).toBe('Campus, Pune');
  });
  it('preserves partial team rules and rejects contradictory ranges', () => {
    expect(eventTeam({})).toBe('Not listed');
    expect(eventTeam({ max_team_size: '4' })).toBe('Up to 4 members');
    expect(eventTeam({ min_team_size: 2 })).toBe('At least 2 members');
    expect(eventTeam({ min_team_size: 5, max_team_size: 2 })).toBe('Check organizer');
    expect(eventTeam({ min_team_size: 1, max_team_size: 1 })).toBe('Solo');
    expect(eventTeam({ min_team_size: false, max_team_size: -2 })).toBe('Not listed');
  });
  it('keeps calendar deadlines on their UTC date across time zones', () => {
    const result = eventDeadline({ deadline_iso: '2026-10-09' }, new Date('2026-10-09T23:30:00-07:00'));
    expect(result.iso).toBe('2026-10-09');
    expect(result.text).toBe('9 Oct 2026');
    expect(result.note).toBe('');
    expect(eventDeadline({ deadline_iso: '2026-10-10' }, new Date('2026-10-09T12:00:00Z')).note).toBe('Closes tomorrow');
  });
  it('rejects invalid calendar dates and preserves a supplied human-readable deadline', () => {
    expect(eventDeadline({ deadline_iso: '2026-02-31' }).text).toBe('Not listed');
    expect(eventDeadline({ deadline: 'See organizer schedule' }).text).toBe('See organizer schedule');
  });
});
