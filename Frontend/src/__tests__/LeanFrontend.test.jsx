import React from "react";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../App";
import Dialog from "../components/Dialog";
import DiscoveryControls from "../components/DiscoveryControls";
import { useGeolocation } from "../hooks/useGeolocation";

const cardRenders = vi.hoisted(() => vi.fn());
vi.mock("../components/HackathonCard", async (original) => {
  const actual = await original();
  return {
    ...actual,
    HackathonCard: (props) => {
      cardRenders(props.event.id);
      return <actual.HackathonCard {...props} />;
    },
  };
});

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  localStorage.clear();
  cardRenders.mockClear();
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("does not re-render the discovery cards while updating scroll progress", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ _id: "fixture", title: "Synthetic lean fixture" }],
        upcoming_total: 1,
        all_total: 1,
      }),
    }),
  );
  render(<App />);
  await screen.findByRole("heading", {
    name: "Synthetic lean fixture",
    level: 2,
  });
  const count = cardRenders.mock.calls.length;
  vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(
    2000,
  );
  vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(
    1000,
  );
  vi.stubGlobal("scrollY", 250);
  fireEvent.scroll(window);
  expect(cardRenders).toHaveBeenCalledTimes(count);
});

it("keeps the search shortcut inside an open dialog", () => {
  render(
    <>
      <DiscoveryControls />
      <Dialog isOpen title="Fixture dialog" onClose={vi.fn()}>
        <p>Content</p>
      </Dialog>
    </>,
  );
  const close = screen.getByRole("button", { name: "Close dialog" });
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: "/" });
  expect(close).toHaveFocus();
});

it("does not steal slash or modified shortcuts from editable content", () => {
  render(
    <>
      <DiscoveryControls />
      <div contentEditable tabIndex={0} aria-label="Fixture editor" />
    </>,
  );
  const editor = screen.getByLabelText("Fixture editor");
  editor.focus();
  fireEvent.keyDown(editor, { key: "/" });
  expect(editor).toHaveFocus();
  editor.blur();
  fireEvent.keyDown(window, { key: "/", ctrlKey: true });
  expect(screen.getByRole("searchbox")).not.toHaveFocus();
});

it("closes mobile filters with Escape and restores the toggle focus", () => {
  render(<DiscoveryControls />);
  const toggle = screen.getByRole("button", { name: "Filters" });
  fireEvent.click(toggle);
  const select = screen.getByRole("combobox", { name: "Sort hackathons" });
  select.focus();
  fireEvent.keyDown(select, { key: "Escape" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(toggle).toHaveFocus();
  expect(
    document.getElementById(toggle.getAttribute("aria-controls")),
  ).toBeTruthy();
});

it("ignores location callbacks after reset and prevents duplicate permission requests", () => {
  let complete;
  const getCurrentPosition = vi.fn((callback) => {
    complete = callback;
  });
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
  const { result } = renderHook(() => useGeolocation());
  act(() => {
    result.current.requestLocation();
    result.current.requestLocation();
  });
  expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  act(() => result.current.clearLocation());
  act(() => complete({ coords: { latitude: 0, longitude: 0 } }));
  expect(result.current.coords).toBeNull();
  expect(result.current.locating).toBe(false);
});

it("shows and can cancel a deep-linked detail request without reopening a late result", async () => {
  window.history.replaceState({}, "", "/?event=outside-page");
  const pending = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url) =>
      String(url).includes("/hackathons/")
        ? new Promise((resolve) => pending.push(resolve))
        : Promise.resolve({
            ok: true,
            json: async () => ({ data: [], upcoming_total: 0, all_total: 0 }),
          }),
    ),
  );
  render(<App />);
  await screen.findByRole("dialog", { name: "Opening event" });
  await waitFor(() => expect(pending.length).toBeGreaterThan(0));
  fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
  await act(async () => {
    for (const resolve of pending)
      resolve({
        ok: true,
        json: async () => ({ _id: "outside-page", title: "Late fixture" }),
      });
  });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(new URL(location.href).searchParams.has("event")).toBe(false);
});
