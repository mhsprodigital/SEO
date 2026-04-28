import React, { useState, useMemo } from 'react';
import { Employee, ShiftAssignment, ShiftDefinition } from '../types';
import { Users, AlertTriangle, Building2, Calendar, X, Filter, TrendingUp, User as UserIcon } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';

interface DashboardProps {
    employees: Employee[];
    assignments: ShiftAssignment[];
    startDate: Date;
    shiftDefs: Record<string, ShiftDefinition>;
    professionalCategories: Record<string, string>;
    setProfessionalCategories: (newCats: Record<string, string>) => void;
}

interface DrillDownData {
    date: string;
    category: string;
    staff: Array<{
        name: string;
        shiftCode: string;
        duration: number;
        color: string;
    }>;
}

const ROLE_COLORS: Record<string, string> = {
    'Enfermeiro(a)': '#0056b3',
    'Técnico(a) em Enfermagem': '#00a8cc',
    'Médico(a)': '#10b981',
    'Fisioterapeuta': '#f59e0b',
    'Nutricionista': '#8b5cf6',
    'Psicólogo(a)': '#ec4899',
    'Administrativo': '#6b7280',
    'Afastamento': '#9ca3af',
};

const Dashboard: React.FC<DashboardProps> = ({ employees, assignments, startDate, shiftDefs, professionalCategories, setProfessionalCategories }) => {
    const [drillDown, setDrillDown] = useState<DrillDownData | null>(null);
    const [showPendencies, setShowPendencies] = useState(false);
    const [showStaffList, setShowStaffList] = useState(false);
    
    const [roleFilter, setRoleFilter] = useState<string>('Todos');
    const [periodFilter, setPeriodFilter] = useState<string>('Todos');
    const [employeeFilter, setEmployeeFilter] = useState<string>('Todos');
    const [chartMetric, setChartMetric] = useState<'hours' | 'professionals'>('hours');
    
    // Month and Year Filters
    const [selectedMonth, setSelectedMonth] = useState<number>(startDate.getMonth());
    const [selectedYear, setSelectedYear] = useState<number>(startDate.getFullYear());
    const [activeModal, setActiveModal] = useState<'staff' | 'tpd' | 'absences' | 'pendencies' | null>(null);

    const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    const years = useMemo(() => {
        const currentYear = new Date().getFullYear();
        return [currentYear - 1, currentYear, currentYear + 1];
    }, []);

    // Date Range: Selected Month
    const daysInMonth = useMemo(() => {
        const date = new Date(selectedYear, selectedMonth, 1);
        const days = [];
        while (date.getMonth() === selectedMonth) {
            days.push(new Date(date));
            date.setDate(date.getDate() + 1);
        }
        return days;
    }, [selectedMonth, selectedYear]);

    const monthDateStrings = useMemo(() => {
        return new Set(daysInMonth.map(d => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }));
    }, [daysInMonth]);

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
                 if (shiftCode.includes('M')) isM = true;
                 if (shiftCode.includes('T') && !shiftCode.includes('ST6 SN12')) isT = true;
                 if (shiftCode.includes('N')) isN = true;
            }
        }
        
        if (checkPeriod === 'Manhã') return isM;
        if (checkPeriod === 'Tarde') return isT;
        if (checkPeriod === 'Noite') return isN;
        return false;
    };

    // Filtered Employees
    const filteredEmployees = useMemo(() => {
        let emps = employees;
        if (employeeFilter !== 'Todos') {
            emps = emps.filter(e => e.id === employeeFilter);
        } else if (roleFilter !== 'Todos') {
            emps = emps.filter(e => e.role === roleFilter);
        }
        
        // If period is filtered, only show employees who are assigned in that period during the selected month
        if (periodFilter !== 'Todos') {
            const validStaffIds = new Set(
                assignments
                    .filter(a => a.shiftCode !== 'BLK' && monthDateStrings.has(a.date))
                    .filter(a => {
                        const shiftDef = shiftDefs[a.shiftCode];
                        const cat = a.category || shiftDef?.category;
                        if (periodFilter === 'Manhã' || periodFilter === 'Tarde' || periodFilter === 'Noite') {
                            return isShiftInPeriod(a.shiftCode, cat, periodFilter as any);
                        }
                        if (periodFilter === 'Legenda Especial' && cat === 'Legenda Especial') return true;
                        if (periodFilter === 'Afastamento' && cat === 'Afastamento') return true;
                        return cat === periodFilter;
                    })
                    .map(a => a.employeeId)
            );
            emps = emps.filter(e => validStaffIds.has(e.id));
        }

        return emps.sort((a,b) => (a.name || '').localeCompare(b.name || ''));
    }, [employees, roleFilter, periodFilter, assignments, monthDateStrings, shiftDefs]);

    // Filtered Assignments for "Horas Alocadas"
    const filteredAssignments = useMemo(() => {
        let filtered = assignments.filter(a => {
            const def = shiftDefs[a.shiftCode];
            const cat = a.category || def?.category;
            // Excluir bloqueios, datas fora do mês e afastamentos/banco de horas da contagem de ASSISTÊNCIA
            return a.shiftCode !== 'BLK' && 
                   monthDateStrings.has(a.date) && 
                   cat !== 'Afastamento' && 
                   cat !== 'Banco de Horas' &&
                   cat !== 'Legenda Especial'; // TPDs não entram em carga horária normal
        });
        
        if (employeeFilter !== 'Todos') {
            filtered = filtered.filter(a => a.employeeId === employeeFilter);
        } else if (roleFilter !== 'Todos') {
            filtered = filtered.filter(a => {
                const emp = employees.find(e => e.id === a.employeeId);
                return emp?.role === roleFilter;
            });
        }
        
        if (periodFilter !== 'Todos') {
            filtered = filtered.filter(a => {
                const shiftDef = shiftDefs[a.shiftCode];
                const cat = a.category || shiftDef?.category;
                if (periodFilter === 'Manhã' || periodFilter === 'Tarde' || periodFilter === 'Noite') {
                    return isShiftInPeriod(a.shiftCode, cat, periodFilter as any);
                }
                return cat === periodFilter;
            });
        }
        
        return filtered;
    }, [assignments, employees, roleFilter, periodFilter, monthDateStrings, shiftDefs]);

    // 1. Calculate General Stats
    const totalStaff = filteredEmployees.length;
    const totalHoursAssigned = filteredAssignments.reduce((acc, curr) => {
        let dur = curr.duration;
        if (curr.shiftCode.includes('SM6 ST6') && (periodFilter === 'Manhã' || periodFilter === 'Tarde')) {
            dur = 6;
        }
        return acc + dur;
    }, 0);
    
    // Base month assignments preserving category for stats, but applying employee/role filters
    const baseMonthAssignments = useMemo(() => {
        let monthAssigns = assignments.filter(a => monthDateStrings.has(a.date));
        
        if (employeeFilter !== 'Todos') {
            monthAssigns = monthAssigns.filter(a => a.employeeId === employeeFilter);
        } else if (roleFilter !== 'Todos') {
            monthAssigns = monthAssigns.filter(a => {
                const emp = employees.find(e => e.id === a.employeeId);
                return emp?.role === roleFilter;
            });
        }
        return monthAssigns;
    }, [assignments, monthDateStrings, employeeFilter, roleFilter, employees]);

    // Banco de Horas stats for the selected month
    const bankStats = useMemo(() => {
        const monthBanks = baseMonthAssignments.filter(a => {
            const def = shiftDefs[a.shiftCode];
            const cat = a.category || def?.category;
            return cat === 'Banco de Horas';
        });
        
        const positive = monthBanks.filter(a => a.duration > 0 && !a.shiftCode.includes('-') && !a.shiftCode.includes('NEG')).reduce((sum, a) => sum + a.duration, 0);
        const negative = monthBanks.filter(a => a.duration < 0 || a.shiftCode.includes('-') || a.shiftCode.includes('NEG')).reduce((sum, a) => sum + Math.abs(a.duration), 0);
        
        return { positive, negative, total: positive + negative };
    }, [baseMonthAssignments, shiftDefs]);

    // TPD stats
    const tpdStats = useMemo(() => {
         const monthTpds = baseMonthAssignments.filter(a => {
            const def = shiftDefs[a.shiftCode];
            const cat = a.category || def?.category;
            return cat === 'Legenda Especial';
        });
        return {
            count: monthTpds.length,
            hours: monthTpds.reduce((sum, a) => sum + a.duration, 0)
        };
    }, [baseMonthAssignments, shiftDefs]);

    // Afastamento stats
    const absenceStats = useMemo(() => {
        const monthAbsences = baseMonthAssignments.filter(a => {
            const def = shiftDefs[a.shiftCode];
            const cat = a.category || def?.category;
            return cat === 'Afastamento';
        });
        return {
             count: monthAbsences.length,
             hours: monthAbsences.reduce((sum, a) => sum + a.duration, 0)
        };
    }, [baseMonthAssignments, shiftDefs]);

    // Pendencies calculated monthly
    const pendencies = useMemo(() => {
        const weeksInMonth = daysInMonth.length / 7;
        
        return filteredEmployees.map(e => {
            const empAssignments = assignments.filter(a => {
                if (a.employeeId !== e.id || a.shiftCode === 'BLK' || !monthDateStrings.has(a.date)) return false;
                if (shiftDefs[a.shiftCode]?.category === 'Afastamento') return false;
                return true;
            });
            
            const assigned = empAssignments.reduce((sum, a) => sum + a.duration, 0);
            const expectedMonthly = Math.round(e.contractHours * weeksInMonth);
            const diff = expectedMonthly - assigned;
            
            // Allow a small variation (e.g., +/- 6 hours) before flagging as a pendency
            // since shifts are often in multiples of 6 or 12 and might not perfectly match
            // the exact mathematical monthly expectation.
            const isPendency = e.isTpdOnly ? false : Math.abs(diff) > 6;
            
            return {
                employee: e,
                assigned,
                contract: expectedMonthly,
                weeklyContract: e.contractHours,
                diff,
                isPendency
            };
        }).filter(p => p.isPendency);
    }, [filteredEmployees, assignments, daysInMonth, monthDateStrings]);
    
    // Define Category Colors for individual employee view
    const categoryColors: Record<string, string> = {
        'Manhã': '#eab308', // yellow-500
        'Tarde': '#f97316', // orange-500
        'Noite': '#1e3a8a', // blue-900
        'Afastamento': '#ef4444', // red-500
        'Atividade Não Assistencial': '#d946ef', // fuchsia-500
        'Legenda Especial': '#8b5cf6', // purple-500
        'Banco de Horas': '#10b981', // emerald-500
        'Outros': '#9ca3af' // gray-400
    };

    // 2. Prepare Chart Data
    const chartData = useMemo(() => {
        return daysInMonth.map(day => {
            const y = day.getFullYear();
            const m = String(day.getMonth() + 1).padStart(2, '0');
            const d = String(day.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${d}`;
            
            let dayAssignments = assignments.filter(a => a.date === dateStr && a.shiftCode !== 'BLK');
            
            // Apply Employee/Role Filter
            if (employeeFilter !== 'Todos') {
                dayAssignments = dayAssignments.filter(a => a.employeeId === employeeFilter);
            } else if (roleFilter !== 'Todos') {
                dayAssignments = dayAssignments.filter(a => {
                    const emp = employees.find(e => e.id === a.employeeId);
                    const shiftDef = shiftDefs[a.shiftCode];
                    const rKey = shiftDef?.category === 'Afastamento' ? 'Afastamento' : emp?.role;
                    return rKey === roleFilter;
                });
            }

            // Apply Period Filter
            if (periodFilter !== 'Todos') {
                dayAssignments = dayAssignments.filter(a => {
                    const shiftDef = shiftDefs[a.shiftCode];
                    const cat = a.category || shiftDef?.category;
                    if (periodFilter === 'Manhã' || periodFilter === 'Tarde' || periodFilter === 'Noite') {
                        return isShiftInPeriod(a.shiftCode, cat, periodFilter as any);
                    }
                    return cat === periodFilter;
                });
            }

            const roleCounts: Record<string, number> = {};
            const catCounts: Record<string, number> = {};

            Object.keys(professionalCategories).forEach(r => roleCounts[r] = 0);
            roleCounts['Afastamento'] = 0; // Ensure Afastamento exists
            
            Object.keys(categoryColors).forEach(c => catCounts[c] = 0);

            const uniqueEmployeesPerRole: Record<string, Set<string>> = {};
            Object.keys(professionalCategories).forEach(r => uniqueEmployeesPerRole[r] = new Set());
            uniqueEmployeesPerRole['Afastamento'] = new Set();

            dayAssignments.forEach(assign => {
                const emp = employees.find(e => e.id === assign.employeeId);
                const shiftDef = shiftDefs[assign.shiftCode];
                if (emp && shiftDef) {
                    const cat = assign.category || shiftDef.category;
                    const isAbsence = cat === 'Afastamento' || cat === 'Atividade Não Assistencial' || (cat === 'Banco de Horas' && (assign.duration < 0 || assign.shiftCode.includes('-') || assign.shiftCode.includes('NEG')));
                    
                    if (employeeFilter !== 'Todos') {
                        let finalCat = 'Outros';
                        if (['Manhã', 'Tarde', 'Noite', 'Afastamento', 'Atividade Não Assistencial', 'Legenda Especial', 'Banco de Horas'].includes(cat)) {
                            finalCat = cat;
                        }
                        // We map Atividade Não Assistencial out of "Afastamento" for the individual breakdown if we want, or keep it distinct
                        // Actually, if isAbsence is true, we override it to Afastamento for the general view, but what about finalCat here?
                        // Let's keep finalCat as the real category, unless it's a negative Banco de Horas.
                        if (cat === 'Banco de Horas' && (assign.duration < 0 || assign.shiftCode.includes('-') || assign.shiftCode.includes('NEG'))) finalCat = 'Afastamento';

                        let dur = Math.abs(assign.duration); // Use absolute for graph
                        if (assign.shiftCode.includes('SM6 ST6') && (periodFilter === 'Manhã' || periodFilter === 'Tarde')) {
                            dur = 6;
                        }
                        catCounts[finalCat] += dur;
                    } else {
                        let roleKey = isAbsence ? 'Afastamento' : emp.role;
                        if (uniqueEmployeesPerRole[roleKey] !== undefined) {
                            uniqueEmployeesPerRole[roleKey].add(assign.employeeId);
                            
                            if (chartMetric === 'hours') {
                                let dur = assign.duration;
                                if (assign.shiftCode.includes('SM6 ST6') && (periodFilter === 'Manhã' || periodFilter === 'Tarde')) {
                                    dur = 6;
                                }
                                roleCounts[roleKey] += dur;
                            }
                        }
                    }
                }
            });

            if (chartMetric === 'professionals' && employeeFilter === 'Todos') {
                Object.keys(professionalCategories).forEach(r => {
                    roleCounts[r] = uniqueEmployeesPerRole[r].size;
                });
                roleCounts['Afastamento'] = uniqueEmployeesPerRole['Afastamento'].size;
            }

            return {
                date: dateStr,
                displayDate: day.getDate().toString(),
                fullDisplayDate: day.toLocaleDateString('pt-BR'),
                ...(employeeFilter !== 'Todos' ? catCounts : roleCounts)
            };
        });
    }, [daysInMonth, assignments, employees, roleFilter, periodFilter, chartMetric, employeeFilter]);

    // Handle Click on Bar
    const handleBarClick = (data: any, roleKey: string) => {
        const dateStr = data.date;
        let dayAssignments = assignments.filter(a => a.date === dateStr && a.shiftCode !== 'BLK');
        
        if (employeeFilter !== 'Todos') {
            dayAssignments = dayAssignments.filter(a => a.employeeId === employeeFilter);
        }

        if (periodFilter !== 'Todos') {
            dayAssignments = dayAssignments.filter(a => {
                const shiftDef = shiftDefs[a.shiftCode];
                const cat = a.category || shiftDef?.category;
                if (periodFilter === 'Manhã' || periodFilter === 'Tarde' || periodFilter === 'Noite') {
                    return isShiftInPeriod(a.shiftCode, cat, periodFilter as any);
                }
                return cat === periodFilter;
            });
        }

        const staffList = dayAssignments
            .map(assign => {
                const emp = employees.find(e => e.id === assign.employeeId);
                const shiftDef = shiftDefs[assign.shiftCode];
                if (emp && shiftDef) {
                    const cat = assign.category || shiftDef.category;
                    const isAbsence = cat === 'Afastamento' || cat === 'Atividade Não Assistencial' || (cat === 'Banco de Horas' && (assign.duration < 0 || assign.shiftCode.includes('-') || assign.shiftCode.includes('NEG')));
                    
                    let isMatch = false;

                    if (employeeFilter !== 'Todos') {
                        // roleKey is a Category
                        let finalCat = 'Outros';
                        if (['Manhã', 'Tarde', 'Noite', 'Afastamento', 'Atividade Não Assistencial', 'Legenda Especial', 'Banco de Horas'].includes(cat)) {
                            finalCat = cat;
                        }
                        if (cat === 'Banco de Horas' && (assign.duration < 0 || assign.shiftCode.includes('-') || assign.shiftCode.includes('NEG'))) finalCat = 'Afastamento';

                        if (finalCat === roleKey) {
                            isMatch = true;
                        }
                    } else {
                        // roleKey is a Role or Afastamento
                        let rKey = isAbsence ? 'Afastamento' : emp.role;
                        if (rKey === roleKey) {
                            isMatch = true;
                        }
                    }
                    
                    if (isMatch) {
                        return {
                            name: emp.name,
                            shiftCode: assign.shiftCode,
                            category: cat,
                            duration: assign.duration,
                            color: emp.colorIdentifier
                        };
                    }
                }
                return null;
            })
            .filter((item): item is NonNullable<typeof item> => item !== null);

        // Deduplicate staffList in case someone has two shifts in the SAME day
        const uniqueStaff = Array.from(new Map(staffList.map(item => [item.name, item])).values());

        setDrillDown({
            date: data.fullDisplayDate,
            category: roleKey,
            staff: uniqueStaff
        });
    };

    return (
        <div className="space-y-6">
            {/* Modal for Drill Down */}
            {drillDown && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setDrillDown(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                        <div className="bg-gray-50 p-4 border-b flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                                    <Users size={20} className="text-gdf-primary"/>
                                    {drillDown.category}
                                </h3>
                                <p className="text-sm text-gray-500">{drillDown.date}</p>
                            </div>
                            <button onClick={() => setDrillDown(null)} className="text-gray-400 hover:text-red-500">
                                <X size={24}/>
                            </button>
                        </div>
                        <div className="p-4 max-h-[60vh] overflow-y-auto">
                            {drillDown.staff.length > 0 ? (
                                <div className="space-y-2">
                                    {drillDown.staff.map((s, idx) => (
                                        <div key={idx} className="flex justify-between items-center p-3 bg-white border border-gray-100 rounded-lg shadow-sm hover:bg-blue-50 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full ${s.color} flex items-center justify-center text-white text-xs font-bold`}>
                                                    {s.name.charAt(0)}
                                                </div>
                                                <span className="font-semibold text-gray-800">{s.name}</span>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <div className="flex items-center gap-2">
                                                    {s.category && !['Manhã', 'Tarde', 'Noite', 'Afastamento', 'Legenda Especial', 'Banco de Horas'].includes(drillDown.category) && (
                                                        <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                                            {s.category}
                                                        </span>
                                                    )}
                                                    <span className="text-sm font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">{s.shiftCode}</span>
                                                </div>
                                                <span className="text-xs text-gray-500 font-medium">{s.duration}h</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-center text-gray-500 py-4">Nenhum profissional escalado.</p>
                            )}
                        </div>
                        <div className="bg-gray-50 p-3 text-center text-xs text-gray-400 border-t">
                            Total: {drillDown.staff.length} Profissionais
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b pb-4 gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Painel Gerencial</h2>
                    <p className="text-gray-500 text-sm">Visão consolidada da escala selecionada.</p>
                </div>
                <div className="flex flex-wrap gap-3 w-full md:w-auto">
                    <div className="flex-1 md:w-32">
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Mês</label>
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
                    <div className="flex-1 md:w-24">
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Ano</label>
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
                    <div className="flex-1 md:w-48">
                        <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1"><UserIcon size={12}/> Servidor</label>
                        <select 
                            className="w-full border-gray-300 rounded-md shadow-sm focus:ring-gdf-primary focus:border-gdf-primary text-sm p-2 border bg-white"
                            value={employeeFilter}
                            onChange={(e) => {
                                setEmployeeFilter(e.target.value);
                                if (e.target.value !== 'Todos') setRoleFilter('Todos'); // Reset role when specific employee is chosen
                            }}
                        >
                            <option value="Todos">Todos os Servidores</option>
                            {[...employees].sort((a,b) => (a.name || '').localeCompare(b.name || '')).map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 md:w-48">
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Categoria Profissional</label>
                        <select 
                            className="w-full border-gray-300 rounded-md shadow-sm focus:ring-gdf-primary focus:border-gdf-primary text-sm p-2 border bg-white"
                            value={roleFilter}
                            onChange={(e) => {
                                setRoleFilter(e.target.value);
                                if (e.target.value !== 'Todos') setEmployeeFilter('Todos');
                            }}
                            disabled={employeeFilter !== 'Todos'}
                        >
                            <option value="Todos">Todas as Categorias</option>
                            {Object.keys(professionalCategories).map(role => (
                                <option key={role} value={role}>{role}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 md:w-48">
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Período</label>
                        <select 
                            className="w-full border-gray-300 rounded-md shadow-sm focus:ring-gdf-primary focus:border-gdf-primary text-sm p-2 border bg-white"
                            value={periodFilter}
                            onChange={(e) => setPeriodFilter(e.target.value)}
                        >
                            <option value="Todos">Todos os Períodos</option>
                            <option value="Manhã">Manhã</option>
                            <option value="Tarde">Tarde</option>
                            <option value="Noite">Noite</option>
                            <option value="Banco de Horas">Banco de Horas</option>
                        </select>
                    </div>
                </div>
            </div>
            
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div 
                    className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-blue-500 flex justify-between items-center cursor-pointer hover:bg-blue-50 transition-colors"
                    onClick={() => setActiveModal('staff')}
                >
                    <div>
                        <p className="text-xs font-bold text-gray-400 border-b border-gray-100 pb-1 mb-1 block">SERVIDORES / HORAS</p>
                        <p className="text-xl font-bold text-gray-800">{totalStaff} <span className="text-sm font-normal text-gray-500">disp.</span> / {totalHoursAssigned}h</p>
                    </div>
                </div>
                
                <div 
                    className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-yellow-500 flex justify-between items-center cursor-pointer hover:bg-yellow-50 transition-colors"
                    onClick={() => setActiveModal('tpd')}
                    title="Exibindo horas de Trabalho em Período de Descanso (TPD)"
                >
                    <div>
                        <p className="text-[10px] font-bold text-yellow-600 uppercase">TPD (Mensal)</p>
                        <p className="text-lg font-bold text-gray-800">{tpdStats.count} <span className="text-sm font-normal text-gray-500">un.</span> / {tpdStats.hours}h</p>
                    </div>
                </div>

                <div 
                    className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-purple-500 flex justify-between items-center cursor-pointer hover:bg-purple-50 transition-colors"
                    onClick={() => setActiveModal('absences')}
                >
                    <div>
                        <p className="text-[10px] font-bold text-purple-600 uppercase">Afastamentos</p>
                        <p className="text-lg font-bold text-gray-800">{absenceStats.count} <span className="text-sm font-normal text-gray-500">un.</span> / {absenceStats.hours}h</p>
                    </div>
                </div>
                
                <div 
                    className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-red-500 flex justify-between items-center cursor-pointer hover:bg-red-50 transition-colors"
                    onClick={() => setActiveModal('pendencies')}
                >
                    <div>
                        <p className="text-[10px] font-bold text-red-600 uppercase">Pendências</p>
                        <p className="text-xl font-bold text-gray-800">
                             {pendencies.length}
                        </p>
                    </div>
                    <AlertTriangle className="text-red-200" size={24} />
                </div>
                
                <div className="md:col-span-2">
                    {/* Banco de Horas Summary Card Mini */}
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 h-full flex flex-col justify-center shadow-sm">
                        <div className="flex items-center justify-between">
                            <p className="text-[10px] font-bold text-orange-800 uppercase flex items-center gap-1"><TrendingUp size={12}/> Banco de Horas</p>
                            <p className={`text-sm font-bold ${bankStats.total >= 0 ? 'text-green-600' : 'text-red-600'}`}>Saldo: {bankStats.total > 0 ? '+' : ''}{bankStats.total}h</p>
                        </div>
                        <div className="flex gap-4 mt-1">
                            <div>
                                <p className="text-[10px] uppercase font-bold text-gray-500">BH Positivo</p>
                                <p className="text-sm font-bold text-blue-600">+{bankStats.positive}h</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase font-bold text-gray-500">BH Negativo</p>
                                <p className="text-sm font-bold text-red-600">{bankStats.negative}h</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Daily Distribution Chart */}
            <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-700 flex items-center gap-2">
                            <Calendar className="text-gdf-primary" size={20}/>
                            Distribuição Diária por Categoria
                        </h3>
                    </div>
                    <div className="flex items-center gap-4">
                         <div className="bg-gray-100 p-1 rounded-lg flex items-center shadow-inner">
                            <button 
                                onClick={() => setChartMetric('hours')}
                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${chartMetric === 'hours' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Em Horas
                            </button>
                            <button 
                                onClick={() => setChartMetric('professionals')}
                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${chartMetric === 'professionals' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Nº Profissionais
                            </button>
                        </div>
                        <div className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded border flex items-center gap-1">
                            <Filter size={14} />
                            Filtros aplicados ao gráfico
                        </div>
                    </div>
                </div>

                <div className="h-[400px] w-full min-h-[300px]" style={{ minWidth: 10, minHeight: 10 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb"/>
                            <XAxis 
                                dataKey="displayDate" 
                                tickLine={false} 
                                axisLine={false} 
                                tick={{fill: '#6b7280', fontSize: 12}}
                            />
                            <YAxis 
                                tickLine={false} 
                                axisLine={false} 
                                tick={{fill: '#6b7280', fontSize: 12}}
                                allowDecimals={false}
                            />
                            <Tooltip 
                                cursor={{fill: '#f3f4f6'}}
                                contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                            />
                            <Legend wrapperStyle={{paddingTop: '20px'}}/>
                            
                            {/* Render bars depending on employeeFilter state */}
                            {employeeFilter !== 'Todos' ? (
                                Object.keys(categoryColors).map((cat) => (
                                    <Bar 
                                        key={cat} 
                                        dataKey={cat} 
                                        name={cat}
                                        stackId="a"
                                        fill={categoryColors[cat]}
                                        radius={[0, 0, 0, 0]}
                                        onClick={(data) => handleBarClick(data, cat)}
                                        cursor="pointer"
                                    />
                                ))
                            ) : (
                                Object.keys(professionalCategories).map((role) => (
                                    (roleFilter === 'Todos' || roleFilter === role) && (
                                        <Bar 
                                            key={role} 
                                            dataKey={role} 
                                            name={role}
                                            stackId="a"
                                            fill={professionalCategories[role] || '#000000'}
                                            radius={[0, 0, 0, 0]}
                                            onClick={(data) => handleBarClick(data, role)}
                                            cursor="pointer"
                                        />
                                    )
                                ))
                            )}
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Global Modal for List Displays */}
            {(activeModal) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => { setActiveModal(null); setShowStaffList(false); setShowPendencies(false); }}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                        <div className={`p-4 border-b flex justify-between items-center ${activeModal === 'pendencies' ? 'bg-red-50 border-red-100' : 'bg-gray-50'}`}>
                            <div>
                                <h3 className={`font-bold text-lg flex items-center gap-2 ${activeModal === 'pendencies' ? 'text-red-800' : 'text-gray-800'}`}>
                                    {activeModal === 'pendencies' ? <AlertTriangle size={20} className="text-red-600"/> : <Users size={20} className="text-gdf-primary"/>}
                                    {activeModal === 'staff'  && 'Servidores Filtrados'}
                                    {activeModal === 'tpd' && 'Detalhamento de TPDs'}
                                    {activeModal === 'absences' && 'Detalhamento de Afastamentos'}
                                    {activeModal === 'pendencies' && 'Pendências de Carga Horária Mensal'}
                                </h3>
                                <p className={`text-sm ${activeModal === 'pendencies' ? 'text-red-600' : 'text-gray-500'}`}>
                                    {activeModal === 'staff' && 'Com base nos filtros de Mês, Cargo e Período'}
                                    {activeModal === 'tpd' && 'Servidores com registros de Legenda Especial / TPD no mês'}
                                    {activeModal === 'absences' && 'Servidores com registros de Afastamentos no mês'}
                                    {activeModal === 'pendencies' && 'Diferença entre a carga mensal esperada e a alocada no mês atual'}
                                </p>
                            </div>
                            <button onClick={() => { setActiveModal(null); setShowStaffList(false); setShowPendencies(false); }} className={`text-gray-400 hover:text-red-500 ${activeModal === 'pendencies' ? 'text-red-400 hover:text-red-600' : ''}`}>
                                <X size={24}/>
                            </button>
                        </div>
                        <div className="p-4 max-h-[60vh] overflow-y-auto">
                            {activeModal === 'staff' ? (
                                filteredEmployees.length > 0 ? (
                                    <div className="space-y-4">
                                        {filteredEmployees.map(emp => {
                                            const empAssignments = filteredAssignments.filter(a => a.employeeId === emp.id);
                                            const assignedHours = empAssignments.reduce((acc, curr) => acc + curr.duration, 0);
                                            return (
                                            <div key={emp.id} className="flex justify-between items-center p-3 bg-white border border-gray-100 rounded-lg shadow-sm hover:bg-gray-50 transition-colors">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-full ${emp.colorIdentifier} flex items-center justify-center text-white text-sm font-bold`}>
                                                        {emp.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-gray-800">{emp.name}</p>
                                                        <p className="text-xs text-gray-500">Mat: {emp.matricula} • {emp.role}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="flex flex-col gap-1 items-end">
                                                        <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded font-medium">
                                                            Contrato: {emp.contractHours}h/sem
                                                        </span>
                                                        <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded font-medium">
                                                            Alocado: {assignedHours}h
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        )})}
                                    </div>
                                ) : (
                                    <p className="text-center text-gray-500 py-8">Nenhum servidor encontrado com estes filtros.</p>
                                )
                            ) : activeModal === 'pendencies' ? (
                                pendencies.length > 0 ? (
                                    <div className="space-y-3">
                                        {pendencies.map((p, idx) => (
                                            <div key={idx} className="flex justify-between items-center p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-full ${p.employee.colorIdentifier} flex items-center justify-center text-white text-sm font-bold`}>
                                                        {p.employee.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <span className="font-semibold text-gray-800 block">{p.employee.name}</span>
                                                        <span className="text-xs text-gray-500">{p.employee.role}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="text-right hidden sm:block">
                                                        <p className="text-xs text-gray-500">Contrato Mensal</p>
                                                        <p className="font-semibold">{p.contract}h</p>
                                                    </div>
                                                    <div className="text-right hidden sm:block">
                                                        <p className="text-xs text-gray-500">Alocado</p>
                                                        <p className="font-semibold">{p.assigned}h</p>
                                                    </div>
                                                    <div className={`text-right px-3 py-1 rounded ${p.diff > 0 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                        <p className="text-xs font-bold">{p.diff > 0 ? 'Faltam' : 'Excedem'}</p>
                                                        <p className="font-bold">{Math.abs(p.diff)}h</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-center text-gray-500 py-8">Nenhuma pendência encontrada. Todos os servidores estão com a carga horária correta no mês.</p>
                                )
                            ) : activeModal === 'tpd' ? (
                                <div className="space-y-4">
                                    {Array.from(new Set(assignments.filter(a => monthDateStrings.has(a.date) && (a.category || shiftDefs[a.shiftCode]?.category) === 'Legenda Especial').map(a => a.employeeId)))
                                        .map(empId => employees.find(e => e.id === empId))
                                        .filter(Boolean)
                                        .map(emp => {
                                            const tpds = assignments.filter(a => a.employeeId === emp!.id && monthDateStrings.has(a.date) && (a.category || shiftDefs[a.shiftCode]?.category) === 'Legenda Especial');
                                            const hours = tpds.reduce((sum, a) => sum + a.duration, 0);
                                            return (
                                                <div key={emp!.id} className="flex justify-between items-center p-3 bg-white border border-gray-100 rounded-lg shadow-sm">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 rounded-full ${emp!.colorIdentifier} flex items-center justify-center text-white text-sm font-bold`}>
                                                            {emp!.name.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-gray-800">{emp!.name}</p>
                                                            <p className="text-xs text-gray-500">{emp!.role}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-lg font-bold text-yellow-600">{hours}h</p>
                                                        <p className="text-[10px] text-gray-400 font-bold uppercase">{tpds.length} registros</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            ) : activeModal === 'absences' ? (
                                <div className="space-y-4">
                                    {Array.from(new Set(assignments.filter(a => monthDateStrings.has(a.date) && (a.category || shiftDefs[a.shiftCode]?.category) === 'Afastamento').map(a => a.employeeId)))
                                        .map(empId => employees.find(e => e.id === empId))
                                        .filter(Boolean)
                                        .map(emp => {
                                            const abs = assignments.filter(a => a.employeeId === emp!.id && monthDateStrings.has(a.date) && (a.category || shiftDefs[a.shiftCode]?.category) === 'Afastamento');
                                            const hours = abs.reduce((sum, a) => sum + a.duration, 0);
                                            return (
                                                <div key={emp!.id} className="flex justify-between items-center p-3 bg-white border border-gray-100 rounded-lg shadow-sm">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 rounded-full ${emp!.colorIdentifier} flex items-center justify-center text-white text-sm font-bold`}>
                                                            {emp!.name.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-gray-800">{emp!.name}</p>
                                                            <p className="text-xs text-gray-500">{emp!.role}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-lg font-bold text-purple-600">{hours}h</p>
                                                        <p className="text-[10px] text-gray-400 font-bold uppercase">{abs.length} dias</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;