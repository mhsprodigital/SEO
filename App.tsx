import React, { useEffect, useState, useMemo } from 'react';
import { Users, Settings as SettingsIcon, BookOpen, Menu, Plus, Calendar, LayoutDashboard } from 'lucide-react';
import { subscribeToEmployees, subscribeToAssignments, subscribeToSettings, subscribeToVehicles, subscribeToSectors, saveAssignmentsDiff, saveAssignments, saveEmployee, deleteEmployee, deleteAssignment, syncDefaultSettings, getSystemUserByEmail, saveSettings } from './services/storageService';
import { Employee, ShiftAssignment, Vehicle, Sector, UserRole } from './types';
import StaffForm from './components/StaffForm';
import ScaleGrid from './components/ScaleGrid';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import RulesView from './components/RulesView';
import ReportsView from './components/ReportsView';
import AccessManagement from './components/AccessManagement';
import DossierView from './components/DossierView';
import { FileText, ShieldCheck, FileDigit } from 'lucide-react';
import ConfirmModal from './components/ConfirmModal';
import { auth } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';

enum ViewState {
    DASHBOARD = 'DASHBOARD',
    STAFF_LIST = 'STAFF_LIST',
    STAFF_FORM = 'STAFF_FORM',
    SCALE = 'SCALE',
    RULES = 'RULES',
    REPORTS = 'REPORTS',
    SETTINGS = 'SETTINGS',
    ACCESS_MANAGEMENT = 'ACCESS_MANAGEMENT',
    DOSSIER = 'DOSSIER'
}

const App: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [userRole, setUserRole] = useState<UserRole>('VIEWER');
    const [isAuthChecking, setIsAuthChecking] = useState(true);
    const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [sectors, setSectors] = useState<Sector[]>([]);
    const [settings, setSettings] = useState<any>(null);
    const professionalCategories = settings?.professionalCategories || {
        'Enfermeiro(a)': '#0056b3',
        'Técnico(a) em Enfermagem': '#00a8cc',
        'Médico(a)': '#10b981',
        'Fisioterapeuta': '#f59e0b',
        'Nutricionista': '#8b5cf6',
        'Psicólogo(a)': '#ec4899',
    };
    
    const setProfessionalCategories = async (newCats: Record<string, string>) => {
        const newSettings = { ...settings, professionalCategories: newCats };
        await saveSettings(newSettings);
    };

    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [currentWeekStart, setCurrentWeekStart] = useState<Date>(new Date());
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [employeeToDelete, setEmployeeToDelete] = useState<string | null>(null);
    const [appError, setAppError] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            if (!currentUser) setIsAuthChecking(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (isAuthChecking || !settings) {
                setAppError(`Tempo limite excedido. Detalhes: user=${!!user}, isAuthChecking=${isAuthChecking}, settings=${!!settings}`);
            }
        }, 10000);
        return () => clearTimeout(timer);
    }, [isAuthChecking, settings, user]);

    useEffect(() => {
        if (!user) return;

        const checkRole = async () => {
            // Master always ADMIN
            if (user.email?.toLowerCase() === 'mhs.pro.digital@gmail.com') {
                setUserRole('ADMIN');
                setUserUnitAccess(null);
                setIsAuthChecking(false);
                return;
            }

            // Check system_users
            const systemUser = await getSystemUserByEmail(user.email || '');
            if (systemUser) {
                setUserRole(systemUser.role);
                setUserUnitAccess(systemUser.unitAccess || null);
            } else {
                setUserRole('VIEWER');
                setUserUnitAccess(null);
            }
            setIsAuthChecking(false);
        };

        checkRole();
    }, [user]);

    const isAdmin = userRole === 'ADMIN';
    const canEdit = userRole === 'ADMIN' || userRole === 'EDITOR';
    
    // Sidebar state
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [userUnitAccess, setUserUnitAccess] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;

        // Sync settings with new defaults (like Banco de Horas)
        syncDefaultSettings();

        const unsubEmployees = subscribeToEmployees((data) => {
            setEmployees(data);
        });
        const unsubAssignments = subscribeToAssignments((data) => {
            setAssignments(data);
        });
        const unsubVehicles = subscribeToVehicles((data) => {
            setVehicles(data || []);
        });
        const unsubSectors = subscribeToSectors((data) => {
            setSectors(data || []);
        });
        const unsubSettings = subscribeToSettings((data) => {
            setSettings(data);
            setIsInitialLoading(false);
        });

        return () => {
            unsubEmployees();
            unsubAssignments();
            unsubVehicles();
            unsubSectors();
            unsubSettings();
        };
    }, [user]);

    useEffect(() => {
        const d = new Date();
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        setCurrentWeekStart(monday);
    }, [view]);

    const handleLogin = async () => {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error('Login error:', error);
            alert('Erro ao fazer login com o Google.');
        }
    };

    const handleLogout = async () => {
        try {
            await auth.signOut();
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    const handleSaveEmployee = async (emp: Employee) => {
        await saveEmployee(emp);
        setView(ViewState.STAFF_LIST);
        setEditingEmployee(null);
    };

    const handleDeleteEmployee = (id: string) => {
        setEmployeeToDelete(id);
    };

    const [isDeleting, setIsDeleting] = useState(false);

    const confirmDeleteEmployee = async () => {
        if (employeeToDelete && !isDeleting) {
            setIsDeleting(true);
            try {
                await deleteEmployee(employeeToDelete);
            } catch (error) {
                console.error("Failed to delete", error);
                alert("Falha ao deletar servidor. O banco pode ter atingido o limite de operações.");
            } finally {
                setEmployeeToDelete(null);
                setIsDeleting(false);
            }
        }
    };

    const handleAssignmentsChange = async (newAssignments: ShiftAssignment[]): Promise<boolean> => {
        try {
            const addedOrModified = newAssignments.filter(newA => {
                const oldA = assignments.find(a => a.id === newA.id);
                if (!oldA) return true;
                return oldA.shiftCode !== newA.shiftCode || 
                       oldA.date !== newA.date || 
                       oldA.employeeId !== newA.employeeId ||
                       oldA.duration !== newA.duration ||
                       oldA.category !== newA.category ||
                       oldA.seiProcess !== newA.seiProcess ||
                       oldA.isManualLock !== newA.isManualLock ||
                       oldA.allocation?.id !== newA.allocation?.id ||
                       oldA.allocation?.type !== newA.allocation?.type;
            });
            const newIds = new Set(newAssignments.map(a => a.id));
            const deletedIds = assignments
                .filter(a => !newIds.has(a.id))
                .map(a => a.id);
            
            if (addedOrModified.length > 0 || deletedIds.length > 0) {
                console.log(`Saving changes: ${addedOrModified.length} added/modified, ${deletedIds.length} deleted.`);
                await saveAssignmentsDiff(addedOrModified, deletedIds);
            }
            return true;
        } catch (error) {
            console.error(error);
            alert("Não foi possível salvar a escala. Verifique sua conexão ou se o limite de uso diário (Quota) foi atingido.");
            return false;
        }
    };

    const handleAssignmentDelete = async (assignmentId: string) => {
        try {
            await deleteAssignment(assignmentId);
        } catch (error) {
            console.error(error);
            alert("Não foi possível excluir a legenda. Verifique se o limite de uso diário (Quota) foi atingido.");
        }
    };

    // Filtering state
    const [globalUnitFilter, setGlobalUnitFilter] = useState<string>('Todos');
    const [globalSectorFilter, setGlobalSectorFilter] = useState<string>('Todos');

    // Force unit filter if user has limited access
    const effectiveUnitFilter = userUnitAccess || globalUnitFilter;

    useEffect(() => {
        // Reset sector when unit changes
        setGlobalSectorFilter('Todos');
    }, [effectiveUnitFilter]);

    const accessibleEmployees = useMemo(() => {
        let filtered = employees;
        if (effectiveUnitFilter && effectiveUnitFilter !== 'Todos') {
            filtered = filtered.filter(emp => emp.unit === effectiveUnitFilter);
        }
        if (globalSectorFilter && globalSectorFilter !== 'Todos') {
            filtered = filtered.filter(emp => emp.sector === globalSectorFilter);
        }
        return filtered;
    }, [employees, effectiveUnitFilter, globalSectorFilter]);

    const accessibleAssignments = useMemo(() => {
        if (effectiveUnitFilter === 'Todos' && globalSectorFilter === 'Todos') return assignments;
        const accessibleIds = new Set(accessibleEmployees.map(e => e.id));
        return assignments.filter(a => accessibleIds.has(a.employeeId));
    }, [assignments, accessibleEmployees, effectiveUnitFilter, globalSectorFilter]);

    if (isAuthChecking) {
        return (
            <div className="flex items-center justify-center h-screen w-full bg-gray-100">
                <div className="flex flex-col items-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gdf-primary mb-4"></div>
                    <p className="text-gray-500">Verificando autenticação...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="flex items-center justify-center h-screen w-full bg-gray-100">
                <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
                    <h1 className="text-2xl font-bold text-gray-800 mb-6">SIS-ESCALA GDF</h1>
                    <p className="text-gray-600 mb-8">Faça login para acessar o sistema de escalas.</p>
                    <button 
                        onClick={handleLogin}
                        className="w-full bg-gdf-primary text-white font-bold py-3 px-4 rounded hover:bg-blue-700 transition duration-200"
                    >
                        Entrar com Google
                    </button>
                </div>
            </div>
        );
    }

    if (appError && !settings) {
        return (
            <div className="flex items-center justify-center h-screen w-full bg-gray-100 p-4">
                <div className="bg-red-50 p-6 rounded-lg shadow-lg w-full max-w-md border border-red-300">
                    <h2 className="text-xl font-bold text-red-700 mb-4">Falha no Carregamento</h2>
                    <p className="text-sm text-red-600 word-break mb-4">
                        O usuário foi autenticado, mas não conseguimos carregar os dados do Firestore. 
                        Isso geralmente indica um erro de permissão ou rede.
                    </p>
                    <div className="bg-white p-3 rounded border border-red-100 text-xs text-red-500 font-mono overflow-auto max-h-32">
                        {appError}
                    </div>
                </div>
            </div>
        );
    }

    if (!settings) {
        return (
            <div className="flex items-center justify-center h-screen w-full bg-gray-100">
                <div className="flex flex-col items-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gdf-primary mb-4"></div>
                    <p className="text-gray-500">Carregando dados do sistema...</p>
                </div>
            </div>
        );
    }

    const renderContent = () => {
        if (isInitialLoading || !settings) {
            return (
                <div className="flex items-center justify-center h-full w-full">
                    <div className="flex flex-col items-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gdf-primary mb-4"></div>
                        <p className="text-gray-500">Sincronizando com banco de dados...</p>
                    </div>
                </div>
            );
        }

        switch (view) {
            case ViewState.DASHBOARD:
                return (
                    <Dashboard 
                        employees={accessibleEmployees}
                        assignments={accessibleAssignments}
                        startDate={currentWeekStart}
                        shiftDefs={settings.shiftDefs}
                        professionalCategories={professionalCategories}
                        setProfessionalCategories={setProfessionalCategories}
                    />
                );
            
            case ViewState.STAFF_LIST:
                if (!canEdit) return <Dashboard employees={employees} assignments={assignments} startDate={currentWeekStart} shiftDefs={settings.shiftDefs} />;
                return (
                    <div className="bg-white rounded-lg shadow overflow-hidden">
                        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                            <div>
                                <h2 className="text-lg font-bold text-gray-800">Cadastro de Servidores</h2>
                                <p className="text-xs text-gray-500">Gerencie a equipe do seu setor</p>
                            </div>
                            {canEdit && (
                                <button 
                                    onClick={() => { setEditingEmployee(null); setView(ViewState.STAFF_FORM); }}
                                    className="bg-gdf-secondary text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-cyan-600 transition shadow-sm"
                                >
                                    <Plus size={18} /> Novo Servidor
                                </button>
                            )}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Servidor</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Cargo</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Vínculo</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Restrições</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Carga Horária</th>
                                        <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">{canEdit ? 'Ações' : ''}</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {[...accessibleEmployees].sort((a,b) => (a.name || '').localeCompare(b.name || '')).map(emp => (
                                        <tr key={emp.id} className="hover:bg-blue-50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <div className={`flex-shrink-0 h-9 w-9 rounded-full ${emp.colorIdentifier} flex items-center justify-center text-white text-sm font-bold shadow-sm`}>
                                                        {emp.name.charAt(0)}
                                                    </div>
                                                    <div className="ml-4">
                                                        <div className="text-sm font-semibold text-gray-900">{emp.name}</div>
                                                        <div className="text-xs text-gray-500">{emp.matricula}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{emp.role}</td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${emp.employmentType === 'Temporário' ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-green-100 text-green-700 border border-green-200'}`}>
                                                    {emp.employmentType || 'Efetivo'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                {emp.preferences?.reducaoCarga > 0 && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 mr-1">
                                                        Redução: {emp.preferences.reducaoCarga}h
                                                    </span>
                                                )}
                                                {emp.preferences?.prefersWeekends && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                                        FDS
                                                    </span>
                                                )}
                                                {!emp.preferences?.reducaoCarga && !emp.preferences?.prefersWeekends && (
                                                    <span className="text-gray-400 text-xs">-</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                                                    {emp.contractHours}h
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                {canEdit && (
                                                    <>
                                                        <button onClick={() => { setEditingEmployee(emp); setView(ViewState.STAFF_FORM); }} className="text-indigo-600 hover:text-indigo-900 mr-4 font-semibold">Editar</button>
                                                        <button onClick={() => handleDeleteEmployee(emp.id)} className="text-red-500 hover:text-red-700 font-semibold">Excluir</button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {accessibleEmployees.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-gray-400 bg-gray-50 border-dashed border-2 border-gray-200 rounded-lg m-4">
                                                <Users size={48} className="mx-auto mb-2 opacity-20" />
                                                <p>Nenhum servidor cadastrado.</p>
                                                <p className="text-sm">Clique em "Novo Servidor" para começar.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );

            case ViewState.STAFF_FORM:
                if (!canEdit) return <Dashboard employees={accessibleEmployees} assignments={accessibleAssignments} startDate={currentWeekStart} shiftDefs={settings.shiftDefs} />;
                return (
                    <StaffForm 
                        onSave={handleSaveEmployee} 
                        onCancel={() => setView(ViewState.STAFF_LIST)} 
                        initialData={editingEmployee}
                        professionalCategories={professionalCategories}
                        units={settings?.units || []}
                        restrictedUnit={userUnitAccess}
                    />
                );

            case ViewState.SCALE:
                return (
                    <ScaleGrid 
                        employees={accessibleEmployees}
                        assignments={accessibleAssignments}
                        onAssignmentChange={handleAssignmentsChange}
                        onAssignmentDelete={handleAssignmentDelete}
                        startDate={currentWeekStart}
                        shiftDefs={settings.shiftDefs}
                        canEdit={canEdit}
                        professionalCategories={professionalCategories}
                    />
                );
            
            case ViewState.SETTINGS:
                if (!isAdmin) return <Dashboard employees={accessibleEmployees} assignments={accessibleAssignments} startDate={currentWeekStart} shiftDefs={settings.shiftDefs} professionalCategories={professionalCategories} setProfessionalCategories={setProfessionalCategories} />;
                return <Settings canEdit={isAdmin} professionalCategories={professionalCategories} setProfessionalCategories={setProfessionalCategories} employees={accessibleEmployees} />;

            case ViewState.ACCESS_MANAGEMENT:
                if (!isAdmin) return <Dashboard employees={accessibleEmployees} assignments={accessibleAssignments} startDate={currentWeekStart} shiftDefs={settings.shiftDefs} />;
                return <AccessManagement />;

            case ViewState.RULES:
                if (!isAdmin) return <Dashboard employees={accessibleEmployees} assignments={accessibleAssignments} startDate={currentWeekStart} shiftDefs={settings.shiftDefs} />;
                return <RulesView />;

            case ViewState.REPORTS:
                if (!canEdit) return <Dashboard employees={accessibleEmployees} assignments={accessibleAssignments} startDate={currentWeekStart} shiftDefs={settings.shiftDefs} />;
                return (
                    <ReportsView 
                        employees={accessibleEmployees}
                        assignments={accessibleAssignments}
                        startDate={currentWeekStart}
                        shiftDefs={settings.shiftDefs}
                        vehicles={vehicles}
                        sectors={sectors}
                        onAssignmentsChange={handleAssignmentsChange}
                        canEdit={canEdit}
                    />
                );

            case ViewState.DOSSIER:
                if (!canEdit) return <Dashboard employees={accessibleEmployees} assignments={accessibleAssignments} startDate={currentWeekStart} shiftDefs={settings.shiftDefs} />;
                return (
                    <DossierView 
                        employees={accessibleEmployees}
                        assignments={accessibleAssignments}
                        shiftDefs={settings.shiftDefs}
                    />
                );

            default:
                return null;
        }
    };

    return (
        <div className="min-h-screen flex bg-gray-100 font-sans">
            {/* Sidebar */}
            <aside className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-gdf-dark text-white hidden md:flex flex-col flex-shrink-0 transition-all duration-300 shadow-xl z-20 overflow-hidden`}>
                <div className="h-16 flex items-center justify-center border-b border-gray-700 bg-gdf-primary shadow-inner">
                    {isSidebarOpen ? (
                        <span className="font-bold text-xl tracking-wider flex items-center gap-2 whitespace-nowrap">
                            SIS-ESCALA <span className="text-xs bg-white text-gdf-primary px-1 rounded">GDF</span>
                        </span>
                    ) : (
                        <span className="font-bold text-xl tracking-wider flex items-center justify-center">
                            S<span className="text-xs bg-white text-gdf-primary px-1 rounded ml-1">GDF</span>
                        </span>
                    )}
                </div>
                
                <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto overflow-x-hidden">
                    
                    <button 
                         onClick={() => setView(ViewState.DASHBOARD)}
                         className={`flex items-center w-full px-4 py-3 rounded-lg transition-all duration-200 group ${view === ViewState.DASHBOARD ? 'bg-gray-700 text-gdf-accent shadow-lg translate-x-1' : 'hover:bg-gray-700 hover:text-white'} ${!isSidebarOpen && 'justify-center translate-x-0 px-0'}`}
                         title={!isSidebarOpen ? "Dashboard" : ""}
                    >
                        <LayoutDashboard className={`${isSidebarOpen ? 'mr-3' : ''} ${view === ViewState.DASHBOARD ? 'text-gdf-accent' : 'text-gray-400 group-hover:text-white'}`} size={20} />
                        {isSidebarOpen && <span className="whitespace-nowrap">Dashboard</span>}
                    </button>

                    <button 
                        onClick={() => setView(ViewState.SCALE)}
                        className={`flex items-center w-full px-4 py-3 rounded-lg transition-all duration-200 group ${view === ViewState.SCALE ? 'bg-gray-700 text-gdf-accent shadow-lg translate-x-1' : 'hover:bg-gray-700 hover:text-white'} ${!isSidebarOpen && 'justify-center translate-x-0 px-0'}`}
                        title={!isSidebarOpen ? "Escala Mensal" : ""}
                    >
                        <Calendar className={`${isSidebarOpen ? 'mr-3' : ''} ${view === ViewState.SCALE ? 'text-gdf-accent' : 'text-gray-400 group-hover:text-white'}`} size={20} />
                        {isSidebarOpen && <span className="whitespace-nowrap">Escala Mensal</span>}
                    </button>

                    {canEdit && (
                        <button 
                            onClick={() => setView(ViewState.STAFF_LIST)}
                            className={`flex items-center w-full px-4 py-3 rounded-lg transition-all duration-200 group ${view === ViewState.STAFF_LIST || view === ViewState.STAFF_FORM ? 'bg-gray-700 text-gdf-accent shadow-lg translate-x-1' : 'hover:bg-gray-700 hover:text-white'} ${!isSidebarOpen && 'justify-center translate-x-0 px-0'}`}
                            title={!isSidebarOpen ? "Servidores" : ""}
                        >
                            <Users className={`${isSidebarOpen ? 'mr-3' : ''} ${view === ViewState.STAFF_LIST || view === ViewState.STAFF_FORM ? 'text-gdf-accent' : 'text-gray-400 group-hover:text-white'}`} size={20} />
                            {isSidebarOpen && <span className="whitespace-nowrap">Servidores</span>}
                        </button>
                    )}

                    {canEdit && (
                        <button 
                            onClick={() => setView(ViewState.REPORTS)}
                            className={`flex items-center w-full px-4 py-3 rounded-lg transition-all duration-200 group ${view === ViewState.REPORTS ? 'bg-gray-700 text-gdf-accent shadow-lg translate-x-1' : 'hover:bg-gray-700 hover:text-white'} ${!isSidebarOpen && 'justify-center translate-x-0 px-0'}`}
                            title={!isSidebarOpen ? "Relatórios" : ""}
                        >
                            <FileText className={`${isSidebarOpen ? 'mr-3' : ''} ${view === ViewState.REPORTS ? 'text-gdf-accent' : 'text-gray-400 group-hover:text-white'}`} size={20} />
                            {isSidebarOpen && <span className="whitespace-nowrap">Relatórios</span>}
                        </button>
                    )}

                    {isAdmin && (
                        <button 
                            onClick={() => setView(ViewState.RULES)}
                            className={`flex items-center w-full px-4 py-3 rounded-lg transition-all duration-200 group ${view === ViewState.RULES ? 'bg-gray-700 text-gdf-accent shadow-lg translate-x-1' : 'hover:bg-gray-700 hover:text-white'} ${!isSidebarOpen && 'justify-center translate-x-0 px-0'}`}
                            title={!isSidebarOpen ? "Regras & Portarias" : ""}
                        >
                            <BookOpen className={`${isSidebarOpen ? 'mr-3' : ''} ${view === ViewState.RULES ? 'text-gdf-accent' : 'text-gray-400 group-hover:text-white'}`} size={20} />
                            {isSidebarOpen && <span className="whitespace-nowrap">Regras & Portarias</span>}
                        </button>
                    )}

                    <div className={`pt-4 mt-4 border-t border-gray-700 ${!isSidebarOpen && 'mx-2'}`}>
                        {canEdit && (
                            <button 
                                onClick={() => setView(ViewState.DOSSIER)}
                                className={`flex items-center w-full px-4 py-3 rounded-lg transition-all duration-200 group ${view === ViewState.DOSSIER ? 'bg-gray-700 text-gdf-accent shadow-lg translate-x-1' : 'hover:bg-gray-700 hover:text-white'} ${!isSidebarOpen && 'justify-center translate-x-0 px-0'}`}
                                title={!isSidebarOpen ? "Dossiê do Servidor" : ""}
                            >
                                <FileDigit className={`${isSidebarOpen ? 'mr-3' : ''} ${view === ViewState.DOSSIER ? 'text-gdf-accent' : 'text-gray-400 group-hover:text-white'}`} size={20} />
                                {isSidebarOpen && <span className="whitespace-nowrap">Dossiê do Servidor</span>}
                            </button>
                        )}
                        {isAdmin && (
                            <button 
                                onClick={() => setView(ViewState.ACCESS_MANAGEMENT)}
                                className={`flex items-center w-full px-4 py-3 rounded-lg transition-all duration-200 group ${view === ViewState.ACCESS_MANAGEMENT ? 'bg-gray-700 text-gdf-accent shadow-lg translate-x-1' : 'hover:bg-gray-700 hover:text-white'} ${!isSidebarOpen && 'justify-center translate-x-0 px-0'}`}
                                title={!isSidebarOpen ? "Gestão de Acessos" : ""}
                            >
                                <ShieldCheck className={`${isSidebarOpen ? 'mr-3' : ''} ${view === ViewState.ACCESS_MANAGEMENT ? 'text-gdf-accent' : 'text-gray-400 group-hover:text-white'}`} size={20} />
                                {isSidebarOpen && <span className="whitespace-nowrap">Gestão de Acessos</span>}
                            </button>
                        )}
                        {isAdmin && (
                            <button 
                                onClick={() => setView(ViewState.SETTINGS)}
                                className={`flex items-center w-full px-4 py-3 rounded-lg transition-all duration-200 group ${view === ViewState.SETTINGS ? 'bg-gray-700 text-gdf-accent shadow-lg translate-x-1' : 'hover:bg-gray-700 hover:text-white'} ${!isSidebarOpen && 'justify-center translate-x-0 px-0'}`}
                                title={!isSidebarOpen ? "Configurações" : ""}
                            >
                                <SettingsIcon className={`${isSidebarOpen ? 'mr-3' : ''} ${view === ViewState.SETTINGS ? 'text-gdf-accent' : 'text-gray-400 group-hover:text-white'}`} size={20} />
                                {isSidebarOpen && <span className="whitespace-nowrap">Configurações</span>}
                            </button>
                        )}
                    </div>
                </nav>

                <div className="p-4 border-t border-gray-700 text-xs text-gray-400 text-center">
                    {isSidebarOpen ? (
                        <>
                            <p className="font-semibold whitespace-nowrap">SES-DF / GDF</p>
                            <p className="opacity-75">v1.3.0</p>
                        </>
                    ) : (
                        <p className="font-semibold" title="SES-DF / GDF v1.3.0">v1.3</p>
                    )}
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
                <header className="bg-white shadow-sm h-16 flex items-center justify-between px-6 md:px-8 z-10 flex-shrink-0">
                    <div className="flex items-center">
                        <button 
                            className="text-gray-600 hover:text-gdf-primary transition-colors p-2 rounded-lg hover:bg-gray-100"
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        >
                            <Menu size={24} />
                        </button>
                    </div>
                    <div className="flex-1 flex justify-end items-center gap-4">
                        
                        <div className="hidden md:flex items-center gap-2 mr-4 bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                            {!userUnitAccess && (
                                <select 
                                    className="text-xs font-semibold bg-white border border-gray-300 rounded px-2 py-1 text-gray-700 outline-none focus:ring-1 focus:ring-gdf-primary"
                                    value={globalUnitFilter}
                                    onChange={(e) => setGlobalUnitFilter(e.target.value)}
                                >
                                    <option value="Todos">Todos os Núcleos</option>
                                    {settings?.units?.map((u: any) => <option key={u.id} value={u.name}>{u.name}</option>)}
                                </select>
                            )}
                            <select 
                                className="text-xs font-semibold bg-white border border-gray-300 rounded px-2 py-1 text-gray-700 outline-none focus:ring-1 focus:ring-gdf-primary"
                                value={globalSectorFilter}
                                onChange={(e) => setGlobalSectorFilter(e.target.value)}
                            >
                                <option value="Todos">Todos os Setores{effectiveUnitFilter !== 'Todos' ? ` do Núcleo` : ''}</option>
                                {settings?.units?.find((u: any) => u.name.trim() === effectiveUnitFilter.trim())?.sectors?.map((s: string) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>

                        <div className="text-right flex flex-col justify-center">
                            <p className="text-sm font-bold text-gray-900 leading-tight">{user?.displayName || 'Gestor de Setor'}</p>
                            <p className="text-[10px] text-gray-500 font-medium">Núcleo: {userUnitAccess || 'Acesso Restrito'}</p>
                        </div>
                        <div 
                            className="h-10 w-10 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center cursor-pointer hover:bg-gray-200 transition"
                            onClick={() => setView(ViewState.SETTINGS)}
                        >
                            <SettingsIcon size={20} className="text-gray-600" />
                        </div>
                        <button 
                            onClick={handleLogout}
                            className="text-sm text-red-600 hover:text-red-800 font-semibold ml-2"
                        >
                            Sair
                        </button>
                    </div>
                </header>

                <main className="flex-1 overflow-hidden p-4 md:p-6 lg:p-8 relative">
                    {renderContent()}
                </main>
            </div>

            <ConfirmModal 
                isOpen={!!employeeToDelete}
                title="Excluir Servidor"
                message="Tem certeza que deseja excluir este servidor? Esta ação não pode ser desfeita."
                onConfirm={confirmDeleteEmployee}
                onCancel={() => setEmployeeToDelete(null)}
            />
        </div>
    );
};

export default App;