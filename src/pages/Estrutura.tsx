import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  writeBatch,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { logAudit } from '../lib/audit';
import { AuditEntity, Building, Floor, Room, Item, Ticket } from '../types';
import {
  Building2,
  Layers,
  DoorOpen,
  Lightbulb,
  ChevronRight,
  Plus,
  X,
  Pencil,
  Trash2,
  AlertTriangle,
  History,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type StructureLevel = 'building' | 'floor' | 'room' | 'item';

interface EditingTarget {
  level: StructureLevel;
  id: string;
  name: string;
  address?: string;
  type?: Item['type'];
}

interface DeletingTarget {
  level: StructureLevel;
  id: string;
  name: string;
}

const LEVEL_LABELS: Record<StructureLevel, string> = {
  building: 'Prédio',
  floor: 'Andar',
  room: 'Sala / Ambiente',
  item: 'Item',
};

const COLLECTION_NAMES: Record<StructureLevel, string> = {
  building: 'buildings',
  floor: 'floors',
  room: 'rooms',
  item: 'items',
};

function logFirestoreError(error: unknown, operationType: string, path: string) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
    },
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

export default function Estrutura() {
  const { userData, activeCompany } = useAuth();
  const isAdmin = userData?.role === 'master' || userData?.role === 'admin';
  const companyId = activeCompany?.id;

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);

  const [floors, setFloors] = useState<Floor[]>([]);
  const [selectedFloor, setSelectedFloor] = useState<Floor | null>(null);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  const [items, setItems] = useState<Item[]>([]);

  const [selectedItemForHistory, setSelectedItemForHistory] = useState<Item | null>(null);
  const [itemTickets, setItemTickets] = useState<Ticket[]>([]);

  // Controlled creation inputs per column
  const [newBuildingName, setNewBuildingName] = useState('');
  const [newFloorName, setNewFloorName] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemType, setNewItemType] = useState<Item['type']>('outro');

  // Edit & Delete modals state
  const [editingTarget, setEditingTarget] = useState<EditingTarget | null>(null);
  const [deletingTarget, setDeletingTarget] = useState<DeletingTarget | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Reset selections when switching company
  useEffect(() => {
    setSelectedBuilding(null);
    setSelectedFloor(null);
    setSelectedRoom(null);
    setSelectedItemForHistory(null);
    setEditingTarget(null);
    setDeletingTarget(null);
  }, [companyId]);

  // Fetch Buildings
  useEffect(() => {
    if (!companyId) {
      setBuildings([]);
      return;
    }
    const q = query(collection(db, 'buildings'), where('companyId', '==', companyId));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Building));
        setBuildings(list);
        setSelectedBuilding((prev) => (prev ? list.find((b) => b.id === prev.id) || null : null));
      },
      (err) => logFirestoreError(err, 'list', 'buildings')
    );
    return unsubscribe;
  }, [companyId]);

  // Fetch Floors
  useEffect(() => {
    if (!companyId || !selectedBuilding) {
      setFloors([]);
      return;
    }
    const q = query(
      collection(db, 'floors'),
      where('companyId', '==', companyId),
      where('buildingId', '==', selectedBuilding.id)
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Floor));
        setFloors(list);
        setSelectedFloor((prev) => (prev ? list.find((f) => f.id === prev.id) || null : null));
      },
      (err) => logFirestoreError(err, 'list', 'floors')
    );
    return unsubscribe;
  }, [companyId, selectedBuilding?.id]);

  // Fetch Rooms
  useEffect(() => {
    if (!companyId || !selectedFloor) {
      setRooms([]);
      return;
    }
    const q = query(
      collection(db, 'rooms'),
      where('companyId', '==', companyId),
      where('floorId', '==', selectedFloor.id)
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Room));
        setRooms(list);
        setSelectedRoom((prev) => (prev ? list.find((r) => r.id === prev.id) || null : null));
      },
      (err) => logFirestoreError(err, 'list', 'rooms')
    );
    return unsubscribe;
  }, [companyId, selectedFloor?.id]);

  // Fetch Items
  useEffect(() => {
    if (!companyId || !selectedRoom) {
      setItems([]);
      return;
    }
    const q = query(
      collection(db, 'items'),
      where('companyId', '==', companyId),
      where('roomId', '==', selectedRoom.id)
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Item));
        setItems(list);
        setSelectedItemForHistory((prev) => (prev ? list.find((i) => i.id === prev.id) || null : null));
      },
      (err) => logFirestoreError(err, 'list', 'items')
    );
    return unsubscribe;
  }, [companyId, selectedRoom?.id]);

  // Fetch Item Tickets History
  useEffect(() => {
    if (!companyId || !selectedItemForHistory) {
      setItemTickets([]);
      return;
    }
    const q = query(
      collection(db, 'tickets'),
      where('companyId', '==', companyId),
      where('itemId', '==', selectedItemForHistory.id)
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
            completedAt: data.completedAt?.toDate(),
          } as Ticket;
        });
        docs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        setItemTickets(docs);
      },
      (err) => logFirestoreError(err, 'list', 'tickets')
    );
    return unsubscribe;
  }, [companyId, selectedItemForHistory?.id]);

  const LEVEL_ENTITY_MAP: Record<StructureLevel, AuditEntity> = {
    building: 'prédio',
    floor: 'andar',
    room: 'sala',
    item: 'item',
  };

  const handleCreate = async (level: StructureLevel) => {
    if (!companyId) return;
    setActionError(null);
    try {
      if (level === 'building') {
        const name = newBuildingName.trim();
        if (!name) return;
        const docRef = await addDoc(collection(db, 'buildings'), {
          companyId,
          name,
          createdAt: serverTimestamp(),
        });
        await logAudit({
          companyId,
          companyName: activeCompany?.name,
          user: userData,
          action: 'inclusão',
          entity: 'prédio',
          entityId: docRef.id,
          entityName: name,
          details: `Prédio "${name}" cadastrado.`,
        });
        setNewBuildingName('');
      } else if (level === 'floor' && selectedBuilding) {
        const name = newFloorName.trim();
        if (!name) return;
        const docRef = await addDoc(collection(db, 'floors'), {
          companyId,
          name,
          buildingId: selectedBuilding.id,
          createdAt: serverTimestamp(),
        });
        await logAudit({
          companyId,
          companyName: activeCompany?.name,
          user: userData,
          action: 'inclusão',
          entity: 'andar',
          entityId: docRef.id,
          entityName: name,
          details: `Andar "${name}" cadastrado no prédio "${selectedBuilding.name}".`,
        });
        setNewFloorName('');
      } else if (level === 'room' && selectedFloor && selectedBuilding) {
        const name = newRoomName.trim();
        if (!name) return;
        const docRef = await addDoc(collection(db, 'rooms'), {
          companyId,
          name,
          floorId: selectedFloor.id,
          buildingId: selectedBuilding.id,
          createdAt: serverTimestamp(),
        });
        await logAudit({
          companyId,
          companyName: activeCompany?.name,
          user: userData,
          action: 'inclusão',
          entity: 'sala',
          entityId: docRef.id,
          entityName: name,
          details: `Sala "${name}" cadastrada em "${selectedBuilding.name} > ${selectedFloor.name}".`,
        });
        setNewRoomName('');
      } else if (level === 'item' && selectedRoom && selectedFloor && selectedBuilding) {
        const name = newItemName.trim();
        if (!name) return;
        const docRef = await addDoc(collection(db, 'items'), {
          companyId,
          name,
          type: newItemType,
          roomId: selectedRoom.id,
          floorId: selectedFloor.id,
          buildingId: selectedBuilding.id,
          createdAt: serverTimestamp(),
        });
        await logAudit({
          companyId,
          companyName: activeCompany?.name,
          user: userData,
          action: 'inclusão',
          entity: 'item',
          entityId: docRef.id,
          entityName: name,
          details: `Item "${name}" (${newItemType}) cadastrado em "${selectedBuilding.name} > ${selectedFloor.name} > ${selectedRoom.name}".`,
        });
        setNewItemName('');
      }
    } catch (e) {
      logFirestoreError(e, 'create', COLLECTION_NAMES[level]);
      setActionError('Erro ao criar registro. Verifique suas permissões.');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTarget || !companyId) return;
    const trimmedName = editingTarget.name.trim();
    if (!trimmedName) return;

    setIsSubmitting(true);
    setActionError(null);
    const colName = COLLECTION_NAMES[editingTarget.level];

    try {
      const payload: Record<string, unknown> = { name: trimmedName };
      if (editingTarget.level === 'building') {
        payload.address = editingTarget.address?.trim() || '';
      } else if (editingTarget.level === 'item' && editingTarget.type) {
        payload.type = editingTarget.type;
      }

      await updateDoc(doc(db, colName, editingTarget.id), payload);
      await logAudit({
        companyId,
        companyName: activeCompany?.name,
        user: userData,
        action: 'alteração',
        entity: LEVEL_ENTITY_MAP[editingTarget.level],
        entityId: editingTarget.id,
        entityName: trimmedName,
        details: `${LEVEL_LABELS[editingTarget.level]} "${trimmedName}" atualizado.`,
      });
      setEditingTarget(null);
    } catch (err) {
      logFirestoreError(err, 'update', `${colName}/${editingTarget.id}`);
      setActionError('Erro ao atualizar registro. Verifique suas permissões.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingTarget || !companyId) return;
    setIsSubmitting(true);
    setActionError(null);

    const { level, id } = deletingTarget;
    const colName = COLLECTION_NAMES[level];

    try {
      if (level === 'item') {
        await deleteDoc(doc(db, 'items', id));
        if (selectedItemForHistory?.id === id) {
          setSelectedItemForHistory(null);
        }
      } else {
        const docsToDelete: ReturnType<typeof doc>[] = [];

        if (level === 'building') {
          const [floorsSnap, roomsSnap, itemsSnap] = await Promise.all([
            getDocs(
              query(
                collection(db, 'floors'),
                where('companyId', '==', companyId),
                where('buildingId', '==', id)
              )
            ),
            getDocs(
              query(
                collection(db, 'rooms'),
                where('companyId', '==', companyId),
                where('buildingId', '==', id)
              )
            ),
            getDocs(
              query(
                collection(db, 'items'),
                where('companyId', '==', companyId),
                where('buildingId', '==', id)
              )
            ),
          ]);
          floorsSnap.docs.forEach((d) => docsToDelete.push(d.ref));
          roomsSnap.docs.forEach((d) => docsToDelete.push(d.ref));
          itemsSnap.docs.forEach((d) => docsToDelete.push(d.ref));
          docsToDelete.push(doc(db, 'buildings', id));
        } else if (level === 'floor') {
          const [roomsSnap, itemsSnap] = await Promise.all([
            getDocs(
              query(
                collection(db, 'rooms'),
                where('companyId', '==', companyId),
                where('floorId', '==', id)
              )
            ),
            getDocs(
              query(
                collection(db, 'items'),
                where('companyId', '==', companyId),
                where('floorId', '==', id)
              )
            ),
          ]);
          roomsSnap.docs.forEach((d) => docsToDelete.push(d.ref));
          itemsSnap.docs.forEach((d) => docsToDelete.push(d.ref));
          docsToDelete.push(doc(db, 'floors', id));
        } else if (level === 'room') {
          const itemsSnap = await getDocs(
            query(
              collection(db, 'items'),
              where('companyId', '==', companyId),
              where('roomId', '==', id)
            )
          );
          itemsSnap.docs.forEach((d) => docsToDelete.push(d.ref));
          docsToDelete.push(doc(db, 'rooms', id));
        }

        // Firestore writeBatch supports up to 500 operations per batch
        for (let i = 0; i < docsToDelete.length; i += 450) {
          const batch = writeBatch(db);
          docsToDelete.slice(i, i + 450).forEach((ref) => batch.delete(ref));
          await batch.commit();
        }

        if (level === 'building' && selectedBuilding?.id === id) {
          setSelectedBuilding(null);
          setSelectedFloor(null);
          setSelectedRoom(null);
          setSelectedItemForHistory(null);
        } else if (level === 'floor' && selectedFloor?.id === id) {
          setSelectedFloor(null);
          setSelectedRoom(null);
          setSelectedItemForHistory(null);
        } else if (level === 'room' && selectedRoom?.id === id) {
          setSelectedRoom(null);
          setSelectedItemForHistory(null);
        }
      }

      if (companyId) {
        await logAudit({
          companyId,
          companyName: activeCompany?.name,
          user: userData,
          action: 'exclusão',
          entity: LEVEL_ENTITY_MAP[level],
          entityId: id,
          entityName: deletingTarget.name,
          details: `${LEVEL_LABELS[level]} "${deletingTarget.name}" excluído.`,
        });
      }

      setDeletingTarget(null);
    } catch (err) {
      logFirestoreError(err, 'delete', `${colName}/${id}`);
      setActionError('Erro ao excluir registro. Verifique suas permissões.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-100">Estrutura Predial</h1>
      </div>

      {actionError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-300 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-[calc(100vh-12rem)] min-h-[500px]">
        {/* Buildings Column */}
        <div className="bg-[#141414] rounded-xl shadow-lg border border-[#262626] flex flex-col overflow-hidden">
          <div className="p-4 border-b border-[#262626] bg-[#0a0a0a] font-semibold text-neutral-300 flex items-center gap-2">
            <Building2 size={18} className="text-indigo-400" /> Prédios
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {buildings.map((b) => {
              const isSelected = selectedBuilding?.id === b.id;
              return (
                <div
                  key={b.id}
                  onClick={() => {
                    setSelectedBuilding(b);
                    setSelectedFloor(null);
                    setSelectedRoom(null);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between gap-2 cursor-pointer transition-colors group ${
                    isSelected
                      ? 'bg-indigo-500/20 text-indigo-400 font-medium'
                      : 'hover:bg-[#262626] text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{b.name}</div>
                    {b.address && <div className="text-xs text-neutral-500 truncate">{b.address}</div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isAdmin && (
                      <div className="flex items-center gap-1 opacity-80 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          title="Editar prédio"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionError(null);
                            setEditingTarget({
                              level: 'building',
                              id: b.id,
                              name: b.name,
                              address: b.address || '',
                            });
                          }}
                          className="p-1 rounded hover:bg-[#333] text-neutral-400 hover:text-indigo-400 transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          title="Excluir prédio"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionError(null);
                            setDeletingTarget({ level: 'building', id: b.id, name: b.name });
                          }}
                          className="p-1 rounded hover:bg-[#333] text-neutral-400 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                    {isSelected && <ChevronRight size={16} />}
                  </div>
                </div>
              );
            })}
          </div>
          {isAdmin && (
            <div className="p-3 border-t border-[#262626] bg-[#0a0a0a] flex gap-2">
              <input
                type="text"
                placeholder="Novo prédio"
                value={newBuildingName}
                className="flex-1 text-sm bg-[#141414] border border-[#262626] text-neutral-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate('building');
                }}
                onChange={(e) => setNewBuildingName(e.target.value)}
              />
              <button
                type="button"
                onClick={() => handleCreate('building')}
                className="bg-indigo-600 text-white p-1 rounded hover:bg-indigo-700 transition-colors"
              >
                <Plus size={20} />
              </button>
            </div>
          )}
        </div>

        {/* Floors Column */}
        <div className="bg-[#141414] rounded-xl shadow-lg border border-[#262626] flex flex-col overflow-hidden">
          <div className="p-4 border-b border-[#262626] bg-[#0a0a0a] font-semibold text-neutral-300 flex items-center gap-2">
            <Layers size={18} className="text-indigo-400" /> Andares
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {!selectedBuilding ? (
              <div className="text-center text-sm text-neutral-600 mt-10">Selecione um prédio</div>
            ) : (
              floors.map((f) => {
                const isSelected = selectedFloor?.id === f.id;
                return (
                  <div
                    key={f.id}
                    onClick={() => {
                      setSelectedFloor(f);
                      setSelectedRoom(null);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between gap-2 cursor-pointer transition-colors group ${
                      isSelected
                        ? 'bg-indigo-500/20 text-indigo-400 font-medium'
                        : 'hover:bg-[#262626] text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <span className="truncate flex-1">{f.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {isAdmin && (
                        <div className="flex items-center gap-1 opacity-80 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            title="Editar andar"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionError(null);
                              setEditingTarget({ level: 'floor', id: f.id, name: f.name });
                            }}
                            className="p-1 rounded hover:bg-[#333] text-neutral-400 hover:text-indigo-400 transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            title="Excluir andar"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionError(null);
                              setDeletingTarget({ level: 'floor', id: f.id, name: f.name });
                            }}
                            className="p-1 rounded hover:bg-[#333] text-neutral-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                      {isSelected && <ChevronRight size={16} />}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {isAdmin && selectedBuilding && (
            <div className="p-3 border-t border-[#262626] bg-[#0a0a0a] flex gap-2">
              <input
                type="text"
                placeholder="Novo andar"
                value={newFloorName}
                className="flex-1 text-sm bg-[#141414] border border-[#262626] text-neutral-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate('floor');
                }}
                onChange={(e) => setNewFloorName(e.target.value)}
              />
              <button
                type="button"
                onClick={() => handleCreate('floor')}
                className="bg-indigo-600 text-white p-1 rounded hover:bg-indigo-700 transition-colors"
              >
                <Plus size={20} />
              </button>
            </div>
          )}
        </div>

        {/* Rooms Column */}
        <div className="bg-[#141414] rounded-xl shadow-lg border border-[#262626] flex flex-col overflow-hidden">
          <div className="p-4 border-b border-[#262626] bg-[#0a0a0a] font-semibold text-neutral-300 flex items-center gap-2">
            <DoorOpen size={18} className="text-indigo-400" /> Salas / Ambientes
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {!selectedFloor ? (
              <div className="text-center text-sm text-neutral-600 mt-10">Selecione um andar</div>
            ) : (
              rooms.map((r) => {
                const isSelected = selectedRoom?.id === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedRoom(r)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between gap-2 cursor-pointer transition-colors group ${
                      isSelected
                        ? 'bg-indigo-500/20 text-indigo-400 font-medium'
                        : 'hover:bg-[#262626] text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <span className="truncate flex-1">{r.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {isAdmin && (
                        <div className="flex items-center gap-1 opacity-80 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            title="Editar sala"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionError(null);
                              setEditingTarget({ level: 'room', id: r.id, name: r.name });
                            }}
                            className="p-1 rounded hover:bg-[#333] text-neutral-400 hover:text-indigo-400 transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            title="Excluir sala"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionError(null);
                              setDeletingTarget({ level: 'room', id: r.id, name: r.name });
                            }}
                            className="p-1 rounded hover:bg-[#333] text-neutral-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                      {isSelected && <ChevronRight size={16} />}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {isAdmin && selectedFloor && (
            <div className="p-3 border-t border-[#262626] bg-[#0a0a0a] flex gap-2">
              <input
                type="text"
                placeholder="Nova sala"
                value={newRoomName}
                className="flex-1 text-sm bg-[#141414] border border-[#262626] text-neutral-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate('room');
                }}
                onChange={(e) => setNewRoomName(e.target.value)}
              />
              <button
                type="button"
                onClick={() => handleCreate('room')}
                className="bg-indigo-600 text-white p-1 rounded hover:bg-indigo-700 transition-colors"
              >
                <Plus size={20} />
              </button>
            </div>
          )}
        </div>

        {/* Items Column */}
        <div className="bg-[#141414] rounded-xl shadow-lg border border-[#262626] flex flex-col overflow-hidden">
          <div className="p-4 border-b border-[#262626] bg-[#0a0a0a] font-semibold text-neutral-300 flex items-center gap-2">
            <Lightbulb size={18} className="text-indigo-400" /> Itens
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {!selectedRoom ? (
              <div className="text-center text-sm text-neutral-600 mt-10">Selecione uma sala</div>
            ) : (
              items.map((i) => (
                <div
                  key={i.id}
                  onClick={() => setSelectedItemForHistory(i)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between gap-2 hover:bg-[#262626] border border-transparent hover:border-[#333] text-neutral-300 mb-1 transition-colors cursor-pointer group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-neutral-200 group-hover:text-indigo-300 truncate">{i.name}</div>
                    <div className="text-xs text-neutral-500 capitalize">{i.type}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      title="Ver histórico"
                      className="p-1 text-neutral-500 group-hover:text-neutral-300 transition-colors"
                    >
                      <History size={14} />
                    </span>
                    {isAdmin && (
                      <div className="flex items-center gap-1 opacity-80 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          title="Editar item"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionError(null);
                            setEditingTarget({
                              level: 'item',
                              id: i.id,
                              name: i.name,
                              type: i.type,
                            });
                          }}
                          className="p-1 rounded hover:bg-[#333] text-neutral-400 hover:text-indigo-400 transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          title="Excluir item"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionError(null);
                            setDeletingTarget({ level: 'item', id: i.id, name: i.name });
                          }}
                          className="p-1 rounded hover:bg-[#333] text-neutral-400 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          {isAdmin && selectedRoom && (
            <div className="p-3 border-t border-[#262626] bg-[#0a0a0a] flex flex-col gap-2">
              <input
                type="text"
                placeholder="Novo item"
                value={newItemName}
                className="w-full text-sm bg-[#141414] border border-[#262626] text-neutral-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate('item');
                }}
                onChange={(e) => setNewItemName(e.target.value)}
              />
              <div className="flex gap-2">
                <select
                  className="flex-1 text-sm bg-[#141414] border border-[#262626] text-neutral-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-500"
                  value={newItemType}
                  onChange={(e) => setNewItemType(e.target.value as Item['type'])}
                >
                  <option value="porta">Porta</option>
                  <option value="lâmpada">Lâmpada</option>
                  <option value="extintor">Extintor</option>
                  <option value="ar-condicionado">Ar-condicionado</option>
                  <option value="outro">Outro</option>
                </select>
                <button
                  type="button"
                  onClick={() => handleCreate('item')}
                  className="bg-indigo-600 text-white p-1 rounded hover:bg-indigo-700 transition-colors"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Item History Modal */}
      {selectedItemForHistory && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-[#141414] border border-[#262626] rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-[#262626] flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-neutral-100">Histórico de Manutenções</h2>
                <p className="text-sm text-neutral-400">
                  {selectedItemForHistory.name} ({selectedItemForHistory.type})
                </p>
              </div>
              <button onClick={() => setSelectedItemForHistory(null)} className="text-neutral-400 hover:text-white">
                <X size={24} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {itemTickets.length === 0 ? (
                <div className="text-center text-neutral-500 py-8">
                  Nenhuma manutenção registrada para este item.
                </div>
              ) : (
                itemTickets.map((t) => (
                  <div
                    key={t.id}
                    className="bg-[#1a1a1a] border border-[#262626] rounded-lg p-4 flex flex-col gap-2"
                  >
                    <div className="flex justify-between items-start">
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded border ${
                          t.status === 'Concluído'
                            ? 'bg-green-500/10 text-green-400 border-green-500/30'
                            : 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                        }`}
                      >
                        {t.status}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {format(t.createdAt, 'dd MMM yyyy', { locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-200 mt-2">{t.description}</p>
                    {t.initialPhotoUrl && (
                      <img
                        src={t.initialPhotoUrl}
                        alt="Evidência"
                        className="mt-2 w-32 h-32 object-cover rounded border border-[#333]"
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Structure Modal */}
      {editingTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#141414] border border-[#262626] rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-[#262626] flex justify-between items-center bg-[#0a0a0a]">
              <h2 className="text-lg font-bold text-neutral-100">
                Editar {LEVEL_LABELS[editingTarget.level]}
              </h2>
              <button
                type="button"
                onClick={() => setEditingTarget(null)}
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
                  autoFocus
                  value={editingTarget.name}
                  onChange={(e) => setEditingTarget({ ...editingTarget, name: e.target.value })}
                  className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              {editingTarget.level === 'building' && (
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-1">
                    Endereço (opcional)
                  </label>
                  <input
                    type="text"
                    value={editingTarget.address || ''}
                    onChange={(e) => setEditingTarget({ ...editingTarget, address: e.target.value })}
                    placeholder="Ex: Rua Exemplo, 123"
                    className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              {editingTarget.level === 'item' && (
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-1">Tipo</label>
                  <select
                    value={editingTarget.type || 'outro'}
                    onChange={(e) =>
                      setEditingTarget({ ...editingTarget, type: e.target.value as Item['type'] })
                    }
                    className="w-full bg-[#0a0a0a] border border-[#262626] text-neutral-200 rounded-md p-2 text-sm focus:outline-none focus:border-indigo-500"
                  >
                    <option value="porta">Porta</option>
                    <option value="lâmpada">Lâmpada</option>
                    <option value="extintor">Extintor</option>
                    <option value="ar-condicionado">Ar-condicionado</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-[#262626]">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setEditingTarget(null)}
                  className="px-4 py-2 text-sm text-neutral-400 border border-[#262626] rounded-md hover:bg-[#262626] transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !editingTarget.name.trim()}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#141414] border border-[#262626] rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-[#262626] flex justify-between items-center bg-[#0a0a0a]">
              <h2 className="text-lg font-bold text-red-400 flex items-center gap-2">
                <AlertTriangle size={20} /> Confirmar Exclusão
              </h2>
              <button
                type="button"
                onClick={() => setDeletingTarget(null)}
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
                Tem certeza que deseja excluir{' '}
                <span className="font-semibold text-white">"{deletingTarget.name}"</span> (
                {LEVEL_LABELS[deletingTarget.level]})?
              </p>
              {deletingTarget.level === 'building' && (
                <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-md p-3">
                  Atenção: todos os andares, salas e itens vinculados a este prédio também serão
                  excluídos permanentemente.
                </p>
              )}
              {deletingTarget.level === 'floor' && (
                <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-md p-3">
                  Atenção: todas as salas e itens vinculados a este andar também serão excluídos
                  permanentemente.
                </p>
              )}
              {deletingTarget.level === 'room' && (
                <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-md p-3">
                  Atenção: todos os itens vinculados a esta sala também serão excluídos
                  permanentemente.
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t border-[#262626]">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setDeletingTarget(null)}
                  className="px-4 py-2 text-sm text-neutral-400 border border-[#262626] rounded-md hover:bg-[#262626] transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleDelete}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

