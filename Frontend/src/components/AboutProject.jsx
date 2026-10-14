import React from 'react';
import { Dialog } from './Dialog';

export function AboutProject({ isOpen, onClose }) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      subtitle="About"
      title="About Hackathon Notifier"
      maxWidth="540px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.84375rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        <p>
          Finding student and developer hackathons usually means checking half a dozen separate websites and social feeds. Hackathon Notifier brings those listings into a single, searchable directory.
        </p>
        <p>
          You can filter opportunities by online or in-person format, check which registration deadlines are closing soon, bookmark events to review later, or submit an event URL to add it to the public index.
        </p>
      </div>
    </Dialog>
  );
}

export default AboutProject;
