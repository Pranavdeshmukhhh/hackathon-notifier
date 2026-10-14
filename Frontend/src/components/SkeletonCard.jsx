import React from 'react';

export function SkeletonCard() {
  const bar = (width, height = '12px') => ({
    width,
    height,
    backgroundColor: 'var(--bg-subtle)',
    borderRadius: '3px',
  });

  return (
    <div className="hn-card" aria-busy="true" aria-label="Loading event">
      <div>
        <div className="hn-card-header">
          <div style={bar('72px', '18px')} />
          <div style={bar('64px', '18px')} />
        </div>
        <div style={{ ...bar('85%', '20px'), marginBottom: '10px' }} />
        <div style={{ ...bar('100%', '13px'), marginBottom: '6px' }} />
        <div style={{ ...bar('65%', '13px'), marginBottom: '18px' }} />
      </div>
      <div className="hn-spec-grid">
        <div style={bar('80%', '26px')} />
        <div style={bar('80%', '26px')} />
        <div style={bar('80%', '26px')} />
        <div style={bar('80%', '26px')} />
      </div>
    </div>
  );
}

export default SkeletonCard;
