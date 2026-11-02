import React from "react";
import { Dialog } from "./Dialog";
export function TechSpecModal({ isOpen, onClose }) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      subtitle="THE INDEX / A FIELD GUIDE"
      title="Read the signal. Keep your judgment."
      maxWidth="620px"
    >
      <div className="hn-info-notes">
        <section>
          <span className="hn-info-label">01 / THE FIELD</span>
          <h3>A map of registration windows.</h3>
          <p>
            The orbital view uses opportunities on your current results page.
            Format determines direction; known registration dates determine
            distance from the centre. Nearer signals close sooner. Unknown or
            closed dates stay outside the map. It is not a location map or a
            live scan animation.
          </p>
        </section>
        <section>
          <span className="hn-info-label">02 / THE SHORT WINDOW</span>
          <h3>Deadlines with evidence.</h3>
          <p>
            The closing-windows section asks the API for its soonest closing
            registrations. Event dates and submission cutoffs are separate
            facts. A missing deadline means unconfirmed, not open indefinitely.
          </p>
        </section>
        <section>
          <span className="hn-info-label">03 / YOUR SHORTLIST</span>
          <h3>Saved here, in this browser.</h3>
          <p>
            Bookmarks are stored locally. They survive reloads in this browser,
            but do not sync across devices. Clearing browser storage removes
            them.
          </p>
        </section>
        <section>
          <span className="hn-info-label">04 / SOURCE CONTEXT</span>
          <h3>Freshness is not verification.</h3>
          <p>
            Source dates, verification status and provenance appear in event
            details when available. Check original rules before registering.
            Public suggestions enter review and do not start a scan or send a
            notification.
          </p>
        </section>
      </div>
    </Dialog>
  );
}
export default TechSpecModal;
