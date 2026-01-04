// src/services/GasApi.ts

declare global {
  interface Window {
    google?: any;
  }
}

function callGas<T = any>(fnName: string, ...args: any[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const g = window.google;
    if (!g?.script?.run) {
      reject(new Error("google.script.run이 없습니다. (GAS 웹앱/HtmlService 환경에서만 동작)"));
      return;
    }

    try {
      g.script.run
        .withSuccessHandler((res: any) => {
          // 서버에서 {ok:false} 형태면 에러 처리
          if (res && res.ok === false) {
            reject(new Error(res.message || "Server error"));
            return;
          }
          // 서버에서 {value:...}로 주면 value를 우선 사용
          resolve(res?.value !== undefined ? res.value : res);
        })
        .withFailureHandler((err: any) => {
          reject(new Error(err?.message || String(err)));
        })[fnName](...args);
    } catch (e: any) {
      reject(new Error(e?.message || String(e)));
    }
  });
}

export const getWebAppUrl = () => callGas<string>("getWebAppUrl");

export const listGetAppConfig = () => callGas<any>("listGetAppConfig");
export const listGetQuoteList = (keyword = "") => callGas<any>("listGetQuoteList", keyword);
export const listGetQuoteDetail = (quoteId: string) => callGas<any>("listGetQuoteDetail", quoteId);
export const listUpdateQuote = (quoteId: string, payload: any) => callGas<any>("listUpdateQuote", quoteId, payload);

export const listPreviewQuotePdfUrl = (quoteId: string) => callGas<any>("listPreviewQuotePdfUrl", quoteId);
export const listSendQuoteEmail = (quoteId: string, toEmail: string) => callGas<any>("listSendQuoteEmail", quoteId, toEmail);

export const listPreviewStatementPdfUrl = (quoteId: string) => callGas<any>("listPreviewStatementPdfUrl", quoteId);
export const listSendStatementEmail = (quoteId: string, toEmail: string) => callGas<any>("listSendStatementEmail", quoteId, toEmail);

export const listGetRentalContractPrefill = (quoteId: string) => callGas<any>("listGetRentalContractPrefill", quoteId);
export const listSaveRentalContract = (quoteId: string, form: any) => callGas<any>("listSaveRentalContract", quoteId, form);
export const listPreviewRentalContractPdfUrl = (quoteId: string) => callGas<any>("listPreviewRentalContractPdfUrl", quoteId);
export const listSendRentalContractEmail = (quoteId: string, toEmail: string) =>
  callGas<any>("listSendRentalContractEmail", quoteId, toEmail);

export const searchOptions = (keyword: string) => callGas<any>("searchOptions", keyword);
