import React, { useState, useEffect } from 'react';
import { UnitStructure, ShiftAssignment, Employee, ShiftDefinition, Vehicle, Sector } from '../types';
import { subscribeToSettings, saveSettings, getEmployees, getAssignments, subscribeToVehicles, subscribeToSectors, saveVehicle, deleteVehicle, saveSector, deleteSector, saveEmployee } from '../services/storageService';
import { Plus, Trash2, Layers, Briefcase, Clock, Download, Calendar, Truck, MapPin, Lock, Unlock, X } from 'lucide-react';

interface SettingsData {
    rulesTitle: string;
    rulesDesc: string;
    glossary: Record<string, string>;
    shiftDefs: Record<string, ShiftDefinition>;
    units: UnitStructure[];
    hours: number[];
}

interface SettingsProps {
    canEdit: boolean;
    professionalCategories: Record<string, string>;
    setProfessionalCategories: (newCats: Record<string, string>) => void;
    employees: Employee[];
}

const Settings: React.FC<SettingsProps> = ({ canEdit, professionalCategories, setProfessionalCategories, employees }) => {
    const [settings, setSettings] = useState<SettingsData | null>(null);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [sectors, setSectors] = useState<Sector[]>([]);
    
    // Category Management
    const [newCatName, setNewCatName] = useState('');
    const [reassignMap, setReassignMap] = useState<Record<string, string>>({});
    const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);
    
    // New Vehicle State
    const [newVehicleCode, setNewVehicleCode] = useState('');
    const [newVehicleName, setNewVehicleName] = useState('');
    const [newVehiclePlate, setNewVehiclePlate] = useState('');
    
    // Unit (Nucleo) State
    const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
    const [selectedSectorName, setSelectedSectorName] = useState<string | null>(null);
    const [newUnitName, setNewUnitName] = useState('');
    const [newUnitSectorName, setNewUnitSectorName] = useState('');
    const [newWorkstationName, setNewWorkstationName] = useState('');
    
    const [newHour, setNewHour] = useState<string>('');
    
    // CSV Export State
    const [exportStartDate, setExportStartDate] = useState('');
    const [exportEndDate, setExportEndDate] = useState('');
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        const unsubSettings = subscribeToSettings((data: any) => {
            setSettings(data as SettingsData);
        });
        const unsubVehicles = subscribeToVehicles((data) => setVehicles(data || []));
        const unsubSectors = subscribeToSectors((data) => setSectors(data || []));
        
        return () => {
            unsubSettings();
            unsubVehicles();
            unsubSectors();
        };
    }, []);

    if (!settings) return <div className="p-8 text-center text-gray-500">Carregando configurações...</div>;

    // --- Vehicle Handlers ---
    const handleAddVehicle = async () => {
        if (!newVehicleCode.trim() || !newVehicleName.trim() || !newVehiclePlate.trim()) return;
        const newVehicle: Vehicle = {
            id: Date.now().toString(),
            code: newVehicleCode,
            name: newVehicleName,
            plate: newVehiclePlate,
            isBlocked: false
        };
        await saveVehicle(newVehicle);
        setNewVehicleCode('');
        setNewVehicleName('');
        setNewVehiclePlate('');
    };

    const handleToggleBlockVehicle = async (vehicle: Vehicle) => {
        await saveVehicle({ ...vehicle, isBlocked: !vehicle.isBlocked });
    };

    // --- Unit/Sector Handlers ---
    const handleAddUnit = async () => {
        if (!newUnitName.trim()) return;
        const newUnit: UnitStructure = {
            id: Date.now().toString(),
            name: newUnitName.trim(),
            sectors: []
        };
        const updatedUnits = [...(settings.units || []), newUnit];
        await saveSettings({ ...settings, units: updatedUnits });
        setNewUnitName('');
    };

    const handleDeleteUnit = async (unitId: string) => {
        if (!confirm('Deseja realmente remover este Núcleo? Isso afetará os servidores vinculados a ele.')) return;
        const updatedUnits = settings.units.filter(u => u.id !== unitId);
        await saveSettings({ ...settings, units: updatedUnits });
        if (selectedUnitId === unitId) setSelectedUnitId(null);
    };

    const handleAddUnitSector = async (unitId: string) => {
        if (!newUnitSectorName.trim()) return;
        const updatedUnits = settings.units.map(u => {
            if (u.id === unitId) {
                return { ...u, sectors: [...u.sectors, newUnitSectorName.trim()] };
            }
            return u;
        });
        await saveSettings({ ...settings, units: updatedUnits });
        setNewUnitSectorName('');
    };

    const handleDeleteUnitSector = async (unitId: string, sectorName: string) => {
        if (!confirm(`Deseja realmente remover o setor ${sectorName}?`)) return;
         const updatedUnits = settings.units.map(u => {
            if (u.id === unitId) {
                const subUnits = { ...(u.sectorSubunits || {}) };
                delete subUnits[sectorName];
                return { ...u, sectors: u.sectors.filter(s => s !== sectorName), sectorSubunits: subUnits };
            }
            return u;
        });
        await saveSettings({ ...settings, units: updatedUnits });
        if (selectedSectorName === sectorName) setSelectedSectorName(null);
    };

    const handleAddWorkstation = async (unitId: string, sectorName: string) => {
        if (!newWorkstationName.trim()) return;
        const updatedUnits = settings.units.map(u => {
            if (u.id === unitId) {
                const subUnits = { ...(u.sectorSubunits || {}) };
                const list = subUnits[sectorName] || [];
                subUnits[sectorName] = [...list, newWorkstationName.trim()];
                return { ...u, sectorSubunits: subUnits };
            }
            return u;
        });
        await saveSettings({ ...settings, units: updatedUnits });
        setNewWorkstationName('');
    };

    const handleDeleteWorkstation = async (unitId: string, sectorName: string, workstation: string) => {
        if (!confirm(`Deseja realmente remover a lotação ${workstation}?`)) return;
        const updatedUnits = settings.units.map(u => {
            if (u.id === unitId) {
                const subUnits = { ...(u.sectorSubunits || {}) };
                if (subUnits[sectorName]) {
                    subUnits[sectorName] = subUnits[sectorName].filter(w => w !== workstation);
                }
                return { ...u, sectorSubunits: subUnits };
            }
            return u;
        });
        await saveSettings({ ...settings, units: updatedUnits });
    };

    // --- Hours Handlers ---
    const handleAddHour = async () => {
        const hourVal = parseInt(newHour);
        if (isNaN(hourVal) || hourVal <= 0) return;
        if (settings.hours.includes(hourVal)) return;

        const updatedHours = [...settings.hours, hourVal].sort((a, b) => a - b);
        await saveSettings({ ...settings, hours: updatedHours });
        setNewHour('');
    };

    const handleDeleteHour = async (hour: number) => {
        const updatedHours = settings.hours.filter((h: number) => h !== hour);
        await saveSettings({ ...settings, hours: updatedHours });
    };

    const handleAddCategory = () => {
        if (!newCatName.trim()) return;
        setProfessionalCategories({ ...professionalCategories, [newCatName]: '#000000' });
        setNewCatName('');
    };

    const deleteCategoryNoEmployees = (cat: string) => {
        const newCats = { ...professionalCategories };
        delete newCats[cat];
        setProfessionalCategories(newCats);
    };

    const handleDeleteCategoryClick = (cat: string) => {
        const affectedEmployees = employees.filter(e => e.role === cat);
        if (affectedEmployees.length === 0) {
            deleteCategoryNoEmployees(cat);
        } else {
            setCategoryToDelete(cat);
        }
    };

    const confirmCategoryDeletion = () => {
        if (!categoryToDelete) return;
        
        // Finalize reassignment for all affected employees
        const affectedEmployees = employees.filter(e => e.role === categoryToDelete);
        affectedEmployees.forEach(emp => {
            if (reassignMap[emp.id]) {
                saveEmployee({...emp, role: reassignMap[emp.id]});
            }
        });
        
        const newCats = { ...professionalCategories };
        delete newCats[categoryToDelete];
        setProfessionalCategories(newCats);
        setCategoryToDelete(null);
        setReassignMap({});
    };

    const affectedEmployees = categoryToDelete ? employees.filter(e => e.role === categoryToDelete) : [];
    const canDeleteCategory = affectedEmployees.every(emp => !!reassignMap[emp.id]);
    const handleExportCSV = async () => {
        if (!exportStartDate || !exportEndDate) {
            alert('Por favor, selecione o período para exportação.');
            return;
        }

        setIsExporting(true);
        try {
            const employees = await getEmployees();
            const assignments = await getAssignments();

            const filteredAssignments = assignments.filter(a => {
                return a.date >= exportStartDate && a.date <= exportEndDate;
            });

            if (filteredAssignments.length === 0) {
                alert('Nenhuma escala encontrada para o período selecionado.');
                return;
            }

            // Generate CSV in Grid Format
            const dates: string[] = [];
            const formattedDates: string[] = [];
            let currentDate = new Date(exportStartDate + 'T12:00:00'); // Use noon to avoid TZ issues
            const endDate = new Date(exportEndDate + 'T12:00:00');
            
            while (currentDate <= endDate) {
                const isoDate = currentDate.toISOString().split('T')[0];
                dates.push(isoDate);
                const [y, m, d] = isoDate.split('-');
                formattedDates.push(`${d}/${m}/${y}`);
                currentDate.setDate(currentDate.getDate() + 1);
            }

            const headers = ['Nome', 'Matrícula', 'Cargo', 'CNES', 'Contato', 'Carga Horária', ...formattedDates, 'Total Horas'];
            
            const rows = employees.map(emp => {
                const empAssignments = filteredAssignments.filter(a => a.employeeId === emp.id);
                
                let totalHours = 0;
                const dateColumns = dates.map(dateStr => {
                    const assignment = empAssignments.find(a => a.date === dateStr);
                    if (assignment) {
                        totalHours += assignment.duration;
                        return assignment.shiftCode;
                    }
                    return '';
                });

                return [
                    emp.name || '',
                    emp.matricula || '',
                    emp.role || '',
                    emp.cnes || '',
                    emp.contact || '',
                    emp.contractHours || '',
                    ...dateColumns,
                    totalHours
                ].map(val => `"${val}"`).join(',');
            });

            const csvContent = [headers.join(','), ...rows].join('\n');
            const BOM = '\uFEFF';
            const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `escala_saude_${exportStartDate}_${exportEndDate}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Erro ao exportar CSV:', error);
            alert('Erro ao gerar o arquivo CSV.');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="border-b pb-4">
                <h2 className="text-2xl font-bold text-gray-800">Configurações do Sistema</h2>
                <p className="text-gray-500 text-sm mt-1">Gerencie os parâmetros da base de dados Firestore.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Column 1: Vehicles Management */}
                <div className="bg-white rounded-lg shadow border border-gray-200 p-6 h-full">
                     <h3 className="font-semibold text-gray-700 mb-6 flex items-center gap-2 text-lg border-b pb-2">
                        <Truck size={20} className="text-gdf-secondary"/> Viaturas
                    </h3>

                    <div>
                        {canEdit && (
                            <div className="flex flex-col gap-3 mb-6">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newVehicleCode}
                                        onChange={(e) => setNewVehicleCode(e.target.value)}
                                        placeholder="Código (ex: VTR-01)"
                                        className="w-1/3 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gdf-secondary focus:outline-none"
                                    />
                                    <input
                                        type="text"
                                        value={newVehicleName}
                                        onChange={(e) => setNewVehicleName(e.target.value)}
                                        placeholder="Nome (ex: USA 01)"
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gdf-secondary focus:outline-none"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newVehiclePlate}
                                        onChange={(e) => setNewVehiclePlate(e.target.value)}
                                        placeholder="Placa (ex: ABC-1234)"
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gdf-secondary focus:outline-none"
                                    />
                                    <button 
                                        onClick={handleAddVehicle}
                                        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2 font-medium shadow-sm transition-colors"
                                    >
                                        <Plus size={18} />
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-1">
                            {vehicles.map((vehicle) => (
                                <div key={vehicle.id} className={`flex justify-between items-center p-3 rounded-lg border transition-colors ${vehicle.isBlocked ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200 hover:border-gray-300'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`p-1.5 rounded border ${vehicle.isBlocked ? 'bg-red-100 border-red-200 text-red-500' : 'bg-white border-gray-200 text-gray-500'}`}>
                                            <Truck size={14}/>
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-gray-700">
                                                {vehicle.code} - {vehicle.name}
                                                {vehicle.isBlocked && <span className="ml-2 text-xs text-red-600 font-bold">(Bloqueada)</span>}
                                            </div>
                                            <div className="text-xs text-gray-500">{vehicle.plate}</div>
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        {canEdit && (
                                            <button 
                                                onClick={() => handleToggleBlockVehicle(vehicle)}
                                                className={`p-1.5 rounded-full transition-colors ${vehicle.isBlocked ? 'text-green-600 hover:bg-green-100' : 'text-orange-500 hover:bg-orange-100'}`}
                                                title={vehicle.isBlocked ? "Desbloquear Viatura" : "Bloquear Viatura"}
                                            >
                                                {vehicle.isBlocked ? <Unlock size={16} /> : <Lock size={16} />}
                                            </button>
                                        )}
                                        {canEdit && (
                                            <button 
                                                onClick={() => deleteVehicle(vehicle.id)}
                                                className="text-gray-400 hover:text-red-500 p-1.5 rounded-full hover:bg-red-50 transition-colors"
                                                title="Remover Viatura"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {vehicles.length === 0 && (
                                <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                                    <Truck size={32} className="mx-auto text-gray-300 mb-2"/>
                                    <p className="text-sm text-gray-500">Nenhuma viatura cadastrada.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Column 2: Units Management */}
                <div className="bg-white rounded-lg shadow border border-gray-200 p-6 h-full flex flex-col">
                     <h3 className="font-semibold text-gray-700 mb-6 flex items-center gap-2 text-lg border-b pb-2">
                        <MapPin size={20} className="text-gdf-secondary"/> Núcleos e Setores
                    </h3>

                    <div className="flex-1 flex flex-col min-h-0">
                        {canEdit && (
                             <div className="flex gap-3 mb-4">
                                <input
                                    type="text"
                                    value={newUnitName}
                                    onChange={(e) => setNewUnitName(e.target.value)}
                                    placeholder="Nome do Novo Núcleo..."
                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gdf-secondary focus:outline-none"
                                />
                                <button 
                                    onClick={handleAddUnit}
                                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2 font-medium shadow-sm transition-colors"
                                >
                                    <Plus size={18} />
                                </button>
                            </div>
                        )}

                        <div className="flex gap-4 flex-1 min-h-[300px] overflow-hidden">
                            {/* Lista de Núcleos */}
                            <div className="w-1/3 flex flex-col bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                                <div className="bg-gray-100 px-3 py-2 text-xs font-bold text-gray-500 uppercase border-b border-gray-200">
                                    Núcleos
                                </div>
                                <div className="overflow-y-auto flex-1 p-2 space-y-1">
                                    {settings.units?.map(unit => (
                                        <div 
                                            key={unit.id} 
                                            onClick={() => { setSelectedUnitId(unit.id); setSelectedSectorName(null); }}
                                            className={`p-2 rounded flex justify-between items-center cursor-pointer transition-colors ${
                                                selectedUnitId === unit.id ? 'bg-blue-100 text-blue-800 font-bold border-blue-200' : 'bg-white border-transparent hover:border-gray-200 text-gray-600'
                                            } border`}
                                        >
                                            <span className="text-sm truncate mr-2">{unit.name}</span>
                                            {canEdit && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteUnit(unit.id); }}
                                                    className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded transition-colors"
                                                >
                                                    <Trash2 size={14}/>
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    {(!settings.units || settings.units.length === 0) && (
                                        <div className="text-center py-4 text-xs text-gray-400 italic">Nenhum núcleo.</div>
                                    )}
                                </div>
                            </div>

                            {/* Lista de Setores */}
                            <div className="w-1/3 flex flex-col bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                                <div className="bg-gray-100 px-3 py-2 text-xs font-bold text-gray-500 uppercase border-b border-gray-200">
                                    Setores vinculados
                                </div>
                                <div className="flex flex-col flex-1 p-2">
                                    {selectedUnitId ? (
                                        <>
                                            {canEdit && (
                                                <div className="flex gap-2 mb-2">
                                                    <input
                                                        type="text"
                                                        value={newUnitSectorName}
                                                        onChange={(e) => setNewUnitSectorName(e.target.value)}
                                                        placeholder="Novo setor..."
                                                        className="flex-1 min-w-0 w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-gdf-primary outline-none"
                                                    />
                                                    <button onClick={() => handleAddUnitSector(selectedUnitId)} className="shrink-0 bg-green-600 text-white px-2 rounded hover:bg-green-700">
                                                        <Plus size={16}/>
                                                    </button>
                                                </div>
                                            )}
                                            <div className="overflow-y-auto flex-1 space-y-1">
                                                {settings.units?.find(u => u.id === selectedUnitId)?.sectors.map(sector => (
                                                    <div 
                                                        key={sector} 
                                                        onClick={() => setSelectedSectorName(sector)}
                                                        className={`border rounded p-2 flex justify-between items-center text-sm cursor-pointer transition-colors ${
                                                            selectedSectorName === sector ? 'bg-blue-100 text-blue-800 font-bold border-blue-200' : 'bg-white text-gray-600 hover:border-gray-200'
                                                        }`}
                                                    >
                                                        <span className="truncate">{sector}</span>
                                                        {canEdit && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleDeleteUnitSector(selectedUnitId, sector); }}
                                                                className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded transition-colors"
                                                            >
                                                                <X size={14}/>
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                                {settings.units?.find(u => u.id === selectedUnitId)?.sectors.length === 0 && (
                                                    <div className="text-center py-4 text-xs text-gray-400 italic">Nenhum setor adicionado.</div>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex flex-1 items-center justify-center text-center px-4 text-xs text-gray-400 italic">
                                            Selecione um núcleo para ver e gerenciar os setores.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Lista de Unidades/Viaturas do Setor Selecionado */}
                            <div className="w-1/3 flex flex-col bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                                <div className="bg-gray-100 px-3 py-2 text-xs font-bold text-gray-500 uppercase border-b border-gray-200">
                                    Subunidades / VTR (Lotação)
                                </div>
                                <div className="flex flex-col flex-1 p-2">
                                    {selectedUnitId && selectedSectorName ? (
                                        <>
                                            {canEdit && (
                                                <div className="flex gap-2 mb-2">
                                                    <input
                                                        type="text"
                                                        value={newWorkstationName}
                                                        onChange={(e) => setNewWorkstationName(e.target.value)}
                                                        placeholder="Nova lotação..."
                                                        className="flex-1 min-w-0 w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-gdf-primary outline-none"
                                                    />
                                                    <button onClick={() => handleAddWorkstation(selectedUnitId, selectedSectorName)} className="shrink-0 bg-green-600 text-white px-2 rounded hover:bg-green-700">
                                                        <Plus size={16}/>
                                                    </button>
                                                </div>
                                            )}
                                            <div className="overflow-y-auto flex-1 space-y-1">
                                                {(settings.units?.find(u => u.id === selectedUnitId)?.sectorSubunits?.[selectedSectorName] || []).map(workstation => (
                                                    <div key={workstation} className="bg-white border rounded p-2 flex justify-between items-center text-sm text-gray-600">
                                                        <span className="truncate">{workstation}</span>
                                                        {canEdit && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleDeleteWorkstation(selectedUnitId, selectedSectorName, workstation); }}
                                                                className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded transition-colors"
                                                            >
                                                                <X size={14}/>
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                                {(settings.units?.find(u => u.id === selectedUnitId)?.sectorSubunits?.[selectedSectorName] || []).length === 0 && (
                                                    <div className="text-center py-4 text-xs text-gray-400 italic">Nenhuma subunidade.</div>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex flex-1 items-center justify-center text-center px-4 text-xs text-gray-400 italic">
                                            Selecione um setor para gerenciar suas lotações/viaturas.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {/* Column 3: Contract Hours Management */}
                <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                    <h3 className="font-semibold text-gray-700 mb-6 flex items-center gap-2 text-lg border-b pb-2">
                        <Clock size={20} className="text-gdf-secondary"/> Cargas Horárias Permitidas
                    </h3>

                    {canEdit && (
                        <div className="flex gap-3 mb-6">
                            <input
                                type="number"
                                value={newHour}
                                onChange={(e) => setNewHour(e.target.value)}
                                placeholder="Ex: 12, 24, 44..."
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gdf-secondary focus:outline-none"
                            />
                            <button 
                                onClick={handleAddHour}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium shadow-sm transition-colors"
                            >
                                <Plus size={18} />
                            </button>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                        {settings.hours.map((hour: number) => (
                            <div key={hour} className="flex justify-between items-center p-3 bg-blue-50 rounded-lg border border-blue-100">
                                <span className="text-sm font-bold text-blue-800">{hour} Horas</span>
                                {canEdit && (
                                    <button 
                                        onClick={() => handleDeleteHour(hour)}
                                        className="text-blue-300 hover:text-red-500 p-1 rounded-full hover:bg-red-50 transition-colors"
                                        title="Remover Carga Horária"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-700 mb-6 flex items-center gap-2 text-lg border-b pb-2">
                    <Briefcase size={20} className="text-gdf-secondary"/> Categorias Profissionais
                </h3>
                {canEdit && (
                     <div className="flex gap-3 mb-6">
                        <input
                            type="text"
                            value={newCatName}
                            onChange={(e) => setNewCatName(e.target.value)}
                            placeholder="Nova Categoria..."
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gdf-secondary focus:outline-none"
                        />
                        <button 
                            onClick={handleAddCategory}
                            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2 font-medium shadow-sm transition-colors"
                        >
                            <Plus size={18} />
                        </button>
                    </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Object.entries(professionalCategories).map(([cat, color]) => (
                        <div key={cat} className="flex items-center gap-2 border p-3 rounded-lg bg-gray-50">
                            <input type="color" value={color} onChange={(e) => setProfessionalCategories({...professionalCategories, [cat]: e.target.value})} className="w-8 h-8 rounded" />
                            <span className="text-sm font-semibold flex-grow">{cat}</span>
                            {canEdit && (
                                <button onClick={() => handleDeleteCategoryClick(cat)} className="text-gray-400 hover:text-red-500">
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Reassignment Modal */}
            {categoryToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
                        <h3 className="font-bold text-lg mb-4 text-red-600">Realocação de Profissionais: {categoryToDelete}</h3>
                        <p className="text-sm text-gray-600 mb-4">Esta categoria está em uso. Por favor, realloque cada profissional abaixo para uma das categorias existentes:</p>
                        <div className="space-y-3 max-h-[300px] overflow-y-auto mb-6">
                            {affectedEmployees.map(emp => (
                                <div key={emp.id} className="flex justify-between items-center bg-gray-50 p-2 rounded">
                                    <span className="text-sm font-medium">{emp.name}</span>
                                    <select 
                                        className="text-sm border rounded p-1"
                                        value={reassignMap[emp.id] || ''}
                                        onChange={(e) => setReassignMap({...reassignMap, [emp.id]: e.target.value})}
                                    >
                                        <option value="">Selecione nova categoria</option>
                                        {Object.keys(professionalCategories).filter(c => c !== categoryToDelete).map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => { setCategoryToDelete(null); setReassignMap({}); }} className="px-4 py-2 border rounded-lg">Cancelar</button>
                            <button 
                                disabled={!canDeleteCategory}
                                onClick={confirmCategoryDeletion} 
                                className="px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50"
                            >
                                Excluir e Realocar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CSV Export Section */}
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6 mt-8">
                <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2 text-lg border-b pb-2">
                    <Download size={20} className="text-gdf-primary"/> Exportar Base de Dados (CSV)
                </h3>
                <p className="text-sm text-gray-600 mb-6">
                    Selecione o período desejado para baixar as escalas e dados dos servidores em formato CSV.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data Inicial</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                type="date"
                                value={exportStartDate}
                                onChange={(e) => setExportStartDate(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gdf-primary focus:outline-none"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data Final</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                type="date"
                                value={exportEndDate}
                                onChange={(e) => setExportEndDate(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gdf-primary focus:outline-none"
                            />
                        </div>
                    </div>
                    <button 
                        onClick={handleExportCSV}
                        disabled={isExporting}
                        className="bg-gdf-primary text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
                    >
                        {isExporting ? 'Processando...' : <><Download size={18} /> Baixar CSV</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Settings;