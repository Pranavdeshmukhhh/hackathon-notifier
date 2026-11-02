import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { deadlineDays, buildSignalField } from "../utils/signalField";
import { SignalField } from "../components/SignalField";
import { ClosingWindows } from "../components/ClosingWindows";
import { fetchPublicEvents } from "../utils/api";

vi.mock("../utils/api", () => ({ fetchPublicEvents: vi.fn() }));
const now = new Date("2026-10-30T20:00:00Z");
const fixture = (id, date = "2026-11-02", format = "Online") => ({
  _id: id,
  title: `Opportunity ${id}`,
  source: "Devfolio",
  format,
  registration_deadline: { date },
  canonical: {
    registration_state: "open",
    registration_closes: { date, precision: "date", timezone: null },
  },
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
});
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("registration signal data", () => {
  it("never substitutes event or submission dates for registration", () => {
    expect(
      deadlineDays({
        event_end: "2026-11-10",
        submission_deadline: "2026-11-08",
      }),
    ).toBeNull();
    expect(
      deadlineDays({
        ...fixture("unknown"),
        canonical: { registration_closes: { precision: "unknown" } },
      }),
    ).toBeNull();
    expect(
      deadlineDays({
        ...fixture("local"),
        canonical: {
          registration_closes: {
            precision: "local_datetime",
            local_value: "2026-11-02T20:00",
          },
        },
      }),
    ).toBeNull();
  });
  it("rejects malformed dates and naive clocks", () => {
    for (const date of ["bad", "2026-02-30", "2026-11-03T20:00:00"])
      expect(deadlineDays(fixture("invalid", date))).toBeNull();
  });
  it("uses the source calendar zone and the documented UTC fallback for date-only values", () => {
    const value = fixture("zone", "2026-10-31");
    expect(deadlineDays(value)).toBe(1);
    value.canonical.registration_closes.timezone = "Asia/Kolkata";
    expect(deadlineDays(value)).toBe(0);
    value.canonical.registration_closes.timezone = "+0530";
    expect(deadlineDays(value)).toBe(0);
    value.canonical.registration_closes.timezone = "bad-zone";
    expect(deadlineDays(value)).toBe(1);
  });
  it("respects exact instants even when the UTC calendar day is unchanged", () => {
    const exact = (at) => ({
      canonical: { registration_closes: { precision: "timestamp", at } },
    });
    expect(deadlineDays(exact("2026-10-30T19:59:00Z"))).toBe(-1);
    expect(deadlineDays(exact("2026-10-30T21:00:00Z"))).toBe(1);
    expect(deadlineDays(exact("2026-11-01T01:30:00+05:30"))).toBe(1);
  });
  it("plots stable real IDs, nearer deadlines closer to the origin, and keeps closed/unknown outside", () => {
    const a = fixture("a", "2026-11-01"),
      b = fixture("b", "2026-11-15");
    const closed = {
      ...fixture("closed"),
      canonical: {
        ...fixture("closed").canonical,
        registration_state: "cancelled",
      },
    };
    const unknown = {
      _id: "unknown",
      title: "No date",
      event_end: "2026-11-10",
    };
    const field = buildSignalField([a, b, closed, unknown]);
    expect(field.points.map((point) => point.id)).toEqual(["a", "b"]);
    const radius = (point) => Math.hypot(point.x - 230, point.y - 150);
    expect(radius(field.points[0])).toBeLessThan(radius(field.points[1]));
    expect(buildSignalField([b, a]).points).toEqual(field.points);
    expect(field.unknown.map((event) => event.id)).toEqual([
      "closed",
      "unknown",
    ]);
    expect(buildSignalField([])).toEqual({ points: [], unknown: [] });
  });
});

describe("interactive opportunity field", () => {
  it("opens the actual mapped event through points and keyboard-friendly selection", () => {
    const onSelect = vi.fn();
    render(
      <SignalField events={[fixture("a"), fixture("b")]} onSelect={onSelect} />,
    );
    expect(screen.getByText("2 on this page")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Opportunity a, registration closes in 3 days",
      }),
    );
    expect(onSelect.mock.lastCall[0].id).toBe("a");
    fireEvent.change(
      screen.getByRole("combobox", { name: "Choose a mapped opportunity" }),
      { target: { value: "b" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Open selected opportunity" }),
    );
    expect(onSelect.mock.lastCall[0].id).toBe("b");
    const expand = screen.getByRole("button", {
      name: /Explore the deadline map/,
    });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(expand);
    expect(expand).toHaveAttribute("aria-expanded", "true");
  });
  it("retains access to unknown records without plotting invented dates", () => {
    const onSelect = vi.fn();
    render(
      <SignalField
        events={[{ _id: "unknown", title: "Date pending" }]}
        onSelect={onSelect}
      />,
    );
    expect(
      screen.getByText("No confirmed future registration dates on this page."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Date pending" }));
    expect(onSelect.mock.lastCall[0].id).toBe("unknown");
  });
  it("hides old plotted events during API failures and exposes an honest state", () => {
    render(<SignalField events={[fixture("a")]} error />);
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Open Opportunity/ }),
    ).not.toBeInTheDocument();
  });
});

describe("independent closing windows feed", () => {
  it("requests the real closing API and filters unconfirmed/expired results defensively", async () => {
    const onSelect = vi.fn(),
      onViewAll = vi.fn();
    fetchPublicEvents.mockResolvedValue({
      events: [
        fixture("closing"),
        {
          _id: "unknown",
          title: "Unknown window",
          lifecycle_state: "Closing soon",
        },
        fixture("expired", "2026-10-28"),
      ],
      total: 3,
    });
    render(<ClosingWindows onSelect={onSelect} onViewAll={onViewAll} />);
    await screen.findByRole("button", { name: /Opportunity closing/ });
    expect(fetchPublicEvents).toHaveBeenCalledWith(
      "status=closing&tab=upcoming&sort=deadline&limit=3",
      { signal: expect.any(AbortSignal) },
    );
    expect(screen.queryByText("Unknown window")).not.toBeInTheDocument();
    expect(screen.queryByText("Opportunity expired")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Opportunity closing/ }),
    );
    expect(onSelect.mock.lastCall[0].id).toBe("closing");
    fireEvent.click(screen.getByRole("button", { name: /View closing soon/ }));
    expect(onViewAll).toHaveBeenCalledOnce();
  });
  it("recovers from a failed feed without displaying a false empty result", async () => {
    fetchPublicEvents
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ events: [], total: 0 });
    render(<ClosingWindows />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Try deadlines again" }),
    );
    await screen.findByText(
      "No confirmed closing windows right now. Explore the full directory.",
    );
    expect(fetchPublicEvents).toHaveBeenCalledTimes(2);
  });
  it("aborts the independent request when unmounted", async () => {
    fetchPublicEvents.mockImplementation(() => new Promise(() => {}));
    const { unmount } = render(<ClosingWindows />);
    await waitFor(() => expect(fetchPublicEvents).toHaveBeenCalledOnce());
    const signal = fetchPublicEvents.mock.calls[0][1].signal;
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
