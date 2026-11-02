import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Homepage API failures & error recovery', () => {
  it('displays error recovery box when API fails to load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Backend connection failed'))
    );

    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Unable to load hackathons');
    expect(alert).toHaveTextContent('Backend connection failed');

    const retryBtn = screen.getByRole('button', { name: /Try again/i });
    expect(retryBtn).toBeInTheDocument();
  });

  it('retries fetching events when Try again button is clicked', async () => {
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        if (fail) throw new Error('Network error');
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: 'ev-recovered', title: 'Recovered Hackathon' }],
        };
      })
    );

    render(<App />);

    const retryBtn = await screen.findByRole('button', { name: /Try again/i });
    fail = false;
    fireEvent.click(retryBtn);

    expect(await screen.findByRole('heading',{name:'Recovered Hackathon',level:2})).toBeInTheDocument();
  });
});

it('keeps previous results visible and labels them after a failed filter refresh',async()=>{
 let fail=false;
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>{
  if(fail)throw new Error('Refresh failed');
  return {ok:true,json:async()=>({data:[{_id:'previous',title:'Previously loaded opportunity'}],upcoming_total:1,all_total:1})};
 }));
 render(<App/>);
 await screen.findByRole('heading',{name:'Previously loaded opportunity',level:2});
 fail=true;
 fireEvent.click(screen.getByRole('button',{name:'In-person',exact:true}));
 await screen.findByRole('alert');
 expect(screen.getByText('Previously loaded results are shown below.')).toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'Previously loaded opportunity',level:2})).toBeInTheDocument();
});
