import { Building2, Pencil, Plus, Save, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { Branch, InventoryColorOption, InventoryConfig, InventoryFieldDefinition } from 'p2p-mesh-core';
import { dbSync } from 'p2p-mesh-core';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { useUI } from '../context/UIContext';
import {
  createInventoryField,
  DEFAULT_INVENTORY_CONFIG,
  normalizeInventoryConfig,
  normalizeInventoryFieldKey,
} from '../lib/inventoryConfig';
import { generateId } from '../utils/id';
import CollapsibleCard from './CollapsibleCard';

const BranchConfig: React.FC = () => {
  const { t } = useI18n();
  const { state, dispatch } = useAppContext();
  const { showNotification } = useUI();
  const { user } = useAuth();

  const [inventoryConfigDraft, setInventoryConfigDraft] = useState<InventoryConfig>(
    normalizeInventoryConfig(state.inventoryConfig || DEFAULT_INVENTORY_CONFIG),
  );
  const [inventoryConfigErrors, setInventoryConfigErrors] = useState<string[]>([]);

  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchType, setBranchType] = useState<'sucursal' | 'bodega'>('sucursal');

  const team = useMemo(
    () => [{ id: 'owner', email: user?.email ?? 'owner@example.com', role: 'owner' as const }, ...state.teamMembers],
    [user?.email, state.teamMembers],
  );

  const isAdmin = state.role === 'admin' || team.find((m) => m.email === user?.email)?.role === 'owner';

  useEffect(() => {
    setInventoryConfigDraft(normalizeInventoryConfig(state.inventoryConfig || DEFAULT_INVENTORY_CONFIG));
  }, [state.inventoryConfig]);

  const updateInventoryField = (index: number, patch: Partial<InventoryFieldDefinition>) => {
    setInventoryConfigDraft((current) => ({
      ...current,
      fields: current.fields.map((field, fieldIndex) => (fieldIndex === index ? { ...field, ...patch } : field)),
    }));
  };

  const normalizeInventoryFieldAt = (index: number) => {
    setInventoryConfigDraft((current) => ({
      ...current,
      fields: current.fields.map((field, fieldIndex) =>
        fieldIndex === index
          ? { ...field, key: normalizeInventoryFieldKey(field.key, `field_${fieldIndex + 1}`) }
          : field,
      ),
    }));
  };

  const addInventoryField = () => {
    setInventoryConfigDraft((current) => ({
      ...current,
      fields: [...current.fields, createInventoryField(current.fields.length)],
    }));
  };

  const removeInventoryField = (index: number) => {
    setInventoryConfigDraft((current) => ({
      ...current,
      fields: current.fields.filter((_, fieldIndex) => fieldIndex !== index),
    }));
  };

  const updateVariantAttribute = (index: number, value: string) => {
    setInventoryConfigDraft((current) => ({
      ...current,
      variantAttributes: current.variantAttributes.map((attribute, attributeIndex) =>
        attributeIndex === index ? value : attribute,
      ),
    }));
  };

  const addVariantAttribute = () => {
    setInventoryConfigDraft((current) => ({
      ...current,
      variantAttributes: [...current.variantAttributes, `Atributo ${current.variantAttributes.length + 1}`],
    }));
  };

  const removeVariantAttribute = (index: number) => {
    setInventoryConfigDraft((current) => ({
      ...current,
      variantAttributes: current.variantAttributes.filter((_, attributeIndex) => attributeIndex !== index),
    }));
  };

  const updateMeasureOption = (index: number, value: string) => {
    setInventoryConfigDraft((current) => ({
      ...current,
      measureOptions: current.measureOptions.map((option, optionIndex) => (optionIndex === index ? value : option)),
    }));
  };

  const addMeasureOption = () => {
    setInventoryConfigDraft((current) => ({
      ...current,
      measureOptions: [...current.measureOptions, `Medida ${current.measureOptions.length + 1}`],
    }));
  };

  const removeMeasureOption = (index: number) => {
    setInventoryConfigDraft((current) => ({
      ...current,
      measureOptions: current.measureOptions.filter((_, optionIndex) => optionIndex !== index),
    }));
  };

  const updateColorOption = (index: number, patch: Partial<InventoryColorOption>) => {
    setInventoryConfigDraft((current) => ({
      ...current,
      colorOptions: current.colorOptions.map((option, optionIndex) =>
        optionIndex === index ? { ...option, ...patch } : option,
      ),
    }));
  };

  const addColorOption = () => {
    setInventoryConfigDraft((current) => ({
      ...current,
      colorOptions: [...current.colorOptions, { name: `Color ${current.colorOptions.length + 1}`, hex: '#808080' }],
    }));
  };

  const removeColorOption = (index: number) => {
    setInventoryConfigDraft((current) => ({
      ...current,
      colorOptions: current.colorOptions.filter((_, optionIndex) => optionIndex !== index),
    }));
  };

  const updateInventorySyncSetting = (patch: Partial<InventoryConfig>) => {
    setInventoryConfigDraft((current) => normalizeInventoryConfig({ ...current, ...patch }));
  };

  const inventoryConfigSummary = useMemo(
    () => [
      { label: 'Campos visibles', value: inventoryConfigDraft.fields.length },
      { label: 'Atributos de variante', value: inventoryConfigDraft.variantAttributes.filter(Boolean).length },
      { label: 'Medidas sugeridas', value: inventoryConfigDraft.measureOptions.filter(Boolean).length },
      {
        label: 'Colores sugeridos',
        value: inventoryConfigDraft.colorOptions.filter((option) => option.name.trim()).length,
      },
    ],
    [
      inventoryConfigDraft.fields.length,
      inventoryConfigDraft.measureOptions,
      inventoryConfigDraft.colorOptions,
      inventoryConfigDraft.variantAttributes,
    ],
  );

  const validateInventoryConfigDraft = () => {
    const errors: string[] = [];
    const normalizedFields = inventoryConfigDraft.fields.map((field, index) => ({
      ...field,
      key: normalizeInventoryFieldKey(field.key, `field_${index + 1}`),
      label: field.label.trim(),
    }));
    const keys = normalizedFields.map((field) => field.key);
    const duplicateKeys = keys.filter((key, index) => keys.indexOf(key) !== index);
    const variantAttributes = inventoryConfigDraft.variantAttributes
      .map((attribute) => attribute.trim())
      .filter(Boolean);
    const duplicateVariantAttributes = variantAttributes.filter(
      (attribute, index) =>
        variantAttributes.findIndex((candidate) => candidate.toLowerCase() === attribute.toLowerCase()) !== index,
    );

    const colorNames = inventoryConfigDraft.colorOptions.map((option) => option.name.trim()).filter(Boolean);
    const duplicateColorNames = colorNames.filter(
      (name, index) => colorNames.findIndex((candidate) => candidate.toLowerCase() === name.toLowerCase()) !== index,
    );

    if (normalizedFields.length === 0) errors.push('Agrega al menos un campo de producto.');
    if (normalizedFields.some((field) => !field.label)) errors.push('Cada campo necesita una etiqueta visible.');
    if (duplicateKeys.length > 0) errors.push('Hay claves de campos duplicadas. Usa una clave unica por parametro.');
    if (variantAttributes.length === 0) errors.push('Agrega al menos un atributo para variantes.');
    if (duplicateVariantAttributes.length > 0) errors.push('Hay atributos de variante repetidos.');
    if (duplicateColorNames.length > 0) errors.push('Hay colores sugeridos repetidos.');

    setInventoryConfigErrors(errors);
    return errors.length === 0;
  };

  const saveInventoryConfig = () => {
    if (!validateInventoryConfigDraft()) return;
    const nextConfig = normalizeInventoryConfig(inventoryConfigDraft);
    setInventoryConfigDraft(nextConfig);
    dispatch({ type: 'UPDATE_INVENTORY_CONFIG', payload: nextConfig });
    dbSync.setInventoryConfig(nextConfig);
    showNotification('Configuración de inventario guardada', 'success');
  };

  const handleAddBranch = () => {
    setEditingBranch(null);
    setBranchName('');
    setBranchAddress('');
    setBranchType('sucursal');
    setIsBranchModalOpen(true);
  };

  const handleEditBranch = (branch: Branch) => {
    setEditingBranch(branch);
    setBranchName(branch.name);
    setBranchAddress(branch.address || '');
    setBranchType(branch.type || 'sucursal');
    setIsBranchModalOpen(true);
  };

  const handleDeleteBranch = (branchId: string) => {
    const hasProducts = state.products.some((p) => p.branchId === branchId && p.isActive);
    if (hasProducts) {
      showNotification(t('settings.branches.deleteErrorHasProducts'), 'error');
      return;
    }

    if (window.confirm(t('settings.branches.deleteConfirm'))) {
      dispatch({ type: 'DELETE_BRANCH', payload: branchId });

      const branchToUpdate = state.branches.find((b) => b.id === branchId);
      if (branchToUpdate) {
        dbSync.upsertEntity('branches', { ...branchToUpdate, isActive: false });
      }

      showNotification(t('settings.branches.successDelete'), 'success');
    }
  };

  const handleSaveBranch = () => {
    if (!branchName.trim()) return;

    if (editingBranch) {
      const updatedBranch = {
        ...editingBranch,
        name: branchName.trim(),
        address: branchAddress.trim(),
        type: branchType,
      };
      dispatch({ type: 'UPDATE_BRANCH', payload: updatedBranch });
      dbSync.upsertEntity('branches', updatedBranch);
      showNotification(t('settings.branches.successUpdate'), 'success');
    } else {
      const newBranch = {
        id: generateId(),
        name: branchName.trim(),
        address: branchAddress.trim(),
        type: branchType,
        isActive: true,
        createdAt: Date.now(),
      };
      dispatch({ type: 'ADD_BRANCH', payload: newBranch as Branch });
      dbSync.upsertEntity('branches', newBranch);
      showNotification(t('settings.branches.successAdd'), 'success');
    }
    setIsBranchModalOpen(false);
  };

  return (
    <div className="flex w-full flex-col gap-6 md:gap-8">
      {/* Configuration of Articles */}
      <CollapsibleCard
        title="Configuración de artículos"
        description="Ajusta los campos del producto, los atributos de variante y las listas sugeridas de medidas y colores."
        icon={<SlidersHorizontal className="h-5 w-5" />}
        testId="settings-articles-config-card"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-4">
          <p className="text-xs text-[#F5F5DC]/70">
            Ajusta los campos del producto, los atributos de variante y las listas sugeridas de medidas y colores desde
            aquí.
          </p>
          <button
            type="button"
            onClick={saveInventoryConfig}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#F5F5DC] px-4 py-2.5 text-sm font-bold text-[#121212] min-h-[44px] hover:bg-opacity-80 active:scale-95 md:w-auto cursor-pointer shrink-0"
            data-testid="save-inventory-config"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            Guardar configuración
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4 mb-5">
          {inventoryConfigSummary.map((item) => (
            <div key={item.label} className="rounded-md border border-white/10 bg-[#121212] p-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#F5F5DC]/45">{item.label}</div>
              <div className="mt-1 text-2xl font-bold text-[#F5F5DC]">{item.value}</div>
            </div>
          ))}
        </div>

        {inventoryConfigErrors.length > 0 && (
          <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200 mb-4">
            {inventoryConfigErrors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        )}

        <div className="space-y-6">
          <div className="rounded-lg border border-white/5 bg-[#121212] p-4 min-w-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h4 className="font-semibold text-[#F5F5DC]">Gobierno y sincronizacion</h4>
                <p className="text-xs text-[#F5F5DC]/55">
                  Controla cómo el host aplica cambios de productos enviados por otros nodos.
                </p>
              </div>
              <span className="rounded-full border border-[#F5F5DC]/15 bg-[#0f0f0f] px-3 py-1 text-xs text-[#F5F5DC]/65 self-start sm:self-center">
                Historial: {inventoryConfigDraft.productHistoryLimit} cambios
              </span>
            </div>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-md border border-[#F5F5DC]/10 bg-[#0f0f0f] p-3">
              <input
                type="checkbox"
                checked={inventoryConfigDraft.autoApplyProductUpdates}
                onChange={(event) => updateInventorySyncSetting({ autoApplyProductUpdates: event.target.checked })}
                className="mt-1 h-4 w-4 shrink-0 accent-[#4f9d69]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#F5F5DC]">
                  Aplicar actualizaciones automáticamente
                </span>
                <span className="mt-1 block text-xs text-[#F5F5DC]/55">
                  Si está activo, los cambios de producto con permiso se aplican sin revisión manual y se conserva una
                  versión anterior para restaurar.
                </span>
              </span>
            </label>
          </div>

          <div className="rounded-lg border border-white/5 bg-[#121212] p-4 min-w-0">
            <div className="flex flex-col gap-3 mb-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h4 className="font-semibold text-[#F5F5DC]">Estructura de variantes</h4>
                <p className="text-xs text-[#F5F5DC]/55">
                  Define que diferencia una variante vendible: Color, Medida o Material.
                </p>
              </div>
              <button
                type="button"
                onClick={addVariantAttribute}
                className="w-full bg-transparent border border-[#F5F5DC]/20 text-[#F5F5DC] px-3 py-2 rounded-md text-xs hover:bg-white/5 sm:w-auto cursor-pointer shrink-0"
              >
                <span className="inline-flex items-center gap-2">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Atributo
                </span>
              </button>
            </div>
            <div className="space-y-2">
              {inventoryConfigDraft.variantAttributes.map((attribute, index) => (
                <div key={`${attribute}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 min-w-0">
                  <input
                    value={attribute}
                    onChange={(e) => updateVariantAttribute(index, e.target.value)}
                    className="w-full min-w-0 p-2.5 bg-[#0f0f0f] border border-[#F5F5DC]/20 rounded-md text-sm"
                    placeholder={`Atributo ${index + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeVariantAttribute(index)}
                    className="min-h-[44px] px-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-300 text-xs cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/5 bg-[#121212] p-4 min-w-0">
            <div className="flex flex-col gap-3 mb-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h4 className="font-semibold text-[#F5F5DC]">Listas sugeridas</h4>
                <p className="text-xs text-[#F5F5DC]/55">Valores rapidos para los campos de tipo medida.</p>
              </div>
              <button
                type="button"
                onClick={addMeasureOption}
                className="w-full bg-transparent border border-[#F5F5DC]/20 text-[#F5F5DC] px-3 py-2 rounded-md text-xs hover:bg-white/5 sm:w-auto cursor-pointer shrink-0"
                data-testid="add-measure-option"
              >
                <span className="inline-flex items-center gap-2">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Medida
                </span>
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {inventoryConfigDraft.measureOptions.map((option, index) => (
                <div key={`${option}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 min-w-0">
                  <input
                    value={option}
                    onChange={(e) => updateMeasureOption(index, e.target.value)}
                    className="w-full min-w-0 p-2.5 bg-[#0f0f0f] border border-[#F5F5DC]/20 rounded-md text-sm"
                    placeholder={`Medida ${index + 1}`}
                    data-testid={`measure-option-input-${index}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeMeasureOption(index)}
                    className="min-h-[44px] px-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-300 text-xs cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/5 bg-[#121212] p-4 min-w-0">
            <div className="flex flex-col gap-3 mb-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h4 className="font-semibold text-[#F5F5DC]">Colores sugeridos</h4>
                <p className="text-xs text-[#F5F5DC]/55">
                  Catalogo de colores disponibles al crear o editar productos y sus variantes.
                </p>
              </div>
              <button
                type="button"
                onClick={addColorOption}
                className="w-full bg-transparent border border-[#F5F5DC]/20 text-[#F5F5DC] px-3 py-2 rounded-md text-xs hover:bg-white/5 sm:w-auto cursor-pointer shrink-0"
                data-testid="add-color-option"
              >
                <span className="inline-flex items-center gap-2">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Color
                </span>
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2" data-testid="color-options-list">
              {inventoryConfigDraft.colorOptions.map((option, index) => (
                <div
                  key={`${option.name}-${index}`}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 min-w-0"
                >
                  <input
                    type="color"
                    value={/^#[0-9a-f]{6}$/i.test(option.hex) ? option.hex : '#808080'}
                    onChange={(e) => updateColorOption(index, { hex: e.target.value })}
                    className="h-10 w-10 shrink-0 cursor-pointer rounded-md border border-[#F5F5DC]/20 bg-[#0f0f0f] p-1"
                    aria-label={`Tono de ${option.name || `color ${index + 1}`}`}
                    data-testid={`color-option-hex-${index}`}
                  />
                  <input
                    value={option.name}
                    onChange={(e) => updateColorOption(index, { name: e.target.value })}
                    className="w-full min-w-0 p-2.5 bg-[#0f0f0f] border border-[#F5F5DC]/20 rounded-md text-sm"
                    placeholder={`Color ${index + 1}`}
                    data-testid={`color-option-name-${index}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeColorOption(index)}
                    className="min-h-[44px] px-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-300 text-xs cursor-pointer"
                    data-testid={`color-option-remove-${index}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/5 bg-[#121212] p-4 min-w-0">
            <div className="flex flex-col gap-3 mb-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h4 className="font-semibold text-[#F5F5DC]">Ficha maestra del producto</h4>
                <p className="text-xs text-[#F5F5DC]/55">
                  Campos que describen el articulo completo y aparecen al agregar inventario.
                </p>
              </div>
              <button
                type="button"
                onClick={addInventoryField}
                className="w-full bg-transparent border border-[#F5F5DC]/20 text-[#F5F5DC] px-3 py-2 rounded-md text-xs hover:bg-white/5 sm:w-auto cursor-pointer shrink-0"
              >
                <span className="inline-flex items-center gap-2">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Agregar campo
                </span>
              </button>
            </div>
            <div className="space-y-3">
              {inventoryConfigDraft.fields.map((field, index) => (
                <div
                  key={field.id}
                  className="grid grid-cols-1 gap-2 rounded-md border border-[#F5F5DC]/10 p-3 bg-[#0f0f0f] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center"
                >
                  <input
                    value={field.key}
                    onBlur={() => normalizeInventoryFieldAt(index)}
                    onChange={(e) => updateInventoryField(index, { key: e.target.value })}
                    className="w-full min-w-0 p-2.5 bg-[#121212] border border-[#F5F5DC]/20 rounded-md text-sm"
                    placeholder="Clave"
                  />
                  <input
                    value={field.label}
                    onChange={(e) => updateInventoryField(index, { label: e.target.value })}
                    className="w-full min-w-0 p-2.5 bg-[#121212] border border-[#F5F5DC]/20 rounded-md text-sm"
                    placeholder="Etiqueta"
                  />
                  <select
                    value={field.type}
                    onChange={(e) =>
                      updateInventoryField(index, { type: e.target.value as InventoryFieldDefinition['type'] })
                    }
                    className="w-full min-w-0 p-2.5 bg-[#121212] border border-[#F5F5DC]/20 rounded-md text-sm"
                  >
                    <option value="text">Texto</option>
                    <option value="color">Color</option>
                    <option value="measure">Medida</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeInventoryField(index)}
                    className="w-full px-3 py-2.5 rounded-md bg-red-500/10 border border-red-500/20 text-red-300 text-xs min-h-[44px] md:w-auto cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CollapsibleCard>

      {/* Branches configuration */}
      {isAdmin && (
        <CollapsibleCard
          title={t('settings.branches.title')}
          description={t('settings.branches.description')}
          icon={<Building2 className="h-5 w-5" />}
          testId="settings-branches-card"
        >
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
            <span className="text-xs text-[#F5F5DC]/70">{t('settings.branches.description')}</span>
            <button
              type="button"
              data-testid="add-branch-button"
              onClick={handleAddBranch}
              className="w-full sm:w-auto bg-[#F5F5DC] text-[#121212] font-bold py-2.5 px-4 rounded-lg min-h-[44px] hover:bg-opacity-80 text-sm active:scale-95 cursor-pointer shrink-0"
            >
              <Plus className="h-4 w-4 inline mr-1" />
              {t('settings.branches.add')}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#F5F5DC]/10 text-[#F5F5DC]/50 text-xs uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold">{t('settings.branches.table.name')}</th>
                  <th className="py-3 px-4 font-semibold">{t('settings.branches.table.type')}</th>
                  <th className="py-3 px-4 font-semibold hidden md:table-cell">{t('settings.branches.table.id')}</th>
                  <th className="py-3 px-4 font-semibold">{t('settings.branches.table.createdAt')}</th>
                  <th className="py-3 px-4 font-semibold text-right">{t('settings.branches.table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F5DC]/10">
                {state.branches.filter((b) => b.isActive).length > 0 ? (
                  state.branches
                    .filter((b) => b.isActive)
                    .map((branch) => (
                      <tr key={branch.id} className="text-[#F5F5DC]/90 text-sm hover:bg-white/5 transition-colors">
                        <td className="py-4 px-4 font-medium">
                          <div>{branch.name}</div>
                          {branch.address && (
                            <div className="text-[10px] text-[#F5F5DC]/50 mt-0.5">{branch.address}</div>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          <span className="text-[10px] uppercase tracking-wider bg-[#F5F5DC]/10 px-2 py-0.5 rounded border border-[#F5F5DC]/20">
                            {branch.type === 'bodega'
                              ? t('settings.branches.types.bodega')
                              : t('settings.branches.types.sucursal')}
                          </span>
                        </td>
                        <td className="py-4 px-4 hidden md:table-cell">
                          <code className="text-[10px] bg-[#121212] px-1.5 py-0.5 rounded border border-[#F5F5DC]/10 text-[#F5F5DC]/40">
                            {branch.id}
                          </code>
                        </td>
                        <td className="py-4 px-4">{new Date(branch.createdAt).toLocaleDateString()}</td>
                        <td className="py-4 px-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditBranch(branch)}
                              className="p-2 text-[#4ADE80] hover:bg-[#4ADE80]/10 rounded-md transition-colors cursor-pointer"
                              title={t('common.edit')}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteBranch(branch.id)}
                              className="p-2 text-red-400 hover:bg-red-400/10 rounded-md transition-colors cursor-pointer"
                              title={t('common.delete')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-[#F5F5DC]/40 italic">
                      {t('settings.branches.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CollapsibleCard>
      )}

      {isBranchModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 w-full max-w-md rounded-xl shadow-2xl overflow-hidden">
            <div className="p-6">
              <h3 className="text-xl font-bold text-[#F5F5DC] mb-4">
                {editingBranch ? t('settings.branches.edit') : t('settings.branches.new')}
              </h3>
              <div className="space-y-4">
                <div>
                  <label htmlFor="branch-name" className="block text-sm font-medium text-[#F5F5DC]/70 mb-1">
                    {t('settings.branches.nameLabel')}
                  </label>
                  <input
                    id="branch-name"
                    data-testid="branch-name-input"
                    type="text"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    placeholder={t('settings.branches.namePlaceholder')}
                    className="w-full p-3 bg-[#121212] border border-[#F5F5DC]/20 rounded-lg text-[#F5F5DC] focus:outline-none focus:ring-2 focus:ring-[#4ADE80]/50 transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="branch-address" className="block text-sm font-medium text-[#F5F5DC]/70 mb-1">
                    {t('settings.branches.addressLabel')}
                  </label>
                  <input
                    id="branch-address"
                    data-testid="branch-address-input"
                    type="text"
                    value={branchAddress}
                    onChange={(e) => setBranchAddress(e.target.value)}
                    placeholder={t('settings.branches.addressPlaceholder')}
                    className="w-full p-3 bg-[#121212] border border-[#F5F5DC]/20 rounded-lg text-[#F5F5DC] focus:outline-none focus:ring-2 focus:ring-[#4ADE80]/50 transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="branch-type" className="block text-sm font-medium text-[#F5F5DC]/70 mb-1">
                    {t('settings.branches.typeLabel')}
                  </label>
                  <select
                    id="branch-type"
                    data-testid="branch-type-select"
                    value={branchType}
                    onChange={(e) => setBranchType(e.target.value as 'sucursal' | 'bodega')}
                    className="w-full p-3 bg-[#121212] border border-[#F5F5DC]/20 rounded-lg text-[#F5F5DC] focus:outline-none focus:ring-2 focus:ring-[#4ADE80]/50 transition-all"
                  >
                    <option value="sucursal">{t('settings.branches.types.sucursal')}</option>
                    <option value="bodega">{t('settings.branches.types.bodega')}</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setIsBranchModalOpen(false)}
                  className="flex-1 px-4 py-3 border border-[#F5F5DC]/20 text-[#F5F5DC]/70 rounded-lg font-bold hover:bg-white/5 transition-all active:scale-95 cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  data-testid="save-branch-button"
                  onClick={handleSaveBranch}
                  disabled={!branchName.trim()}
                  className="flex-1 px-4 py-3 bg-[#F5F5DC] text-[#121212] rounded-lg font-bold hover:bg-opacity-90 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {editingBranch ? t('common.save') : t('settings.branches.add')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BranchConfig;
