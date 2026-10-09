import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TermsAndConditions from '../components/TermsAndConditions';

describe('TermsAndConditions Component', () => {
  it('renders hero title and essential student charter clauses', () => {
    render(<TermsAndConditions onBack={() => {}} onShowToast={() => {}} />);

    expect(screen.getByText(/Terms & Conditions & Code of Student Practice/i)).toBeInTheDocument();
    expect(screen.getByText(/Acceptance of Terms & Student Purpose/i)).toBeInTheDocument();
    expect(screen.getByText(/100% Free & Open-Source Software/i)).toBeInTheDocument();
    expect(screen.getByText(/University On-Duty \(OD\) Attendance Policy/i)).toBeInTheDocument();
    expect(screen.getByText(/Prize Pools, Bounties & Escrow Disclaimer/i)).toBeInTheDocument();
    expect(screen.getByText(/Student Privacy & Data Use/i)).toBeInTheDocument();
  });

  it('calls onBack when Back to Hackathon Radar button is clicked', () => {
    const handleBack = vi.fn();
    render(<TermsAndConditions onBack={handleBack} onShowToast={() => {}} />);

    const backButtons = screen.getAllByText(/Back to Hackathon Radar|Return to Hackathon Radar/i);
    expect(backButtons.length).toBeGreaterThan(0);
    fireEvent.click(backButtons[0]);
    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it('reports success only after the terms link is copied', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const handleToast = vi.fn();
    render(<TermsAndConditions onBack={() => {}} onShowToast={handleToast} />);

    const shareBtn = screen.getByText(/Share Terms/i);
    fireEvent.click(shareBtn);
    await screen.findByText('Link copied');
    expect(handleToast).toHaveBeenCalledWith('Terms link copied');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(window.location.href);
  });
  it('does not claim success when clipboard access is blocked', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } });
    const onShowToast = vi.fn();
    render(<TermsAndConditions onBack={() => {}} onShowToast={onShowToast} />);
    fireEvent.click(screen.getByText(/Share Terms/i));
    await screen.findByText('Could not copy. Copy the address from your browser.');
    expect(onShowToast).not.toHaveBeenCalled();
  });
});
