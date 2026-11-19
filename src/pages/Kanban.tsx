import React, { useState, useEffect, useRef } from 'react';
import {
  collection,
  query,
  onSnapshot,
  where,
  doc,
  updateDoc,
  deleteDoc,
  deleteField,
  addDoc,
  getDocs,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { logAudit } from '../lib/audit';
import {
  Ticket,
  TicketStatus,
  TicketComment,
  Building,
  Floor,
  Room,
  Item,
} from '../types';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus,
  MoreVertical,
  Camera,
  Image as ImageIcon,
  Pencil,
  Trash2,
  MessageSquare,
  Send,
  X,
  AlertTriangle,
  Eye,
  Calendar,
  MapPin,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const COLUMNS: { id: TicketStatus; label: string; color: string }[] = [
  { id: 'Aberto', label: 'Aberto', color: 'bg-red-500/10 text-red-400 border-red-500/30' },
  {
    id: 'Em Andamento',
    label: 'Em Andamento',
    color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
  },
  {
    id: 'Aguardando Peça',
    label: 'Aguardando Peça',
    color: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  },
  {
    id: 'Concluído',
    label: 'Concluído',
    color: 'bg-green-500/10 text-green-400 border-green-500/30',
  },
];

export default function Kanban() {
  const { userData, activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const companyName = activeCompany?.name;

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [description, setDescription] = useState('');
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Structure state
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  const [selectedBuildingId, setSelectedBuildingId] = useState('');
  const [selectedFloorId, setSelectedFloorId] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');

  // View / Edit & Comments Modal State
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editBuildingId, setEditBuildingId] = useState('');
  const [editFloorId, setEditFloorId] = useState('');
  const [editRoomId, setEditRoomId] = useState('');
  const [editItemId, setEditItemId] = useState('');
  const [editStatus, setEditStatus] = useState<TicketStatus>('Aberto');
  const [editDescription, setEditDescription] = useState('');
  const [editPhotoBase64, setEditPhotoBase64] = useState<string | null>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [ticketComments, setTicketComments] = useState<TicketComment[]>([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [savingComment, setSavingComment] = useState(false);

  // Delete Modal State
  const [deletingTicket, setDeletingTicket] = useState<Ticket | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [submittingDelete, setSubmittingDelete] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);

  const canComment = Boolean(userData && userData.role !== 'viewer');

  const canModifyTicket = (ticket: Ticket) => {
    if (!userData) return false;
    if (
      userData.role === 'master' ||
      userData.role === 'admin' ||
      userData.role === 'technician'
    ) {
      return true;
    }
    return userData.role === 'requester' && ticket.createdBy === userData.id;
  };

  useEffect(() => {
    setSelectedBuildingId('');
    setSelectedFloorId('');
    setSelectedRoomId('');
    setSelectedItemId('');
    setEditingTicket(null);
    setIsEditMode(false);
    setDeletingTicket(null);
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
      (snapshot) => {
        setBuildings(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Building)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'buildings')
    );
    const unsubFloors = onSnapshot(
      query(collection(db, 'floors'), where('companyId', '==', companyId)),
      (snapshot) => {
        setFloors(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Floor)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'floors')
    );
    const unsubRooms = onSnapshot(
      query(collection(db, 'rooms'), where('companyId', '==', companyId)),
      (snapshot) => {
        setRooms(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Room)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'rooms')
    );
    const unsubItems = onSnapshot(
      query(collection(db, 'items'), where('companyId', '==', companyId)),
      (snapshot) => {
        setItems(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Item)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'items')
    );

    return () => {
      unsubBuildings();
      unsubFloors();
      unsubRooms();
      unsubItems();
    };
  }, [companyId]);

  // Fetch Tickets scoped by companyId
  useEffect(() => {
    if (!companyId) {
      setTickets([]);
      return;
    }

    const q = query(collection(db, 'tickets'), where('companyId', '==', companyId));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedTickets = snapshot.docs.map((docData) => {
          const data = docData.data();
          return {
            id: docData.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate(),
            completedAt: data.completedAt?.toDate(),
          } as Ticket;
        });
        fetchedTickets.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        setTickets(fetchedTickets);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'tickets')
    );
    return unsubscribe;
  }, [companyId]);

  // Fetch Comments for currently opened ticket in modal
  useEffect(() => {
    if (!editingTicket || !companyId) {
      setTicketComments([]);
      return;
    }

    const q = query(
      collection(db, 'tickets', editingTicket.id, 'comments'),
      where('companyId', '==', companyId)
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
          } as TicketComment;
        });
        list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        setTicketComments(list);
      },
      (err) =>
        handleFirestoreError(
          err,
          OperationType.LIST,
          `tickets/${editingTicket.id}/comments`
        )
    );

    return unsubscribe;
  }, [editingTicket?.id, companyId]);

  const buildStructurePathByIds = (
    bId?: string,
    fId?: string,
    rId?: string,
    iId?: string
  ) => {
    const b = buildings.find((x) => x.id === bId)?.name;
    const f = floors.find((x) => x.id === fId)?.name;
    const r = rooms.find((x) => x.id === rId)?.name;
    const i = items.find((x) => x.id === iId)?.name;
    return [b, f, r, i].filter(Boolean).join(' > ');
  };

  const getStructurePath = (ticket: Ticket) =>
    buildStructurePathByIds(
      ticket.buildingId,
      ticket.floorId,
      ticket.roomId,
      ticket.itemId
    );

  const moveTicket = async (ticket: Ticket, newStatus: TicketStatus) => {
    if (!companyId || ticket.status === newStatus) return;
    setActionError(null);
    try {
      const updateData: Record<string, unknown> = {
        status: newStatus,
        updatedAt: serverTimestamp(),
      };
      if (newStatus === 'Concluído') {
        updateData.completedAt = serverTimestamp();
      } else if (ticket.status === 'Concluído') {
        updateData.completedAt = deleteField();
      }

      await updateDoc(doc(db, 'tickets', ticket.id), updateData);

      await logAudit({
        companyId,
        companyName,
        user: userData,
        action: 'alteração',
        entity: 'chamado',
        entityId: ticket.id,
        entityName: ticket.description.slice(0, 80),
        details: `Status alterado de "${ticket.status}" para "${newStatus}" (${getStructurePath(ticket) || 'Geral'}).`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${ticket.id}`);
      setActionError('Erro ao atualizar status do chamado.');
    }
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string | null) => void
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setter(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !userData || !selectedBuildingId || !companyId) return;
    setActionError(null);

    try {
      const trimmedDesc = description.trim();
      const docRef = await addDoc(collection(db, 'tickets'), {
        companyId,
        description: trimmedDesc,
        status: 'Aberto',
        createdBy: userData.id,
        createdAt: serverTimestamp(),
        initialPhotoUrl: photoBase64,
        buildingId: selectedBuildingId,
        floorId: selectedFloorId,
        roomId: selectedRoomId,
        itemId: selectedItemId,
      });

      const locPath = buildStructurePathByIds(
        selectedBuildingId,
        selectedFloorId,
        selectedRoomId,
        selectedItemId
      );

      await logAudit({
        companyId,
        companyName,
        user: userData,
        action: 'inclusão',
        entity: 'chamado',
        entityId: docRef.id,
        entityName: trimmedDesc.slice(0, 80),
        details: `Chamado aberto em "${locPath || 'Geral'}": ${trimmedDesc.slice(0, 300)}`,
      });

      setIsAdding(false);
      setDescription('');
      setPhotoBase64(null);
      setSelectedBuildingId('');
      setSelectedFloorId('');
      setSelectedRoomId('');
      setSelectedItemId('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tickets');
      setActionError('Erro ao abrir chamado.');
    }
  };

  const openTicketModal = (ticket: Ticket, startInEditMode = false) => {
    setActionError(null);
    setEditingTicket(ticket);
    setIsEditMode(startInEditMode && canModifyTicket(ticket));
    setEditBuildingId(ticket.buildingId || '');
    setEditFloorId(ticket.floorId || '');
    setEditRoomId(ticket.roomId || '');
    setEditItemId(ticket.itemId || '');
    setEditStatus(ticket.status);
    setEditDescription(ticket.description);
    setEditPhotoBase64(ticket.initialPhotoUrl ?? null);
    setNewCommentText('');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTicket || !companyId || !editBuildingId || !editDescription.trim()) return;
    if (!canModifyTicket(editingTicket)) return;

    setSavingEdit(true);
    setActionError(null);

    try {
      const trimmedDesc = editDescription.trim();
      const updatePayload: Record<string, unknown> = {
        buildingId: editBuildingId,
        floorId: editFloorId,
        roomId: editRoomId,
        itemId: editItemId,
        status: editStatus,
        description: trimmedDesc,
        initialPhotoUrl: editPhotoBase64,
        updatedAt: serverTimestamp(),
      };

      if (editStatus === 'Concluído' && editingTicket.status !== 'Concluído') {
        updatePayload.completedAt = serverTimestamp();
      } else if (editStatus !== 'Concluído' && editingTicket.status === 'Concluído') {
        updatePayload.completedAt = deleteField();
      }

      await updateDoc(doc(db, 'tickets', editingTicket.id), updatePayload);

      const newLocPath = buildStructurePathByIds(
        editBuildingId,
        editFloorId,
        editRoomId,
        editItemId
      );
      const changes: string[] = [];
      if (editingTicket.status !== editStatus) {
        changes.push(`status: "${editingTicket.status}" → "${editStatus}"`);
      }
      if (editingTicket.description !== trimmedDesc) {
        changes.push(`descrição atualizada`);
      }
      const oldPath = getStructurePath(editingTicket);
      if (oldPath !== newLocPath) {
        changes.push(`local: "${oldPath || 'Geral'}" → "${newLocPath || 'Geral'}"`);
      }
      if ((editingTicket.initialPhotoUrl ?? null) !== editPhotoBase64) {
        changes.push('foto alterada');
      }

      await logAudit({
        companyId,
        companyName,
        user: userData,
        action: 'alteração',
        entity: 'chamado',
        entityId: editingTicket.id,
        entityName: trimmedDesc.slice(0, 80),
        details:
          changes.length > 0
            ? `Chamado editado (${changes.join('; ')}).`
            : `Chamado atualizado em "${newLocPath || 'Geral'}".`,
      });

      setEditingTicket({
        ...editingTicket,
        buildingId: editBuildingId,
        floorId: editFloorId,
        roomId: editRoomId,
        itemId: editItemId,
        status: editStatus,
        description: trimmedDesc,
        initialPhotoUrl: editPhotoBase64,
        updatedAt: new Date(),
        completedAt:
          editStatus === 'Concluído'
            ? editingTicket.completedAt || new Date()
            : undefined,
      });
      setIsEditMode(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${editingTicket.id}`);
      setActionError('Erro ao salvar alterações do chamado.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCommentText.trim();
    if (!trimmed || !editingTicket || !userData || !companyId || !canComment) return;

    setSavingComment(true);
    setActionError(null);
    try {
      const commentRef = await addDoc(
        collection(db, 'tickets', editingTicket.id, 'comments'),
        {
          companyId,
          ticketId: editingTicket.id,
          text: trimmed,
          authorId: userData.id,
          authorName: userData.name || userData.email || 'Usuário',
          authorEmail: userData.email || '',
          createdAt: serverTimestamp(),
        }
      );

      await logAudit({
        companyId,
        companyName,
        user: userData,
        action: 'inclusão',
        entity: 'comentário',
        entityId: commentRef.id,
        entityName: editingTicket.description.slice(0, 60),
        details: `Comentário adicionado no chamado "${editingTicket.description.slice(0, 60)}": ${trimmed.slice(0, 300)}`,
      });

      setNewCommentText('');
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.CREATE,
        `tickets/${editingTicket.id}/comments`
      );
      setActionError('Erro ao adicionar comentário.');
    } finally {
      setSavingComment(false);
    }
  };

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingTicket || !companyId || !deleteReason.trim()) return;
    if (!canModifyTicket(deletingTicket)) return;

    setSubmittingDelete(true);
    setActionError(null);

    try {
      const targetId = deletingTicket.id;
      const commentsSnap = await getDocs(
        query(
          collection(db, 'tickets', targetId, 'comments'),
          where('companyId', '==', companyId)
        )
      );
      if (!commentsSnap.empty) {
        const commentDocs = commentsSnap.docs;
        for (let i = 0; i < commentDocs.length; i += 450) {
          const batch = writeBatch(db);
          commentDocs.slice(i, i + 450).forEach((cDoc) => batch.delete(cDoc.ref));
          await batch.commit();
        }
      }

      await deleteDoc(doc(db, 'tickets', targetId));

      await logAudit({
        companyId,
        companyName,
        user: userData,
        action: 'exclusão',
        entity: 'chamado',
        entityId: targetId,
        entityName: deletingTicket.description.slice(0, 80),
        details: `Chamado excluído (${getStructurePath(deletingTicket) || 'Geral'} | Status: ${deletingTicket.status}): ${deletingTicket.description.slice(0, 200)}`,
        reason: deleteReason.trim(),
      });

      if (editingTicket?.id === targetId) {
        setEditingTicket(null);
      }
      setDeletingTicket(null);
      setDeleteReason('');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tickets/${deletingTicket.id}`);
      setActionError('Erro ao excluir chamado. Verifique suas permissões.');
    } finally {
      setSubmittingDelete(false);
    }
  };

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-100 flex items-center gap-2">
          Quadro de Manutenção
        </h1>
        {canComment && (
          <button
            onClick={() => {
              setActionError(null);
              setIsAdding(true);
            }}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-indigo-700 transition-colors"
          >
            <Plus size={20} /> Abrir Chamado
          </button>
        )}
      </div>

      {actionError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm flex items-center justify-between shrink-0">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-300 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {isAdding && (
        <div className="bg-[#141414] p-6 rounded-xl shadow-lg border border-[#262626] shrink-0">
          <h2 className="text-lg font-semibold mb-4 text-neutral-100">Novo Chamado</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Prédio *</label>
                <select
                  required
                  value={selectedBuildingId}
                  onChange={(e) => {
                    setSelectedBuildingId(e.target.value);
                    setSelectedFloorId('');
                    setSelectedRoomId('');
                    setSelectedItemId('');
                  }}
                  className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Selecione...</option>
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Andar</label>
                <select
                  value={selectedFloorId}
                  onChange={(e) => {
                    setSelectedFloorId(e.target.value);
                    setSelectedRoomId('');
                    setSelectedItemId('');
                  }}
                  disabled={!selectedBuildingId}
                  className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                >
                  <option value="">Nenhum/Todos</option>
                  {floors
                    .filter((f) => f.buildingId === selectedBuildingId)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Sala</label>
                <select
                  value={selectedRoomId}
                  onChange={(e) => {
                    setSelectedRoomId(e.target.value);
                    setSelectedItemId('');
                  }}
                  disabled={!selectedFloorId}
                  className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                >
                  <option value="">Nenhuma/Todas</option>
                  {rooms
                    .filter((r) => r.floorId === selectedFloorId)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Item</label>
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  disabled={!selectedRoomId}
                  className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                >
                  <option value="">Nenhum/Todos</option>
                  {items
                    .filter((i) => i.roomId === selectedRoomId)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">
                Descrição do Problema *
              </label>
              <textarea
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 focus:outline-none focus:border-indigo-500"
                placeholder="Ex: Lâmpada queimada na recepção..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Foto / Evidência
              </label>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 bg-[#262626] text-neutral-300 rounded-md hover:bg-[#333] transition-colors"
                >
                  <Camera size={20} /> Capturar Foto
                </button>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={(e) => handleFileChange(e, setPhotoBase64)}
                />
                {photoBase64 && (
                  <div className="flex items-center gap-2 text-green-400 text-sm">
                    <ImageIcon size={16} /> Imagem anexada
                  </div>
                )}
              </div>
              {photoBase64 && (
                <img
                  src={photoBase64}
                  alt="Preview"
                  className="mt-4 w-32 h-32 object-cover rounded-lg border border-[#262626]"
                />
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4 border-t border-[#262626] pt-4">
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setPhotoBase64(null);
                }}
                className="px-4 py-2 text-neutral-400 border border-[#262626] rounded-md hover:bg-[#262626] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
              >
                Registrar Chamado
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex-1 flex gap-6 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-[#262626] scrollbar-track-[#0a0a0a]">
        {COLUMNS.map((column) => (
          <div
            key={column.id}
            className="flex-shrink-0 w-80 flex flex-col bg-[#141414] rounded-xl border border-[#262626] shadow-lg overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[#262626] bg-[#0a0a0a] flex items-center justify-between">
              <h3 className="font-semibold text-neutral-200">{column.label}</h3>
              <span className="bg-[#262626] text-neutral-300 text-xs py-1 px-2 rounded-full font-medium">
                {tickets.filter((t) => t.status === column.id).length}
              </span>
            </div>

            <div className="flex-1 p-3 space-y-3 overflow-y-auto">
              {tickets
                .filter((t) => t.status === column.id)
                .map((ticket) => {
                  const editable = canModifyTicket(ticket);
                  return (
                    <div
                      key={ticket.id}
                      onClick={() => openTicketModal(ticket, false)}
                      className="bg-[#1a1a1a] p-4 rounded-lg shadow-sm border border-[#262626] flex flex-col gap-3 group relative hover:border-indigo-500/40 transition-colors cursor-pointer"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className={`text-xs font-medium px-2 py-1 rounded-md border ${column.color}`}>
                          {ticket.status}
                        </span>
                        {editable && (
                          <div
                            className="relative"
                            title="Alterar status rapidamente"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <select
                              className="opacity-0 absolute inset-0 cursor-pointer"
                              value={ticket.status}
                              onChange={(e) =>
                                moveTicket(ticket, e.target.value as TicketStatus)
                              }
                            >
                              {COLUMNS.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="text-neutral-500 hover:text-neutral-300 p-1"
                            >
                              <MoreVertical size={16} />
                            </button>
                          </div>
                        )}
                      </div>

                      {ticket.initialPhotoUrl && (
                        <img
                          src={ticket.initialPhotoUrl}
                          alt="Chamado"
                          className="w-full h-32 object-cover rounded-md border border-[#262626]"
                        />
                      )}

                      <p className="text-sm text-neutral-300 line-clamp-3">{ticket.description}</p>

                      <div className="text-xs text-indigo-300 bg-indigo-500/5 p-2 rounded border border-indigo-500/10">
                        {getStructurePath(ticket) || 'Geral'}
                      </div>

                      <div className="flex justify-between items-center text-xs text-neutral-500 pt-2 border-t border-[#262626]">
                        <span>{format(ticket.createdAt, 'dd MMM', { locale: ptBR })}</span>
                        <span className="inline-flex items-center gap-1 text-neutral-400 group-hover:text-indigo-400 transition-colors">
                          <Eye size={14} /> Ver detalhes
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {/* View / Edit & Comments Modal */}
      {editingTicket && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-[#141414] border border-[#262626] rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#262626] flex justify-between items-center bg-[#0a0a0a]">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-lg font-bold text-neutral-100">
                  {isEditMode ? 'Editar Chamado' : 'Detalhes do Chamado'}
                </h2>
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-md border ${
                    COLUMNS.find((c) => c.id === editingTicket.status)?.color || ''
                  }`}
                >
                  {editingTicket.status}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingTicket(null);
                  setIsEditMode(false);
                }}
                className="text-neutral-400 hover:text-white p-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {!isEditMode ? (
                /* Read-Only Ticket Details View */
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-3">
                      <div className="text-[11px] uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                        <Calendar size={12} className="text-indigo-400" /> Abertura
                      </div>
                      <div className="text-sm text-neutral-200 mt-1 font-medium">
                        {format(editingTicket.createdAt, "dd/MM/yyyy 'às' HH:mm", {
                          locale: ptBR,
                        })}
                      </div>
                    </div>
                    <div className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-3">
                      <div className="text-[11px] uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                        <Calendar size={12} className="text-indigo-400" /> Última Atualização
                      </div>
                      <div className="text-sm text-neutral-200 mt-1 font-medium">
                        {editingTicket.updatedAt
                          ? format(editingTicket.updatedAt, "dd/MM/yyyy 'às' HH:mm", {
                              locale: ptBR,
                            })
                          : '—'}
                      </div>
                    </div>
                    <div className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-3">
                      <div className="text-[11px] uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                        <Calendar size={12} className="text-green-400" /> Conclusão
                      </div>
                      <div className="text-sm text-neutral-200 mt-1 font-medium">
                        {editingTicket.completedAt
                          ? format(editingTicket.completedAt, "dd/MM/yyyy 'às' HH:mm", {
                              locale: ptBR,
                            })
                          : '—'}
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-4 space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                      <MapPin size={14} className="text-indigo-400" /> Estrutura Predial
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <span className="block text-xs text-neutral-500">Prédio</span>
                        <span className="text-neutral-200 font-medium">
                          {buildings.find((b) => b.id === editingTicket.buildingId)?.name || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-xs text-neutral-500">Andar</span>
                        <span className="text-neutral-200 font-medium">
                          {floors.find((f) => f.id === editingTicket.floorId)?.name ||
                            'Nenhum/Todos'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-xs text-neutral-500">Sala</span>
                        <span className="text-neutral-200 font-medium">
                          {rooms.find((r) => r.id === editingTicket.roomId)?.name ||
                            'Nenhuma/Todas'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-xs text-neutral-500">Item</span>
                        <span className="text-neutral-200 font-medium">
                          {items.find((i) => i.id === editingTicket.itemId)?.name ||
                            'Nenhum/Todos'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                      Descrição do Problema
                    </h3>
                    <div className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-4 text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed">
                      {editingTicket.description}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                      Foto / Evidência
                    </h3>
                    {editingTicket.initialPhotoUrl ? (
                      <div className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-3 inline-block">
                        <img
                          src={editingTicket.initialPhotoUrl}
                          alt="Evidência do chamado"
                          className="max-h-72 rounded-md object-contain"
                        />
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-500 italic">Nenhuma foto anexada.</p>
                    )}
                  </div>
                </div>
              ) : (
                /* Ticket Edit Form */
                <form onSubmit={handleSaveEdit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-neutral-400 mb-1">
                        Prédio *
                      </label>
                      <select
                        required
                        value={editBuildingId}
                        onChange={(e) => {
                          setEditBuildingId(e.target.value);
                          setEditFloorId('');
                          setEditRoomId('');
                          setEditItemId('');
                        }}
                        className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 text-sm focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">Selecione...</option>
                        {buildings.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-400 mb-1">
                        Andar
                      </label>
                      <select
                        disabled={!editBuildingId}
                        value={editFloorId}
                        onChange={(e) => {
                          setEditFloorId(e.target.value);
                          setEditRoomId('');
                          setEditItemId('');
                        }}
                        className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                      >
                        <option value="">Nenhum/Todos</option>
                        {floors
                          .filter((f) => f.buildingId === editBuildingId)
                          .map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-400 mb-1">
                        Sala
                      </label>
                      <select
                        disabled={!editFloorId}
                        value={editRoomId}
                        onChange={(e) => {
                          setEditRoomId(e.target.value);
                          setEditItemId('');
                        }}
                        className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                      >
                        <option value="">Nenhuma/Todas</option>
                        {rooms
                          .filter((r) => r.floorId === editFloorId)
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-400 mb-1">
                        Item
                      </label>
                      <select
                        disabled={!editRoomId}
                        value={editItemId}
                        onChange={(e) => setEditItemId(e.target.value)}
                        className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                      >
                        <option value="">Nenhum/Todos</option>
                        {items
                          .filter((i) => i.roomId === editRoomId)
                          .map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-neutral-400 mb-1">
                        Status
                      </label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as TicketStatus)}
                        className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 text-sm focus:outline-none focus:border-indigo-500"
                      >
                        {COLUMNS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-neutral-400 mb-1">
                        Descrição do Problema *
                      </label>
                      <textarea
                        required
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        rows={3}
                        className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-2">
                      Foto / Evidência
                    </label>
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <button
                        type="button"
                        onClick={() => editFileInputRef.current?.click()}
                        className="flex items-center gap-2 px-3 py-1.5 bg-[#262626] text-neutral-200 rounded-md hover:bg-[#333] transition-colors text-xs"
                      >
                        <Camera size={16} />
                        {editPhotoBase64 ? 'Substituir Foto' : 'Capturar Foto'}
                      </button>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        ref={editFileInputRef}
                        className="hidden"
                        onChange={(e) => handleFileChange(e, setEditPhotoBase64)}
                      />
                      {editPhotoBase64 && (
                        <button
                          type="button"
                          onClick={() => setEditPhotoBase64(null)}
                          className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded border border-red-500/20 hover:bg-red-500/10"
                        >
                          Remover Foto
                        </button>
                      )}
                    </div>
                    {editPhotoBase64 ? (
                      <img
                        src={editPhotoBase64}
                        alt="Evidência do chamado"
                        className="w-40 h-40 object-cover rounded-lg border border-[#262626]"
                      />
                    ) : (
                      <p className="text-xs text-neutral-500 italic">Nenhuma foto anexada.</p>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-[#262626]">
                    <button
                      type="button"
                      onClick={() => openTicketModal(editingTicket, false)}
                      className="px-4 py-2 text-sm text-neutral-400 border border-[#262626] rounded-md hover:bg-[#262626] transition-colors"
                    >
                      Cancelar Edição
                    </button>
                    <button
                      type="submit"
                      disabled={savingEdit || !editBuildingId || !editDescription.trim()}
                      className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
                    >
                      {savingEdit ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                  </div>
                </form>
              )}

              {/* Comments Section */}
              <div className="border-t border-[#262626] pt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
                    <MessageSquare size={16} className="text-indigo-400" />
                    Comentários ({ticketComments.length})
                  </h3>
                </div>

                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {ticketComments.length === 0 ? (
                    <div className="text-xs text-neutral-500 bg-[#0a0a0a] border border-[#262626] rounded-lg p-4 text-center">
                      Nenhum comentário registrado neste chamado ainda.
                    </div>
                  ) : (
                    ticketComments.map((comment) => (
                      <div
                        key={comment.id}
                        className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-3 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-indigo-300">
                            {comment.authorName}
                          </span>
                          <span className="text-neutral-500">
                            {format(comment.createdAt, 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-200 whitespace-pre-wrap">
                          {comment.text}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                {(isEditMode || (!canModifyTicket(editingTicket) && canComment)) && (
                  <form onSubmit={handleAddComment} className="flex flex-col sm:flex-row gap-2">
                    <textarea
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      rows={2}
                      placeholder="Escreva um comentário sobre o andamento ou atendimento deste chamado..."
                      className="flex-1 bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2.5 text-sm focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="submit"
                      disabled={savingComment || !newCommentText.trim()}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#262626] hover:bg-indigo-600 text-neutral-100 rounded-md text-sm font-medium transition-colors disabled:opacity-50 shrink-0 self-end sm:self-stretch"
                    >
                      <Send size={15} />
                      {savingComment ? 'Enviando...' : 'Adicionar'}
                    </button>
                  </form>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-[#262626] bg-[#0a0a0a] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {canModifyTicket(editingTicket) && (
                  <>
                    {!isEditMode && (
                      <button
                        type="button"
                        onClick={() => openTicketModal(editingTicket, true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                      >
                        <Pencil size={15} /> Editar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setActionError(null);
                        setDeletingTicket(editingTicket);
                        setDeleteReason('');
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-red-600/15 text-red-400 border border-red-500/30 rounded-md hover:bg-red-600/25 transition-colors"
                    >
                      <Trash2 size={15} /> Excluir
                    </button>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingTicket(null);
                  setIsEditMode(false);
                }}
                className="px-4 py-2 text-sm text-neutral-300 border border-[#262626] rounded-md hover:bg-[#262626] transition-colors ml-auto"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Ticket Confirmation Modal with Mandatory Reason */}
      {deletingTicket && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-[60]">
          <div className="bg-[#141414] border border-[#262626] rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-[#262626] flex justify-between items-center bg-[#0a0a0a]">
              <h2 className="text-lg font-bold text-red-400 flex items-center gap-2">
                <AlertTriangle size={20} /> Excluir Chamado
              </h2>
              <button
                type="button"
                onClick={() => {
                  setDeletingTicket(null);
                  setDeleteReason('');
                  setActionError(null);
                }}
                className="text-neutral-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleConfirmDelete} className="p-5 space-y-4">
              {actionError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2 rounded-md text-xs">
                  {actionError}
                </div>
              )}
              <div className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-3 space-y-1">
                <div className="text-xs text-indigo-300">
                  {getStructurePath(deletingTicket) || 'Geral'} • {deletingTicket.status}
                </div>
                <p className="text-sm text-neutral-200 line-clamp-3">
                  {deletingTicket.description}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">
                  Motivo da exclusão *
                </label>
                <textarea
                  required
                  autoFocus
                  rows={3}
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Informe o motivo pelo qual este chamado está sendo excluído..."
                  className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2.5 text-sm focus:outline-none focus:border-red-500"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  O motivo ficará registrado permanentemente na auditoria do sistema.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#262626]">
                <button
                  type="button"
                  disabled={submittingDelete}
                  onClick={() => {
                    setDeletingTicket(null);
                    setDeleteReason('');
                  }}
                  className="px-4 py-2 text-sm text-neutral-400 border border-[#262626] rounded-md hover:bg-[#262626] transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingDelete || !deleteReason.trim()}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {submittingDelete ? 'Excluindo...' : 'Excluir Chamado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
