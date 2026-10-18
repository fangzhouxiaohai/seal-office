import type { CloudNode } from '../cloud/CloudFileBrowser'

export type TeamRole = 'owner' | 'admin' | 'editor' | 'viewer'
export interface ShareEntry { id: string; nodeId: string; name: string; filename?: string; direction: 'sent' | 'received'; ownerId?: string; recipientPhone: string; permission: 'read' | 'edit'; version: number; created: number; expiresAt?: number; revoked?: boolean; accepted?: boolean }
export interface CloudDevice { id: string; name: string; current: boolean; created: number; lastSeen: number; revoked?: boolean }
export interface CloudTag { id: string; name: string; color?: string; count?: number }
export interface TeamEntry { id: string; name: string; role: TeamRole; ownerId: string; created: number }
export interface TeamMember { userId: string; phone: string; role: TeamRole; joined: number }
export interface TeamInvite { id: string; recipientPhone: string; role: TeamRole; expiresAt: number; accepted?: boolean; revoked?: boolean }
export interface CredentialResult { id: string; credential: string; expiresAt?: number }
export interface CollaborationDownload { name: string; path: string; data?: string; version: number }
export type TaggedNode = CloudNode & { tagIds?: string[]; teamId?: string }
export const roleNames: Record<TeamRole, string> = { owner: '所有者', admin: '管理员', editor: '编辑者', viewer: '查看者' }
export const canEditTeam = (role: TeamRole) => role !== 'viewer'
export const canManageMember = (role: TeamRole, target: TeamRole) => role === 'owner' ? target !== 'owner' : role === 'admin' && (target === 'editor' || target === 'viewer')
