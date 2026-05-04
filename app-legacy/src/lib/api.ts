const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface FetchOptions extends RequestInit {
    token?: string;
}

export async function apiFetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const { token, ...fetchOptions } = options;

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(fetchOptions.headers as Record<string, string> || {}),
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...fetchOptions,
        headers,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
}

export function getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('pilotos_token');
}

export function setToken(token: string): void {
    localStorage.setItem('pilotos_token', token);
}

export function removeToken(): void {
    localStorage.removeItem('pilotos_token');
}

export function getUser(): any | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem('pilotos_user');
    return raw ? JSON.parse(raw) : null;
}

export function setUser(user: any): void {
    localStorage.setItem('pilotos_user', JSON.stringify(user));
}
