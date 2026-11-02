import React, { useState, useEffect, useMemo, useCallback } from "react";
import { HowItWorks } from "./components/HowItWorks";
import { Radio, Bookmark } from "lucide-react";
import { HomeIntro } from "./components/HomeIntro";
import { ClosingWindows } from "./components/ClosingWindows";
import { DiscoveryControls } from "./components/DiscoveryControls";
import { EventDetail } from "./components/EventDetail";
import { AutoListModal } from "./components/AutoListModal";
import { TechSpecModal } from "./components/TechSpecModal";
import { AboutProject } from "./components/AboutProject";
import { TermsAndConditions } from "./components/TermsAndConditions";
import { Toast } from "./components/Toast";
import { ScrollToTop } from "./components/ScrollToTop";
import { useDarkMode } from "./hooks/useDarkMode";
import { useCopyLink } from "./hooks/useCopyLink";
import { useGeolocation } from "./hooks/useGeolocation";
import {
  buildDiscoveryQueryParams,
  filterAndSortEvents,
  parseDiscoveryStateFromUrl,
  syncDiscoveryStateToUrl,
} from "./utils/discoveryQuery";

import { useEventFeed } from "./hooks/useEventFeed";
import { useEventRoute } from "./hooks/useEventRoute";
import { useSavedEvents } from "./hooks/useSavedEvents";
import { SiteHeader } from "./components/SiteHeader";
import { SiteFooter } from "./components/SiteFooter";
import { EventDirectory } from "./components/EventDirectory";
import { ScrollProgress } from "./components/ScrollProgress";
import { Dialog } from "./components/Dialog";
import { scrollToSection } from "./utils/navigation";

const PAGE_SIZE = 12;
const scrollToDirectory = () => scrollToSection("discover");
const scrollToGuide = () => scrollToSection("how-it-works");

export function App() {
  const [darkMode, toggleDarkMode] = useDarkMode(true);
  const { copiedId, copyLink } = useCopyLink(2000);
  const {
    coords: userCoords,
    locating,
    geoError,
    requestLocation,
    clearLocation,
    isActive: locationActive,
  } = useGeolocation();

  // Initialize discovery state from URL parameters
  const initialUrlState = useMemo(() => parseDiscoveryStateFromUrl(), []);

  const [searchQuery, setSearchQuery] = useState(initialUrlState.search);
  const [debouncedSearch, setDebouncedSearch] = useState(
    initialUrlState.search,
  );
  const [selectedFormat, setSelectedFormat] = useState(initialUrlState.format);
  const [selectedStatus, setSelectedStatus] = useState(initialUrlState.status);
  const [selectedSource, setSelectedSource] = useState(initialUrlState.source);
  const [sortBy, setSortBy] = useState(initialUrlState.sort);
  const [savedOnly, setSavedOnly] = useState(initialUrlState.savedOnly);
  const [currentPage, setCurrentPage] = useState(initialUrlState.page);
  const [layoutMode, setLayoutMode] = useState("grid");

  const {
    savedIds,
    isEventSaved,
    toggleSaveEvent: toggleSaved,
  } = useSavedEvents();
  const [activeModal, setActiveModal] = useState(null);
  const openModal = useCallback((type) => setActiveModal(type), []);
  const closeModal = useCallback(() => setActiveModal(null), []);

  // Debounce search input slightly for smooth typing while keeping tests responsive
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.slice(0, 100));
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Synchronize filter state to URL query parameters
  useEffect(() => {
    syncDiscoveryStateToUrl({
      search: debouncedSearch,
      format: selectedFormat,
      status: selectedStatus,
      source: selectedSource,
      sort: sortBy,
      savedOnly,
      page: currentPage,
    });
  }, [
    debouncedSearch,
    selectedFormat,
    selectedStatus,
    selectedSource,
    sortBy,
    savedOnly,
    currentPage,
  ]);

  // Handle Browser Back / Forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const nextState = parseDiscoveryStateFromUrl();
      setSearchQuery(nextState.search);
      setDebouncedSearch(nextState.search);
      setSelectedFormat(nextState.format);
      setSelectedStatus(nextState.status);
      setSelectedSource(nextState.source);
      setSortBy(nextState.sort);
      setSavedOnly(nextState.savedOnly);
      setCurrentPage(nextState.page);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const queryParams = useMemo(
    () =>
      buildDiscoveryQueryParams({
        search: debouncedSearch,
        format: selectedFormat,
        status: selectedStatus,
        source: selectedSource,
        sort: sortBy,
        page: currentPage,
        limit: PAGE_SIZE,
        coords: userCoords,
        savedIds: savedOnly ? savedIds : null,
      }),
    [
      debouncedSearch,
      selectedFormat,
      selectedStatus,
      selectedSource,
      sortBy,
      currentPage,
      userCoords,
      savedOnly,
      savedIds,
    ],
  );

  const { rawEvents, feedMeta, loading, error, loadEvents } =
    useEventFeed(queryParams);
  const {
    activeEvent,
    detailError,
    detailLoading,
    handleSelectEvent,
    handleCloseDetail,
    retryDetail,
  } = useEventRoute(rawEvents);
  const toggleSaveEvent = useCallback(
    (id) => {
      toggleSaved(
        rawEvents.find((item) => item.id === id) ||
          (activeEvent?.id === id ? activeEvent : id),
      );
    },
    [rawEvents, activeEvent, toggleSaved],
  );

  // Dynamically derive available sources from actual data when present
  const availableSources = useMemo(() => {
    const base = ["devfolio", "unstop", "devpost", "hackerearth", "devnovate"];
    const fromData = rawEvents
      .map((e) => e.sourceKey)
      .filter((s) => s && s !== "web_discovery");
    const globalSources = (feedMeta.stats?.sources || []).map((source) =>
      source.toLowerCase(),
    );
    return Array.from(new Set([...base, ...globalSources, ...fromData]));
  }, [rawEvents, feedMeta.stats]);

  const filteredEvents = useMemo(
    () =>
      feedMeta.paginated
        ? rawEvents
        : filterAndSortEvents(rawEvents, {
            search: searchQuery,
            format: selectedFormat,
            status: selectedStatus,
            source: selectedSource,
            sort: sortBy,
            savedOnly,
            savedIds,
            userCoords,
          }),
    [
      rawEvents,
      feedMeta.paginated,
      searchQuery,
      selectedFormat,
      selectedStatus,
      selectedSource,
      sortBy,
      savedOnly,
      savedIds,
      userCoords,
    ],
  );

  const totalPages = Math.max(
    1,
    Math.ceil(
      (feedMeta.paginated ? feedMeta.total : filteredEvents.length) / PAGE_SIZE,
    ),
  );
  useEffect(() => {
    if (!loading && !error && currentPage > totalPages)
      setCurrentPage(totalPages);
  }, [loading, error, currentPage, totalPages]);
  const paginatedEvents = useMemo(() => {
    if (feedMeta.paginated) return filteredEvents;
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredEvents.slice(start, start + PAGE_SIZE);
  }, [filteredEvents, feedMeta.paginated, currentPage, totalPages]);

  const openCount = useMemo(
    () =>
      feedMeta.stats?.open_count ??
      rawEvents.filter((e) => e.lifecycleKey === "open").length,
    [rawEvents, feedMeta.stats],
  );
  const closingCount = useMemo(
    () =>
      feedMeta.stats?.closing_count ??
      rawEvents.filter((e) => e.lifecycleKey === "closing").length,
    [rawEvents, feedMeta.stats],
  );

  const handleToggleLocation = () => {
    requestLocation();
    if (locationActive) setSortBy("deadline_asc");
    if (!locationActive) setSortBy("distance_asc");
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setDebouncedSearch("");
    setSelectedFormat("all");
    setSelectedStatus("all");
    setSelectedSource("all");
    setSortBy("deadline_asc");
    setSavedOnly(false);
    clearLocation();
    setCurrentPage(1);
  };

  const showSaved = () => {
    setSavedOnly(true);
    setSelectedStatus("all");
    setCurrentPage(1);
    scrollToDirectory();
  };

  return (
    <div className="hn-app-shell">
      <a className="hn-skip-link" href="#discover">
        Skip to hackathons
      </a>
      <ScrollProgress />
      <SiteHeader
        darkMode={darkMode}
        toggleDarkMode={toggleDarkMode}
        savedOnly={savedOnly}
        selectedStatus={selectedStatus}
        savedCount={savedIds.length}
        onResetFilters={handleResetFilters}
        onExplore={() => {
          handleResetFilters();
          scrollToDirectory();
        }}
        onClosing={() => {
          setSavedOnly(false);
          setSelectedStatus("closing");
          setCurrentPage(1);
          scrollToDirectory();
        }}
        onSaved={showSaved}
        onHowItWorks={scrollToGuide}
        onSubmit={() => openModal("autoList")}
      />

      {/* Main Content */}
      <main className="hn-container hn-main">
        <HomeIntro
          events={paginatedEvents}
          onSelect={handleSelectEvent}
          error={Boolean(error)}
          totalCount={
            feedMeta.stats?.total ??
            (loading || error ? null : rawEvents.length)
          }
          savedCount={savedIds.length}
          loading={loading && !feedMeta.stats}
          onExplore={scrollToDirectory}
          onShowSaved={showSaved}
          openCount={openCount}
          closingCount={closingCount}
          onFilterStatus={(statusKey) => {
            setSavedOnly(false);
            setSelectedStatus((prev) =>
              prev === statusKey ? "all" : statusKey,
            );
            setCurrentPage(1);
            scrollToDirectory();
          }}
        />

        <ClosingWindows
          onSelect={handleSelectEvent}
          onViewAll={() => {
            handleResetFilters();
            setSelectedStatus("closing");
            scrollToDirectory();
          }}
        />
        <div className="hn-directory-heading" id="discover">
          <div>
            <div className="hn-section-kicker">
              <span />{" "}
              {savedOnly ? "YOUR PERSONAL INDEX" : "THE DISCOVERY INDEX"}
            </div>
            <h2>
              {savedOnly ? (
                "Your saved opportunities."
              ) : (
                <>
                  <span className="hn-desktop-copy">
                    Find your kind of challenge.
                  </span>
                  <span className="hn-mobile-copy">Explore opportunities.</span>
                </>
              )}
            </h2>
            <p>
              {savedOnly
                ? "Saved in this browser. Ready when you are."
                : "A theme, a place, a deadline. Find the opportunity that fits."}
            </p>
          </div>
          <span className="hn-directory-note">
            {savedOnly ? <Bookmark size={17} /> : <Radio size={17} />}{" "}
            {savedOnly
              ? `${savedIds.length} saved`
              : "Compare. Shortlist. Build."}
          </span>
        </div>
        <DiscoveryControls
          searchQuery={searchQuery}
          onSearchChange={(q) => {
            setSearchQuery(q);
            setCurrentPage(1);
          }}
          selectedFormat={selectedFormat}
          onFormatChange={(fmt) => {
            setSelectedFormat(fmt);
            setCurrentPage(1);
          }}
          selectedStatus={selectedStatus}
          onStatusChange={(st) => {
            setSelectedStatus(st);
            setCurrentPage(1);
          }}
          selectedSource={selectedSource}
          onSourceChange={(src) => {
            setSelectedSource(src);
            setCurrentPage(1);
          }}
          availableSources={availableSources}
          sortBy={sortBy}
          onSortChange={setSortBy}
          savedOnly={savedOnly}
          onToggleSavedOnly={(val) => {
            setSavedOnly(val);
            setCurrentPage(1);
          }}
          savedCount={savedIds.length}
          layoutMode={layoutMode}
          onLayoutModeChange={setLayoutMode}
          onUseLocation={handleToggleLocation}
          locationActive={locationActive}
          locationLoading={locating}
          loading={loading}
          resultCount={
            loading
              ? null
              : error
                ? null
                : feedMeta.paginated
                  ? feedMeta.total
                  : filteredEvents.length
          }
          onResetFilters={handleResetFilters}
        />

        {detailError && (
          <div role="alert" className="hn-detail-error">
            {detailError}
            <button type="button" className="hn-btn" onClick={retryDetail}>
              Try event again
            </button>
            <button
              type="button"
              className="hn-btn"
              onClick={handleCloseDetail}
            >
              Dismiss
            </button>
          </div>
        )}
        {geoError && (
          <div role="status" className="hn-geo-notice">
            {geoError}
          </div>
        )}
        <EventDirectory
          loading={loading}
          error={error}
          events={paginatedEvents}
          hasEvents={rawEvents.length > 0}
          savedOnly={savedOnly}
          savedCount={savedIds.length}
          onResetFilters={handleResetFilters}
          onRetry={loadEvents}
          layoutMode={layoutMode}
          currentPage={currentPage}
          totalPages={totalPages}
          startIndex={(currentPage - 1) * PAGE_SIZE}
          onPageChange={(page) => {
            setCurrentPage(page);
            scrollToDirectory();
          }}
          onSelect={handleSelectEvent}
          onCopyLink={copyLink}
          copiedId={copiedId}
          isEventSaved={isEventSaved}
          onToggleSave={toggleSaveEvent}
        />
        <HowItWorks
          onExplore={scrollToDirectory}
          onSubmit={() => openModal("autoList")}
        />
      </main>

      <SiteFooter onOpenModal={openModal} />

      {/* Modals */}
      <Dialog
        isOpen={detailLoading}
        onClose={handleCloseDetail}
        title="Opening event"
      >
        <p role="status">Loading source details…</p>
      </Dialog>
      <EventDetail
        event={activeEvent}
        isOpen={Boolean(activeEvent)}
        onClose={handleCloseDetail}
        onCopyLink={copyLink}
        copied={Boolean(activeEvent && copiedId === activeEvent.id)}
        isSaved={isEventSaved(activeEvent)}
        onToggleSave={toggleSaveEvent}
      />

      <AutoListModal
        isOpen={activeModal === "autoList"}
        onClose={closeModal}
        onSuccess={() => loadEvents()}
      />

      <TechSpecModal isOpen={activeModal === "guide"} onClose={closeModal} />
      <AboutProject isOpen={activeModal === "about"} onClose={closeModal} />
      <TermsAndConditions
        isOpen={activeModal === "terms"}
        onClose={closeModal}
      />
      <Toast
        visible={Boolean(copiedId)}
        message={
          copiedId === "copy-error"
            ? "Could not copy. Use your browser address bar to share."
            : "Link copied to clipboard"
        }
      />
      <ScrollToTop />
    </div>
  );
}

export default App;
