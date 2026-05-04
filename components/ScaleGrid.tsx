import React, { useState, useMemo, useEffect, useRef, memo, useCallback } from 'react';
import { Employee, ShiftAssignment, ShiftDefinition } from '../types';
import { RulesService } from '../services/rulesService';
import { Search, Calendar, ChevronLeft, ChevronRight, Ban, Trash2, Lock, X, MessageSquare, TrendingUp, Sparkles, AlertCircle, Save } from 'lucide-react';

interface ScaleGridProps {
    employees: Employee[];
    assignments: ShiftAssignment[];
    onAssignmentChange: (newAssignments: ShiftAssignment[]) => void;
    onAssignmentDelete: (id: string) => Promise<void>;
    startDate: Date; 
    shiftDefs: Record<string, ShiftDefinition>;
    canEdit?: boolean;
    professionalCategories?: Record<string, string>;
}

interface ActiveCell {
    empId: string;
    dateStr: string;
    empName: string;
    seiProcess?: string;
}

interface WeekSegment {
    start: Date;
    end: Date;
    colSpan: number;
    fullWeekStart: Date;
    fullWeekEnd: Date;
}

const NOTES_KEY = 'sis_escala_weekly_notes';
const USAGE_KEY = 'sis_escala_shift_usage';

const DebouncedInput: React.FC<{ value: string, onChange: (v: string) => void, placeholder?: string, className?: string }> = ({ value, onChange, placeholder, className }) => {
    const [val, setVal] = useState(value);
    useEffect(() => { setVal(value); }, [value]);
    return (
        <input 
            type="text"
            className={className}
            placeholder={placeholder}
            value={val}
            onChange={e => setVal(e.target.value)}
            onBlur={() => onChange(val)}
        />
    );
};

const ScaleGrid: React.FC<ScaleGridProps> = ({ employees, assignments, onAssignmentChange, onAssignmentDelete, startDate, shiftDefs, canEdit = false, professionalCategories = {} }) => {
    const [currentDate, setCurrentDate] = useState(startDate);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('Todos');
    const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
    const [shiftSearch, setShiftSearch] = useState('');
    const [weeklyNotes, setWeeklyNotes] = useState<Record<string, string>>({});
    const [usageStats, setUsageStats] = useState<Record<string, number>>({});
    const [periodInfo, setPeriodInfo] = useState<{ dateStr: string, period: 'Manhã'|'Tarde'|'Noite', employees: Employee[] } | null>(null);
    
    const [isSaving, setIsSaving] = useState(false);
    const [localAssignments, setLocalAssignments] = useState<ShiftAssignment[]>(assignments);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Sync from props (Firestore) unless there are unsaved local changes
    useEffect(() => {
        if (!hasUnsavedChanges && assignments) {
            setLocalAssignments(assignments);
        }
    }, [assignments, hasUnsavedChanges]);

    // Batch Event State
    const [showBatchModal, setShowBatchModal] = useState(false);
    const [batchForm, setBatchForm] = useState({
        employeeId: '',
        startDate: '',
        endDate: '',
        shiftCode: '',
        seiProcess: ''
    });
    
    // Month and Year Filters
    const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth());
    const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());

    const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    const years = useMemo(() => {
        const currentYear = new Date().getFullYear();
        return [currentYear - 1, currentYear, currentYear + 1];
    }, []);

    // Update currentDate when selectors change
    useEffect(() => {
        setCurrentDate(new Date(selectedYear, selectedMonth, 1));
    }, [selectedMonth, selectedYear]);

    const searchInputRef = useRef<HTMLInputElement>(null);

    // Load Notes and Usage Stats on Mount
    useEffect(() => {
        const savedNotes = localStorage.getItem(NOTES_KEY);
        if (savedNotes) setWeeklyNotes(JSON.parse(savedNotes));

        const savedUsage = localStorage.getItem(USAGE_KEY);
        if (savedUsage) setUsageStats(JSON.parse(savedUsage));
    }, []);

    const saveNote = (key: string, value: string) => {
        const updated = { ...weeklyNotes, [key]: value };
        setWeeklyNotes(updated);
        localStorage.setItem(NOTES_KEY, JSON.stringify(updated));
    };

    const incrementUsage = (code: string) => {
        const newStats = { ...usageStats, [code]: (usageStats[code] || 0) + 1 };
        setUsageStats(newStats);
        localStorage.setItem(USAGE_KEY, JSON.stringify(newStats));
    };

    // Focus input when modal opens
    useEffect(() => {
        if (activeCell && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [activeCell]);

    // Generate days
    const daysInMonth = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const date = new Date(year, month, 1);
        const days = [];
        while (date.getMonth() === month) {
            days.push(new Date(date));
            date.setDate(date.getDate() + 1);
        }
        return days;
    }, [currentDate]);

    // Calculate Week Segments
    const weekSegments = useMemo(() => {
        const segments: WeekSegment[] = [];
        if (daysInMonth.length === 0) return segments;

        let currentSegmentStart = daysInMonth[0];
        let count = 0;

        daysInMonth.forEach((day, index) => {
            const isSunday = day.getDay() === 0;
            const isFirstDay = index === 0;
            
            if (isSunday && !isFirstDay) {
                const prevEnd = new Date(daysInMonth[index - 1]);
                const { start: fullStart, end: fullEnd } = RulesService.getWeekRange(prevEnd);
                
                segments.push({
                    start: currentSegmentStart,
                    end: prevEnd,
                    colSpan: count,
                    fullWeekStart: fullStart,
                    fullWeekEnd: fullEnd
                });

                currentSegmentStart = day;
                count = 0;
            }
            count++;

            if (index === daysInMonth.length - 1) {
                const { start: fullStart, end: fullEnd } = RulesService.getWeekRange(day);
                segments.push({
                    start: currentSegmentStart,
                    end: day,
                    colSpan: count,
                    fullWeekStart: fullStart,
                    fullWeekEnd: fullEnd
                });
            }
        });
        return segments;
    }, [daysInMonth]);

    const nextMonth = () => {
        const nextDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
        setSelectedMonth(nextDate.getMonth());
        setSelectedYear(nextDate.getFullYear());
    };
    const prevMonth = () => {
        const prevDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
        setSelectedMonth(prevDate.getMonth());
        setSelectedYear(prevDate.getFullYear());
    };

    const filteredEmployees = useMemo(() => {
        return employees.filter(emp => {
            const matchName = emp.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchTermRole = emp.role.toLowerCase().includes(searchTerm.toLowerCase());
            const matchRole = roleFilter === 'Todos' || emp.role === roleFilter;
            return (matchName || matchTermRole) && matchRole;
        }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [employees, searchTerm, roleFilter]);

    // --- Helpers ---
    // Memoize assignments per tuple to avoid constant re-filtering on cell render
    const assignmentsByDateAndEmp = useMemo(() => {
        const map = new Map<string, ShiftAssignment[]>();
        localAssignments.forEach(a => {
            const key = `${a.employeeId}_${a.date}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(a);
        });
        return map;
    }, [localAssignments]);

    const handleLocalAssignmentChange = (newAssignments: ShiftAssignment[]) => {
        setLocalAssignments(newAssignments);
        setHasUnsavedChanges(true);
    };

    const handleSaveChanges = async () => {
        setIsSaving(true);
        // onAssignmentChange agora retorna booleano de sucesso
        const success = await onAssignmentChange(localAssignments) as unknown as boolean;
        if (success !== false) {
            setHasUnsavedChanges(false);
        }
        setIsSaving(false);
    };

    const handleDiscardChanges = () => {
        setLocalAssignments(assignments);
        setHasUnsavedChanges(false);
    };

    const EMPTY_ASSIGNMENTS: ShiftAssignment[] = useMemo(() => [], []);

    const getCellAssignments = useCallback((empId: string, dateStr: string) => {
        return assignmentsByDateAndEmp.get(`${empId}_${dateStr}`) || EMPTY_ASSIGNMENTS;
    }, [assignmentsByDateAndEmp, EMPTY_ASSIGNMENTS]);

    // --- Actions ---
    const handleCellClick = useCallback((empId: string, dateStr: string, empName: string) => {
        if (!canEdit) return;
        setActiveCell({ empId, dateStr, empName, seiProcess: '' });
        setShiftSearch('');
    }, [canEdit]);

    const handleAddShift = (code: string) => {
        if (!activeCell) return;
        const { empId, dateStr, seiProcess } = activeCell;

        incrementUsage(code); // Track usage

        let updatedAssignments = [...localAssignments];

        if (code === 'BLK') {
            updatedAssignments = updatedAssignments.filter(a => !(a.employeeId === empId && a.date === dateStr));
            const lockAssignment = RulesService.createAssignment(empId, dateStr, { 
                code: 'BLK', label: 'Bloqueio', start: '', end: '', hours: 0, category: 'Bloqueio' 
            }, true);
            updatedAssignments.push(lockAssignment);
        } else {
            updatedAssignments = updatedAssignments.filter(a => 
                !(a.employeeId === empId && a.date === dateStr && (a.isManualLock || a.shiftCode === code))
            );
            const def = shiftDefs[code];
            if (def) {
                const newAssignment = RulesService.createAssignment(empId, dateStr, def);
                if (seiProcess) {
                    newAssignment.seiProcess = seiProcess;
                }
                updatedAssignments.push(newAssignment);
            }
        }

        handleLocalAssignmentChange(updatedAssignments);
        if (code === 'BLK') setActiveCell(null);
    };

    const handleRemoveAssignment = async (assignmentId: string) => {
        const remaining = localAssignments.filter(a => a.id !== assignmentId);
        handleLocalAssignmentChange(remaining);
    };

    const handleClearDay = useCallback((empId: string, dateStr: string) => {
        const remaining = localAssignments.filter(a => !(a.employeeId === empId && a.date === dateStr));
        handleLocalAssignmentChange(remaining);
    }, [localAssignments]);

    const isShiftInPeriod = (shiftCode: string, cat: string, checkPeriod: 'Manhã'|'Tarde'|'Noite'): boolean => {
        if (!['Manhã', 'Tarde', 'Noite', 'Legenda Especial', 'Banco de Horas'].includes(cat)) return false;
        
        if (cat === 'Banco de Horas' && (shiftCode.includes('-') || shiftCode.includes('NEG'))) return false;

        let isM = cat === 'Manhã';
        let isT = cat === 'Tarde';
        let isN = cat === 'Noite';

        if (cat === 'Legenda Especial' || cat === 'Banco de Horas' || shiftCode.includes('ST6 SN12') || shiftCode.includes('SM6 ST6')) {
            if (shiftCode.includes('SM6 ST6')) {
                 isM = true; isT = true;
            } else if (shiftCode.includes('ST6 SN12')) {
                 isT = true; isN = true;
            } else {
                 if (shiftCode.match(/SM|\bM\b/)) isM = true;
                 if (shiftCode.match(/ST|\bT\b/)) isT = true;
                 if (shiftCode.match(/SN|\bN\b/)) isN = true;
            }
        }
        
        if (checkPeriod === 'Manhã') return isM;
        if (checkPeriod === 'Tarde') return isT;
        if (checkPeriod === 'Noite') return isN;
        return false;
    };

    const handleOpenPeriodInfo = (dateStr: string, period: 'Manhã'|'Tarde'|'Noite') => {
        const periodEmployees = filteredEmployees.filter(emp => {
             const empAssignments = localAssignments.filter(a => a.employeeId === emp.id && a.date === dateStr);
             return empAssignments.some(a => {
                 const def = shiftDefs[a.shiftCode];
                 const cat = a.category || def?.category;
                 return isShiftInPeriod(a.shiftCode, cat, period);
             });
        });
        setPeriodInfo({ dateStr, period, employees: periodEmployees });
    };

    const dailyStats = useMemo(() => {
        const stats: Record<string, { manha: number, tarde: number, noite: number }> = {};
        
        daysInMonth.forEach(d => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${day}`;
            stats[dateStr] = { manha: 0, tarde: 0, noite: 0 };
        });

        localAssignments.forEach(a => {
            const isEmployeeVisible = filteredEmployees.some(e => e.id === a.employeeId);
            if (!isEmployeeVisible || !stats[a.date]) return;

            const def = shiftDefs[a.shiftCode];
            const cat = a.category || def?.category;

            if (isShiftInPeriod(a.shiftCode, cat, 'Manhã')) stats[a.date].manha += 1;
            if (isShiftInPeriod(a.shiftCode, cat, 'Tarde')) stats[a.date].tarde += 1;
            if (isShiftInPeriod(a.shiftCode, cat, 'Noite')) stats[a.date].noite += 1;
        });

        return stats;
    }, [localAssignments, filteredEmployees, daysInMonth, shiftDefs]);

    // --- Smart Lists Logic ---
    const topUsedShifts = useMemo(() => {
        return Object.keys(usageStats)
            .sort((a, b) => usageStats[b] - usageStats[a])
            .slice(0, 5) // Top 5
            .map(code => shiftDefs[code])
            .filter(Boolean);
    }, [usageStats, shiftDefs]);

    const standardShifts = useMemo(() => {
        return Object.values(shiftDefs).filter((s: ShiftDefinition) => s && s.code && s.code.startsWith('S')); // 'S' codes (SM6, SN12...)
    }, [shiftDefs]);

    const specialShifts = useMemo(() => {
        return Object.values(shiftDefs).filter((s: ShiftDefinition) => s && s.category === 'Legenda Especial');
    }, [shiftDefs]);

    const bankShifts = useMemo(() => {
        return Object.values(shiftDefs).filter((s: ShiftDefinition) => s && s.category === 'Banco de Horas');
    }, [shiftDefs]);

    const filteredShifts = useMemo(() => {
        const all = Object.values(shiftDefs);
        if (!shiftSearch) return []; // Should not run when empty anyway, but an optimization.
        
        const term = shiftSearch.toLowerCase();
        return all.filter((s: ShiftDefinition) => {
            if (!s || !s.code || !s.label || !s.category) return false;
            if (s.code.toLowerCase().startsWith(term)) return true; // Prioritize exact code matches first
            
            return s.code.toLowerCase().includes(term) || 
                   s.label.toLowerCase().includes(term) ||
                   s.category.toLowerCase().includes(term);
        }).sort((a: ShiftDefinition, b: ShiftDefinition) => {
            // Sort by code length or exact match priority
            const aStarts = a.code.toLowerCase().startsWith(term) ? 1 : 0;
            const bStarts = b.code.toLowerCase().startsWith(term) ? 1 : 0;
            if (aStarts !== bStarts) return bStarts - aStarts;
            return a.code.localeCompare(b.code);
        }).slice(0, 50); // Limit to 50 results to prevent massive DOM updates
    }, [shiftSearch, shiftDefs]);

    const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;
    const isSaturday = (date: Date) => date.getDay() === 6;

    const handleBatchSubmit = () => {
        if (!batchForm.employeeId || !batchForm.startDate || !batchForm.endDate || !batchForm.shiftCode) {
            alert("Preencha todos os campos.");
            return;
        }

        const start = new Date(batchForm.startDate + 'T00:00:00');
        const end = new Date(batchForm.endDate + 'T00:00:00');
        
        if (start > end) {
            alert("A data de início deve ser menor ou igual a data de fim.");
            return;
        }

        const newAssignments = [...localAssignments];
        const def = shiftDefs[batchForm.shiftCode];

        let current = new Date(start);
        while (current <= end) {
            const y = current.getFullYear();
            const m = String(current.getMonth() + 1).padStart(2, '0');
            const d = String(current.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${d}`;

            // Check if already has assignment on this day (optional, we can just add)
            const existing = newAssignments.find(a => a.employeeId === batchForm.employeeId && a.date === dateStr && a.shiftCode === batchForm.shiftCode);
            if (!existing) {
                const newAssignment = RulesService.createAssignment(batchForm.employeeId, dateStr, def, false);
                if (batchForm.seiProcess) {
                    newAssignment.seiProcess = batchForm.seiProcess;
                }
                newAssignments.push(newAssignment);
            }

            current.setDate(current.getDate() + 1);
        }

        handleLocalAssignmentChange(newAssignments);
        setShowBatchModal(false);
        setBatchForm({ employeeId: '', startDate: '', endDate: '', shiftCode: '' });
    };

    // Helper to render assignment list
    const renderShiftButtonList = (shifts: ShiftDefinition[]) => (
        <div className="grid grid-cols-1 gap-1">
            {shifts.map((def: ShiftDefinition) => (
                <button 
                    key={def.code}
                    onClick={() => handleAddShift(def.code)}
                    className="w-full text-left px-4 py-2 hover:bg-blue-50 rounded-lg flex justify-between items-center group border-b border-gray-50 last:border-0"
                >
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded flex items-center justify-center text-xs font-bold shadow-sm ${RulesService.getShiftColor(def.category, def.code)}`}>
                            {def.code}
                        </div>
                        <div>
                            <div className="font-bold text-gray-800">{def.label}</div>
                            <div className="text-xs text-gray-500">{def.category} • {def.start} - {def.end}</div>
                        </div>
                    </div>
                    <div className="text-sm font-bold text-gray-400 group-hover:text-blue-600">
                        {def.hours}h
                    </div>
                </button>
            ))}
        </div>
    );

    const renderActiveCellAssignments = () => {
        if (!activeCell) return null;
        const cellAssignments = getCellAssignments(activeCell.empId, activeCell.dateStr);
        if (cellAssignments.length === 0) return null;

        return (
            <div className="p-4 bg-blue-50 border-b border-blue-100">
                <h4 className="text-xs font-bold text-blue-800 uppercase mb-2">Alocações no Dia</h4>
                <div className="flex flex-wrap gap-2">
                    {cellAssignments.map(a => {
                         const def = shiftDefs[a.shiftCode];
                        return (
                            <div key={a.id} className="flex flex-col bg-white rounded-lg border border-blue-200 shadow-sm overflow-hidden">
                                <div className="flex items-center gap-2 px-3 py-1.5">
                                    <span className={`text-xs font-bold ${a.isManualLock ? 'text-red-500' : 'text-gray-700'}`}>
                                        {a.isManualLock ? 'BLOQUEIO' : a.shiftCode}
                                    </span>
                                    {!a.isManualLock && <span className="text-[10px] text-gray-500">({a.duration}h)</span>}
                                    <button 
                                        onClick={() => handleRemoveAssignment(a.id)}
                                        className="ml-auto text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full p-0.5"
                                    >
                                        <X size={14}/>
                                    </button>
                                </div>
                                {a.seiProcess && (
                                    <div className="bg-blue-50 px-3 py-1 text-[10px] text-blue-700 border-t border-blue-100 flex items-center justify-between">
                                        <span className="font-semibold">SEI:</span> {a.seiProcess}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] space-y-4 relative">
            
            {/* SHIFT SELECTION MODAL */}
            {activeCell && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setActiveCell(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-gray-800 text-lg">Gerenciar Plantões</h3>
                                <p className="text-sm text-gray-500">
                                    {activeCell.empName} - {new Date(activeCell.dateStr).toLocaleDateString('pt-BR')}
                                </p>
                            </div>
                            <button onClick={() => setActiveCell(null)} className="text-gray-400 hover:text-red-500">
                                <X size={24}/>
                            </button>
                        </div>

                        {renderActiveCellAssignments()}
                        
                        <div className="p-4 border-b space-y-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                <input 
                                    ref={searchInputRef}
                                    type="text" 
                                    placeholder="Buscar legenda (ex: M3, 12, Noite)..." 
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gdf-primary focus:outline-none text-lg"
                                    value={shiftSearch}
                                    onChange={(e) => setShiftSearch(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Processo SEI (Opcional - Ex: banco, licença)</label>
                                <DebouncedInput 
                                    placeholder="Ex: 00060-00012345/2023-11"
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-gdf-primary focus:border-gdf-primary p-2 border bg-white text-sm"
                                    value={activeCell.seiProcess || ''}
                                    onChange={(val) => setActiveCell({...activeCell, seiProcess: val})}
                                />
                            </div>
                        </div>

                        <div className="overflow-y-auto flex-1 p-2">
                             
                             {/* DEFAULT VIEW (No Search) */}
                             {shiftSearch === '' && (
                                <div className="space-y-6 pt-2 pb-4">
                                    <div className="px-4">
                                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 flex items-center gap-1">
                                            <Sparkles size={14} className="text-blue-500" /> Acesso Rápido (Prioridade)
                                        </h4>
                                        <div className="grid grid-cols-2 gap-3">
                                            {['SM6', 'ST6', 'SN12', 'SM6 ST6', 'ST6 SN12'].map(code => {
                                                const def = shiftDefs[code];
                                                if (!def) return null;
                                                return (
                                                    <button 
                                                        key={code}
                                                        onClick={() => handleAddShift(code)}
                                                        className="bg-white border hover:bg-blue-50 hover:border-blue-300 border-gray-200 rounded-xl p-3 shadow-sm flex flex-col items-center justify-center transition-all duration-150 active:scale-95"
                                                    >
                                                        <span className="font-bold text-gray-800 text-lg tracking-tight">{code}</span>
                                                        <span className="text-[10px] text-gray-500 font-medium">({def.hours}h)</span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    <div className="px-4">
                                        <button 
                                            onClick={() => handleAddShift('BLK')}
                                            className="w-full bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded-xl p-3 shadow-sm flex items-center justify-center gap-2 transition-all duration-150 active:scale-95"
                                        >
                                            <Ban size={18}/>
                                            <span className="font-bold text-sm tracking-wide">BLOQUEAR O DIA (FOLGA)</span>
                                        </button>
                                    </div>
                                    
                                    <div className="px-4 text-center">
                                        <p className="text-sm text-gray-500">
                                            Para outras legendas, digite no campo de <strong>busca</strong> acima.
                                        </p>
                                    </div>
                                </div>
                             )}

                             {/* SEARCH RESULTS */}
                             {shiftSearch !== '' && (
                                <>
                                    {renderShiftButtonList(filteredShifts)}
                                    {filteredShifts.length === 0 && (
                                        <div className="text-center py-8 text-gray-400">
                                            Nenhuma legenda encontrada.
                                        </div>
                                    )}
                                </>
                             )}
                        </div>
                    </div>
                </div>
            )}

            {/* Batch Event Modal */}
            {showBatchModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowBatchModal(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                        <div className="bg-gray-50 p-4 border-b flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-gray-800 text-lg">Lançar Evento em Lote</h3>
                                <p className="text-sm text-gray-500">Adicionar férias, licenças, abonos, etc.</p>
                            </div>
                            <button onClick={() => setShowBatchModal(false)} className="text-gray-400 hover:text-red-500">
                                <X size={24}/>
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Servidor</label>
                                <select 
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-gdf-primary focus:border-gdf-primary p-2 border bg-white"
                                    value={batchForm.employeeId}
                                    onChange={e => setBatchForm({...batchForm, employeeId: e.target.value})}
                                >
                                    <option value="">Selecione um servidor...</option>
                                    {employees.map(emp => (
                                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Data Início</label>
                                    <input 
                                        type="date" 
                                        className="w-full border-gray-300 rounded-md shadow-sm focus:ring-gdf-primary focus:border-gdf-primary p-2 border bg-white"
                                        value={batchForm.startDate}
                                        onChange={e => setBatchForm({...batchForm, startDate: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Data Fim</label>
                                    <input 
                                        type="date" 
                                        className="w-full border-gray-300 rounded-md shadow-sm focus:ring-gdf-primary focus:border-gdf-primary p-2 border bg-white"
                                        value={batchForm.endDate}
                                        onChange={e => setBatchForm({...batchForm, endDate: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Evento (Afastamento / Especial)</label>
                                <select 
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-gdf-primary focus:border-gdf-primary p-2 border bg-white"
                                    value={batchForm.shiftCode}
                                    onChange={e => setBatchForm({...batchForm, shiftCode: e.target.value})}
                                >
                                    <option value="">Selecione um evento...</option>
                                    {Object.values(shiftDefs)
                                        .filter((def: ShiftDefinition) => def && (def.category === 'Afastamento' || def.category === 'Legenda Especial' || def.category === 'Atividade Não Assistencial'))
                                        .map((def: ShiftDefinition) => (
                                            <option key={def.code} value={def.code}>{def.label} ({def.hours}h)</option>
                                        ))
                                    }
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Processo SEI (Opcional)</label>
                                <DebouncedInput 
                                    placeholder="Ex: 00060-00012345/2023-11"
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-gdf-primary focus:border-gdf-primary p-2 border bg-white"
                                    value={batchForm.seiProcess}
                                    onChange={(val) => setBatchForm({...batchForm, seiProcess: val})}
                                />
                            </div>
                        </div>

                        <div className="bg-gray-50 p-4 border-t flex justify-end gap-2">
                            <button onClick={() => setShowBatchModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition">Cancelar</button>
                            <button onClick={handleBatchSubmit} className="px-4 py-2 bg-gdf-primary text-white hover:bg-blue-700 rounded-lg shadow-sm transition">Aplicar Evento</button>
                        </div>
                    </div>
                </div>
            )}

            {/* PERIOD INFO MODAL */}
            {periodInfo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setPeriodInfo(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-gray-800 text-lg">
                                    {periodInfo.employees.length} Servidor(es)
                                </h3>
                                <p className="text-sm text-gray-500 font-medium">
                                    {new Date(periodInfo.dateStr + 'T12:00:00').toLocaleDateString('pt-BR')} - <span className="uppercase text-gdf-primary">{periodInfo.period}</span>
                                </p>
                            </div>
                            <button onClick={() => setPeriodInfo(null)} className="text-gray-400 hover:text-red-500">
                                <X size={24}/>
                            </button>
                        </div>
                        <div className="overflow-y-auto p-4 flex-1">
                            {periodInfo.employees.length === 0 ? (
                                <p className="text-gray-500 text-center py-4">Nenhum servidor alocado neste período.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {periodInfo.employees.map(emp => (
                                        <li key={emp.id} className="p-2 bg-gray-50 border border-gray-100 rounded flex justify-between items-center text-sm">
                                            <span className="font-bold text-gray-700">{emp.name}</span>
                                            <span className="text-xs text-gray-500">{emp.role}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Header / Controls */}
            {hasUnsavedChanges && (
                <div className="sticky top-0 z-[60] bg-yellow-50 border-b border-yellow-200 p-3 flex justify-between items-center shadow-md animate-in slide-in-from-top duration-300">
                    <div className="flex items-center gap-2">
                        <div className="bg-yellow-400 p-1.5 rounded-full ring-4 ring-yellow-100">
                            <AlertCircle size={18} className="text-white" />
                        </div>
                        <div>
                            <span className="text-yellow-900 font-bold block leading-none">Alterações em Rascunho</span>
                            <span className="text-yellow-700 text-xs text-opacity-80">Clique em salvar para consolidar no banco de dados.</span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={handleDiscardChanges}
                            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-bold text-sm transition-all shadow-sm active:scale-95"
                            disabled={isSaving}
                        >
                            Descartar
                        </button>
                        <button 
                            onClick={handleSaveChanges}
                            className="px-6 py-2 bg-gdf-primary text-white rounded-lg font-bold text-sm hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg active:scale-95 ring-offset-2 focus:ring-2 focus:ring-gdf-primary"
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <><div className="animate-spin w-4 h-4 border-2 border-white rounded-full border-t-transparent" /> Processando...</>
                            ) : (
                                <><Save size={18} /> Salvar Agora</>
                            )}
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col lg:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex items-center bg-gray-100 rounded-lg p-1">
                        <button onClick={prevMonth} className="p-2 hover:bg-white rounded-md shadow-sm transition"><ChevronLeft size={20}/></button>
                        <div className="px-4 font-bold text-gray-800 min-w-[150px] text-center flex items-center gap-2 justify-center">
                            <Calendar size={18} className="text-gdf-primary"/>
                            {currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()}
                        </div>
                        <button onClick={nextMonth} className="p-2 hover:bg-white rounded-md shadow-sm transition"><ChevronRight size={20}/></button>
                    </div>
                    {canEdit && (
                        <button 
                            onClick={() => setShowBatchModal(true)}
                            className="bg-gdf-primary text-white px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700 transition text-sm font-semibold whitespace-nowrap"
                        >
                            Lançar Eventos
                        </button>
                    )}
                </div>

                <div className="flex flex-wrap gap-3 w-full lg:w-auto">
                    <div className="flex-1 lg:w-32">
                        <select 
                            className="w-full border-gray-300 rounded-md shadow-sm focus:ring-gdf-primary focus:border-gdf-primary text-sm p-2 border bg-white"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(Number(e.target.value))}
                        >
                            {months.map((month, index) => (
                                <option key={index} value={index}>{month}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 lg:w-24">
                        <select 
                            className="w-full border-gray-300 rounded-md shadow-sm focus:ring-gdf-primary focus:border-gdf-primary text-sm p-2 border bg-white"
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                        >
                            {years.map(year => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 lg:w-48">
                        <select
                            className="w-full border-gray-300 rounded-md shadow-sm focus:ring-gdf-primary focus:border-gdf-primary text-sm p-2 border bg-white"
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                        >
                            <option value="Todos">Todas Categorias</option>
                            {Object.keys(professionalCategories).map((cat) => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                    <div className="relative flex-1 lg:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input 
                            type="text" 
                            placeholder="Buscar servidor..." 
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-gdf-secondary focus:outline-none text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Excel Grid Container */}
            <div className="flex-1 overflow-auto bg-white rounded-lg shadow border border-gray-300 relative">
                <table className="border-collapse w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0 z-30 shadow-sm text-gray-600">
                        <tr>
                            <th className="sticky left-0 top-0 bg-gray-200 z-[45] border-r border-b border-gray-300 px-4 py-2 text-left min-w-[250px] font-bold text-xs uppercase align-bottom text-gray-700">
                                Servidor
                            </th>
                            {daysInMonth.map((d, i) => {
                                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                const mNum = dailyStats[dateStr]?.manha || 0;
                                const tNum = dailyStats[dateStr]?.tarde || 0;
                                const nNum = dailyStats[dateStr]?.noite || 0;

                                const getBg = (n: number) => n <= 4 ? 'bg-red-100 text-red-700' : (n <= 6 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700');

                                return (
                                    <th 
                                        key={i} 
                                        className={`border-b border-gray-300 min-w-[48px] w-[50px] max-w-[50px] p-0 align-bottom text-center relative bg-white
                                            ${isSaturday(d) ? 'border-r-2 border-r-gray-400' : 'border-r'} 
                                        `}
                                    >
                                        <div className={`pt-1 pb-1 border-b border-gray-200 ${isWeekend(d) ? 'bg-orange-50' : 'bg-gray-100'}`}>
                                            <div className="text-[10px] font-bold text-gray-500">{d.toLocaleDateString('pt-BR', { weekday: 'narrow' })}</div>
                                            <div className="text-xs font-bold text-gray-800">{d.getDate()}</div>
                                        </div>
                                        <div className="flex flex-col text-[10px]">
                                            <div onClick={() => handleOpenPeriodInfo(dateStr, 'Manhã')} className={`flex justify-center items-center py-[2px] cursor-pointer hover:opacity-80 border-b border-white transition-opacity ${getBg(mNum)}`} title={`${mNum} funcionário(s) pela manhã`}>
                                                <span className="font-bold mr-[1px]">{mNum}</span><span className="text-[8px] uppercase">M</span>
                                            </div>
                                            <div onClick={() => handleOpenPeriodInfo(dateStr, 'Tarde')} className={`flex justify-center items-center py-[2px] cursor-pointer hover:opacity-80 border-b border-white transition-opacity ${getBg(tNum)}`} title={`${tNum} funcionário(s) à tarde`}>
                                                <span className="font-bold mr-[1px]">{tNum}</span><span className="text-[8px] uppercase">T</span>
                                            </div>
                                            <div onClick={() => handleOpenPeriodInfo(dateStr, 'Noite')} className={`flex justify-center items-center py-[2px] cursor-pointer hover:opacity-80 transition-opacity ${getBg(nNum)}`} title={`${nNum} funcionário(s) à noite`}>
                                                <span className="font-bold mr-[1px]">{nNum}</span><span className="text-[8px] uppercase">N</span>
                                            </div>
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredEmployees.map((emp) => {
                            return (
                                <React.Fragment key={emp.id}>
                                    {/* ROW 1: SHIFT ASSIGNMENTS */}
                                    <tr className="hover:bg-blue-50 transition-colors group">
                                        <td className="sticky left-0 bg-white group-hover:bg-blue-50 z-20 border-r border-gray-200 px-4 py-3 align-middle">
                                            <div className="flex items-center">
                                                <div className={`w-8 h-8 rounded-full ${emp.colorIdentifier} flex items-center justify-center text-white text-xs font-bold mr-3`}>
                                                    {emp.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-gray-900 flex flex-wrap items-center gap-1 leading-tight max-w-[180px]">
                                                        <span className="break-words whitespace-normal">{emp.name}</span>
                                                        {emp.isTpdOnly && (
                                                            <span className="bg-yellow-100 text-yellow-800 text-[9px] px-1 py-0.5 rounded border border-yellow-200 font-bold" title="Somente TPD (Hora Extra)">TPD</span>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-gray-500 mt-0.5">{emp.role}</div>
                                                    {emp.matricula && (
                                                        <div className="text-[10px] text-gray-400">Matrícula: {emp.matricula}</div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        {daysInMonth.map((d, i) => {
                                            const y = d.getFullYear();
                                            const m = String(d.getMonth() + 1).padStart(2, '0');
                                            const day = String(d.getDate()).padStart(2, '0');
                                            const dateStr = `${y}-${m}-${day}`;
                                            const cellAssignments = getCellAssignments(emp.id, dateStr);
                                            
                                            let cellBg = isWeekend(d) ? 'bg-orange-50' : 'bg-white';
                                            const hasBlock = cellAssignments.some(a => a.isManualLock);
                                            
                                            if (hasBlock) cellBg = 'bg-red-50 pattern-diagonal-lines-sm';

                                            return (
                                                <ScaleCell 
                                                    key={i}
                                                    emp={emp}
                                                    d={d}
                                                    dateStr={dateStr}
                                                    cellAssignments={cellAssignments}
                                                    isSaturday={isSaturday(d)}
                                                    isWeekend={isWeekend(d)}
                                                    canEdit={canEdit}
                                                    shiftDefs={shiftDefs}
                                                    onCellClick={handleCellClick}
                                                    onClearDay={handleClearDay}
                                                />
                                            );
                                        })}
                                    </tr>

                                    {/* ROW 2: WEEKLY SUMMARY */}
                                    <tr className="bg-gray-50/50">
                                        <td className="sticky left-0 bg-gray-50 z-20 border-r border-b border-gray-300 px-4 py-1 text-[10px] text-right text-gray-400 font-medium align-middle">
                                            Resumo Semanal
                                        </td>

                                        {weekSegments.map((segment, idx) => {
                                            const hours = RulesService.calculateRangeHours(emp.id, localAssignments, segment.fullWeekStart, segment.fullWeekEnd, shiftDefs);
                                            const y = segment.fullWeekStart.getFullYear();
                                            const m = String(segment.fullWeekStart.getMonth() + 1).padStart(2, '0');
                                            const d = String(segment.fullWeekStart.getDate()).padStart(2, '0');
                                            const noteKey = `${emp.id}-${y}-${m}-${d}`;
                                            const isOverload = hours > 44;
                                            
                                            return (
                                                <td 
                                                    key={idx} 
                                                    colSpan={segment.colSpan}
                                                    className={`border-b border-gray-300 px-2 py-1 align-top relative
                                                        ${idx < weekSegments.length - 1 ? 'border-r-2 border-r-gray-400' : 'border-r border-gray-200'}
                                                    `}
                                                >
                                                    <div className="flex items-center justify-between gap-2 h-full">
                                                        <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap
                                                            ${isOverload ? 'bg-red-100 text-red-700 border-red-200' : 'bg-white text-gray-600 border-gray-200'}
                                                        `}>
                                                            {hours}h
                                                        </div>

                                                        <div className="flex-1 relative group/input">
                                                            <input 
                                                                type="text"
                                                                value={weeklyNotes[noteKey] || ''}
                                                                onChange={(e) => saveNote(noteKey, e.target.value)}
                                                                readOnly={!canEdit}
                                                                placeholder={canEdit ? "Obs..." : ""}
                                                                className={`w-full bg-transparent text-[10px] text-gray-600 placeholder-gray-300 border-b border-transparent focus:border-blue-400 focus:outline-none transition-colors px-1 ${!canEdit ? 'cursor-default' : ''}`}
                                                            />
                                                            {!weeklyNotes[noteKey] && canEdit && (
                                                                <MessageSquare size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none opacity-0 group-hover/input:opacity-100" />
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
                {filteredEmployees.length === 0 && (
                     <div className="p-10 text-center text-gray-500">
                        Nenhum servidor encontrado.
                    </div>
                )}
            </div>
            
            <div className="flex flex-wrap gap-4 text-xs text-gray-500 justify-center">
                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-yellow-100 border border-yellow-300 rounded-sm"></div> Manhã</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-100 border border-blue-300 rounded-sm"></div> Tarde</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-indigo-100 border border-indigo-300 rounded-sm"></div> Noite</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-100 border border-red-200 rounded-sm"></div> Bloqueio</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-orange-100 border border-orange-300 rounded-sm"></div> Banco (Negativo)</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-100 border border-blue-300 rounded-sm"></div> Banco (Positivo)</div>
                <div className="flex items-center gap-1 font-bold"><span className="border-r-2 border-gray-400 h-3 w-1 inline-block"></span> Semanas (Dom-Sáb)</div>
            </div>
        </div>
    );
};

interface ScaleCellProps {
    emp: Employee;
    d: Date;
    dateStr: string;
    cellAssignments: ShiftAssignment[];
    isSaturday: boolean;
    isWeekend: boolean;
    canEdit: boolean;
    shiftDefs: Record<string, ShiftDefinition>;
    onCellClick: (empId: string, dateStr: string, empName: string) => void;
    onClearDay: (empId: string, dateStr: string) => void;
}

const ScaleCell = memo(({ emp, d, dateStr, cellAssignments, isSaturday, isWeekend, canEdit, shiftDefs, onCellClick, onClearDay }: ScaleCellProps) => {
    let cellBg = isWeekend ? 'bg-orange-50' : 'bg-white';
    const hasBlock = cellAssignments.some(a => a.isManualLock);
    
    if (hasBlock) cellBg = 'bg-red-50 pattern-diagonal-lines-sm';

    return (
        <td 
            onClick={() => onCellClick(emp.id, dateStr, emp.name)}
            className={`border-gray-200 p-0 relative h-16 text-center cursor-pointer hover:brightness-95 align-top
                ${isSaturday ? 'border-r-2 border-r-gray-400' : 'border-r'}
                ${cellBg}
            `}
        >
            <div className="w-full h-full flex flex-col gap-0.5 p-0.5 justify-start">
                {hasBlock ? (
                    <div className="flex-1 flex items-center justify-center text-red-500">
                        <Lock size={14}/>
                    </div>
                ) : (
                    (() => {
                        const sortedAssignments = [...cellAssignments].sort((a, b) => {
                            const categoryWeight: Record<string, number> = {
                                'Manhã': 1,
                                'Tarde': 2,
                                'Noite': 3,
                                'Bloqueio': 4,
                                'Banco de Horas': 5,
                                'Legenda Especial': 6,
                                'Afastamento': 7
                            };
                            
                            const defA = shiftDefs[a.shiftCode];
                            const defB = shiftDefs[b.shiftCode];
                            
                            const weightA = defA ? (categoryWeight[defA.category] || 99) : 99;
                            const weightB = defB ? (categoryWeight[defB.category] || 99) : 99;
                            
                            if (weightA !== weightB) return weightA - weightB;
                            
                            if (defA && defB && defA.start && defB.start) {
                                  return defA.start.localeCompare(defB.start);
                            }
                            return a.shiftCode.localeCompare(b.shiftCode);
                        });

                        return sortedAssignments.map((assignment, idx) => {
                            const def = shiftDefs[assignment.shiftCode];
                            const chipColor = def ? RulesService.getShiftColor(def.category, def.code) : 'bg-gray-200';
                            
                            const shiftParts = assignment.shiftCode.split(' ');
                            return (
                                <div 
                                    key={idx} 
                                    className={`min-h-[20px] w-full py-0.5 px-0.5 rounded flex flex-col items-center justify-center text-[9px] font-bold leading-[1.1] border shadow-sm ${chipColor} flex-none relative`}
                                    title={`${def?.label}${assignment.seiProcess ? ` - SEI: ${assignment.seiProcess}` : ''}`}
                                >
                                    {shiftParts.map((part, pIdx) => (
                                        <span key={pIdx} className="block">{part}</span>
                                    ))}
                                    {assignment.seiProcess && (
                                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full border border-white" title={`SEI: ${assignment.seiProcess}`}></div>
                                    )}
                                </div>
                            );
                        });
                    })()
                )}
            </div>

            {cellAssignments.length > 0 && canEdit && (
                <button 
                    onClick={(e) => { e.stopPropagation(); onClearDay(emp.id, dateStr); }}
                    className="absolute top-0 right-0 hidden group-hover:flex bg-white rounded-full p-0.5 shadow-sm border border-gray-300 z-10 hover:text-red-600"
                    title="Limpar Dia"
                >
                    <Trash2 size={10} />
                </button>
            )}
        </td>
    );
});

export default ScaleGrid;