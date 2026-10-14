import React from 'react';
import { Dialog } from './Dialog';

export function TermsAndConditions({ isOpen = true, onClose }) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      subtitle="Legal"
      title="Terms and Conditions"
      maxWidth="580px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.84375rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        <p>
          <strong>1. Directory Information:</strong> Hackathon Notifier indexes publicly available hackathon information from third-party platforms. All applications and team registrations take place on the official organizer websites.
        </p>
        <p>
          <strong>2. Schedule & Deadline Accuracy:</strong> While listings are updated regularly, organizers may change deadlines or eligibility rules at any time. Always verify final details on the official registration page.
        </p>
        <p>
          <strong>3. Community Submissions:</strong> Submitted event URLs must point to legitimate, publicly accessible hackathon pages. Spam or unsafe links are automatically rejected.
        </p>
      </div>
    </Dialog>
  );
}

export default TermsAndConditions;
