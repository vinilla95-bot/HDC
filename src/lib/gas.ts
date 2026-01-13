// src/lib/gas.ts
const GAS_URL = "https://script.google.com/macros/s/AKfycbyTGGQnxlfFpqP5zS0kf7m9kzSK29MGZbeW8GUMlAja04mRJHRszuRdpraPdmOWxNNr/exec";

function unwrap<T>(res: any): T {
  if (!res) throw new Error("Empty response from GAS");
  if (res.ok === false) throw new Error(res.message || "GAS error");
  if (res.value !== undefined) return res.value as T;
  return res as T;
}

async function gasPost<T>(fn: string, ...args: any[]): Promise<T> {
  const r = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fn, args }),
  });
  if (!r.ok) throw new Error(`GAS HTTP ${r.status}`);
  const json = await r.json();
  return unwrap<T>(json);
}

/** ✅ 견적서 PDF 미리보기 URL */
export async function listPreviewQuotePdfUrl(quoteId: string) {
  return gasPost<{ url: string; fileName?: string }>("listPreviewQuotePdfUrl", quoteId);
}

/** ✅ 거래명세서 PDF 미리보기 URL */
export async function listPreviewStatementPdfUrl(quoteId: string) {
  return gasPost<{ url: string; fileName?: string }>("listPreviewStatementPdfUrl", quoteId);
}

/** ✅ 견적서 메일 전송 */
export async function listSendQuoteEmail(quoteId: string, toEmail: string) {
  return gasPost<{ ok: true; pdfUrl?: string }>("listSendQuoteEmail", quoteId, toEmail);
}

/** ✅ 거래명세서 메일 전송 */
export async function listSendStatementEmail(quoteId: string, toEmail: string) {
  return gasPost<{ ok: true; pdfUrl?: string }>("listSendStatementEmail", quoteId, toEmail);
}

/** ✅ 임대차: 프리필 불러오기 */
export async function listGetRentalContractPrefill(quoteId: string) {
  return gasPost<any>("listGetRentalContractPrefill", quoteId);
}

/** ✅ 임대차: 저장 */
export async function listSaveRentalContract(quoteId: string, form: any) {
  return gasPost<any>("listSaveRentalContract", quoteId, form);
}

/** ✅ 임대차: PDF 미리보기 URL */
export async function listPreviewRentalContractPdfUrl(quoteId: string) {
  return gasPost<{ url: string; fileName?: string }>("listPreviewRentalContractPdfUrl", quoteId);
}

/** ✅ 임대차: 메일 전송 */
export async function listSendRentalContractEmail(quoteId: string, toEmail: string) {
  return gasPost<any>("listSendRentalContractEmail", quoteId, toEmail);
}
