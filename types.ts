export type ShiftCode = string;

export interface ShiftDefinition {
    code: ShiftCode;
    label: string;
    start: string;
    end: string;
    hours: number;
    category: 'Manhã' | 'Tarde' | 'Noite' | 'Afastamento' | 'Bloqueio' | 'Legenda Especial' | 'Banco de Horas' | 'Atividade Não Assistencial';
}

export interface EmployeePreferences {
    reducaoCarga: number; // Horas a reduzir da contratual
    periodoPreferencial: 'INDIFERENTE' | 'DIURNO' | 'NOTURNO';
    prefersWeekends: boolean; // Para servidores de outro estado
    tipoAtuacao: 'TOTAL' | 'ADMINISTRATIVO' | 'RESTRICAO_ASSISTENCIA';
    // diasProibidos removido, agora é gerido dinamicamente na escala
}

export interface Employee {
    id: string;
    name: string;
    matricula: string;
    coren: string;
    role: string;
    contractHours: number;
    unit: string;
    sector: string; 
    workstation?: string;
    cnes: string;
    contact: string;
    restrictions?: string;
    colorIdentifier: string;
    
    preferences: EmployeePreferences;
    
    // Novas propriedades para gestão de contratos
    employmentType?: 'Efetivo' | 'Temporário';
    contractExpiry?: string | null; // Data no formato YYYY-MM-DD
    isTpdOnly?: boolean; // Se verdadeiro, o servidor não possui carga horária contratual na unidade e as pendências são ignoradas.
}

export interface Vehicle {
    id: string;
    code: string;
    name: string;
    plate: string;
    isBlocked?: boolean;
    blockReason?: string;
}

export interface Sector {
    id: string;
    name: string;
}

export interface ShiftAssignment {
    id: string;
    employeeId: string;
    date: string; // ISO Date string YYYY-MM-DD
    shiftCode: string; // Not just ShiftCode type as it was before, as there are many special codes
    category?: string;
    duration: number; // in hours, denormalized for performance
    isManualLock?: boolean; // Se foi bloqueado manualmente pelo gestor naquele mês
    seiProcess?: string; // Processo SEI associado (para afastamentos/auditoria)
    allocation?: {
        type: 'VEHICLE' | 'SECTOR';
        id: string;
    };
}

export interface WeekData {
    startDate: string;
    assignments: ShiftAssignment[];
}

export interface UnitStructure {
    id: string;
    name: string;
    sectors: string[];
    sectorSubunits?: Record<string, string[]>; // sectorName -> array of sub-units
}

export type UserRole = 'ADMIN' | 'EDITOR' | 'VIEWER';

export interface SystemUser {
    uid: string;
    email: string;
    displayName: string;
    role: UserRole;
    unitAccess?: string; // ID of the Nucleus (Unit) they can access. empty/null means all.
    createdAt: string;
}