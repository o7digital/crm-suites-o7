import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
const { PDFDocument } = createRequire(`${process.cwd()}/package.json`)(
  "../api/node_modules/pdf-lib",
);
let pdf: Buffer;
test.beforeAll(async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawText("Contract for signature", { x: 50, y: 750, size: 18 });
  pdf = Buffer.from(await doc.save());
});
const token = "a".repeat(64);
const actor = {
  id: "owner",
  tenantId: "workspace",
  email: "owner@example.test",
  name: "Owner",
  role: "OWNER",
};
const field = (id: string, type: string) => ({
  id,
  type,
  page: 1,
  x: 0.1,
  y: id === "signature" ? 0.5 : 0.6,
  width: 0.35,
  height: 0.065,
  recipientId: "one",
  label: id === "signature" ? "Signature" : "Initials",
  required: true,
});
const envelope = {
  id: "document",
  title: "Client contract",
  tenantName: "Clinic",
  status: "SENT",
  language: "en",
  pages: 1,
  pageSizes: [{ width: 595, height: 842 }],
  originalHash: "hash",
  createdAt: "2026-10-06",
  fields: [field("signature", "signature"), field("initials", "initials")],
  recipients: [
    {
      id: "one",
      name: "Jane Smith",
      email: "jane@example.test",
      delivery: "SENT",
    },
  ],
  recipientId: "one",
};
async function recipient(page: Page) {
  let pdfReads = 0;
  let submitted: any;
  let completed = false;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    let data: any = {};
    let status = 200;
    if (path === `/signatures/public/${token}`)
      data = {
        title: envelope.title,
        tenantName: "Clinic",
        name: "Jane Smith",
        email: "ja***@example.test",
        status: "SENT",
        language: "en",
      };
    else if (path.endsWith("/code")) data = { sent: true };
    else if (path.endsWith("/verify")) {
      if (route.request().postDataJSON().code === "123456")
        data = { session: "verified-session" };
      else {
        status = 400;
        data = { message: "Incorrect code" };
      }
    } else if (path.endsWith("/document")) {
      expect(route.request().headers()["x-signing-session"]).toBe(
        "verified-session",
      );
      data = {
        ...envelope,
        status: completed ? "COMPLETED" : "SENT",
        recipients: completed
          ? [{ ...envelope.recipients[0], signedAt: "2026-10-06T12:00:00Z" }]
          : envelope.recipients,
      };
    } else if (path.endsWith("/pdf")) {
      pdfReads++;
      expect(route.request().headers()["x-signing-session"]).toBe(
        "verified-session",
      );
      await route.fulfill({ contentType: "application/pdf", body: pdf });
      return;
    } else if (path.endsWith("/sign")) {
      submitted = route.request().postDataJSON();
      completed = true;
      data = { completed: true, alreadySigned: false };
    }
    await route.fulfill({ status, json: data });
  });
  await page.goto(`/sign/${token}`);
  return { pdfReads: () => pdfReads, submitted: () => submitted };
}
async function verify(page: Page) {
  await page
    .getByRole("button", { name: "Email me a verification code" })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Code sent. Check your mailbox.",
  );
  await page.getByLabel("Six-digit code").fill("123456");
  await page.getByRole("button", { name: "Verify and open document" }).click();
  await expect(
    page.getByRole("heading", { name: "Signature fields" }),
  ).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible();
}
test("requires emailed code before exposing PDF and records typed signature with initials and consent", async ({
  page,
}) => {
  const state = await recipient(page);
  await expect(
    page.getByRole("heading", { name: "Verify your email" }),
  ).toBeVisible();
  expect(state.pdfReads()).toBe(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByLabel("Six-digit code").fill("111111");
  await page.getByRole("button", { name: "Verify and open document" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Incorrect code" }),
  ).toHaveText("Incorrect code");
  expect(state.pdfReads()).toBe(0);
  await verify(page);
  const sign = page.getByRole("button", { name: "Sign document", exact: true });
  await expect(sign).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Signature", exact: true })
    .fill("Jane Smith");
  await page.getByRole("textbox", { name: "Initials", exact: true }).fill("JS");
  await expect(sign).toBeDisabled();
  await page.getByRole("checkbox").check();
  await sign.click();
  await expect(
    page.getByText("The document has been signed by everyone."),
  ).toBeVisible();
  expect(state.submitted()).toEqual({
    consent: true,
    values: { signature: { text: "Jane Smith" }, initials: { text: "JS" } },
  });
  await expect(
    page.getByRole("button", { name: "Download signed PDF" }),
  ).toBeVisible();
});
test("captures handwritten signature and works on mobile", async ({ page }) => {
  const state = await recipient(page);
  await verify(page);
  await page.getByRole("button", { name: "Draw", exact: true }).click();
  const pad = page.getByLabel("Handwritten signature");
  const bounds = (await pad.boundingBox())!;
  await page.mouse.move(bounds.x + 20, bounds.y + 30);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 80, bounds.y + 50, { steps: 10 });
  await page.mouse.move(bounds.x + 140, bounds.y + 20, { steps: 10 });
  await page.mouse.up();
  await page.getByRole("textbox", { name: "Initials", exact: true }).fill("JS");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Sign document", exact: true })
    .click();
  await expect(
    page.getByText("The document has been signed by everyone."),
  ).toBeVisible();
  expect(state.submitted().values.signature.image).toMatch(
    /^data:image\/png;base64,/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const size = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
});
test("sender generates a PDF, saves positioned fields and sends through workspace connector", async ({
  page,
}) => {
  let created: any;
  let saved: any;
  let document: any = null;
  await page.addInitScript((actor) => {
    localStorage.setItem("localAuthSession", "true");
    localStorage.setItem("token", "test");
    localStorage.setItem("user", JSON.stringify(actor));
    localStorage.setItem("o7_language", "en");
  }, actor);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    let data: any = {};
    if (path === "/auth/me")
      data = { user: { userId: actor.id, tenantId: actor.tenantId } };
    else if (path === "/signatures/settings")
      data = { configured: true, fromEmail: "clinic@example.test" };
    else if (path === "/signatures" && route.request().method() === "POST") {
      created = route.request().postDataJSON();
      document = { ...envelope, status: "DRAFT", fields: [], recipients: [] };
      data = document;
    } else if (path === "/signatures") data = document ? [document] : [];
    else if (path === "/signatures/document/pdf") {
      await route.fulfill({ contentType: "application/pdf", body: pdf });
      return;
    } else if (
      path === "/signatures/document" &&
      route.request().method() === "PATCH"
    ) {
      saved = route.request().postDataJSON();
      document = { ...document, ...saved };
      data = document;
    } else if (path === "/signatures/document/send") {
      document = {
        ...document,
        status: "SENT",
        recipients: document.recipients.map((r: any) => ({
          ...r,
          delivery: "SENT",
        })),
      };
      data = document;
    } else if (path === "/signatures/document") data = document;
    else if (path === "/clients") data = [];
    else if (path === "/tenant/settings")
      data = { settings: { crmMode: "B2B", crmDisplayCurrency: "USD" } };
    else if (path === "/tenant/branding") data = { branding: {} };
    else if (path === "/admin/context")
      data = { role: "OWNER", ownsSubscriptions: true };
    await route.fulfill({ json: data });
  });
  await page.goto("/admin/contracts");
  const workspace = page.getByRole("region", {
    name: "o7 electronic signature",
  });
  await workspace
    .getByRole("button", { name: "Prepare a document", exact: true })
    .click();
  await workspace
    .getByLabel("Document title", { exact: true })
    .fill("Agreement");
  await workspace.getByLabel("Document content").fill("Hello Jane");
  await workspace
    .getByRole("button", { name: "Create PDF", exact: true })
    .click();
  await workspace.getByRole("button", { name: "Add signatory" }).click();
  await workspace.getByLabel("Full name").fill("Jane Smith");
  await workspace
    .getByLabel("Email", { exact: true })
    .fill("jane@example.test");
  const canvas = workspace.locator("canvas").first();
  await expect(canvas).toBeVisible();
  const bounds = (await canvas.boundingBox())!;
  await canvas.click({
    position: { x: bounds.width * 0.12, y: bounds.height * 0.55 },
  });
  await workspace.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => saved?.fields?.length).toBe(1);
  expect(saved.fields[0].type).toBe("signature");
  expect(saved.fields[0].recipientId).toBe(saved.recipients[0].id);
  expect(created).toMatchObject({
    title: "Agreement",
    text: "Hello Jane",
    language: "en",
  });
  await workspace.getByRole("button", { name: "Send for signature" }).click();
  await expect(
    workspace.getByText("Awaiting signatures", { exact: true }),
  ).toBeVisible();
  await expect(
    workspace.getByText("Email accepted by mail server"),
  ).toBeVisible();
  await expect(
    workspace.getByRole("button", { name: "Save draft" }),
  ).toHaveCount(0);
});
test("unconfigured Mailing connector allows preparation and clearly blocks sending", async ({
  page,
}) => {
  await page.addInitScript((actor) => {
    localStorage.setItem("localAuthSession", "true");
    localStorage.setItem("token", "test");
    localStorage.setItem("user", JSON.stringify(actor));
    localStorage.setItem("o7_language", "en");
  }, actor);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json: path.endsWith("/signatures/settings")
        ? { configured: false, fromEmail: null }
        : path.endsWith("/signatures") || path.endsWith("/clients")
          ? []
          : path.endsWith("/auth/me")
            ? { user: { userId: actor.id, tenantId: actor.tenantId } }
            : path.endsWith("/tenant/settings")
              ? { settings: {} }
              : {},
    });
  });
  await page.goto("/admin/contracts");
  const workspace = page.getByRole("region", {
    name: "o7 electronic signature",
  });
  await expect(workspace.getByText(/Configure SMTP\/Mailcow/)).toBeVisible();
  await expect(
    workspace.getByRole("link", { name: "Open Mailing settings" }),
  ).toHaveAttribute("href", "/admin/parameters/customers");
  await workspace
    .getByRole("button", { name: "Prepare a document", exact: true })
    .click();
  await expect(workspace.getByLabel("Document content")).toBeVisible();
});

test('legacy Vercel static entry reads the original invitation path', async ({page}) => {
  await page.route(`**/sign/${token}`, async route => {
    const response = await route.fetch({url:'http://127.0.0.1:3128/sign'});
    await route.fulfill({response});
  });
  const state = await recipient(page);
  await expect(page.getByRole('heading',{name:'Verify your email'})).toBeVisible();
  expect(state.pdfReads()).toBe(0);
  await verify(page);
  await expect(page.getByRole('textbox',{name:'Signature',exact:true})).toBeVisible();
});
