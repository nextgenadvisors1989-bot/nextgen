import { handleComplianceRegister } from '@/lib/api/compliance-register-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ path?: string[] }> };

export async function GET(request: Request, { params }: Context) { return handleComplianceRegister(request, (await params).path ?? [], 'GET'); }
export async function POST(request: Request, { params }: Context) { return handleComplianceRegister(request, (await params).path ?? [], 'POST'); }
export async function PUT(request: Request, { params }: Context) { return handleComplianceRegister(request, (await params).path ?? [], 'PUT'); }
export async function DELETE(request: Request, { params }: Context) { return handleComplianceRegister(request, (await params).path ?? [], 'DELETE'); }
