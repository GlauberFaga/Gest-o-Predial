import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { AuditAction, AuditEntity, AuditLog } from '../types';
import { useAuth } from '../contexts/AuthContext';
import {
  ClipboardList,
  Search,
  Shield,
  PlusCircle,
  Pencil,
  Trash2,
  Filter,
  Building2,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const ACTION_CONFIG: Record<
  AuditAction,
  { label: string; badgeClass: string; icon: React.ComponentType<{ size?: number }> }
> = {
  inclusão: {
    label: 'Inclusão',
    badgeClass: 'bg-green-500/10 text-green-400 border-green-500/30',
    icon: PlusCircle,
  },
  alteração: {
    label: 'Alteração',
    badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
    icon: Pencil,
  },
  exclusão: {
    label: 'Exclusão',
    badgeClass: 'bg-red-500/10 text-red-400 border-red-500/30',
    icon: Trash2,
  },
};

const ENTITY_LABELS: Record<AuditEntity, string> = {
  empresa: 'Empresa',
  usuário: 'Usuário',
  prédio: 'Prédio',
  andar: 'Andar',
  sala: 'Sala',
  item: 'Item',
  vencimento: 'Vencimento',
  chamado: 'Chamado',
  comentário: 'Comentário',
};

export default function Auditoria() {
  const { userData, activeCompany, companies } = useAuth();
  const isMaster = userData?.role === 'master';
  const isAdminOrMaster = isMaster || userData?.role === 'admin';

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [scope, setScope] = useState<'active' | 'all'>(activeCompany ? 'active' : 'all');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<'all' | AuditAction>('all');
  const [entityFilter, setEntityFilter] = useState<'all' | AuditEntity>('all');

  useEffect(() => {
    if (!isMaster && scope === 'all') {
      setScope('active');
    }
  }, [isMaster, scope]);

  useEffect(() => {
    if (!isAdminOrMaster) {
      setLogs([]);
      return;
    }

    const useAllScope = isMaster && (scope === 'all' || !activeCompany);
    if (!useAllScope && !activeCompany?.id) {
      setLogs([]);
      return;
    }

    const q = useAllScope
      ? query(collection(db, 'audit_logs'))
      : query(collection(db, 'audit_logs'), where('companyId', '==', activeCompany!.id));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedLogs = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
          } as AuditLog;
        });
        fetchedLogs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        setLogs(fetchedLogs);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'audit_logs')
    );

    return unsubscribe;
  }, [isAdminOrMaster, isMaster, scope, activeCompany?.id]);

  const filteredLogs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return logs.filter((log) => {
      if (actionFilter !== 'all' && log.action !== actionFilter) return false;
      if (entityFilter !== 'all' && log.entity !== entityFilter) return false;
      if (!term) return true;

      const companyDisplay = (
        log.companyName ||
        companies.find((c) => c.id === log.companyId)?.name ||
        ''
      ).toLowerCase();

      return (
        (log.userName || '').toLowerCase().includes(term) ||
        (log.userEmail || '').toLowerCase().includes(term) ||
        (log.entityName || '').toLowerCase().includes(term) ||
        (log.details || '').toLowerCase().includes(term) ||
        (log.reason || '').toLowerCase().includes(term) ||
        companyDisplay.includes(term)
      );
    });
  }, [logs, actionFilter, entityFilter, searchTerm, companies]);

  const counts = useMemo(() => {
    return {
      total: filteredLogs.length,
      inclusao: filteredLogs.filter((l) => l.action === 'inclusão').length,
      alteracao: filteredLogs.filter((l) => l.action === 'alteração').length,
      exclusao: filteredLogs.filter((l) => l.action === 'exclusão').length,
    };
  }, [filteredLogs]);

  if (!isAdminOrMaster) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-400">
        <Shield size={48} className="mb-4 opacity-50" />
        <h2 className="text-xl font-semibold">Acesso Negado</h2>
        <p>Apenas Administradores e Master podem visualizar os registros de auditoria.</p>
      </div>
    );
  }

  const getCompanyLabel = (log: AuditLog) => {
    if (log.companyName) return log.companyName;
    if (log.companyId === 'global') return 'Sistema Global';
    return companies.find((c) => c.id === log.companyId)?.name || log.companyId;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-100 flex items-center gap-2">
            <ClipboardList className="text-indigo-400" /> Auditoria do Sistema
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Histórico completo de inclusões, alterações e exclusões realizadas pelos usuários.
          </p>
        </div>

        {isMaster && (
          <div className="flex items-center gap-2 bg-[#141414] border border-[#262626] rounded-lg p-1">
            <button
              type="button"
              disabled={!activeCompany}
              onClick={() => setScope('active')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-40 ${
                scope === 'active' && activeCompany
                  ? 'bg-indigo-600 text-white'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Empresa Ativa
            </button>
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                scope === 'all' || !activeCompany
                  ? 'bg-indigo-600 text-white'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Todas as Empresas
            </button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
          <div className="text-xs text-neutral-400 uppercase tracking-wider">Registros</div>
          <div className="text-2xl font-bold text-neutral-100 mt-1">{counts.total}</div>
        </div>
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
          <div className="text-xs text-green-400 uppercase tracking-wider">Inclusões</div>
          <div className="text-2xl font-bold text-green-400 mt-1">{counts.inclusao}</div>
        </div>
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
          <div className="text-xs text-indigo-400 uppercase tracking-wider">Alterações</div>
          <div className="text-2xl font-bold text-indigo-400 mt-1">{counts.alteracao}</div>
        </div>
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
          <div className="text-xs text-red-400 uppercase tracking-wider">Exclusões</div>
          <div className="text-2xl font-bold text-red-400 mt-1">{counts.exclusao}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#141414] border border-[#262626] rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2 relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por usuário, e-mail, detalhes ou motivo..."
            className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="relative">
          <Filter
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none"
          />
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as 'all' | AuditAction)}
            className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Todas as Ações</option>
            <option value="inclusão">Inclusão</option>
            <option value="alteração">Alteração</option>
            <option value="exclusão">Exclusão</option>
          </select>
        </div>

        <div>
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value as 'all' | AuditEntity)}
            className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Todos os Módulos</option>
            {(Object.keys(ENTITY_LABELS) as AuditEntity[]).map((entity) => (
              <option key={entity} value={entity}>
                {ENTITY_LABELS[entity]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Audit Table */}
      <div className="bg-[#141414] rounded-xl shadow-lg border border-[#262626] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#1a1a1a] border-b border-[#262626] text-neutral-400 text-xs uppercase tracking-wider">
                <th className="p-4 font-medium">Data / Hora</th>
                <th className="p-4 font-medium">Usuário</th>
                {(isMaster && (scope === 'all' || !activeCompany)) && (
                  <th className="p-4 font-medium">Empresa</th>
                )}
                <th className="p-4 font-medium">Ação</th>
                <th className="p-4 font-medium">Módulo</th>
                <th className="p-4 font-medium">Registro e Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#262626]">
              {filteredLogs.map((log) => {
                const actionCfg = ACTION_CONFIG[log.action] || ACTION_CONFIG['alteração'];
                const ActionIcon = actionCfg.icon;
                return (
                  <tr key={log.id} className="hover:bg-[#1a1a1a]/50 transition-colors align-top">
                    <td className="p-4 text-xs text-neutral-400 whitespace-nowrap">
                      <div className="text-neutral-200 font-medium">
                        {format(log.createdAt, 'dd/MM/yyyy', { locale: ptBR })}
                      </div>
                      <div>{format(log.createdAt, 'HH:mm:ss', { locale: ptBR })}</div>
                    </td>
                    <td className="p-4">
                      <div className="text-sm font-medium text-neutral-200">{log.userName}</div>
                      {log.userEmail && (
                        <div className="text-xs text-neutral-500">{log.userEmail}</div>
                      )}
                    </td>
                    {(isMaster && (scope === 'all' || !activeCompany)) && (
                      <td className="p-4 text-xs text-neutral-300 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#262626] text-neutral-300">
                          <Building2 size={12} className="text-indigo-400" />
                          {getCompanyLabel(log)}
                        </span>
                      </td>
                    )}
                    <td className="p-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${actionCfg.badgeClass}`}
                      >
                        <ActionIcon size={13} />
                        {actionCfg.label}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-neutral-300 whitespace-nowrap">
                      {ENTITY_LABELS[log.entity] || log.entity}
                    </td>
                    <td className="p-4 space-y-1.5 min-w-[260px]">
                      {log.entityName && (
                        <div className="text-sm font-medium text-neutral-100">
                          {log.entityName}
                        </div>
                      )}
                      <div className="text-xs text-neutral-400 leading-relaxed">{log.details}</div>
                      {log.reason && (
                        <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-md px-2.5 py-1.5">
                          <span className="font-semibold">Motivo:</span> {log.reason}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredLogs.length === 0 && (
                <tr>
                  <td
                    colSpan={isMaster && (scope === 'all' || !activeCompany) ? 6 : 5}
                    className="p-10 text-center text-neutral-500"
                  >
                    Nenhum registro de auditoria encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
