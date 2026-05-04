import Link from 'next/link';

export default function OnboardingCompletadoPage() {
    return (
        <main className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white flex items-center justify-center p-4">
            <div className="text-center">
                <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>

                <h1 className="text-2xl font-bold mb-2">¡Todo listo!</h1>
                <p className="text-slate-400 mb-2">Tu cuenta de PilotOS está configurada.</p>
                <p className="text-slate-500 text-sm mb-8">GlorIA te avisará cuando necesites hacer algo.</p>

                <Link
                    href="/parte"
                    className="inline-block px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium rounded-xl shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition-all"
                >
                    Ir al Parte Diario
                </Link>
            </div>
        </main>
    );
}
