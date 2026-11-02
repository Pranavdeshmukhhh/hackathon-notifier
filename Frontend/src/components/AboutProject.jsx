import React from "react";
import { Dialog } from "./Dialog";
export function AboutProject({ isOpen, onClose }) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      subtitle="THE INDEX / ABOUT"
      title="A place to find your next beginning."
      maxWidth="620px"
    >
      <div className="hn-info-notes">
        <p>
          Building starts before the first line of code. It starts with finding
          a challenge, a team, and a reason to try.
        </p>
        <section>
          <span className="hn-info-label">WHY THIS EXISTS</span>
          <h3>Opportunity is scattered. Discovery shouldn’t be.</h3>
          <p>
            Hackathon Notifier brings source listings into a searchable
            directory. Compare formats, understand registration windows, and
            save the opportunities you want to come back to.
          </p>
        </section>
        <section>
          <span className="hn-info-label">HOW TO USE IT WELL</span>
          <h3>The organizer is the source of truth.</h3>
          <p>
            Listings can be incomplete or change. Collection does not mean
            independent verification. Open the source to confirm eligibility,
            team requirements, dates and prizes before registering.
          </p>
        </section>
        <section>
          <span className="hn-info-label">AN OPEN INVITATION</span>
          <h3>Found an opportunity?</h3>
          <p>
            Submit its public URL through the header. Suggestions go to an
            administrator review queue and are never published automatically.
          </p>
        </section>
      </div>
    </Dialog>
  );
}
export default AboutProject;
