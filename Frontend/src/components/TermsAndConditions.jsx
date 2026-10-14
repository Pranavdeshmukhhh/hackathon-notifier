import React from 'react';
import { Dialog } from './Dialog';

export function TermsAndConditions({ isOpen = true, onClose }) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      subtitle="LEGAL & USAGE POLICY"
      title="Terms and Conditions"
      maxWidth="600px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        <p>
          <strong>1. Informational Index Only:</strong> Hackathon Notifier aggregates publicly listed hackathon metadata from third-party platforms (Devfolio, Unstop, Devpost, HackerEarth). All registrations occur on the respective official organizer portals.
        </p>
        <p>
          <strong>2. Verification & Accuracy:</strong> While automated scrapers verify dates and venues regularly, schedules and prize pools are subject to change by event organizers. Always confirm final deadlines on the official registration page.
        </p>
        <p>
          <strong>3. Acceptable Submissions:</strong> User-submitted event URLs must point to legitimate, publicly accessible hackathon pages. Malicious, private-network, or spam URLs are automatically rejected by our security layer.
        </p>
      </div>
    </Dialog>
  );
}

export default TermsAndConditions;
