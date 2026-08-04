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

export default clerkMiddleware(async (auth, req) => {
  if (
    [
      '/',
      '/account',
      '/admin',
      '/clients',
      '/crm',
      '/export',
      '/forecast',
      '/ia-pulse',
      '/invoices',
      '/login',
      '/orders',
      '/post-sales',
      '/register',
      '/tasks',
    ].includes(req.nextUrl.pathname)
  ) {
    return NextResponse.redirect(new URL('/demo-medical', req.url));
  }
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return NextResponse.next();
  }
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
