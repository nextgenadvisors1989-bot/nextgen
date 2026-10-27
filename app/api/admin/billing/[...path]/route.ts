import { handleBilling } from '@/lib/api/billing-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, { params }: Context) { return handleBilling(request, (await params).path, 'GET', 'admin'); }
export async function POST(request: Request, { params }: Context) { return handleBilling(request, (await params).path, 'POST', 'admin'); }
export async function PUT(request: Request, { params }: Context) { return handleBilling(request, (await params).path, 'PUT', 'admin'); }
export async function DELETE(request: Request, { params }: Context) { return handleBilling(request, (await params).path, 'DELETE', 'admin'); }
