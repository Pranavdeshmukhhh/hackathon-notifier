import { memo } from "react";
import { ArrowUpRight } from "lucide-react";

export const SiteFooter = memo(function SiteFooter({ onOpenModal }) {
  return (
    <footer className="hn-footer">
      <div className="hn-container hn-footer-inner">
        <div className="hn-footer-wordmark">
          hackathon<span>notifier /</span>
          <p>Find a signal. Make something of it.</p>
        </div>
        <div className="hn-footer-links">
          <button
            type="button"
            className="hn-footer-link"
            onClick={() => onOpenModal("autoList")}
          >
            Submit a hackathon
          </button>
          <button
            type="button"
            className="hn-footer-link"
            onClick={() => onOpenModal("guide")}
          >
            How it works
          </button>
          <button
            type="button"
            className="hn-footer-link"
            onClick={() => onOpenModal("about")}
          >
            About
          </button>
          <button
            type="button"
            className="hn-footer-link"
            onClick={() => onOpenModal("terms")}
          >
            Terms &amp; Conditions
          </button>
        </div>
      </div>
      <div className="hn-container hn-footer-colophon">
        <span>AN INDEPENDENT OPPORTUNITY INDEX</span>
        <span>
          Source facts, not guarantees. Always check with the organizer.
        </span>
        <span>
          Go build something. <ArrowUpRight size={12} />
        </span>
      </div>
    </footer>
  );
});
