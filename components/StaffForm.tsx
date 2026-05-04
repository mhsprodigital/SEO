import React, { useState, useEffect } from 'react';
import { Employee, EmployeePreferences, UnitStructure } from '../types';
import { AVATAR_COLORS } from '../constants';
import { subscribeToSettings } from '../services/storageService';
import { Save, UserPlus, X, Briefcase, Clock, FileText, ShieldAlert, Moon, MapPin } from 'lucide-react';

interface StaffFormProps {
    onSave: (employee: Employee) => Promise<void> | void;
    onCancel: () => void;
    initialData?: Employee | null;
    professionalCategories: Record<string, string>;
    units?: UnitStructure[];
    restrictedUnit?: string | null;
}

const StaffForm: React.FC<StaffFormProps> = ({ onSave, onCancel, initialData, professionalCategories, units: propUnits, restrictedUnit }) => {
    const [units, setUnits] = useState<UnitStructure[]>(propUnits || []);
    const [availableHours, setAvailableHours] = useState<number[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [formId] = useState<string>(initialData?.id || crypto.randomUUID());
    
    useEffect(() => {
        const unsub = subscribeToSettings((data) => {
            setUnits(data.units);
            setAvailableHours(data.hours);
        });
        return () => unsub();
    }, []);

    // Initial Preferences State
    const defaultPreferences: EmployeePreferences = {
        reducaoCarga: 0,
        periodoPreferencial: 'INDIFERENTE',
        prefersWeekends: false,
        tipoAtuacao: 'TOTAL'
    };

    const [formData, setFormData] = useState<Partial<Employee>>(initialData || {
        contractHours: 40,
        unit: restrictedUnit || '',
        sector: '',
        employmentType: 'Efetivo',
        preferences: defaultPreferences
    });

    useEffect(() => {
        // Se ainda não temos a lista de unidades carregada ou não há unidade selecionada, não fazemos nada
        if (!formData.unit || units.length === 0) return;

        const currentUnit = units.find(u => u.name.trim().toLowerCase() === formData.unit?.trim().toLowerCase());
        
        if (currentUnit && currentUnit.sectors) {
            // Só alteramos o setor automaticamente se:
            // 1. O servidor NÃO for uma edição (novo cadastro)
            // 2. OU se o setor atual for inválido para a unidade selecionada
            const isSectorValid = formData.sector && currentUnit.sectors.some(s => s.trim().toLowerCase() === formData.sector!.trim().toLowerCase());
            
            if (!isSectorValid) {
                setFormData(prev => ({ 
                    ...prev, 
                    unit: currentUnit.name, // Correção de possível divergência de formatação no nome do núcleo
                    sector: currentUnit.sectors[0] || '' 
                }));
            } else if (formData.unit !== currentUnit.name) {
                // Sincroniza o nome exato se o match for apenas case/trim
                 setFormData(prev => ({ 
                    ...prev, 
                    unit: currentUnit.name
                }));
            }
        }
    }, [formData.unit, units]);

    const [prefs, setPrefs] = useState<EmployeePreferences>(initialData?.preferences || defaultPreferences);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        
        if (type === 'checkbox') {
             const checked = (e.target as HTMLInputElement).checked;
             setFormData(prev => ({ ...prev, [name]: checked }));
             return;
        }

        if (name === 'contact') {
            // Simple (ddd) xxxxx-xxxx mask
            const cleaned = value.replace(/\D/g, '');
            let masked = cleaned;
            if (cleaned.length > 0) {
                masked = '(' + cleaned.substring(0, 2);
                if (cleaned.length > 2) {
                    masked += ') ' + cleaned.substring(2, 7);
                    if (cleaned.length > 7) {
                        masked += '-' + cleaned.substring(7, 11);
                    }
                }
            }
            setFormData(prev => ({ ...prev, [name]: masked }));
        } else if (name === 'name') {
             setFormData(prev => ({ ...prev, [name]: value.toUpperCase() }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handlePrefChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
        setPrefs(prev => ({ ...prev, [name]: val }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSaving) return;
        setIsSaving(true);
        
        try {
            const randomColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
            
            const newEmployee: Employee = {
                id: formId,
                name: formData.name || '',
                matricula: formData.matricula || '',
                coren: formData.coren || '',
                role: formData.role || 'Enfermeiro(a)',
                contractHours: Number(formData.contractHours),
                unit: formData.unit || '',
                sector: formData.sector || '', 
                workstation: formData.workstation || '',
                cnes: formData.cnes || '',
                contact: formData.contact || '',
                restrictions: formData.restrictions || '',
                colorIdentifier: initialData?.colorIdentifier || randomColor,
                preferences: {
                    ...prefs,
                    reducaoCarga: Number(prefs.reducaoCarga)
                },
                employmentType: formData.employmentType as 'Efetivo' | 'Temporário',
                contractExpiry: formData.employmentType === 'Temporário' ? (formData.contractExpiry || null) : null,
                isTpdOnly: !!formData.isTpdOnly
            };
            await Promise.resolve(onSave(newEmployee));
        } catch (error) {
            console.error('Failed to save employee:', error);
            alert('Falha ao salvar. Verifique sua conexão e limites do banco.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100 max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-8 border-b border-gray-100 pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <div className="bg-blue-100 p-2 rounded-lg text-gdf-primary">
                            <UserPlus size={24} />
                        </div>
                        {initialData ? 'Editar Servidor' : 'Novo Servidor'}
                    </h2>
                    <p className="text-gray-500 text-sm mt-1 ml-12">Preencha os dados conforme ficha funcional</p>
                </div>
                <button onClick={onCancel} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-all">
                    <X size={24} />
                </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
                {/* Personal Info Section */}
                <section>
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4 flex items-center gap-2">
                        <FileText size={16} className="text-gdf-secondary"/> Dados Pessoais
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Nome Completo</label>
                            <input
                                required
                                type="text"
                                name="name"
                                value={formData.name || ''}
                                onChange={handleChange}
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gdf-primary focus:border-transparent transition-all shadow-sm"
                                placeholder="Ex: João da Silva"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Matrícula</label>
                            <input
                                required
                                type="text"
                                name="matricula"
                                value={formData.matricula || ''}
                                onChange={handleChange}
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gdf-primary focus:border-transparent transition-all shadow-sm"
                                placeholder="Ex: 123.456-7"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Registro Profissional (COREN/CRM)</label>
                            <input
                                type="text"
                                name="coren"
                                value={formData.coren || ''}
                                onChange={handleChange}
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gdf-primary focus:border-transparent transition-all shadow-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">CNES</label>
                            <input
                                required
                                type="text"
                                name="cnes"
                                value={formData.cnes || ''}
                                onChange={handleChange}
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gdf-primary focus:border-transparent transition-all shadow-sm"
                                placeholder="Ex: 1234567"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Contato</label>
                            <input
                                required
                                type="text"
                                name="contact"
                                value={formData.contact || ''}
                                onChange={handleChange}
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gdf-primary focus:border-transparent transition-all shadow-sm"
                                placeholder="(61) 98888-7777"
                            />
                        </div>
                    </div>
                </section>

                {/* Professional Info Section */}
                <section>
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4 flex items-center gap-2">
                         <Briefcase size={16} className="text-gdf-secondary"/> Dados Funcionais
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Cargo/Função</label>
                            <select
                                name="role"
                                value={formData.role}
                                onChange={handleChange}
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gdf-primary focus:border-transparent transition-all shadow-sm cursor-pointer"
                            >
                                <option value="" disabled>Selecione um cargo...</option>
                                {Object.keys(professionalCategories).map((cat) => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                                <Clock size={14} className="text-gray-400"/> Carga Horária Contratual
                            </label>
                            <select
                                name="contractHours"
                                value={formData.contractHours}
                                onChange={handleChange}
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gdf-primary focus:border-transparent transition-all shadow-sm cursor-pointer"
                            >
                                {availableHours.map(hours => (
                                    <option key={hours} value={hours}>{hours} Horas Semanais</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Vínculo Empregatício</label>
                            <select
                                name="employmentType"
                                value={formData.employmentType}
                                onChange={handleChange}
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gdf-primary focus:border-transparent transition-all shadow-sm cursor-pointer"
                            >
                                <option value="Efetivo">Efetivo</option>
                                <option value="Temporário">Temporário (Contrato)</option>
                            </select>
                        </div>
                        
                        <div className="col-span-1 md:col-span-2">
                            <label className="flex items-start gap-3 p-3 bg-blue-50/50 border border-blue-100 rounded-lg cursor-pointer hover:bg-blue-50 transition">
                                <div className="flex-shrink-0 mt-0.5">
                                    <input 
                                        type="checkbox" 
                                        name="isTpdOnly"
                                        checked={!!formData.isTpdOnly}
                                        onChange={handleChange}
                                        className="h-5 w-5 text-gdf-primary border-gray-300 rounded focus:ring-gdf-primary"
                                    />
                                </div>
                                <div className="flex-1">
                                    <span className="block text-sm font-semibold text-gray-800">Servidor atuará apenas como TPD (Hora Extra)</span>
                                    <span className="block text-xs text-gray-500 mt-1">
                                        Servidor lotado em outra unidade que fará apenas TPD neste setor. Ele não contabilizará horas faltantes e será isento da verificação de carga horária contratual na escala.
                                    </span>
                                </div>
                            </label>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Núcleo (Unidade)</label>
                            <select
                                name="unit"
                                value={formData.unit || ''}
                                onChange={handleChange}
                                disabled={!!restrictedUnit}
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gdf-primary focus:border-transparent transition-all shadow-sm cursor-pointer disabled:bg-gray-100 disabled:text-gray-500"
                            >
                                <option value="" disabled>Selecione um núcleo...</option>
                                {units.map((u) => (
                                    <option key={u.id} value={u.name}>{u.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Setor</label>
                            <select
                                name="sector"
                                value={formData.sector || ''}
                                onChange={handleChange}
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gdf-primary focus:border-transparent transition-all shadow-sm cursor-pointer"
                            >
                                <option value="" disabled>Selecione um setor...</option>
                                {units.find(u => u.name.trim().toLowerCase() === (formData.unit || '').trim().toLowerCase())?.sectors?.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Subunidade / Lotação</label>
                            <select
                                name="workstation"
                                value={formData.workstation || ''}
                                onChange={handleChange}
                                disabled={!formData.sector || !(units.find(u => u.name.trim().toLowerCase() === (formData.unit || '').trim().toLowerCase())?.sectorSubunits?.[formData.sector]) || units.find(u => u.name.trim().toLowerCase() === (formData.unit || '').trim().toLowerCase())?.sectorSubunits?.[formData.sector]?.length === 0}
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gdf-primary focus:border-transparent transition-all shadow-sm cursor-pointer disabled:bg-gray-100 disabled:text-gray-500"
                            >
                                <option value="">Geral do Setor</option>
                                {(units.find(u => u.name.trim().toLowerCase() === (formData.unit || '').trim().toLowerCase())?.sectorSubunits?.[formData.sector || ''] || []).map((su) => (
                                    <option key={su} value={su}>{su}</option>
                                ))}
                            </select>
                        </div>

                        {formData.employmentType === 'Temporário' && (
                            <div className="animate-in fade-in slide-in-from-top-1">
                                <label className="block text-sm font-semibold text-gray-700 mb-2 text-gdf-warning">Validade do Contrato</label>
                                <input
                                    required
                                    type="date"
                                    name="contractExpiry"
                                    value={formData.contractExpiry || ''}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2.5 bg-white border-2 border-orange-100 rounded-lg text-gray-900 focus:ring-2 focus:ring-gdf-primary focus:border-transparent transition-all shadow-sm"
                                />
                            </div>
                        )}
                    </div>
                </section>

                {/* Advanced Preferences Section */}
                <section className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4 flex items-center gap-2">
                        <ShieldAlert size={16} className="text-gdf-warning"/> Restrições & Preferências (Módulo Inteligente)
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        
                        {/* Redução de Carga */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Redução de Carga (Horas)
                                <span className="block text-xs text-gray-400 font-normal">Ex: Laudo médico, estudante.</span>
                            </label>
                            <input
                                type="number"
                                name="reducaoCarga"
                                value={prefs.reducaoCarga}
                                onChange={handlePrefChange}
                                min={0}
                                max={40}
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gdf-primary focus:border-transparent transition-all shadow-sm"
                            />
                        </div>

                        {/* Tipo de Atuação */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Tipo de Atuação
                            </label>
                            <select
                                name="tipoAtuacao"
                                value={prefs.tipoAtuacao}
                                onChange={handlePrefChange}
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gdf-primary focus:border-transparent transition-all shadow-sm"
                            >
                                <option value="TOTAL">Atuação Plena (Sem Restrições)</option>
                                <option value="ADMINISTRATIVO">Apenas Administrativo</option>
                                <option value="RESTRICAO_ASSISTENCIA">Restrição de Assistência (Súmula 02/2023)</option>
                            </select>
                        </div>

                        {/* Período Preferencial */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                                <Moon size={14} /> Preferência de Turno
                            </label>
                            <select
                                name="periodoPreferencial"
                                value={prefs.periodoPreferencial}
                                onChange={handlePrefChange}
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gdf-primary focus:border-transparent transition-all shadow-sm"
                            >
                                <option value="INDIFERENTE">Indiferente</option>
                                <option value="DIURNO">Apenas Diurno (Mat/Vesp)</option>
                                <option value="NOTURNO">Preferência Noturno</option>
                            </select>
                        </div>

                        {/* Preferência FDS (Outro Estado) */}
                        <div className="flex items-center pt-6">
                            <label className="flex items-center space-x-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="prefersWeekends"
                                    checked={prefs.prefersWeekends}
                                    onChange={handlePrefChange}
                                    className="h-5 w-5 text-gdf-primary border-gray-300 rounded focus:ring-gdf-primary"
                                />
                                <div className="text-sm">
                                    <span className="font-semibold text-gray-700 flex items-center gap-1">
                                        <MapPin size={14}/> Preferência por Finais de Semana
                                    </span>
                                    <span className="block text-gray-500 text-xs">Para servidores que residem em outros estados (Prioridade no FDS)</span>
                                </div>
                            </label>
                        </div>

                    </div>
                </section>

                <div className="col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Observações Gerais</label>
                    <textarea
                        name="restrictions"
                        value={formData.restrictions || ''}
                        onChange={handleChange}
                        rows={2}
                        className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gdf-primary focus:border-transparent transition-all shadow-sm resize-none"
                    />
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isSaving}
                        className="px-6 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium shadow-sm disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="px-6 py-2.5 bg-gdf-primary text-white rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-md font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Save size={18} />
                        {isSaving ? 'Salvando...' : 'Salvar Servidor'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default StaffForm;