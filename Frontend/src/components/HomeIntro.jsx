import React from 'react';

export function HomeIntro({
  totalCount = 0,
  openCount = 0,
  closingCount = 0,
  onFilterStatus,
  onOpenAutoList,
}) {
  return (
    <section className="hn-intro" aria-label="Directory introduction">
      <div className="hn-intro-layout">
        <div>
          <h1 className="hn-intro-title">Find your next hackathon.</h1>
          <p className="hn-intro-subtitle">
            Browse verified student and developer hackathons, track approaching registration deadlines, and save opportunities for later.
          </p>
        </div>

        <div className="hn-summary-strip">
          {openCount > 0 && (
            <button
              type="button"
              className="hn-summary-chip"
              onClick={() => onFilterStatus?.('open')}
              title="Filter open hackathons"
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--status-open-dot)',
                }}
              />
              <span>{openCount} open</span>
            </button>
          )}

          {closingCount > 0 && (
            <button
              type="button"
              className="hn-summary-chip"
              onClick={() => onFilterStatus?.('closing')}
              title="Filter hackathons closing soon"
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--status-closing-dot)',
                }}
              />
              <span>{closingCount} closing soon</span>
            </button>
          )}

          {totalCount > 0 && (
            <span
              className="hn-summary-chip"
              style={{ cursor: 'default' }}
            >
              <span>{totalCount} listed</span>
            </span>
          )}

          {onOpenAutoList && (
            <button
              type="button"
              className="hn-btn hn-btn-primary"
              onClick={onOpenAutoList}
            >
              Submit a hackathon
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export default HomeIntro;
