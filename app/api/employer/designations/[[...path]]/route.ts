import { handleDesignations } from '@/lib/api/designation-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ path?: string[] }> };

export async function GET(request: Request, { params }: Context) { return handleDesignations(request, (await params).path ?? [], 'GET', 'employer'); }
export async function POST(request: Request, { params }: Context) { return handleDesignations(request, (await params).path ?? [], 'POST', 'employer'); }
export async function PUT(request: Request, { params }: Context) { return handleDesignations(request, (await params).path ?? [], 'PUT', 'employer'); }
export async function DELETE(request: Request, { params }: Context) { return handleDesignations(request, (await params).path ?? [], 'DELETE', 'employer'); }
