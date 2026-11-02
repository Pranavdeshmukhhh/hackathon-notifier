import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,waitFor,act,screen} from '@testing-library/react';
import App from '../App';
afterEach(()=>{vi.unstubAllGlobals();window.history.replaceState({},'','/');});
it('ignores a late detail response after browser history closes the event',async()=>{
 const pending=[];
 window.history.replaceState({},'','/?event=aaaaaaaaaaaaaaaaaaaaaaaa');
 vi.stubGlobal('scrollTo',vi.fn());
 vi.stubGlobal('fetch',vi.fn(url=>String(url).includes('/hackathons/')
  ?new Promise(resolve=>pending.push(resolve))
  :Promise.resolve({ok:true,json:async()=>({success:true,data:[],upcoming_total:0,all_total:0})})));
 render(<App/>);
 await waitFor(()=>expect(pending.length).toBeGreaterThan(0));
 await act(async()=>{
  window.history.pushState({},'','/');window.dispatchEvent(new PopStateEvent('popstate'));
  for(const resolve of pending)resolve({ok:true,json:async()=>({_id:'aaaaaaaaaaaaaaaaaaaaaaaa',title:'Late fixture'})});
 });
 expect(screen.queryByRole('dialog')).toBeNull();
});
