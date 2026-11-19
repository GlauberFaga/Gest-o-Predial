import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, where, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { logAudit } from '../lib/audit';
import { DocumentRecord, Building, Floor, Room, Item } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { format, differenceInDays } from 'date-fns';
import { AlertTriangle, CheckCircle, Clock, Plus, FileText, Trash2, X } from 'lucide-react';
import { ptBR } from 'date-fns/locale';

export default function Vencimentos() {
  const { userData, activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const isAdmin = userData?.role === 'master' || userData?.role === 'admin';
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<DocumentRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [warningDays, setWarningDays] = useState('30');
  
  // Structure state
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  const [selectedBuildingId, setSelectedBuildingId] = useState('');
  const [selectedFloorId, setSelectedFloorId] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');

  useEffect(() => {
    setSelectedBuildingId('');
    setSelectedFloorId('');
    setSelectedRoomId('');
    setSelectedItemId('');
  }, [companyId]);

  // Fetch Structure data scoped by companyId
  useEffect(() => {
    if (!companyId) {
      setBuildings([]);
      setFloors([]);
      setRooms([]);
      setItems([]);
      return;
    }

    const unsubBuildings = onSnapshot(
      query(collection(db, 'buildings'), where('companyId', '==', companyId)),
      snapshot => {
        setBuildings(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Building)));
      },
      err => handleFirestoreError(err, OperationType.LIST, 'buildings')
    );
    const unsubFloors = onSnapshot(
      query(collection(db, 'floors'), where('companyId', '==', companyId)),
      snapshot => {
        setFloors(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Floor)));
      },
      err => handleFirestoreError(err, OperationType.LIST, 'floors')
    );
    const unsubRooms = onSnapshot(
      query(collection(db, 'rooms'), where('companyId', '==', companyId)),
      snapshot => {
        setRooms(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Room)));
      },
      err => handleFirestoreError(err, OperationType.LIST, 'rooms')
    );
    const unsubItems = onSnapshot(
      query(collection(db, 'items'), where('companyId', '==', companyId)),
      snapshot => {
        setItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Item)));
      },
      err => handleFirestoreError(err, OperationType.LIST, 'items')
    );

    return () => {
      unsubBuildings();
      unsubFloors();
      unsubRooms();
      unsubItems();
    };
  }, [companyId]);

  useEffect(() => {
    if (!companyId) {
      setDocuments([]);
      return;
    }
    const q = query(collection(db, 'documents'), where('companyId', '==', companyId));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map(docData => {
          const data = docData.data();
          return {
            id: docData.id,
            ...data,
            issueDate: data.issueDate?.toDate() || new Date(),
            expirationDate: data.expirationDate?.toDate() || new Date(),
            createdAt: data.createdAt?.toDate() || new Date(),
          } as DocumentRecord;
        });
        docs.sort((a, b) => a.expirationDate.getTime() - b.expirationDate.getTime());
        setDocuments(docs);
      },
      err => handleFirestoreError(err, OperationType.LIST, 'documents')
    );
    return unsubscribe;
  }, [companyId]);

  const getStatus = (expirationDate: Date, warningDays: number) => {
    const daysLeft = differenceInDays(expirationDate, new Date());
    if (daysLeft < 0) return 'vencido';
    if (daysLeft <= warningDays) return 'próximo';
    return 'válido';
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !issueDate || !expirationDate || !selectedBuildingId || !companyId) return;
    
    const expDate = new Date(expirationDate);
    const warnDays = parseInt(warningDays, 10);
    const calculatedStatus = getStatus(expDate, warnDays);

    let tType = 'building';
    let tId = selectedBuildingId;
    if (selectedItemId) { tType = 'item'; tId = selectedItemId; }
    else if (selectedRoomId) { tType = 'room'; tId = selectedRoomId; }
    else if (selectedFloorId) { tType = 'floor'; tId = selectedFloorId; }

    try {
      const docRef = await addDoc(collection(db, 'documents'), {
        companyId,
        name,
        issueDate: new Date(issueDate),
        expirationDate: expDate,
        warningDays: warnDays,
        status: calculatedStatus,
        targetType: tType,
        targetId: tId,
        buildingId: selectedBuildingId,
        createdAt: serverTimestamp()
      });

      await logAudit({
        companyId,
        companyName: activeCompany?.name,
        user: userData,
        action: 'inclusão',
        entity: 'vencimento',
        entityId: docRef.id,
        entityName: name.trim(),
        details: `Vencimento "${name.trim()}" cadastrado com validade até ${format(expDate, 'dd/MM/yyyy')}.`,
      });

      setIsAdding(false);
      setName('');
      setIssueDate('');
      setExpirationDate('');
      setSelectedBuildingId('');
      setSelectedFloorId('');
      setSelectedRoomId('');
      setSelectedItemId('');
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'documents');
    }
  };

  const handleDelete = async () => {
    if (!deletingDoc || !companyId || !isAdmin) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteDoc(doc(db, 'documents', deletingDoc.id));
      await logAudit({
        companyId,
        companyName: activeCompany?.name,
        user: userData,
        action: 'exclusão',
        entity: 'vencimento',
        entityId: deletingDoc.id,
        entityName: deletingDoc.name,
        details: `Vencimento "${deletingDoc.name}" excluído.`,
      });
      setDeletingDoc(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `documents/${deletingDoc.id}`);
      setActionError('Erro ao excluir vencimento. Verifique suas permissões.');
    } finally {
      setDeleting(false);
    }
  };

  const getTargetName = (doc: DocumentRecord) => {
    if (doc.targetType === 'item') return items.find(i => i.id === doc.targetId)?.name || 'Item';
    if (doc.targetType === 'room') return rooms.find(r => r.id === doc.targetId)?.name || 'Sala';
    if (doc.targetType === 'floor') return floors.find(f => f.id === doc.targetId)?.name || 'Andar';
    return buildings.find(b => b.id === doc.targetId)?.name || 'Prédio';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-neutral-100 flex items-center gap-2">
          <FileText className="text-indigo-400" /> Certidões e Manutenções Periódicas
        </h1>
        {isAdmin && (
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-indigo-700 transition-colors"
          >
            <Plus size={20} /> Adicionar Vencimento
          </button>
        )}
      </div>

      {isAdding && (
        <div className="bg-[#141414] p-6 rounded-xl shadow-lg border border-[#262626]">
          <h2 className="text-lg font-semibold mb-4 text-neutral-100">Novo Registro</h2>
          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            <div className="md:col-span-4 grid grid-cols-1 md:grid-cols-4 gap-4 p-4 border border-[#262626] rounded-lg bg-[#0a0a0a]">
              <div className="md:col-span-4 font-medium text-sm text-neutral-400">Vincular à Estrutura:</div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Prédio *</label>
                <select required value={selectedBuildingId} onChange={e => { setSelectedBuildingId(e.target.value); setSelectedFloorId(''); setSelectedRoomId(''); setSelectedItemId(''); }} className="w-full bg-[#141414] border border-[#262626] text-neutral-200 rounded-md p-2 focus:outline-none focus:border-indigo-500">
                  <option value="">Selecione...</option>
                  {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Andar</label>
                <select value={selectedFloorId} onChange={e => { setSelectedFloorId(e.target.value); setSelectedRoomId(''); setSelectedItemId(''); }} disabled={!selectedBuildingId} className="w-full bg-[#141414] border border-[#262626] text-neutral-200 rounded-md p-2 focus:outline-none focus:border-indigo-500 disabled:opacity-50">
                  <option value="">Geral</option>
                  {floors.filter(f => f.buildingId === selectedBuildingId).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Sala</label>
                <select value={selectedRoomId} onChange={e => { setSelectedRoomId(e.target.value); setSelectedItemId(''); }} disabled={!selectedFloorId} className="w-full bg-[#141414] border border-[#262626] text-neutral-200 rounded-md p-2 focus:outline-none focus:border-indigo-500 disabled:opacity-50">
                  <option value="">Geral</option>
                  {rooms.filter(r => r.floorId === selectedFloorId).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Equipamento/Item</label>
                <select value={selectedItemId} onChange={e => setSelectedItemId(e.target.value)} disabled={!selectedRoomId} className="w-full bg-[#141414] border border-[#262626] text-neutral-200 rounded-md p-2 focus:outline-none focus:border-indigo-500 disabled:opacity-50">
                  <option value="">Geral</option>
                  {items.filter(i => i.roomId === selectedRoomId).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
            </div>

            <div className="md:col-span-4">
              <label className="block text-sm font-medium text-neutral-300 mb-1">Nome do Documento ou Manutenção</label>
              <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 focus:outline-none focus:border-indigo-500" placeholder="Ex: Alvará de Funcionamento, Limpeza de Ar-condicionado" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Data da Última (Emissão)</label>
              <input type="date" required value={issueDate} onChange={e => setIssueDate(e.target.value)} className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Data do Vencimento</label>
              <input type="date" required value={expirationDate} onChange={e => setExpirationDate(e.target.value)} className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Avisar antecedência (dias)</label>
              <input type="number" required value={warningDays} onChange={e => setWarningDays(e.target.value)} className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 focus:outline-none focus:border-indigo-500" />
            </div>
            <div className="flex items-end justify-end md:col-span-4 gap-2 mt-4">
              <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 text-neutral-400 border border-[#262626] rounded-md hover:bg-[#262626] transition-colors">Cancelar</button>
              <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors">Salvar Registro</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {documents.map(doc => {
          const status = getStatus(doc.expirationDate, doc.warningDays);
          const statusConfig = {
            'válido': { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-[#262626]' },
            'próximo': { icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
            'vencido': { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' }
          }[status];

          const Icon = statusConfig.icon;

          return (
            <div key={doc.id} className={`p-5 rounded-xl border ${statusConfig.border} bg-[#141414] shadow-lg flex flex-col gap-4 relative overflow-hidden`}>
              <div className={`absolute top-0 right-0 p-2 rounded-bl-xl ${statusConfig.bg} ${statusConfig.color}`}>
                <Icon size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-neutral-100 pr-10">{doc.name}</h3>
                <p className="text-sm text-neutral-500 capitalize flex items-center gap-1">
                  Referência: <span className="font-medium text-neutral-400">{getTargetName(doc)}</span>
                </p>
              </div>
              <div className="space-y-1 mt-auto pt-4 border-t border-[#262626]">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Última Ref.:</span>
                  <span className="font-medium text-neutral-300">{format(doc.issueDate, "dd 'de' MMM, yyyy", { locale: ptBR })}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Vencimento:</span>
                  <span className={`font-semibold ${statusConfig.color}`}>{format(doc.expirationDate, "dd 'de' MMM, yyyy", { locale: ptBR })}</span>
                </div>
                {isAdmin && (
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setActionError(null);
                        setDeletingDoc(doc);
                      }}
                      title="Excluir vencimento"
                      className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-red-400 px-2 py-1 rounded hover:bg-[#262626] transition-colors"
                    >
                      <Trash2 size={14} /> Excluir
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {documents.length === 0 && !isAdding && (
          <div className="col-span-full py-12 text-center text-neutral-500 bg-[#141414] rounded-xl border border-dashed border-[#333]">
            Nenhum registro de certidão ou manutenção periódica encontrado.
          </div>
        )}
      </div>

      {deletingDoc && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#141414] border border-[#262626] rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-[#262626] flex justify-between items-center bg-[#0a0a0a]">
              <h2 className="text-lg font-bold text-red-400 flex items-center gap-2">
                <AlertTriangle size={20} /> Confirmar Exclusão
              </h2>
              <button
                type="button"
                onClick={() => setDeletingDoc(null)}
                className="text-neutral-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {actionError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2 rounded-md text-xs">
                  {actionError}
                </div>
              )}
              <p className="text-sm text-neutral-200">
                Tem certeza que deseja excluir o registro{' '}
                <span className="font-semibold text-white">"{deletingDoc.name}"</span>?
              </p>
              <div className="flex justify-end gap-2 pt-2 border-t border-[#262626]">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeletingDoc(null)}
                  className="px-4 py-2 text-sm text-neutral-400 border border-[#262626] rounded-md hover:bg-[#262626] disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDelete}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
