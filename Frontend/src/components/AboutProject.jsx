import React from 'react';
import { Dialog } from './Dialog';

export function AboutProject({ isOpen, onClose }) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      subtitle="PROJECT DOCUMENTATION"
      title="About Hackathon Notifier"
      maxWidth="560px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        <p>
          Hackathon Notifier is an automated discovery console built for engineering students and developers to track verified hackathons without manually checking multiple platforms.
        </p>
        <p>
          Our backend scrapers index competitions from Devfolio, Unstop, Devpost, HackerEarth, and Devnovate, normalizing registration deadlines, formats (In-Person, Remote, Hybrid), and venue locations into a single keyboard-driven workspace.
        </p>
      </div>
    </Dialog>
  );
}

export default AboutProject;
