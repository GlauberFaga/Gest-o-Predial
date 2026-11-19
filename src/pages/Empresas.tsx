import React, { useState } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { logAudit } from '../lib/audit';
import { useAuth } from '../contexts/AuthContext';
import { Company } from '../types';
import {
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
  X,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Empresas() {
  const { userData, companies, activeCompany, setActiveCompanyId } = useAuth();
  const isMaster = userData?.role === 'master';
  const isAdmin = userData?.role === 'admin';

  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isMaster && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-400">
        <Briefcase size={48} className="mb-4 opacity-50" />
        <h2 className="text-xl font-semibold">Acesso Negado</h2>
        <p>Você não tem permissão para gerenciar empresas.</p>
      </div>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMaster || !name.trim() || !userData) return;

    setSubmitting(true);
    setError(null);
    try {
      const docRef = await addDoc(collection(db, 'companies'), {
        name: name.trim(),
        cnpj: cnpj.trim(),
        email: email.trim(),
        phone: phone.trim(),
        active: true,
        createdBy: userData.id,
        createdAt: serverTimestamp(),
      });
      await logAudit({
        companyId: docRef.id,
        companyName: name.trim(),
        user: userData,
        action: 'inclusão',
        entity: 'empresa',
        entityId: docRef.id,
        entityName: name.trim(),
        details: `Empresa "${name.trim()}" cadastrada.`,
      });
      setActiveCompanyId(docRef.id);
      setIsAdding(false);
      setName('');
      setCnpj('');
      setEmail('');
      setPhone('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'companies');
      setError('Erro ao cadastrar empresa. Verifique suas permissões.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany || !editingCompany.name.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const trimmedName = editingCompany.name.trim();
      await updateDoc(doc(db, 'companies', editingCompany.id), {
        name: trimmedName,
        cnpj: (editingCompany.cnpj || '').trim(),
        email: (editingCompany.email || '').trim(),
        phone: (editingCompany.phone || '').trim(),
        active: editingCompany.active,
      });
      await logAudit({
        companyId: editingCompany.id,
        companyName: trimmedName,
        user: userData,
        action: 'alteração',
        entity: 'empresa',
        entityId: editingCompany.id,
        entityName: trimmedName,
        details: `Dados cadastrais da empresa "${trimmedName}" atualizados.`,
      });
      setEditingCompany(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `companies/${editingCompany.id}`);
      setError('Erro ao atualizar empresa.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (company: Company) => {
    if (!isMaster) return;
    setError(null);
    try {
      const nextActive = !company.active;
      await updateDoc(doc(db, 'companies', company.id), {
        active: nextActive,
      });
      await logAudit({
        companyId: company.id,
        companyName: company.name,
        user: userData,
        action: 'alteração',
        entity: 'empresa',
        entityId: company.id,
        entityName: company.name,
        details: `Empresa "${company.name}" ${nextActive ? 'ativada' : 'inativada'}.`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `companies/${company.id}`);
      setError('Erro ao alterar status da empresa.');
    }
  };

  const handleDelete = async () => {
    if (!isMaster || !deletingCompany) return;
    setSubmitting(true);
    setError(null);

    try {
      const targetId = deletingCompany.id;
      const targetName = deletingCompany.name;
      const tenantCollections = ['buildings', 'floors', 'rooms', 'items', 'documents', 'tickets'];
      const refsToDelete: ReturnType<typeof doc>[] = [];

      const snapshots = await Promise.all(
        tenantCollections.map((col) =>
          getDocs(query(collection(db, col), where('companyId', '==', targetId)))
        )
      );
      snapshots.forEach((snap) => snap.docs.forEach((d) => refsToDelete.push(d.ref)));

      for (let i = 0; i < refsToDelete.length; i += 450) {
        const batch = writeBatch(db);
        refsToDelete.slice(i, i + 450).forEach((ref) => batch.delete(ref));
        await batch.commit();
      }

      await deleteDoc(doc(db, 'companies', targetId));
      await logAudit({
        companyId: targetId,
        companyName: targetName,
        user: userData,
        action: 'exclusão',
        entity: 'empresa',
        entityId: targetId,
        entityName: targetName,
        details: `Empresa "${targetName}" e seus registros vinculados foram excluídos.`,
      });
      setDeletingCompany(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `companies/${deletingCompany.id}`);
      setError('Erro ao excluir empresa e registros vinculados.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-100 flex items-center gap-2">
            <Briefcase className="text-indigo-400" /> Empresas / Clientes
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            {isMaster
              ? 'Cadastre e gerencie empresas com isolamento completo de dados entre clientes.'
              : 'Empresas vinculadas ao seu acesso administrativo.'}
          </p>
        </div>

        {isMaster && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setIsAdding(!isAdding);
            }}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-indigo-700 transition-colors"
          >
            <Plus size={20} /> Nova Empresa
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-300 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {isAdding && isMaster && (
        <div className="bg-[#141414] p-6 rounded-xl shadow-lg border border-[#262626]">
          <h2 className="text-lg font-semibold mb-4 text-neutral-100">Cadastrar Nova Empresa</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">
                Nome / Razão Social *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Condomínio Residencial Horizonte"
                className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">
                CNPJ / Documento
              </label>
              <input
                type="text"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="00.000.000/0001-00"
                className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">
                E-mail de Contato
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contato@empresa.com.br"
                className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Telefone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex justify-end md:col-span-2 gap-2 mt-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-4 py-2 text-neutral-400 border border-[#262626] rounded-md hover:bg-[#262626] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Salvando...' : 'Salvar Empresa'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {companies.map((company) => {
          const isSelected = activeCompany?.id === company.id;
          return (
            <div
              key={company.id}
              className={`bg-[#141414] rounded-xl border p-5 shadow-lg flex flex-col gap-4 transition-colors ${
                isSelected ? 'border-indigo-500/60' : 'border-[#262626]'
              } ${!company.active ? 'opacity-70' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-lg text-neutral-100 truncate">
                    {company.name}
                  </h3>
                  {company.cnpj && (
                    <p className="text-xs text-neutral-500 mt-0.5">CNPJ: {company.cnpj}</p>
                  )}
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium shrink-0 ${
                    company.active
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}
                >
                  {company.active ? <CheckCircle size={12} /> : <XCircle size={12} />}
                  {company.active ? 'Ativa' : 'Inativa'}
                </span>
              </div>

              <div className="space-y-1 text-sm text-neutral-400">
                {company.email && <div className="truncate">E-mail: {company.email}</div>}
                {company.phone && <div>Telefone: {company.phone}</div>}
                <div className="text-xs text-neutral-500">
                  Criada em: {format(company.createdAt, 'dd/MM/yyyy', { locale: ptBR })}
                </div>
              </div>

              <div className="mt-auto pt-3 border-t border-[#262626] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setActiveCompanyId(company.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
                      : 'bg-[#1a1a1a] text-neutral-300 hover:bg-[#262626] border border-[#262626]'
                  }`}
                >
                  {isSelected && <Check size={14} />}
                  {isSelected ? 'Empresa Ativa' : 'Selecionar'}
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Editar empresa"
                    onClick={() => setEditingCompany({ ...company })}
                    className="p-2 rounded-lg text-neutral-400 hover:text-indigo-400 hover:bg-[#262626] transition-colors"
                  >
                    <Pencil size={15} />
                  </button>
                  {isMaster && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(company)}
                        className="px-2 py-1 text-xs font-medium text-neutral-400 hover:text-neutral-200 hover:bg-[#262626] rounded-lg transition-colors"
                      >
                        {company.active ? 'Inativar' : 'Ativar'}
                      </button>
                      <button
                        type="button"
                        title="Excluir empresa"
                        onClick={() => setDeletingCompany(company)}
                        className="p-2 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-[#262626] transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {companies.length === 0 && !isAdding && (
          <div className="col-span-full py-12 text-center text-neutral-500 bg-[#141414] rounded-xl border border-dashed border-[#333]">
            {isMaster
              ? 'Nenhuma empresa cadastrada. Clique em "Nova Empresa" para começar.'
              : 'Nenhuma empresa vinculada ao seu usuário.'}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingCompany && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#141414] border border-[#262626] rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-[#262626] flex justify-between items-center bg-[#0a0a0a]">
              <h2 className="text-lg font-bold text-neutral-100">Editar Empresa</h2>
              <button
                type="button"
                onClick={() => setEditingCompany(null)}
                className="text-neutral-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleUpdate} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Nome *</label>
                <input
                  type="text"
                  required
                  value={editingCompany.name}
                  onChange={(e) => setEditingCompany({ ...editingCompany, name: e.target.value })}
                  className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">CNPJ</label>
                <input
                  type="text"
                  value={editingCompany.cnpj || ''}
                  onChange={(e) => setEditingCompany({ ...editingCompany, cnpj: e.target.value })}
                  className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">E-mail</label>
                <input
                  type="email"
                  value={editingCompany.email || ''}
                  onChange={(e) => setEditingCompany({ ...editingCompany, email: e.target.value })}
                  className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Telefone</label>
                <input
                  type="text"
                  value={editingCompany.phone || ''}
                  onChange={(e) => setEditingCompany({ ...editingCompany, phone: e.target.value })}
                  className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[#262626]">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setEditingCompany(null)}
                  className="px-4 py-2 text-sm text-neutral-400 border border-[#262626] rounded-md hover:bg-[#262626]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting || !editingCompany.name.trim()}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingCompany && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#141414] border border-[#262626] rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-[#262626] flex justify-between items-center bg-[#0a0a0a]">
              <h2 className="text-lg font-bold text-red-400 flex items-center gap-2">
                <AlertTriangle size={20} /> Confirmar Exclusão
              </h2>
              <button
                type="button"
                onClick={() => setDeletingCompany(null)}
                className="text-neutral-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-neutral-200">
                Tem certeza que deseja excluir a empresa{' '}
                <span className="font-semibold text-white">"{deletingCompany.name}"</span>?
              </p>
              <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-md p-3">
                Atenção: todos os prédios, andares, salas, itens, vencimentos e chamados vinculados
                a esta empresa serão excluídos permanentemente.
              </p>
              <div className="flex justify-end gap-2 pt-2 border-t border-[#262626]">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setDeletingCompany(null)}
                  className="px-4 py-2 text-sm text-neutral-400 border border-[#262626] rounded-md hover:bg-[#262626]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleDelete}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {submitting ? 'Excluindo...' : 'Excluir Empresa'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
