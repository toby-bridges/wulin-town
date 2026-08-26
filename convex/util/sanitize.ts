// 把不可信文本（角色记忆、事件描述）放进 prompt 前的清洗。
// 只做三件事：去控制字符、去分隔标签、限长。语义内容不动。
//
// 去标签分两步：先按名字去 memory/event 标签（正常情况下输出干净，不留标签词本身），
// 再兜底清空所有尖括号。第二步是关键——单趟按名字匹配的 replace 从左到右扫一遍不回头，
// 如果原文里标签是嵌套/拆分写的（比如把 memory 拆成 "<mem" + "<memory>" + "ory>"），
// 第一步去掉内层标签后，残留的左右片段会拼成一个新的活标签，和经典的
// <script> 过滤被拆分重组绕过是同一类问题。第二步不认标签名、见到尖括号就删，
// 不管前面拼出了什么都会被清空，从根上堵死这种重组逃逸。
// 这些字段本就是纯文本描述，不预期含标记语言，所以正文里如果真的出现尖括号也会被一并删掉。
export function sanitizeForPrompt(text: string, maxLength = 500): string {
  let out = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  out = out.replace(/<\/?(memory|event)>/gi, '');
  out = out.replace(/[<>]/g, '');
  if (out.length > maxLength) {
    out = out.slice(0, maxLength) + '…';
  }
  return out;
}
