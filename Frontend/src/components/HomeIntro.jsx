import React from "react";
import { ArrowDown, ArrowUpRight, Bookmark } from "lucide-react";
import { SignalField } from "./SignalField";

export function HomeIntro({
  totalCount = null,
  openCount = 0,
  closingCount = 0,
  savedCount = 0,
  onFilterStatus,
  onExplore,
  onShowSaved,
  events = [],
  onSelect,
  loading = false,
  error = false,
}) {
  return (
    <section className="hn-intro" aria-label="Directory introduction">
      <div className="hn-intro-copy">
        <div className="hn-hero-eyebrow">
          <span className="hn-signal-glyph" /> AN OPEN INDEX FOR BUILDERS
        </div>
        <h1 className="hn-intro-title">
          Find your next <span>hackathon.</span>
        </h1>
        <p className="hn-intro-subtitle">
          <span className="hn-desktop-copy">
            Follow an idea. Find your people.
            <br />
            Discover the right place to build what’s next.
          </span>
          <span className="hn-mobile-copy">
            Find an opportunity. Check the details. Build what’s next.
          </span>
        </p>
        <div className="hn-hero-actions">
          <button
            type="button"
            className="hn-btn hn-hero-primary"
            onClick={onExplore}
          >
            Explore hackathons <ArrowDown size={16} />
          </button>
          <button
            type="button"
            className="hn-hero-saved"
            aria-label="Open your saved list"
            onClick={onShowSaved}
          >
            <Bookmark size={15} />
            {savedCount} saved <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="hn-hero-index">
          <span>
            {loading || totalCount == null
              ? "Connecting to the directory"
              : `${totalCount.toLocaleString()} listed`}
          </span>
          <span className="hn-index-divider" />
          {openCount > 0 && (
            <button type="button" onClick={() => onFilterStatus?.("open")}>
              {openCount} open
            </button>
          )}
          {closingCount > 0 && (
            <button
              type="button"
              className="hn-closing-link"
              onClick={() => onFilterStatus?.("closing")}
            >
              {closingCount} closing soon <ArrowUpRight size={12} />
            </button>
          )}
        </div>
      </div>
      <SignalField
        events={events}
        onSelect={onSelect}
        loading={loading}
        error={error}
      />
      <div className="hn-hero-baseline">
        <span>LESS NOISE. MORE POSSIBILITY.</span>
        <span>Online / In person / Hybrid</span>
        <span>
          Check the source. Make your move. <ArrowUpRight size={12} />
        </span>
      </div>
    </section>
  );
}
export default HomeIntro;
