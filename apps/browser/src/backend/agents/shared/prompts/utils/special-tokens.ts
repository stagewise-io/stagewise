const specialTokens = {
  userMsgUserContentXmlTag: 'user-msg',
  userMsgAttachmentXmlTag: 'attach',
  userMsgCompressedHistoryXmlTag: 'compressed-history',
  slashCommandXmlTag: 'slash-command',
  truncated: (count?: number, type: 'line' | 'char' | 'file' = 'line') =>
    `{{[TRUNCATED${count ? `${count} ${type}${count > 1 ? 's' : ''}` : ''}]}}`,
};

export default specialTokens;
