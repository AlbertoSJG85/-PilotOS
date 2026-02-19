import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const response = await fetch(`${BACKEND_URL}/api/partes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data, { status: 201 });
    } catch (error) {
        console.error('Error en API partes:', error);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const params = new URLSearchParams();

        if (searchParams.get('vehiculoId')) params.set('vehiculoId', searchParams.get('vehiculoId')!);
        if (searchParams.get('conductorId')) params.set('conductorId', searchParams.get('conductorId')!);
        if (searchParams.get('desde')) params.set('desde', searchParams.get('desde')!);
        if (searchParams.get('hasta')) params.set('hasta', searchParams.get('hasta')!);

        const response = await fetch(`${BACKEND_URL}/api/partes?${params}`);
        const data = await response.json();

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error obteniendo partes:', error);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}
