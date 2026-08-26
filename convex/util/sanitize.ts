// 把不可信文本（角色记忆、事件描述）放进 prompt 前的清洗。
// 只做三件事：去控制字符、去分隔标签本身、限长。语义内容不动。
export function sanitizeForPrompt(text: string, maxLength = 500): string {
  let out = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  out = out.replace(/<\/?(memory|event)>/gi, '');
  if (out.length > maxLength) {
    out = out.slice(0, maxLength) + '…';
  }
  return out;
}
