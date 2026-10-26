import { api } from './api';

export type SrcContainerStatus = 'unsupported' | 'not-imported' | 'signed-in' | 'expired';
export type SrcConversationBasis = 'observed' | 'notify-target' | 'correlated' | 'manual';
export type SrcConversationRef = { accountId: string; kind: 'chat' | 'cowork'; id: string; url: string; basis: SrcConversationBasis };
export type SrcConversation = SrcConversationRef & {
  firstSeenAt: string; lastSeenAt: string; lastActiveAt: string | null;
  taskRefs: Array<{ agent: string; id: string; basis: SrcConversationBasis }>;
};
export type SrcContainer = {
  accountId: string; storeId: string | null; status: SrcContainerStatus; safariUserAgent: boolean; open: boolean;
  currentConversation: Pick<SrcConversationRef, 'kind' | 'id' | 'url'> | null;
  conversations: SrcConversation[];
};
export type SrcConversationsResult = { accounts: SrcContainer[]; correlationSeconds: number };
export type SrcOpenArgs = { accountId: string; safariUserAgent?: boolean } & ({ conversationId?: never; url?: string } | { conversationId: string; url?: never });
export type SrcBindArgs = { accountId: string; agent: string; taskId: string; conversationId: string | null };
export type SrcStatusResult = { accountId: string; status: SrcContainerStatus };

export const srcConversationsApi = {
  list: (accountId?: string) => api<SrcConversationsResult>('src-conversations/query', 'POST', { accountId }),
  profiles: () => api<{ status?: 'unsupported'; profiles: Array<{ directory: string; name: string }> }>('src-conversations/profiles'),
  open: (args: SrcOpenArgs) => api<SrcStatusResult>('src-conversations/open', 'POST', args),
  importLogin: (args: { accountId: string; profile: string }) => api<SrcStatusResult>('src-conversations/import', 'POST', args),
  bind: (args: SrcBindArgs) => api<{ conversation: SrcConversationRef | null }>('src-conversations/bind', 'POST', args),
};
