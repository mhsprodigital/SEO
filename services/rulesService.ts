import { Employee, ShiftAssignment, ShiftDefinition } from '../types';

/**
 * Módulo de Regras de Negócio - Portaria 321/2023 & Súmula 02/2023
 */
export const RulesService = {
    
    // Calculates total hours for a set of assignments
    calculateAllocatedHours(employeeId: string, assignments: ShiftAssignment[], shiftDefs?: Record<string, ShiftDefinition>): number {
        return assignments
            .filter(a => {
                if (a.shiftCode === 'BLK' || a.employeeId !== employeeId) return false;
                const def = shiftDefs ? shiftDefs[a.shiftCode] : null;
                // Don't count Afastamento or any TPD (Extra hour) towards contractual duration
                if (def && def.category === 'Afastamento') return false;
                if (def && def.code.startsWith('TPD')) return false;
                if (def && def.category === 'Banco de Horas' && (def.code.includes('-') || def.code.includes('NEG'))) return false;
                return true;
            })
            .reduce((sum, a) => sum + a.duration, 0);
    },

    // Retorna o Domingo (Início) e Sábado (Fim) da semana de uma data
    getWeekRange(date: Date): { start: Date, end: Date } {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const day = start.getDay(); // 0 = Domingo
        start.setDate(start.getDate() - day); // Volta para o domingo

        const end = new Date(start);
        end.setDate(end.getDate() + 6); // Avança para o sábado
        end.setHours(23, 59, 59, 999);
        
        return { start, end };
    },

    // Calcula horas de um intervalo específico (para semanas quebradas entre meses)
    calculateRangeHours(employeeId: string, assignments: ShiftAssignment[], start: Date, end: Date, shiftDefs?: Record<string, ShiftDefinition>): number {
        const formatDateLocal = (date: Date) => {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };

        const startStr = formatDateLocal(start);
        const endStr = formatDateLocal(end);

        return assignments
            .filter(a => {
                if (a.employeeId !== employeeId || a.shiftCode === 'BLK') return false;
                const def = shiftDefs ? shiftDefs[a.shiftCode] : null;
                // Don't count Afastamento or any TPD (Extra hour) towards contractual duration
                if (def && def.category === 'Afastamento') return false;
                if (def && def.code.startsWith('TPD')) return false;
                if (def && def.category === 'Banco de Horas' && (def.code.includes('-') || def.code.includes('NEG'))) return false;
                return a.date >= startStr && a.date <= endStr;
            })
            .reduce((sum, a) => sum + a.duration, 0);
    },

    /**
     * Validador de Alocação (Súmula 02/2023)
     */
    checkViability(employee: Employee, date: Date, shiftCode: string, existingAssignments: ShiftAssignment[]): boolean {
        const formatDateLocal = (date: Date) => {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };

        // Validação básica mantida para usos futuros ou manuais
        const prefs = employee.preferences || { reducaoCarga: 0, periodoPreferencial: 'INDIFERENTE', prefersWeekends: false, tipoAtuacao: 'TOTAL' };
        
        // 1. Checa Bloqueios Manuais (BLK) existentes no dia
        const dateStr = formatDateLocal(date);
        const isBlocked = existingAssignments.some(a => a.employeeId === employee.id && a.date === dateStr && a.isManualLock);
        if (isBlocked) return false;

        return true;
    },

    createAssignment(employeeId: string, date: string, shiftDef: ShiftDefinition, isManualLock: boolean = false): ShiftAssignment {
        return {
            id: crypto.randomUUID(),
            employeeId,
            date,
            shiftCode: shiftDef.code,
            category: shiftDef.category,
            duration: shiftDef.hours,
            isManualLock
        };
    },

    getShiftColor(category: string, code?: string): string {
        if (code === 'SM6 ST6' || code === 'ST6 SN12') {
            return 'bg-orange-100 text-orange-800 border-orange-400';
        }
        
        switch (category) {
            case 'Manhã': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
            case 'Tarde': return 'bg-blue-100 text-blue-800 border-blue-300';
            case 'Noite': return 'bg-indigo-100 text-indigo-800 border-indigo-300';
            case 'Afastamento': return 'bg-gray-200 text-gray-600 border-gray-400';
            case 'Bloqueio': return 'bg-red-100 text-red-500 font-bold border-red-200';
            case 'Legenda Especial': 
                 if (code && code.startsWith('TPD')) return 'bg-green-100 text-green-800 border-green-300';
                 return 'bg-pink-100 text-pink-800 border-pink-300';
            case 'Banco de Horas': 
                 if (code && (code.includes('-') || code.includes('NEG'))) return 'bg-orange-100 text-orange-800 border-orange-300';
                 return 'bg-blue-100 text-blue-800 border-blue-300';
            default: return 'bg-gray-100 text-gray-800';
        }
    }
};