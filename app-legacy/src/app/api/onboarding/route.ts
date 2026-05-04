import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // 1. Guardar datos (Draft)
        const saveResponse = await fetch(`${BACKEND_URL}/api/onboarding`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const saveData = await saveResponse.json();

        if (!saveResponse.ok) {
            return NextResponse.json(saveData, { status: saveResponse.status });
        }

        // 2. Completar onboarding (Crear entidades)
        const completeResponse = await fetch(`${BACKEND_URL}/api/onboarding/${body.telefono}/completar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });

        const completeData = await completeResponse.json();

        if (!completeResponse.ok) {
            return NextResponse.json(completeData, { status: completeResponse.status });
        }

        return NextResponse.json(completeData, { status: 201 });
    } catch (error) {
        console.error('Error en API onboarding:', error);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const telefono = searchParams.get('telefono');

        if (!telefono) {
            return NextResponse.json({ error: 'Teléfono requerido' }, { status: 400 });
        }

        const response = await fetch(`${BACKEND_URL}/api/onboarding/${telefono}`);
        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error obteniendo onboarding:', error);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}
