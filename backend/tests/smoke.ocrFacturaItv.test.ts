/**
 * Factura de una estación ITV (2026-10-29).
 *
 * Alberto subió la factura de la verificación del taxímetro y el sistema la
 * leyó como certificado ITV: no propuso importe (los certificados no lo
 * buscan), propuso "ITV del vehiculo" en vez del taxímetro y no dijo la
 * vigencia; tuvo que escribir los tres datos a mano. Los textos son los del
 * OCR real de esas dos facturas, sin datos personales.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/prisma', () => ({ prisma: {} }));

import {
    clasificarDocumento,
    analizarDocumentoVehiculo,
    fechaMasMeses,
} from '../src/services/ocrDocumentoVehiculo.service';

const FACTURA_TAXIMETRO = `Estación: 3813
INSPECCION TECNICA DE VEHICULOS PARA LA SEGURIDAD SA
38550 VILLA DE ARAFO
FACTURA
Matrícula / Nº bastidor            Tipo de inspección                      Fecha factura                FACTURA Nº
8053-KKX                          210 TAXIMETRO                            29/10/2026                  000005616/38132026F
Factura correspondiente a la inspección: Tarifa inspección de seguridad: ............. 50,47 Euros
Base imponible: 50,47 Euros
I.G.I.C. 7,0%: ............................................... 3,53 Euros

TOTAL FACTURA 54,00 Euros

Los datos obtenidos para la prestación del servicio de Inspección Técnica de Vehículos (en adelante "ITV")`;

const FACTURA_PERIODICA = `Estación: 20 TENERIFE
INSPECCIÓN TÉCNICA DE VEHÍCULOS PARA LA SEGURIDAD S.A.
Matricula / N° bastidor 8053-KKX
Tipo de inspección 001 PERIODICA
FACTURA SIMPLIFICADA 325
24/09/2026/10:23/000000021
Importe sin descuento 53,26 Descuento -4,00 TOTAL 49,26 Euros
Base imponible: 42,13`;

describe('factura de estación ITV', () => {
    it('es una factura, no un certificado', () => {
        expect(clasificarDocumento(FACTURA_TAXIMETRO)).toBe('FACTURA_TALLER');
        expect(clasificarDocumento(FACTURA_PERIODICA)).toBe('FACTURA_TALLER');
    });

    it('taxímetro: importe, fecha y mantenimiento correctos', () => {
        const p = analizarDocumentoVehiculo(FACTURA_TAXIMETRO, undefined, '8053KKX');
        expect(p.importe).toBe(54);
        expect(p.fecha).toBe('29/10/2026');
        expect(p.mantenimientos_detectados).toEqual(['ITV / verificacion del taximetro']);
        expect(p.concepto).toBe('Verificación del taxímetro');
        expect(p.faltantes).not.toContain('importe');
        expect(p.faltantes).not.toContain('mantenimientos');
    });

    it('periódica: ITV del vehículo y total en mitad de línea', () => {
        const p = analizarDocumentoVehiculo(FACTURA_PERIODICA);
        expect(p.importe).toBe(49.26);
        expect(p.mantenimientos_detectados).toEqual(['ITV del vehiculo']);
    });

    it('un certificado ITV sin marcas fiscales sigue siendo certificado', () => {
        const acta = 'ESTACIÓN ITV\nInspección técnica periódica\nResultado: FAVORABLE\nFecha: 24/09/2026\nPróxima inspección: 24/09/2027';
        expect(clasificarDocumento(acta)).toBe('CERTIFICADO_ITV');
    });
});

describe('fechaMasMeses', () => {
    it('suma la periodicidad del catálogo', () => {
        expect(fechaMasMeses('29/10/2026', 12)).toBe('29/10/2027');
        expect(fechaMasMeses('31/01/2026', 1)).toBe('03/03/2026');
        expect(fechaMasMeses('basura', 12)).toBeUndefined();
    });
});
