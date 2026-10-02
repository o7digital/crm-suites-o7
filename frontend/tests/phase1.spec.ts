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
async function mock(page: Page, failClose = false, sessionUser = user) {
  let deal = {
    id: "d1",
    title: "Phase 1 opportunity",
    value: 5000,
    currency: "USD",
    clientId: "c1",
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
    { user: sessionUser },
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    let data: unknown = {};
    if (path === "/auth/me")
      data = { user: { userId: sessionUser.id, tenantId: sessionUser.tenantId } };
    else if (path === "/pipelines")
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
            "upcomingFollowUps",
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
                    key.includes("Today") ||
                    key === "overdue" ||
                    key === "upcomingFollowUps"
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

test("support can create the first workflow and reopen it for editing", async ({ page }) => {
  await mock(page);
  let pipelines: unknown[] = [];
  let createdStages: unknown[] = [];
  await page.route("**/api/pipelines", async route => {
    if (route.request().method() === "POST") {
      const pipeline = { id: "customer-pipeline", ...route.request().postDataJSON() };
      pipelines = [pipeline];
      return route.fulfill({ json: pipeline });
    }
    await route.fulfill({ json: pipelines });
  });
  await page.route("**/api/stages**", async route => {
    if (route.request().method() === "POST") {
      const stage = { id: "customer-stage", ...route.request().postDataJSON() };
      createdStages.push(stage);
      return route.fulfill({ json: stage });
    }
    await route.fulfill({ json: createdStages });
  });
  await page.route("**/api/deals**", route => route.fulfill({ json: [] }));
  await page.goto("/crm");
  await expect(page.getByText("No workflow yet. Create the first workflow for this workspace.")).toBeVisible();
  await page.getByRole("button", { name: "Manage Workflow", exact: true }).click();
  await page.getByLabel("Workflow name", { exact: true }).fill("RHEO Sales");
  await page.getByLabel("Stage name", { exact: true }).fill("Qualification");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/pipelineId=customer-pipeline/);
  expect(createdStages).toEqual([expect.objectContaining({ pipelineId: "customer-pipeline", name: "Qualification" })]);
  await page.getByRole("button", { name: "Manage Workflow", exact: true }).click();
  await expect(page.getByLabel("Workflow name", { exact: true })).toHaveValue("RHEO Sales");
});

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
test("Command Center displays upcoming sales follow-ups with actionable groups", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/");
  const center = page.getByRole("region", { name: "Command Center" });
  await expect(
    center.getByRole("heading", { name: "Tasks due today" }),
  ).toBeVisible();
  await expect(
    center.getByRole("heading", { name: "Upcoming sales follow-ups" }),
  ).toBeVisible();
  await expect(
    center.getByRole("link", { name: "Item upcomingFollowUps" }),
  ).toHaveAttribute("href", "/tasks#task-upcomingFollowUps");
  await expect(center.getByRole("link")).toHaveCount(6);
  await page.screenshot({
    path: "test-results/command-center.png",
    fullPage: true,
  });
});

test("the bureau loads follow-ups from an older API and respects assigned scope", async ({
  page,
}) => {
  await mock(page, false, { ...user, id: "seller1" });
  await page.route("**/api/dashboard/command-center?**", (route) =>
    route.fulfill({
      json: {
        scope: "assigned",
        timeZone: "UTC",
        ...Object.fromEntries(
          [
            "dueToday",
            "overdue",
            "closingThisWeek",
            "noNextAction",
            "staleDeals",
          ].map((key) => [key, { count: 0, items: [] }]),
        ),
      },
    }),
  );
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ json: { user: { userId: "seller1", tenantId: user.tenantId } } }),
  );
  const dueDate = new Date(Date.now() + 7 * 86400000).toISOString();
  await page.route("**/api/tasks", (route) =>
    route.fulfill({
      json: [
        {
          id: "visible",
          title: "Follow-up: Lost sale",
          status: "PENDING",
          opportunityId: "lost1",
          assigneeId: "seller1",
          dueDate,
        },
        {
          id: "foreign",
          title: "Another seller",
          status: "PENDING",
          opportunityId: "lost1",
          assigneeId: "seller2",
          dueDate,
        },
        {
          id: "done",
          title: "Already completed",
          status: "DONE",
          opportunityId: "lost1",
          assigneeId: "seller1",
          dueDate,
        },
      ],
    }),
  );
  await page.goto("/");
  const center = page.getByRole("region", { name: "Command Center" });
  await expect(
    center.getByRole("link", { name: "Follow-up: Lost sale" }),
  ).toHaveAttribute("href", "/tasks#task-visible");
  await expect(center.getByText("Another seller")).toHaveCount(0);
  await expect(center.getByText("Already completed")).toHaveCount(0);
});

test("LOST with a follow-up date creates a task by default and preserves the local date", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/crm");
  await drop(page, "LOST");
  await page.getByTestId("loss-reason").selectOption("price");
  await page.getByTestId("follow-up-date").fill("2027-01-15");
  await expect(page.getByTestId("create-follow-up")).toBeChecked();
  const request = page.waitForRequest((req) =>
    req.url().endsWith("/deals/d1/close"),
  );
  await page.getByTestId("confirm-close").click();
  const body = (await request).postDataJSON();
  expect(body.createFollowUp).toBe(true);
  expect(
    await page.evaluate((value) => {
      const date = new Date(value);
      return [
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate(),
        date.getHours(),
      ];
    }, body.followUpAt),
  ).toEqual([2027, 1, 15, 12]);
  await expect(page.getByTestId("undo-close")).toBeVisible();
});

test("checking follow-up without a date schedules it for tomorrow", async ({ page }) => {
  await mock(page);
  await page.goto("/crm");
  await drop(page, "LOST");
  await page.getByTestId("loss-reason").selectOption("price");
  await page.getByTestId("create-follow-up").check();
  await expect(page.getByTestId("follow-up-date")).not.toHaveValue("");
  const request = page.waitForRequest((req) => req.url().endsWith("/deals/d1/close"));
  await page.getByTestId("confirm-close").click();
  const body = (await request).postDataJSON();
  expect(body.createFollowUp).toBe(true);
  expect(body.followUpAt).toBeTruthy();
});

test("clearing a follow-up date clears task creation; the checkbox can be opted out", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/crm");
  await drop(page, "LOST");
  await page.getByTestId("follow-up-date").fill("2027-01-15");
  await page.getByTestId("create-follow-up").uncheck();
  await expect(page.getByTestId("create-follow-up")).not.toBeChecked();
  await page.getByTestId("follow-up-date").fill("");
  await expect(page.getByTestId("create-follow-up")).toBeEnabled();
  await expect(page.getByTestId("create-follow-up")).not.toBeChecked();
});

test("a linked pipeline loads while settings and pipeline list are pending", async ({ page }) => {
  await mock(page);
  let releaseSettings!: () => void;
  let releasePipelines!: () => void;
  await page.route("**/api/tenant/settings", async (route) => {
    await new Promise<void>((resolve) => { releaseSettings = resolve; });
    await route.fulfill({ json: { settings: { crmMode: "B2B", crmDisplayCurrency: "USD" } } });
  });
  await page.route("**/api/pipelines", async (route) => {
    await new Promise<void>((resolve) => { releasePipelines = resolve; });
    await route.fulfill({ json: [{ id: "p1", name: "New Sales", isDefault: true }] });
  });
  await page.goto("/crm?pipelineId=p1");
  await expect(page.getByTestId("deal-card-d1")).toBeVisible();
  releaseSettings();
  releasePipelines();
  await expect(page.getByTestId("deal-card-d1")).toBeVisible();
});

test("a monthly package sends its duration, first date and workflow", async ({ page }) => {
  await mock(page);
  await page.route("**/api/deals", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({ json: {
      id: "monthly-1", title: "Monthly package", value: 1200, currency: "USD",
      status: "OPEN", pipelineId: "p1", stageId: "open",
      recurrenceIndex: 1, recurrenceMonths: 6,
    } });
  });
  await page.goto("/crm");
  await page.getByRole("button", { name: "New deal" }).click();
  await page.getByLabel("Deal name").fill("Monthly package");
  await page.getByTestId("recurring-deal").check();
  await page.getByLabel("Monthly amount").fill("1200");
  await page.getByTestId("recurrence-months").fill("6");
  await page.getByTestId("recurrence-start-date").fill("2026-11-30");
  const request = page.waitForRequest((req) =>
    req.method() === "POST" && new URL(req.url()).pathname === "/api/deals",
  );
  await page.getByRole("button", { name: "Create deal" }).click();
  expect((await request).postDataJSON()).toEqual(expect.objectContaining({
    title: "Monthly package", value: 1200, pipelineId: "p1", stageId: "open",
    recurrenceMonths: 6, recurrenceStartAt: "2026-11-30",
    expectedCloseDate: "2026-11-30",
  }));
  await expect(page.getByTestId("deal-card-monthly-1")).toContainText("Month 1/6");
});

test("an existing open deal can become a monthly package", async ({ page }) => {
  await mock(page);
  await page.goto("/crm");
  await page.getByTestId("deal-card-d1").click();
  await page.getByTestId("recurring-deal").check();
  await page.getByTestId("recurrence-months").fill("4");
  await page.getByTestId("recurrence-start-date").fill("2026-12-15");
  const request = page.waitForRequest((req) =>
    req.method() === "PATCH" && new URL(req.url()).pathname === "/api/deals/d1",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect((await request).postDataJSON()).toEqual(expect.objectContaining({
    recurrenceMonths: 4, recurrenceStartAt: "2026-12-15",
    pipelineId: "p1", stageId: "open",
  }));
});

test("duplicating a lead shows the numbered copy returned by the API", async ({ page }) => {
  await mock(page);
  let copy = 0;
  await page.route("**/api/deals/*/duplicate", async (route) => {
    copy += 1;
    await route.fulfill({ json: {
      id: `copy-${copy}`, title: `Phase 1 opportunity copy ${copy}`,
      value: 5000, currency: "USD", status: "OPEN", stageId: "open", pipelineId: "p1",
    } });
  });
  await page.goto("/crm");
  await page.getByTestId("deal-card-d1").click();
  await page.getByRole("button", { name: "Duplicate deal" }).click();
  await expect(page.getByLabel("Deal name")).toHaveValue("Phase 1 opportunity copy 1");
  await page.getByRole("button", { name: "Duplicate deal" }).click();
  await expect(page.getByLabel("Deal name")).toHaveValue("Phase 1 opportunity copy 2");
});

test("sales reporting uses closedAt and explicit status, keeps currencies separate and links lost follow-ups", async ({
  page,
}) => {
  await mock(page);
  const deals = [
    {
      id: "lost1",
      title: "Lost sale to recover",
      status: "LOST",
      closedAt: "2026-09-12T12:00:00Z",
      updatedAt: "2027-02-01T00:00:00Z",
      value: 200,
      currency: "USD",
      lossReason: "price",
      clientId: "c1",
      client: { name: "Client A" },
      stage: stages[0],
    },
    {
      id: "lost2",
      title: "MXN loss",
      status: "LOST",
      closedAt: "2026-09-12T12:00:00Z",
      value: 300,
      currency: "MXN",
      lossReason: "price",
      clientId: "c1",
      stage: stages[2],
    },
    {
      id: "won1",
      title: "Won sale",
      status: "WON",
      closedAt: "2026-09-10T12:00:00Z",
      value: 400,
      currency: "USD",
      clientId: "c1",
      stage: stages[0],
    },
    {
      id: "outside",
      title: "Outside period",
      status: "WON",
      closedAt: "2026-08-01T12:00:00Z",
      value: 900,
      currency: "USD",
      stage: stages[1],
    },
    {
      id: "dateOnly",
      title: "Date without task",
      status: "OPEN",
      value: 10,
      followUpAt: "2026-09-15T12:00:00Z",
      clientId: "c1",
      stage: stages[0],
    },
  ];
  await page.route("**/api/deals", (route) => route.fulfill({ json: deals }));
  await page.route("**/api/tasks", (route) =>
    route.fulfill({
      json: [
        {
          id: "follow1",
          title: "Follow-up: Lost sale to recover",
          status: "PENDING",
          opportunityId: "lost1",
          dueDate: "2026-09-15T12:00:00Z",
          assignee: { name: "Seller" },
        },
      ],
    }),
  );
  await page.goto("/admin/reporting");
  await page.locator("input[type=date]").nth(0).fill("2026-09-01");
  await page.locator("input[type=date]").nth(1).fill("2026-09-30");
  const report = page.getByRole("region", { name: "Sales follow-up report" });
  await expect(report.getByText("33%")).toBeVisible();
  await expect(report.getByText("USD 200 · MXN 300")).toBeVisible();
  await expect(
    report.getByRole("link", { name: "Overdue", exact: true }),
  ).toHaveAttribute("href", "/tasks#task-follow1");
  await expect(report.getByText("Date only — no task")).toBeVisible();
  await expect(report.getByText("Outside period")).toHaveCount(0);
  await expect(
    page.getByText("USD 400", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/sales-follow-up-report.png",
    fullPage: true,
  });
});

const legacyBranding = {
  backgroundColor: '#0b1021',
  surfaceColor: '#0f1629',
  cardColor: '#151d32',
  foregroundColor: '#e9edf5',
  mutedColor: '#9fb3c8',
  accentColor: '#7c3aed',
  accentColor2: '#22d3ee',
};

for (const scenario of [
  { name: 'saved legacy theme', branding: legacyBranding, accent: '#d7ff63', background: '#080b0b' },
  { name: 'saved legacy accents', branding: { accentColor: '#7C3AED', accentColor2: '#22D3EE' }, accent: '#d7ff63', background: '#080b0b' },
  { name: 'custom customer theme', branding: { ...legacyBranding, accentColor: '#ff9900' }, accent: '#ff9900', background: '#0b1021' },
]) {
  test(`branding keeps ${scenario.name} correct after delayed account loading`, async ({ page }) => {
    await mock(page);
    await page.route('**/api/tenant/branding', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fulfill({ json: { branding: scenario.branding } });
    });
    const response = page.waitForResponse('**/api/tenant/branding');
    await page.goto('/crm');
    await response;
    await expect.poll(() => page.evaluate(() => ({
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      background: getComputedStyle(document.documentElement).getPropertyValue('--background').trim(),
    }))).toEqual({ accent: scenario.accent, background: scenario.background });
    await page.reload();
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe(scenario.accent);
  });
}
