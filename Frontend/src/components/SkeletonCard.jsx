import React from 'react';

export function SkeletonCard() {
  const bar = (width, height = '12px') => ({
    width,
    height,
    backgroundColor: 'var(--bg-subtle)',
    borderRadius: '4px',
  });

  return (
    <div className="hn-card" aria-busy="true" aria-label="Loading hackathon">
      <div>
        <div className="hn-card-header">
          <div style={bar('84px', '18px')} />
          <div style={bar('64px', '18px')} />
        </div>
        <div style={{ ...bar('82%', '18px'), marginBottom: '10px' }} />
        <div style={{ ...bar('100%', '12px'), marginBottom: '6px' }} />
        <div style={{ ...bar('60%', '12px'), marginBottom: '16px' }} />
      </div>
      <div className="hn-meta-grid">
        <div style={bar('75%', '24px')} />
        <div style={bar('75%', '24px')} />
      </div>
    </div>
  );
}

export default SkeletonCard;
