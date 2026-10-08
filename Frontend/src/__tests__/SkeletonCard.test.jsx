import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import SkeletonCard from '../components/SkeletonCard';

describe('SkeletonCard Component', () => {
  it('keeps loading placeholders out of the accessibility tree', () => {
    const { container } = render(<SkeletonCard />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    expect(container).toHaveTextContent('');
  });
});
