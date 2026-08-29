import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SubscriptionScanner from "@/components/pages/SubscriptionScanner";

const API_URL = "https://scanner.example.com";

describe("SubscriptionScanner", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SUBSCRIPTION_SCANNER_API_URL", API_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("opens OAuth and only renders a valid result from the API origin", async () => {
    const popup = {} as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(popup);
    const user = userEvent.setup();
    render(<SubscriptionScanner />);

    await user.click(
      screen.getByRole("button", { name: "Googleと連携して自動チェック" }),
    );

    expect(open).toHaveBeenCalledWith(
      `${API_URL}/oauth/start?origin=${encodeURIComponent(window.location.origin)}&mode=popup`,
      "subscription-scanner-oauth",
      "popup,width=560,height=760",
    );
    expect(screen.getByRole("status")).toHaveTextContent("過去1年");

    const data = {
      type: "subscription-scan-result",
      ok: true,
      payload: {
        subscriptions: [
          {
            service_name: "Netflix",
            amount: 1590,
            currency: "JPY",
            billed_at: "2026-08-20",
            billing_cycle: "monthly",
            source: "rule",
            confidence: 0.98,
            estimated_monthly_amount: 1590,
          },
        ],
        summary: {
          monthly_totals: [{ currency: "JPY", amount: 1590 }],
          annual_savings_potential: [{ currency: "JPY", amount: 19080 }],
        },
        scanned_messages: 24,
        ai_analyzed_messages: 3,
        warnings: [],
      },
    };

    fireEvent(
      window,
      new MessageEvent("message", {
        origin: "https://attacker.example",
        source: popup,
        data,
      }),
    );
    expect(screen.queryByText("Netflix")).not.toBeInTheDocument();

    fireEvent(
      window,
      new MessageEvent("message", {
        origin: API_URL,
        source: {} as Window,
        data,
      }),
    );
    expect(screen.queryByText("Netflix")).not.toBeInTheDocument();

    fireEvent(
      window,
      new MessageEvent("message", { origin: API_URL, source: popup, data }),
    );

    expect(await screen.findByText("Netflix")).toBeInTheDocument();
    expect(screen.getAllByText("￥1,590")).toHaveLength(2);
    expect(screen.getByText("￥19,080")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows a callback error", async () => {
    const popup = {} as Window;
    vi.spyOn(window, "open").mockReturnValue(popup);
    const user = userEvent.setup();
    render(<SubscriptionScanner />);
    await user.click(
      screen.getByRole("button", { name: "Googleと連携して自動チェック" }),
    );

    fireEvent(
      window,
      new MessageEvent("message", {
        origin: API_URL,
        source: popup,
        data: {
          type: "subscription-scan-result",
          ok: false,
          error: "Google連携がキャンセルされました。",
        },
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Google連携がキャンセルされました。",
    );
  });
});
