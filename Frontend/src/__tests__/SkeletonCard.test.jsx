import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import SkeletonCard from '../components/SkeletonCard';

describe('SkeletonCard Component', () => {
  it('renders loading placeholder card with accessible busy indicator', () => {
    const { container } = render(<SkeletonCard />);
    const card = container.querySelector('.hn-card');
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute('aria-busy', 'true');
    expect(card).toHaveAttribute('aria-label', 'Loading hackathon');
  });
});
