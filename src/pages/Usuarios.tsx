import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, firebaseConfig, handleFirestoreError, OperationType } from '../lib/firebase';
import { logAudit } from '../lib/audit';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { User, Role } from '../types';
import { useAuth } from '../contexts/AuthContext';
import {
  Shield,
  User as UserIcon,
  Plus,
  CheckCircle,
  XCircle,
  Briefcase,
  X,
  Pencil,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const ROLES: { id: Role; label: string }[] = [
  { id: 'master', label: 'Master' },
  { id: 'admin', label: 'Admin' },
  { id: 'technician', label: 'Técnico' },
  { id: 'requester', label: 'Solicitante' },
  { id: 'viewer', label: 'Visualizador' },
];

export default function Usuarios() {
  const { userData, companies, activeCompany } = useAuth();
  const isMaster = userData?.role === 'master';
  const isAdminOrMaster = isMaster || userData?.role === 'admin';

  const [users, setUsers] = useState<User[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<Role>('requester');
  const [newCompanyIds, setNewCompanyIds] = useState<string[]>([]);

  const [editingCompaniesUser, setEditingCompaniesUser] = useState<User | null>(null);
  const [selectedUserCompanyIds, setSelectedUserCompanyIds] = useState<string[]>([]);

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<Role>('requester');
  const [editActive, setEditActive] = useState(true);
  const [editCompanyIds, setEditCompanyIds] = useState<string[]>([]);

  const [deletingUser, setDeletingUser] = useState<User | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAdding && newCompanyIds.length === 0 && activeCompany) {
      setNewCompanyIds([activeCompany.id]);
    }
  }, [isAdding, activeCompany?.id]);

  useEffect(() => {
    if (!userData || !isAdminOrMaster) {
      setUsers([]);
      return;
    }

    if (isMaster) {
      const q = query(collection(db, 'users'));
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const fetchedUsers = snapshot.docs.map((docData) => {
            const data = docData.data();
            return {
              id: docData.id,
              ...data,
              companyIds: Array.isArray(data.companyIds) ? data.companyIds : [],
              active: data.active ?? true,
              createdAt: data.createdAt?.toDate() || new Date(),
            } as User;
          });
          setUsers(fetchedUsers);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'users')
      );
      return unsubscribe;
    }

    const adminCompanyIds = userData.companyIds || [];
    if (adminCompanyIds.length === 0) {
      setUsers([]);
      return;
    }

    const q = query(
      collection(db, 'users'),
      where('companyIds', 'array-contains-any', adminCompanyIds.slice(0, 10))
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedUsers = snapshot.docs.map((docData) => {
          const data = docData.data();
          return {
            id: docData.id,
            ...data,
            companyIds: Array.isArray(data.companyIds) ? data.companyIds : [],
            active: data.active ?? true,
            createdAt: data.createdAt?.toDate() || new Date(),
          } as User;
        });
        setUsers(fetchedUsers);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );
    return unsubscribe;
  }, [userData?.id, isMaster, isAdminOrMaster, JSON.stringify(userData?.companyIds || [])]);

  const auditCompanyId = activeCompany?.id || userData?.companyIds?.[0] || 'global';
  const auditCompanyName = activeCompany?.name || '';

  const handleRoleChange = async (userId: string, role: Role) => {
    if (!isAdminOrMaster) return;
    if (!isMaster && role === 'master') return;
    setError('');
    try {
      const targetUser = users.find((u) => u.id === userId);
      await updateDoc(doc(db, 'users', userId), { role });
      await logAudit({
        companyId: auditCompanyId,
        companyName: auditCompanyName,
        user: userData,
        action: 'alteração',
        entity: 'usuário',
        entityId: userId,
        entityName: targetUser?.name || targetUser?.email || userId,
        details: `Papel do usuário alterado de "${targetUser?.role || '-'}" para "${role}".`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
      setError('Erro ao atualizar papel do usuário.');
    }
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    if (!isAdminOrMaster) return;
    setError('');
    try {
      const targetUser = users.find((u) => u.id === userId);
      const nextActive = !currentActive;
      await updateDoc(doc(db, 'users', userId), { active: nextActive });
      await logAudit({
        companyId: auditCompanyId,
        companyName: auditCompanyName,
        user: userData,
        action: 'alteração',
        entity: 'usuário',
        entityId: userId,
        entityName: targetUser?.name || targetUser?.email || userId,
        details: `Usuário ${nextActive ? 'ativado' : 'desativado'}.`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
      setError('Erro ao atualizar status do usuário.');
    }
  };

  const toggleCompanyInList = (companyId: string, list: string[], setter: (v: string[]) => void) => {
    if (list.includes(companyId)) {
      setter(list.filter((id) => id !== companyId));
    } else {
      setter([...list, companyId]);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newRole !== 'master' && newCompanyIds.length === 0) {
      setError('Selecione pelo menos uma empresa para vincular o usuário.');
      return;
    }

    setLoading(true);
    try {
      const secondaryApp = getApps().some((a) => a.name === 'Secondary')
        ? getApp('Secondary')
        : initializeApp(firebaseConfig, 'Secondary');
      const secondaryAuth = getAuth(secondaryApp);

      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        newEmail.trim(),
        newPassword
      );

      await setDoc(doc(db, 'users', userCredential.user.uid), {
        id: userCredential.user.uid,
        email: newEmail.trim(),
        name: newName.trim(),
        role: newRole,
        companyIds: newCompanyIds,
        active: true,
        createdAt: new Date(),
      });

      await signOut(secondaryAuth);

      const logTargetCompanyId = newCompanyIds[0] || auditCompanyId;
      const logTargetCompanyName =
        companies.find((c) => c.id === logTargetCompanyId)?.name || auditCompanyName;

      await logAudit({
        companyId: logTargetCompanyId,
        companyName: logTargetCompanyName,
        user: userData,
        action: 'inclusão',
        entity: 'usuário',
        entityId: userCredential.user.uid,
        entityName: newName.trim(),
        details: `Usuário "${newName.trim()}" (${newEmail.trim()}) cadastrado com papel "${newRole}".`,
      });

      setIsAdding(false);
      setNewEmail('');
      setNewPassword('');
      setNewName('');
      setNewRole('requester');
      setNewCompanyIds(activeCompany ? [activeCompany.id] : []);
    } catch (err: any) {
      setError(err.message || 'Erro ao criar usuário');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveUserCompanies = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompaniesUser) return;
    setError('');
    setLoading(true);

    try {
      const finalIds = isMaster
        ? selectedUserCompanyIds
        : [
            ...editingCompaniesUser.companyIds.filter(
              (id) => !companies.some((c) => c.id === id)
            ),
            ...selectedUserCompanyIds,
          ];

      const uniqueIds = Array.from(new Set(finalIds));
      await updateDoc(doc(db, 'users', editingCompaniesUser.id), {
        companyIds: uniqueIds,
      });

      const linkedNames = uniqueIds
        .map((id) => companies.find((c) => c.id === id)?.name || id)
        .join(', ');

      await logAudit({
        companyId: auditCompanyId,
        companyName: auditCompanyName,
        user: userData,
        action: 'alteração',
        entity: 'usuário',
        entityId: editingCompaniesUser.id,
        entityName: editingCompaniesUser.name,
        details: `Vínculos de empresas atualizados para: ${linkedNames || 'Nenhuma'}.`,
      });

      setEditingCompaniesUser(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${editingCompaniesUser.id}`);
      setError('Erro ao atualizar empresas do usuário.');
    } finally {
      setLoading(false);
    }
  };

  const openEditUserModal = (user: User) => {
    setError('');
    setEditingUser(user);
    setEditName(user.name || '');
    setEditRole(user.role);
    setEditActive(user.active ?? true);
    setEditCompanyIds(
      (user.companyIds || []).filter((id) =>
        isMaster ? true : companies.some((c) => c.id === id)
      )
    );
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !isAdminOrMaster) return;

    const trimmedName = editName.trim();
    if (!trimmedName) {
      setError('Informe o nome do usuário.');
      return;
    }

    const isSelf = editingUser.id === userData?.id;
    const nextRole = isSelf ? editingUser.role : editRole;
    const nextActive = isSelf ? (editingUser.active ?? true) : editActive;

    const finalIds = isMaster
      ? nextRole === 'master'
        ? []
        : editCompanyIds
      : [
          ...(editingUser.companyIds || []).filter(
            (id) => !companies.some((c) => c.id === id)
          ),
          ...editCompanyIds,
        ];
    const uniqueIds = Array.from(new Set(finalIds));

    if (nextRole !== 'master' && uniqueIds.length === 0) {
      setError('Selecione pelo menos uma empresa para vincular o usuário.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', editingUser.id), {
        name: trimmedName,
        role: nextRole,
        active: nextActive,
        companyIds: uniqueIds,
      });

      const changes: string[] = [];
      if (editingUser.name !== trimmedName) {
        changes.push(`nome: "${editingUser.name}" → "${trimmedName}"`);
      }
      if (editingUser.role !== nextRole) {
        changes.push(`papel: "${editingUser.role}" → "${nextRole}"`);
      }
      if ((editingUser.active ?? true) !== nextActive) {
        changes.push(`status: ${nextActive ? 'Ativo' : 'Inativo'}`);
      }
      const prevIds = Array.from(new Set(editingUser.companyIds || [])).sort().join(',');
      const nextIdsStr = [...uniqueIds].sort().join(',');
      if (prevIds !== nextIdsStr) {
        const linkedNames = uniqueIds
          .map((id) => companies.find((c) => c.id === id)?.name || id)
          .join(', ');
        changes.push(`empresas: ${linkedNames || 'Nenhuma'}`);
      }

      await logAudit({
        companyId: uniqueIds[0] || auditCompanyId,
        companyName:
          companies.find((c) => c.id === (uniqueIds[0] || auditCompanyId))?.name ||
          auditCompanyName,
        user: userData,
        action: 'alteração',
        entity: 'usuário',
        entityId: editingUser.id,
        entityName: trimmedName,
        details:
          changes.length > 0
            ? `Cadastro do usuário atualizado (${changes.join('; ')}).`
            : `Cadastro do usuário "${trimmedName}" salvo.`,
      });

      setEditingUser(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${editingUser.id}`);
      setError('Erro ao atualizar dados do usuário.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser || !isAdminOrMaster) return;
    if (deletingUser.id === userData?.id) return;
    if (!isMaster && deletingUser.role === 'master') return;

    setError('');
    setLoading(true);
    try {
      const targetId = deletingUser.id;
      const targetName = deletingUser.name || deletingUser.email || targetId;
      const targetCompanyId =
        activeCompany?.id ||
        deletingUser.companyIds?.find((id) => userData?.companyIds?.includes(id)) ||
        auditCompanyId;
      const targetCompanyName =
        companies.find((c) => c.id === targetCompanyId)?.name || auditCompanyName;

      await deleteDoc(doc(db, 'users', targetId));

      await logAudit({
        companyId: targetCompanyId,
        companyName: targetCompanyName,
        user: userData,
        action: 'exclusão',
        entity: 'usuário',
        entityId: targetId,
        entityName: targetName,
        details: `Usuário "${targetName}" (${deletingUser.email}) com papel "${deletingUser.role}" excluído do cadastro.`,
      });

      if (editingUser?.id === targetId) {
        setEditingUser(null);
      }
      setDeletingUser(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${deletingUser.id}`);
      setError('Erro ao excluir usuário. Verifique se você possui permissão para todas as empresas deste usuário.');
    } finally {
      setLoading(false);
    }
  };

  const availableRoles = isMaster ? ROLES : ROLES.filter((r) => r.id !== 'master');

  if (!isAdminOrMaster) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-400">
        <Shield size={48} className="mb-4 opacity-50" />
        <h2 className="text-xl font-semibold">Acesso Negado</h2>
        <p>Você não tem permissão para gerenciar usuários.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-neutral-100 flex items-center gap-2">
          <UserIcon className="text-indigo-400" /> Controle de Usuários
        </h1>
        <button
          onClick={() => {
            setError('');
            setIsAdding(!isAdding);
          }}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-indigo-700 transition-colors"
        >
          <Plus size={20} /> Adicionar Usuário
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-300 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {isAdding && (
        <div className="bg-[#141414] p-6 rounded-xl shadow-lg border border-[#262626]">
          <h2 className="text-lg font-semibold mb-4 text-neutral-100">Novo Usuário</h2>
          <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Nome</label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Email</label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">
                Senha (mín 6 carac.)
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Papel</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as Role)}
                className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 focus:outline-none focus:border-indigo-500"
              >
                {availableRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Empresas Vinculadas {newRole !== 'master' && '*'}
              </label>
              {companies.length === 0 ? (
                <div className="text-xs text-neutral-500 bg-[#0a0a0a] border border-[#262626] rounded-md p-3">
                  Nenhuma empresa disponível. Cadastre uma empresa antes de vincular usuários.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 bg-[#0a0a0a] border border-[#262626] rounded-md p-3 max-h-40 overflow-y-auto">
                  {companies.map((company) => (
                    <label
                      key={company.id}
                      className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer hover:text-white"
                    >
                      <input
                        type="checkbox"
                        checked={newCompanyIds.includes(company.id)}
                        onChange={() =>
                          toggleCompanyInList(company.id, newCompanyIds, setNewCompanyIds)
                        }
                        className="rounded border-[#333] bg-[#141414] text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="truncate">{company.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-end justify-end md:col-span-2 gap-2 mt-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-4 py-2 text-neutral-400 border border-[#262626] rounded-md hover:bg-[#262626] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Salvando...' : 'Salvar Usuário'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-[#141414] rounded-xl shadow-lg border border-[#262626] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#1a1a1a] border-b border-[#262626] text-neutral-400 text-sm uppercase tracking-wider">
                <th className="p-4 font-medium">Nome / Email</th>
                <th className="p-4 font-medium">Empresas</th>
                <th className="p-4 font-medium">Papel</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Cadastro</th>
                <th className="p-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#262626]">
              {users.map((user) => {
                const userCompanyNames = (user.companyIds || [])
                  .map((id) => companies.find((c) => c.id === id)?.name)
                  .filter(Boolean) as string[];

                const canEditTarget = isMaster || user.role !== 'master';

                return (
                  <tr
                    key={user.id}
                    className={`hover:bg-[#1a1a1a]/50 transition-colors ${
                      !user.active ? 'opacity-60' : ''
                    }`}
                  >
                    <td className="p-4">
                      <div className="font-medium text-neutral-200">{user.name}</div>
                      <div className="text-sm text-neutral-500">{user.email}</div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {user.role === 'master' ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                            Todas (Master)
                          </span>
                        ) : userCompanyNames.length > 0 ? (
                          userCompanyNames.map((cName) => (
                            <span
                              key={cName}
                              className="text-xs px-2 py-0.5 rounded bg-[#262626] text-neutral-300"
                            >
                              {cName}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-yellow-400">Sem vínculo</span>
                        )}
                        {canEditTarget && user.role !== 'master' && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCompaniesUser(user);
                              setSelectedUserCompanyIds(
                                (user.companyIds || []).filter((id) =>
                                  companies.some((c) => c.id === id)
                                )
                              );
                            }}
                            className="text-xs text-indigo-400 hover:text-indigo-300 underline ml-1"
                          >
                            Vincular
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <select
                        className="bg-[#0a0a0a] border border-[#262626] text-neutral-200 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2"
                        value={user.role}
                        disabled={userData?.id === user.id || !canEditTarget}
                        onChange={(e) => handleRoleChange(user.id, e.target.value as Role)}
                      >
                        {ROLES.filter((r) => isMaster || r.id !== 'master' || user.role === 'master').map(
                          (role) => (
                            <option key={role.id} value={role.id}>
                              {role.label}
                            </option>
                          )
                        )}
                      </select>
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          user.active
                            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                      >
                        {user.active ? <CheckCircle size={12} /> : <XCircle size={12} />}
                        {user.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-neutral-400 whitespace-nowrap">
                      {format(user.createdAt, "dd 'de' MMM, yyyy", { locale: ptBR })}
                    </td>
                    <td className="p-4 text-right">
                      <div className="inline-flex items-center justify-end gap-3">
                        {(canEditTarget || userData?.id === user.id) && (
                          <button
                            type="button"
                            onClick={() => openEditUserModal(user)}
                            title="Editar usuário"
                            className="inline-flex items-center gap-1 text-sm font-medium text-neutral-300 hover:text-indigo-400 transition-colors"
                          >
                            <Pencil size={14} /> Editar
                          </button>
                        )}
                        <button
                          disabled={userData?.id === user.id || !canEditTarget}
                          onClick={() => handleToggleActive(user.id, user.active ?? true)}
                          className="text-sm font-medium text-indigo-400 hover:text-indigo-300 disabled:opacity-30 disabled:hover:text-indigo-400"
                        >
                          {user.active ? 'Desativar' : 'Ativar'}
                        </button>
                        <button
                          type="button"
                          disabled={userData?.id === user.id || !canEditTarget}
                          onClick={() => {
                            setError('');
                            setDeletingUser(user);
                          }}
                          title="Excluir usuário"
                          className="p-1.5 rounded text-neutral-400 hover:text-red-400 hover:bg-[#262626] transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-neutral-500">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Vincular Empresas ao Usuário */}
      {editingCompaniesUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#141414] border border-[#262626] rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-[#262626] flex justify-between items-center bg-[#0a0a0a]">
              <div>
                <h2 className="text-lg font-bold text-neutral-100 flex items-center gap-2">
                  <Briefcase size={18} className="text-indigo-400" /> Empresas do Usuário
                </h2>
                <p className="text-xs text-neutral-400 mt-0.5">{editingCompaniesUser.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCompaniesUser(null)}
                className="text-neutral-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveUserCompanies} className="p-5 space-y-4">
              <div className="space-y-2 max-h-60 overflow-y-auto bg-[#0a0a0a] border border-[#262626] rounded-lg p-3">
                {companies.length === 0 ? (
                  <p className="text-sm text-neutral-500">Nenhuma empresa disponível.</p>
                ) : (
                  companies.map((company) => (
                    <label
                      key={company.id}
                      className="flex items-center gap-2.5 text-sm text-neutral-200 cursor-pointer py-1 hover:text-white"
                    >
                      <input
                        type="checkbox"
                        checked={selectedUserCompanyIds.includes(company.id)}
                        onChange={() =>
                          toggleCompanyInList(
                            company.id,
                            selectedUserCompanyIds,
                            setSelectedUserCompanyIds
                          )
                        }
                        className="rounded border-[#333] bg-[#141414] text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>{company.name}</span>
                    </label>
                  ))
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[#262626]">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setEditingCompaniesUser(null)}
                  className="px-4 py-2 text-sm text-neutral-400 border border-[#262626] rounded-md hover:bg-[#262626]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : 'Salvar Vínculos'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Usuário */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#141414] border border-[#262626] rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-4 border-b border-[#262626] flex justify-between items-center bg-[#0a0a0a]">
              <div>
                <h2 className="text-lg font-bold text-neutral-100 flex items-center gap-2">
                  <Pencil size={18} className="text-indigo-400" /> Editar Usuário
                </h2>
                <p className="text-xs text-neutral-400 mt-0.5">{editingUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="text-neutral-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="p-5 space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2 rounded-md text-xs">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">
                  Nome *
                </label>
                <input
                  type="text"
                  required
                  maxLength={150}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">
                  E-mail de Acesso
                </label>
                <input
                  type="email"
                  disabled
                  value={editingUser.email}
                  className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-500 rounded-md p-2 text-sm opacity-75 cursor-not-allowed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-1">
                    Papel
                  </label>
                  <select
                    value={editRole}
                    disabled={editingUser.id === userData?.id}
                    onChange={(e) => setEditRole(e.target.value as Role)}
                    className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                  >
                    {availableRoles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-1">
                    Status
                  </label>
                  <select
                    value={editActive ? 'active' : 'inactive'}
                    disabled={editingUser.id === userData?.id}
                    onChange={(e) => setEditActive(e.target.value === 'active')}
                    className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                  >
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </div>
              </div>

              {editRole !== 'master' && (
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Empresas Vinculadas *
                  </label>
                  {companies.length === 0 ? (
                    <div className="text-xs text-neutral-500 bg-[#0a0a0a] border border-[#262626] rounded-md p-3">
                      Nenhuma empresa disponível.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[#0a0a0a] border border-[#262626] rounded-md p-3 max-h-44 overflow-y-auto">
                      {companies.map((company) => (
                        <label
                          key={company.id}
                          className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer hover:text-white"
                        >
                          <input
                            type="checkbox"
                            checked={editCompanyIds.includes(company.id)}
                            onChange={() =>
                              toggleCompanyInList(
                                company.id,
                                editCompanyIds,
                                setEditCompanyIds
                              )
                            }
                            className="rounded border-[#333] bg-[#141414] text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="truncate">{company.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-[#262626]">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-sm text-neutral-400 border border-[#262626] rounded-md hover:bg-[#262626] disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading || !editName.trim()}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Exclusão de Usuário */}
      {deletingUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#141414] border border-[#262626] rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-[#262626] flex justify-between items-center bg-[#0a0a0a]">
              <h2 className="text-lg font-bold text-red-400 flex items-center gap-2">
                <AlertTriangle size={20} /> Confirmar Exclusão
              </h2>
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="text-neutral-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2 rounded-md text-xs">
                  {error}
                </div>
              )}
              <p className="text-sm text-neutral-200">
                Tem certeza que deseja excluir o usuário{' '}
                <span className="font-semibold text-white">"{deletingUser.name}"</span> (
                <span className="text-neutral-400">{deletingUser.email}</span>)?
              </p>
              <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-md p-3">
                Esta ação remove o cadastro e todos os vínculos de empresas e permissões de acesso
                deste usuário no sistema.
              </p>
              <div className="flex justify-end gap-2 pt-2 border-t border-[#262626]">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setDeletingUser(null)}
                  className="px-4 py-2 text-sm text-neutral-400 border border-[#262626] rounded-md hover:bg-[#262626] disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleDeleteUser}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {loading ? 'Excluindo...' : 'Excluir Usuário'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
