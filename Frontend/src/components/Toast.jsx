import React from 'react';

export default function Toast({ message, visible }) {
  if (!visible) return null;
  return <div className="toast animate-island-toast" role="status" aria-live="polite" aria-atomic="true">{message}</div>;
}
