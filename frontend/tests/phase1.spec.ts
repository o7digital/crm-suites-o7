import { test, expect, Page } from "@playwright/test";
const user = {
  id: "u1",
  tenantId: "t1",
  name: "Phase 1",
  email: "test@example.test",
};
const stages = [
  {
    id: "open",
    name: "Qualified",
    status: "OPEN",
    position: 0,
    probability: 0.6,
    pipelineId: "p1",
  },
  {
    id: "won",
    name: "Won",
    status: "WON",
    position: 1,
    probability: 1,
    pipelineId: "p1",
  },
  {
    id: "lost",
    name: "Lost",
    status: "LOST",
    position: 2,
    probability: 0,
    pipelineId: "p1",
  },
];
async function mock(page: Page, failClose = false) {
  let deal = {
    id: "d1",
    title: "Phase 1 opportunity",
    value: 5000,
    currency: "USD",
    status: "OPEN",
    stageId: "open",
    pipelineId: "p1",
    stage: stages[0],
    updatedAt: "2026-09-07T00:00:00.000Z",
    boardOrder: 0,
    closeEventId: "",
  };
  await page.addInitScript(
    ({ user }) => {
      localStorage.setItem("o7_language", "en");
      localStorage.setItem("token", "test-only-token");
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem(
        "supportOriginalSession",
        JSON.stringify({ token: "test-only-token", user }),
      );
    },
    { user },
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    let data: unknown = {};
    if (path === "/pipelines")
      data = [{ id: "p1", name: "New Sales", isDefault: true }];
    else if (path === "/stages") data = stages;
    else if (path === "/deals") data = [deal];
    else if (
      path === "/clients" ||
      path === "/products" ||
      path === "/admin/users" ||
      path === "/tasks/assignees"
    )
      data = [];
    else if (path === "/tenant/settings")
      data = { settings: { crmMode: "B2B", crmDisplayCurrency: "USD" } };
    else if (path === "/tenant/branding") data = { branding: {} };
    else if (path === "/fx/usd")
      data = { rates: { USD: 1 }, date: "2026-09-07", base: "USD" };
    else if (path === "/dashboard")
      data = {
        clients: 0,
        prospects: 0,
        tasks: {},
        leads: {
          open: 1,
          total: 1,
          openByCurrency: [],
          fx: { missingCurrencies: [] },
        },
        invoices: { total: 0, amount: 0, recent: [] },
      };
    else if (path === "/dashboard/command-center") {
      data = {
        scope: "workspace",
        timeZone: "UTC",
        ...Object.fromEntries(
          [
            "dueToday",
            "overdue",
            "closingThisWeek",
            "noNextAction",
            "staleDeals",
          ].map((key) => [
            key,
            {
              count: 1,
              items: [
                {
                  id: key,
                  title: `Item ${key}`,
                  pipelineId:
                    key.includes("Today") || key === "overdue"
                      ? undefined
                      : "p1",
                },
              ],
            },
          ]),
        ),
      };
    } else if (path === "/deals/d1/close") {
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (failClose)
        return route.fulfill({
          status: 500,
          json: { message: "Simulated API failure" },
        });
      const body = route.request().postDataJSON();
      deal = {
        ...deal,
        status: body.status,
        stageId: body.status.toLowerCase(),
        stage: stages.find((s) => s.status === body.status)!,
        closeEventId: "ce1",
        updatedAt: "2026-09-07T00:01:00.000Z",
      };
      data = deal;
    } else if (path === "/deals/d1/undo-close") {
      deal = { ...deal, status: "OPEN", stageId: "open", stage: stages[0] };
      data = deal;
    } else if (path.endsWith("/activity")) data = [];
    await route.fulfill({ json: data });
  });
}
async function drop(page: Page, status: "WON" | "LOST") {
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await transfer.evaluate((dt) => dt.setData("text/plain", "d1"));
  await page
    .getByTestId("deal-card-d1")
    .dispatchEvent("dragstart", { dataTransfer: transfer });
  const target = page.getByTestId(`close-zone-${status}`);
  await expect(target).toBeVisible();
  await target.dispatchEvent("drop", { dataTransfer: transfer });
}

test("WON removes the open card optimistically; Undo restores it", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/crm");
  await expect(page.getByTestId("deal-card-d1")).toBeVisible();
  await drop(page, "WON");
  await expect(page.getByTestId("deal-card-d1")).toHaveCount(0);
  await page.getByTestId("undo-close").click();
  await expect(page.getByTestId("deal-card-d1")).toBeVisible();
});
test("LOST requires a reason, then closes the card", async ({ page }) => {
  await mock(page);
  await page.goto("/crm");
  await expect(page.getByTestId("deal-card-d1")).toBeVisible();
  await drop(page, "LOST");
  await expect(page.getByTestId("confirm-close")).toBeDisabled();
  await page.getByTestId("loss-reason").selectOption("price");
  await page.getByTestId("confirm-close").click();
  await expect(page.getByTestId("undo-close")).toBeVisible();
  await expect(page.getByTestId("deal-card-d1")).toHaveCount(0);
});
test("failed closing restores the open card and shows the API error", async ({
  page,
}) => {
  await mock(page, true);
  await page.goto("/crm");
  await expect(page.getByTestId("deal-card-d1")).toBeVisible();
  await drop(page, "WON");
  await expect(page.getByTestId("deal-card-d1")).toHaveCount(0);
  await expect(page.getByTestId("deal-card-d1")).toBeVisible();
  await expect(page.getByText(/Simulated API failure/)).toBeVisible();
});
test("Command Center displays five actionable groups without replacing the dashboard", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/");
  const center = page.getByRole("region", { name: "Command Center" });
  await expect(
    center.getByRole("heading", { name: "Tasks due today" }),
  ).toBeVisible();
  await expect(center.getByRole("link")).toHaveCount(5);
  await page.screenshot({
    path: "test-results/command-center.png",
    fullPage: true,
  });
});
