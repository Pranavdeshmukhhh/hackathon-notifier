import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import SkeletonCard from '../components/SkeletonCard';

describe('SkeletonCard Component', () => {
  it('renders pulsing skeleton card without throwing errors', () => {
    const { container } = render(<SkeletonCard />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });
});
