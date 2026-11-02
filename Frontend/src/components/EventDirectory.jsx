import { SearchX, WifiOff } from "lucide-react";
import { HackathonCard } from "./HackathonCard";
import { SkeletonCard } from "./SkeletonCard";
import { Pagination } from "./Pagination";

export function EventDirectory({
  loading,
  error,
  events,
  hasEvents,
  savedOnly,
  savedCount,
  onResetFilters,
  onRetry,
  layoutMode,
  currentPage,
  totalPages,
  startIndex,
  onPageChange,
  onSelect,
  onCopyLink,
  copiedId,
  isEventSaved,
  onToggleSave,
}) {
  return (
    <section
      className="hn-directory-section"
      aria-label="Hackathon listings"
      aria-busy={loading}
    >
      {loading && events.length > 0 && (
        <p className="hn-refresh-note" role="status">
          Updating results… Previous results remain visible.
        </p>
      )}
      {error && events.length > 0 && (
        <p className="hn-refresh-note">
          Previously loaded results are shown below.
        </p>
      )}
      {loading && !hasEvents && (
        <>
          <p className="sr-only" role="status">
            Loading hackathons…
          </p>
          <div className="hn-card-grid" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
        </>
      )}
      {!loading && error && (
        <div role="alert" className="hn-error-state">
          <div>
            <WifiOff size={24} className="hn-state-icon" />
            <h2>Unable to load hackathons</h2>
            <p>{error}</p>
          </div>
          <button
            type="button"
            className="hn-btn hn-btn-primary"
            onClick={onRetry}
          >
            Try again
          </button>
        </div>
      )}
      {!loading && !error && events.length === 0 && (
        <div className="hn-empty-state">
          <SearchX size={30} className="hn-state-icon" />
          <span className="hn-section-kicker">
            {savedOnly && savedCount === 0
              ? "YOUR SHORTLIST STARTS HERE"
              : "NO SIGNALS IN THIS VIEW"}
          </span>
          <h2>
            {savedOnly
              ? savedCount > 0
                ? "No saved opportunities in this view"
                : "No saved hackathons yet"
              : "No matching hackathons"}
          </h2>
          <p>
            {savedOnly
              ? savedCount > 0
                ? "Your saved links may be outside these filters or no longer publicly listed. Your bookmarks are still stored in this browser."
                : "Bookmark hackathons while browsing to keep track of upcoming registration deadlines here."
              : "Try adjusting your search terms or clearing active filters to see more opportunities."}
          </p>
          <button type="button" className="hn-btn" onClick={onResetFilters}>
            Reset filters
          </button>
        </div>
      )}
      {(!error || hasEvents) && events.length > 0 && (
        <>
          <div
            className={layoutMode === "rows" ? "hn-row-list" : "hn-card-grid"}
          >
            {events.map((event, index) => (
              <HackathonCard
                key={event.id}
                index={startIndex + index}
                event={event}
                layoutMode={layoutMode}
                onSelect={onSelect}
                onCopyLink={onCopyLink}
                copied={copiedId === event.id}
                isSaved={isEventSaved(event)}
                onToggleSave={onToggleSave}
              />
            ))}
          </div>
          <Pagination
            currentPage={Math.min(currentPage, totalPages)}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </>
      )}
    </section>
  );
}
