import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const doc = await prisma.documento.findFirst({
    orderBy: { created_at: 'desc' },
    include: { enlaces: true }
  });
  
  if (!doc) {
    console.log('No se encontraron documentos');
    return;
  }
  
  console.log(JSON.stringify({
    id: doc.id,
    estado: doc.estado,
    ocr_confianza: doc.ocr_confianza,
    ocr_texto: doc.ocr_texto,
    ocr_datos_extraidos: doc.ocr_datos_extraidos,
    url: doc.url
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
