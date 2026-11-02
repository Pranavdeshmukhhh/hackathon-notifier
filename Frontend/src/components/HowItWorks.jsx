import React from "react";
import { ArrowUpRight, ArrowRight } from "lucide-react";
export function HowItWorks({ onExplore, onSubmit }) {
  return (
    <section
      className="hn-how-section"
      id="how-it-works"
      aria-labelledby="how-heading"
    >
      <div className="hn-how-intro">
        <span className="hn-section-kicker">A LITTLE CONTEXT</span>
        <h2 id="how-heading">
          Built for the moment
          <br />
          before you build.
        </h2>
        <p>
          Discovery is a starting point. The organizer is the source of truth.
        </p>
        <button type="button" onClick={onExplore} className="hn-text-action">
          Back to exploring <ArrowRight size={14} />
        </button>
      </div>
      <div className="hn-how-steps">
        <div>
          <span>01 / FIND YOUR SIGNAL</span>
          <h3>Start with what matters.</h3>
          <p>
            Search a theme, compare formats, or explore registration windows in
            the signal map.
          </p>
        </div>
        <div>
          <span>02 / KEEP YOUR OPTIONS</span>
          <h3>A shortlist, on your terms.</h3>
          <p>
            Save opportunities in this browser. Come back to the details before
            you commit.
          </p>
        </div>
        <div>
          <span>03 / CHECK. THEN REGISTER.</span>
          <h3>Go straight to the source.</h3>
          <p>
            Review dates, eligibility and team requirements on the organizer’s
            page. Unconfirmed facts stay unconfirmed.
          </p>
        </div>
      </div>
      <div className="hn-community-banner">
        <span className="hn-section-kicker">ADD TO THE INDEX</span>
        <h3>Found a signal we missed?</h3>
        <p>
          Share an event URL. Every public suggestion goes through administrator
          review.
        </p>
        <button type="button" onClick={onSubmit}>
          Submit an event <ArrowUpRight size={18} />
        </button>
      </div>
    </section>
  );
}
