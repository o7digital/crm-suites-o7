import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = (await req.json().catch(() => ({}))) as {
    tenantId?: string;
    tenantName?: string;
  };

  const tenantId = (payload.tenantId || userId).trim();
  const tenantName = (payload.tenantName || '').trim();
  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
  }

  const client = await clerkClient();
  const current = await client.users.getUser(userId);
  const currentMetadata = (current.publicMetadata || {}) as Record<string, unknown>;
  const nextMetadata = {
    ...currentMetadata,
    tenant_id: tenantId,
    tenantId,
    ...(tenantName ? { tenant_name: tenantName, tenantName } : {}),
  };

  await client.users.updateUserMetadata(userId, {
    publicMetadata: nextMetadata,
  });

  return NextResponse.json({ ok: true, tenantId, tenantName: tenantName || null });
}

