import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import App from '../App';
import {deriveEventStatus} from '../utils/eventPresentation';
afterEach(()=>{vi.unstubAllGlobals();localStorage.clear();window.history.replaceState({},'','/');});
it('uses canonical unknown/cancelled states without inventing registration closure',()=>{
 expect(deriveEventStatus({is_past:true,status:'Open',canonical:{registration_state:'unknown'}}).key).toBe('unknown');
 expect(deriveEventStatus({canonical:{registration_state:'cancelled'}}).label).toBe('Cancelled');
});
it('preserves and removes bookmarks saved under a historical duplicate ID',async()=>{
 window.history.replaceState({},'','/');
 localStorage.setItem('hn-saved-hackathons',JSON.stringify(['legacy-id']));
 vi.stubGlobal('scrollTo',vi.fn());
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({success:true,data:[{_id:'primary-id',title:'Fixture event',source:'Fixture',canonical:{aliases:['legacy-id']}}],upcoming_total:1,all_total:1})}));
 render(<App/>);
 await screen.findByRole('heading',{name:'Fixture event',level:2});
 const saved=screen.getByRole('button',{name:'Remove from saved',exact:true});
 fireEvent.click(saved);
 await waitFor(()=>expect(JSON.parse(localStorage.getItem('hn-saved-hackathons'))).toEqual([]));
});
it('distinguishes unavailable saved opportunities from an empty bookmark collection',async()=>{
 localStorage.setItem('hn-saved-hackathons',JSON.stringify(['unavailable-event']));
 window.history.replaceState({},'','/?saved=1');
 vi.stubGlobal('scrollTo',vi.fn());
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({data:[],upcoming_total:0,all_total:0})}));
 render(<App/>);
 await screen.findByRole('heading',{name:'No saved opportunities in this view'});
 expect(screen.queryByRole('heading',{name:'No saved hackathons yet'})).not.toBeInTheDocument();
 expect(JSON.parse(localStorage.getItem('hn-saved-hackathons'))).toEqual(['unavailable-event']);
});
