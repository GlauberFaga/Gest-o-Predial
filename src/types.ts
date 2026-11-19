export type Role = 'master' | 'admin' | 'technician' | 'requester' | 'viewer';

export interface Company {
  id: string;
  name: string;
  cnpj?: string;
  email?: string;
  phone?: string;
  active: boolean;
  createdBy?: string;
  createdAt: Date;
}

export interface User {
  id: string;
  email: string;
  role: Role;
  name: string;
  companyIds: string[];
  active?: boolean;
  createdAt: Date;
}

export interface Building {
  id: string;
  companyId: string;
  name: string;
  address?: string;
  createdAt: Date;
}

export interface Floor {
  id: string;
  companyId: string;
  buildingId: string;
  name: string;
  createdAt: Date;
}

export interface Room {
  id: string;
  companyId: string;
  buildingId: string;
  floorId: string;
  name: string;
  createdAt: Date;
}

export interface Item {
  id: string;
  companyId: string;
  buildingId: string;
  floorId: string;
  roomId: string;
  name: string;
  type: 'porta' | 'lâmpada' | 'extintor' | 'ar-condicionado' | 'outro';
  createdAt: Date;
}

export type DocumentStatus = 'válido' | 'próximo' | 'vencido';

export interface DocumentRecord {
  id: string;
  companyId: string;
  name: string;
  issueDate: Date;
  expirationDate: Date;
  warningDays: number;
  status: DocumentStatus;
  targetType: 'building' | 'floor' | 'room' | 'item';
  targetId: string;
  buildingId?: string;
  createdAt: Date;
}

export type TicketStatus = 'Aberto' | 'Em Andamento' | 'Aguardando Peça' | 'Concluído';

export interface TicketComment {
  id: string;
  companyId: string;
  ticketId: string;
  text: string;
  authorId: string;
  authorName: string;
  authorEmail?: string;
  createdAt: Date;
}

export interface Ticket {
  id: string;
  companyId: string;
  itemId: string;
  buildingId: string;
  floorId: string;
  roomId: string;
  description: string;
  status: TicketStatus;
  initialPhotoUrl?: string | null;
  finalPhotoUrl?: string | null;
  assignedTo?: string; // userId of technician
  createdBy: string;   // userId of requester
  createdAt: Date;
  updatedAt?: Date;
  completedAt?: Date;
}

export type AuditAction = 'inclusão' | 'alteração' | 'exclusão';

export type AuditEntity =
  | 'empresa'
  | 'usuário'
  | 'prédio'
  | 'andar'
  | 'sala'
  | 'item'
  | 'vencimento'
  | 'chamado'
  | 'comentário';

export interface AuditLog {
  id: string;
  companyId: string;
  companyName?: string;
  userId: string;
  userName: string;
  userEmail: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  entityName?: string;
  details: string;
  reason?: string;
  createdAt: Date;
}
