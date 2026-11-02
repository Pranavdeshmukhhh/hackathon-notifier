import { useScrollProgress } from "../hooks/useScrollProgress";

export function ScrollProgress() {
  const progress = useScrollProgress();
  return (
    <div
      className="hn-scroll-progress"
      aria-hidden="true"
      style={{ width: `${progress}%` }}
    />
  );
}
