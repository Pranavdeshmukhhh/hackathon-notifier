import {afterEach,describe,it,expect,vi} from 'vitest';
import {fetchPublicEvents,submitAutoListUrl,fetchEventById,normalizeApiBase} from '../utils/api';
import {getEventIdFromUrl,pushEventRoute} from '../utils/eventRoute';
import {calculateDistanceKm,syncDiscoveryStateToUrl,filterAndSortEvents} from '../utils/discoveryQuery';
import {normalizeEventPresentation,deriveEventStatus} from '../utils/eventPresentation';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();window.history.replaceState({},'','/');});
describe('Phase 1 repairs',()=>{
 it('accepts historical events endpoint configuration',()=>{
  expect(normalizeApiBase('https://example.com/api/events/')).toBe('https://example.com/api');
  expect(normalizeApiBase('https://example.com/api/v1/events')).toBe('https://example.com/api/v1');
  expect(normalizeApiBase(' ')).toBe('/api');
 });
 it('does not report a rejected or unconfirmed submission as success',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({success:false,message:'Not queued'})}));
  await expect(submitAutoListUrl('https://example.com')).rejects.toThrow('Not queued');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({})}));
  await expect(submitAutoListUrl('https://example.com')).rejects.toThrow('did not confirm');
 });
 it('selects an array envelope and does not retry a transport failure',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({data:{},items:[{title:'Fixture'}]})}));
  expect((await fetchPublicEvents()).events).toHaveLength(1);
  const fetch=vi.fn().mockRejectedValue(new Error('Network unavailable'));vi.stubGlobal('fetch',fetch);
  await expect(fetchPublicEvents()).rejects.toThrow('Network unavailable');expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('rejects invalid successful detail responses',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({data:[]})}));
  await expect(fetchEventById('a')).rejects.toThrow('invalid event');
 });
 it('closes legacy path and id deep links without reopening them',()=>{
  for(const path of ['/events/abc?q=ai','/?id=abc&q=ai']){
   window.history.replaceState({},'',path);expect(getEventIdFromUrl()).toBe('abc');
   pushEventRoute(null);expect(getEventIdFromUrl()).toBeNull();expect(window.location.search).toContain('q=ai');
  }
  window.history.replaceState({},'','/?event=abc#directory');syncDiscoveryStateToUrl({search:'AI'});
  expect(window.location.hash).toBe('#directory');expect(getEventIdFromUrl()).toBe('abc');
 });
 it('handles physical aliases, future registration and today after midnight',()=>{
  expect(normalizeEventPresentation({mode:'On-site'}).formatKey).toBe('offline');
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-30T12:00:00Z'));
  expect(deriveEventStatus({deadline_iso:'2026-10-30'}).deadlineSummary).toContain('today');
  expect(deriveEventStatus({registration_opens_at:'2026-11-01T12:00:00Z'}).key).toBe('upcoming');
 });
 it('rejects invalid coordinates and does not substitute event dates when sorting deadlines',()=>{
  expect(calculateDistanceKm(0,0,0,0)).toBe(0);expect(calculateDistanceKm(91,0,0,0)).toBeNull();
  expect(calculateDistanceKm(Infinity,0,0,0)).toBeNull();
  const events=[{id:'no-registration',title:'Fixture',event_start:'2026-01-01'},{id:'registration',title:'Fixture',deadline_iso:'2099-01-01'}];
  expect(filterAndSortEvents(events)[0].id).toBe('registration');
 });
 it('times out a stalled request once without retrying another route',async()=>{
  vi.useFakeTimers();
  const fetch=vi.fn((url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))));
  vi.stubGlobal('fetch',fetch);
  const pending=expect(fetchPublicEvents()).rejects.toThrow('taking a little longer');
  await vi.advanceTimersByTimeAsync(12000);await pending;expect(fetch).toHaveBeenCalledTimes(1);
 });

});
