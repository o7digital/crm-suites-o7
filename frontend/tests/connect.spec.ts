import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID, createHash } from "node:crypto";
const api = "http://127.0.0.1:4109/api";
const fixture = JSON.parse(
  readFileSync("/private/tmp/pulse-connect-browser.json", "utf8"),
);
test("real Pulse login → OAuth consent → MCP write → visible CRM records → revoke", async ({
  page,
  request,
}) => {
  const verifier = randomBytes(32).toString("base64url");
  const params = new URLSearchParams({
    client_id: "pulse-isolated-browser",
    redirect_uri: "http://127.0.0.1:3109/callback",
    resource: `${api}/mcp`,
    response_type: "code",
    scope: "pulse:read pulse:write offline_access",
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    state: randomUUID(),
  });
  await page.goto(`${api}/oauth/authorize?${params}`);
  await expect(
    page.getByRole("link", { name: "Iniciar sesión en Pulse" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Iniciar sesión en Pulse" }).click();
  await page.locator('input[type="email"]').fill(fixture.email);
  await page.locator('input[type="password"]').fill(fixture.password);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText(fixture.email, { exact: false })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Autorizar conexión" }),
  ).toBeDisabled();
  await page.getByLabel(/Permitir crear/).check();
  await page
    .getByLabel("Zona horaria", { exact: true })
    .fill("America/Mexico_City");
  await page.getByLabel(/Confirmo que esta zona/).check();
  await page.getByRole("button", { name: "Autorizar conexión" }).click();
  await page.waitForURL("**/callback?**");
  const callback = new URL(page.url());
  expect(callback.searchParams.get("state")).toBe(params.get("state"));
  const response = await request.post(`${api}/oauth/token`, {
    form: {
      client_id: "pulse-isolated-browser",
      grant_type: "authorization_code",
      code: callback.searchParams.get("code")!,
      redirect_uri: "http://127.0.0.1:3109/callback",
      resource: `${api}/mcp`,
      code_verifier: verifier,
    },
  });
  expect(response.ok()).toBeTruthy();
  const tokens = await response.json();
  const headers = {
    Authorization: `Bearer ${tokens.access_token}`,
    Accept: "application/json, text/event-stream",
  };
  const operationId = randomUUID();
  const args = {
    operationId,
    contact: {
      firstName: "Carlos",
      name: `López Browser ${randomUUID().slice(0, 8)}`,
      email: `carlos-${randomUUID()}@example.test`,
      phone: `+52 55 ${Math.floor(10000000 + Math.random() * 89999999)}`,
    },
    opportunity: {
      title: "Financiación Carlos Browser",
      value: 50000,
      currency: "MXN",
      pipelineId: fixture.pipelineId,
      stageId: fixture.stageId,
    },
    task: {
      title: `Relance Carlos Browser martes ${operationId.slice(0, 8)}`,
      dueDate: "2026-10-20T10:00:00-06:00",
    },
  };
  const created = await request.post(`${api}/mcp`, {
    headers,
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "pulse_create_prospect_opportunity_followup",
        arguments: args,
      },
    },
  });
  const body = await created.json();
  expect(body.result.isError, JSON.stringify(body)).not.toBe(true);
  const saved = body.result.structuredContent.result;
  await page.goto(`/clients/${saved.client.id}`);
  await expect(page.locator('input[type="email"]').first()).toHaveValue(
    args.contact.email,
  );
  await page.goto(`/crm/deal/${saved.opportunity.id}`);
  await expect(page.locator("input:visible").first()).toBeVisible();
  await expect(
    page.locator(`input[value="${args.opportunity.title}"]`),
  ).toBeVisible();
  await page.goto("/tasks");
  await expect(page.getByText(args.task.title, { exact: true })).toBeVisible();
  await page.goto("/connect/pulse");
  await expect(
    page.getByText("America/Mexico_City", { exact: false }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Revocar acceso" }).first().click();
  await expect(
    page.getByText("Revocada", { exact: true }).first(),
  ).toBeVisible();
  const denied = await request.post(`${api}/mcp`, {
    headers,
    data: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "pulse_context", arguments: {} },
    },
  });
  expect(denied.status()).toBe(401);
  await page.screenshot({
    path: "/private/tmp/pulse-connect-revoked.png",
    fullPage: true,
  });
});
