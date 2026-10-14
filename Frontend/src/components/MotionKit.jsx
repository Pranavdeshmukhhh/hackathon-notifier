import React from 'react';

export function FadeIn({ children, className = '', style = {} }) {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

export default { FadeIn };
