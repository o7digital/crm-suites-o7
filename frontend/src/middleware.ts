import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isProtectedRoute = createRouteMatcher([
  '/',
  '/account(.*)',
  '/admin(.*)',
  '/clients(.*)',
  '/crm(.*)',
  '/export(.*)',
  '/forecast(.*)',
  '/ia-pulse(.*)',
  '/invoices(.*)',
  '/orders(.*)',
  '/post-sales(.*)',
  '/tasks(.*)',
]);

// Supabase deployments must not initialize Clerk without its publishable key.
export default process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
  return NextResponse.next();
}) : () => NextResponse.next();

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};

