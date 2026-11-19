import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Ticket, DocumentRecord } from '../types';
import { FileBarChart, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../contexts/AuthContext';

export default function Relatorios() {
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

    const qTickets = query(collection(db, 'tickets'), where('companyId', '==', companyId));
    const unsubTickets = onSnapshot(
      qTickets,
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date()
        } as Ticket));
        list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        setTickets(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'tickets')
    );

    const qDocs = query(collection(db, 'documents'), where('companyId', '==', companyId));
    const unsubDocs = onSnapshot(
      qDocs,
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          expirationDate: doc.data().expirationDate?.toDate() || new Date()
        } as DocumentRecord));
        list.sort((a, b) => a.expirationDate.getTime() - b.expirationDate.getTime());
        setDocuments(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'documents')
    );

    return () => {
      unsubTickets();
      unsubDocs();
    };
  }, [companyId]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-neutral-100 flex items-center gap-2">
            <FileBarChart className="text-indigo-400" /> Relatórios
          </h1>
          {activeCompany && (
            <p className="text-sm text-neutral-400 mt-0.5">{activeCompany.name}</p>
          )}
        </div>
        <button 
          onClick={handlePrint}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-indigo-700 transition-colors"
        >
          <Printer size={20} /> Imprimir Relatório
        </button>
      </div>

      <div className="print:block space-y-8">
        {activeCompany && (
          <div className="hidden print:block border-b border-gray-300 pb-4 mb-4">
            <h1 className="text-xl font-bold text-black">{activeCompany.name}</h1>
            {activeCompany.cnpj && <p className="text-sm text-gray-600">CNPJ: {activeCompany.cnpj}</p>}
          </div>
        )}
        <section className="bg-[#141414] print:bg-white rounded-xl shadow-lg border border-[#262626] print:border-gray-300 p-6">
          <h2 className="text-lg font-semibold text-neutral-100 print:text-black mb-4">Serviços Realizados (Últimos Chamados)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#262626] print:border-gray-300 text-neutral-400 print:text-gray-600 uppercase tracking-wider">
                  <th className="pb-3 font-medium">Data</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Descrição</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#262626] print:divide-gray-300">
                {tickets.slice(0, 10).map(ticket => (
                  <tr key={ticket.id} className="text-neutral-300 print:text-gray-800">
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {ticket.createdAt ? format(ticket.createdAt, "dd/MM/yyyy HH:mm", { locale: ptBR }) : '-'}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="bg-[#262626] print:bg-gray-100 px-2 py-1 rounded text-xs">{ticket.status}</span>
                    </td>
                    <td className="py-3">{ticket.description}</td>
                  </tr>
                ))}
                {tickets.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-neutral-500">Nenhum serviço registrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-[#141414] print:bg-white rounded-xl shadow-lg border border-[#262626] print:border-gray-300 p-6">
          <h2 className="text-lg font-semibold text-neutral-100 print:text-black mb-4">Controle de Certidões e Manutenções Periódicas</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#262626] print:border-gray-300 text-neutral-400 print:text-gray-600 uppercase tracking-wider">
                  <th className="pb-3 font-medium">Documento</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Vencimento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#262626] print:divide-gray-300">
                {documents.map(doc => (
                  <tr key={doc.id} className="text-neutral-300 print:text-gray-800">
                    <td className="py-3 pr-4 font-medium">{doc.name}</td>
                    <td className="py-3 pr-4 capitalize">{doc.status}</td>
                    <td className="py-3">
                      {doc.expirationDate ? format(doc.expirationDate, "dd/MM/yyyy", { locale: ptBR }) : '-'}
                    </td>
                  </tr>
                ))}
                {documents.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-neutral-500">Nenhum documento registrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:block, .print\\:block * {
            visibility: visible;
          }
          .print\\:block {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
