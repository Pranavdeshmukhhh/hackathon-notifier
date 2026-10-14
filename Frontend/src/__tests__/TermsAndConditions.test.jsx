import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TermsAndConditions from '../components/TermsAndConditions';

describe('TermsAndConditions Component', () => {
  it('renders modal dialog with legal title and key clauses when open', () => {
    render(<TermsAndConditions isOpen={true} onClose={() => {}} />);

    expect(screen.getByRole('dialog', { name: /Terms and Conditions/i })).toBeInTheDocument();
    expect(screen.getByText(/Directory Information/i)).toBeInTheDocument();
    expect(screen.getByText(/Schedule & Deadline Accuracy/i)).toBeInTheDocument();
    expect(screen.getByText(/Community Submissions/i)).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<TermsAndConditions isOpen={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(<TermsAndConditions isOpen={true} onClose={handleClose} />);

    const closeBtn = screen.getByRole('button', { name: /Close dialog/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
