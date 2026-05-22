import { NextResponse } from 'next/server';
import { clearAdminSession } from '@/lib/admin-auth';

// Use POST for logout to prevent CSRF attacks
// GET requests should not have side effects
export async function POST(request: Request) {
  await clearAdminSession();
  return NextResponse.redirect(new URL('/admin/login', request.url));
}

// Keep GET for backward compatibility with the existing link
export async function GET(request: Request) {
  await clearAdminSession();
  return NextResponse.redirect(new URL('/admin/login', request.url));
}
