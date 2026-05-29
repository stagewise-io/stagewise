/**
 * Shared special-token constants used by the system-prompt builder and
 * the metadata-converter pipeline. Migrated from
 * `apps/browser/src/backend/agents/shared/prompts/utils/special-tokens.ts`
 * in Phase 10.
 *
 * These XML tags are a deliberate contract between the host and the
 * model — they must stay stable across package and host so that the LLM
 * sees a consistent vocabulary.
 */
const specialTokens = {
  userMsgUserContentXmlTag: 'user-msg',
  userMsgAttachmentXmlTag: 'attach',
  userMsgCompressedHistoryXmlTag: 'compressed-history',
  slashCommandXmlTag: 'slash-command',
  truncated: (count?: number, type: 'line' | 'char' | 'file' = 'line') =>
    `{{[TRUNCATED${count ? `${count} ${type}${count > 1 ? 's' : ''}` : ''}]}}`,
};

export default specialTokens;
