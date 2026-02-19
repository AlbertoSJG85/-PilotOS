const fs = require('fs');
const pdf = require('pdf-parse');

async function extractPDF(filename) {
    const dataBuffer = fs.readFileSync(filename);
    const data = await pdf(dataBuffer);
    return data.text;
}

async function main() {
    const files = [
        'Nex Os — Guía Operativa Base (agente Glor Ia).pdf',
        'Nex Os — Gameplan Agentes Y Subagentes (base Única → Multi‑número).pdf',
        'Nex Os — Gameplan Agentes_subagentes (1 Número Hoy, Multi-número Mañana).pdf'
    ];

    for (const file of files) {
        try {
            const text = await extractPDF(file);
            const outFile = file.replace('.pdf', '.txt');
            fs.writeFileSync(outFile, text, 'utf8');
            console.log(`Extracted: ${file} -> ${outFile}`);
        } catch (e) {
            console.error(`Error with ${file}:`, e.message);
        }
    }
}

main();
