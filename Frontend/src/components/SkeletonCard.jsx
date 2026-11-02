import React from "react";

export function SkeletonCard() {
  const bar = (width, height = 12) => ({
    width,
    height,
    backgroundColor: "var(--bg-subtle)",
    borderRadius: 3,
  });
  return (
    <div
      className="hn-card hn-skeleton-card"
      aria-busy="true"
      aria-label="Loading hackathon"
    >
      <div className="hn-card-topline" aria-hidden="true">
        <div style={bar(90, 12)} />
        <div style={bar(70, 18)} />
      </div>
      <div className="hn-card-content" aria-hidden="true">
        <div style={{ ...bar(75, 10), marginBottom: 22 }} />
        <div style={{ ...bar("85%", 26), marginBottom: 14 }} />
        <div style={{ ...bar("55%", 12), marginBottom: 22 }} />
        <div style={{ ...bar("100%"), marginBottom: 8 }} />
        <div style={bar("70%")} />
      </div>
      <div className="hn-card-facts" aria-hidden="true">
        <div style={bar("80%", 30)} />
        <div style={bar("70%", 30)} />
      </div>
      <div className="hn-card-actions" aria-hidden="true">
        <div style={bar(70, 16)} />
        <div style={bar(90, 40)} />
      </div>
    </div>
  );
}
export default SkeletonCard;
