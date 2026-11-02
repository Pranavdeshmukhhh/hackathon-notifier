import { Plus } from "lucide-react";
import { SunIcon, MoonIcon, BookmarkIcon } from "./Icons";
import { scrollBehavior } from "../utils/navigation";

export function SiteHeader({
  darkMode,
  toggleDarkMode,
  savedOnly,
  selectedStatus,
  savedCount,
  onExplore,
  onClosing,
  onSaved,
  onHowItWorks,
  onSubmit,
  onResetFilters,
}) {
  return (
    <header className="hn-header">
      <div className="hn-container hn-header-inner">
        <a
          href="/"
          className="hn-brand-link"
          onClick={(event) => {
            if (
              !event.metaKey &&
              !event.ctrlKey &&
              !event.shiftKey &&
              !event.altKey &&
              event.button === 0
            ) {
              event.preventDefault();
              onResetFilters();
              window.scrollTo({ top: 0, behavior: scrollBehavior() });
            }
          }}
        >
          <span className="hn-wordmark-badge" aria-hidden="true">
            <svg viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="11" />
              <path d="M2 24 30 8M16 2v5M16 25v5" />
              <circle cx="24" cy="11" r="3" />
            </svg>
          </span>
          <span>
            hackathon<span className="hn-brand-secondary">notifier</span>
            <span className="hn-brand-dot">/</span>
          </span>
        </a>
        <nav className="hn-nav" aria-label="Primary navigation">
          <button
            type="button"
            className={`hn-nav-btn ${!savedOnly && selectedStatus === "all" ? "active" : ""}`}
            onClick={onExplore}
          >
            Explore
          </button>
          <button
            type="button"
            className={`hn-nav-btn ${selectedStatus === "closing" ? "active" : ""}`}
            onClick={onClosing}
          >
            Closing soon
          </button>
          <button
            type="button"
            className={`hn-nav-btn ${savedOnly ? "active" : ""}`}
            onClick={onSaved}
          >
            <BookmarkIcon size={13} filled={savedOnly} />
            Saved
            {savedCount > 0 && (
              <span className="hn-count-pill">{savedCount}</span>
            )}
          </button>
          <button
            type="button"
            className="hn-nav-btn hn-nav-label-hide-sm"
            onClick={onHowItWorks}
          >
            How it works
          </button>
        </nav>
        <div className="hn-header-actions">
          <button
            type="button"
            className="hn-btn hn-icon-btn hn-theme-toggle"
            onClick={toggleDarkMode}
            aria-label={
              darkMode ? "Switch to light mode" : "Switch to dark mode"
            }
          >
            {darkMode ? <SunIcon size={16} /> : <MoonIcon size={16} />}
          </button>
          <button
            type="button"
            className="hn-btn hn-header-submit"
            onClick={onSubmit}
          >
            <span>Submit event</span>
            <Plus size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
