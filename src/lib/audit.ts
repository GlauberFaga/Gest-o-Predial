import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { AuditAction, AuditEntity, User } from '../types';

interface LogAuditParams {
  companyId: string;
  companyName?: string;
  user: User | null;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  entityName?: string;
  details: string;
  reason?: string;
}

export async function logAudit({
  companyId,
  companyName,
  user,
  action,
  entity,
  entityId,
  entityName,
  details,
  reason,
}: LogAuditParams): Promise<void> {
  if (!user || !companyId) return;

  try {
    await addDoc(collection(db, 'audit_logs'), {
      companyId,
      companyName: companyName || '',
      userId: user.id,
      userName: user.name || user.email || 'Usuário',
      userEmail: user.email || '',
      action,
      entity,
      entityId,
      entityName: entityName || '',
      details: details.slice(0, 2000),
      reason: reason ? reason.trim().slice(0, 500) : '',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'audit_logs');
  }
}
