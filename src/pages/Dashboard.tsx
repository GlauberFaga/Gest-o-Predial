import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { BarChart3, AlertCircle, Wrench, CheckCircle } from 'lucide-react';
import { Ticket, DocumentRecord } from '../types';
import { useAuth } from '../contexts/AuthContext';

export default function Dashboard() {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);

  useEffect(() => {
    if (!companyId) {
      setTickets([]);
      setDocuments([]);
      return;
    }

    const unsubTickets = onSnapshot(
      query(collection(db, 'tickets'), where('companyId', '==', companyId)),
      (snapshot) => {
        setTickets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ticket)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'tickets')
    );

    const unsubDocs = onSnapshot(
      query(collection(db, 'documents'), where('companyId', '==', companyId)),
      (snapshot) => {
        setDocuments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), expirationDate: doc.data().expirationDate?.toDate() } as DocumentRecord)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'documents')
    );

    return () => {
      unsubTickets();
      unsubDocs();
    };
  }, [companyId]);

  const openTickets = tickets.filter(t => t.status === 'Aberto').length;
  const inProgressTickets = tickets.filter(t => t.status === 'Em Andamento' || t.status === 'Aguardando Peça').length;
  const completedTickets = tickets.filter(t => t.status === 'Concluído').length;

  const expiringDocs = documents.filter(doc => {
    if (!doc.expirationDate) return false;
    const diffTime = doc.expirationDate.getTime() - new Date().getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= (doc.warningDays || 30) && diffDays > 0;
  }).length;

  const stats = [
    { title: 'Chamados Abertos', value: openTickets.toString(), icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
    { title: 'Em Andamento', value: inProgressTickets.toString(), icon: Wrench, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { title: 'Chamados Concluídos', value: completedTickets.toString(), icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10' },
    { title: 'A Vencer (Certidões/Manut.)', value: expiringDocs.toString(), icon: BarChart3, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-neutral-100">Visão Geral</h1>
          {activeCompany && (
            <p className="text-sm text-neutral-400 mt-0.5">{activeCompany.name}</p>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-[#141414] rounded-xl shadow-lg border border-[#262626] p-6 flex items-center gap-4">
            <div className={`p-4 rounded-full ${stat.bg} ${stat.color}`}>
              <stat.icon size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-400">{stat.title}</p>
              <p className="text-3xl font-bold text-neutral-100">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <div className="bg-[#141414] rounded-xl shadow-lg border border-[#262626] p-6 min-h-[300px]">
          <h2 className="text-lg font-semibold text-neutral-100 mb-4">Últimas Manutenções</h2>
          <div className="space-y-3">
             {tickets.filter(t => t.status === 'Concluído').slice(0, 5).map(t => (
               <div key={t.id} className="p-3 bg-[#1a1a1a] rounded-lg border border-[#262626] flex justify-between items-center">
                 <span className="text-sm text-neutral-300 truncate pr-4">{t.description}</span>
                 <CheckCircle size={16} className="text-green-400 shrink-0" />
               </div>
             ))}
             {tickets.filter(t => t.status === 'Concluído').length === 0 && (
               <div className="text-sm text-neutral-500">Nenhuma manutenção concluída recentemente.</div>
             )}
          </div>
        </div>
        <div className="bg-[#141414] rounded-xl shadow-lg border border-[#262626] p-6 min-h-[300px]">
          <h2 className="text-lg font-semibold text-neutral-100 mb-4">Status de Vencimentos</h2>
          <div className="space-y-3">
             {documents.map(doc => {
               let isExpiring = false;
               let isExpired = false;
               if (doc.expirationDate) {
                 const diffDays = Math.ceil((doc.expirationDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                 isExpiring = diffDays <= (doc.warningDays || 30) && diffDays > 0;
                 isExpired = diffDays <= 0;
               }
               if (!isExpiring && !isExpired) return null;
               
               return (
                 <div key={doc.id} className={`p-3 rounded-lg border flex justify-between items-center ${isExpired ? 'bg-red-500/10 border-red-500/30' : 'bg-yellow-500/10 border-yellow-500/30'}`}>
                   <span className="text-sm text-neutral-300 truncate pr-4">{doc.name}</span>
                   <span className={`text-xs font-medium px-2 py-1 rounded-full ${isExpired ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                     {isExpired ? 'Vencido' : 'Próximo'}
                   </span>
                 </div>
               );
             })}
             {documents.length === 0 && (
               <div className="text-sm text-neutral-500">Nenhum vencimento registrado.</div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
