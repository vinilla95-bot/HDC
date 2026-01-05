import React, { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { supabase } from "../lib/supabase";
import { gasRpc as gasRpcRaw } from "../lib/gasRpc";
import { matchKorean, calculateOptionLine } from "../QuoteService";

type SupabaseOptionRow = {
  option_id: string;
  option_name: string;
  unit?: string;
  unit_price?: number;
  keywords?: string;
};

/** =========================
 *  Types (DB 컬럼 기준)
 * ========================= */
type QuoteRow = {
  quote_id: string;
  version: string | number | null;
  quote_title: string | null;

  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;

  site_name: string | null;
  site_addr: string | null;

  spec: string | null;
  w: number | null;
  l: number | null;

  product: string | null;
  qty: number | null;
  memo: string | null;

  contract_start: string | null;

  supply_amount: number | null;
  vat_amount: number | null;
  total_amount: number | null;

  pdf_url: string | null;
  statement_url: string | null;

  created_at: string | null;
  updated_at: string | null;

  items: any; // jsonb
  bizcard_id: string | null;
};

type QuoteItem = {
  CATEGORY?: any;
  ITEM_NAME?: any;
  UNIT?: any;
  QTY?: any;
  UNIT_PRICE?: any;
  AMOUNT?: any;
  NOTE?: any;

  // snake_case 방어
  category?: any;
  item_name?: any;
  unit?: any;
  qty?: any;
  unit_price?: any;
  amount?: any;
  note?: any;

  // 프론트 케이스 방어
  itemName?: any;
  optionName?: any;
  displayName?: any;
  unitPrice?: any;
};

function money(n: any) {
  const num = Number(n || 0);
  return num.toLocaleString("ko-KR");
}

function escapeHtml(s: any) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatKoDate(v: any) {
  if (!v) return "";
  const d = new Date(String(v));
  if (!isNaN(d.getTime())) {
    const wk = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day} (${wk})`;
  }
  return String(v);
}

function pickItems(row: QuoteRow | null): QuoteItem[] {
  if (!row) return [];

  // 1) payload 구조(구버전) 우선
  const p = (row as any).payload || {};
  const fromPayload = p.items || p.lineItems || p.rows;
  if (Array.isArray(fromPayload)) return fromPayload;

  // 2) 현재 Supabase: row.items (jsonb)
  const fromRow = (row as any).items;
  if (Array.isArray(fromRow)) return fromRow;

  // 3) string JSON 방어
  if (typeof fromRow === "string") {
    try {
      const parsed = JSON.parse(fromRow);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.items)) return parsed.items;
    } catch (e) {}
  }

  return [];
}

function normItem(it: QuoteItem) {
  const category = it.CATEGORY ?? it.category ?? it["CATEGORY"] ?? it["category"] ?? "";
  const name =
    it.ITEM_NAME ??
    it.itemName ??
    it.optionName ??
    it.displayName ??
    it.item_name ??
    it["ITEM_NAME"] ??
    it["item_name"] ??
    "";
  const unit = it.UNIT ?? it.unit ?? it["UNIT"] ?? it["unit"] ?? "";
  const qty = Number(it.QTY ?? it.qty ?? it["QTY"] ?? it["qty"] ?? 0);

  const unitPrice = Number(
    it.UNIT_PRICE ?? it.unitPrice ?? it.unit_price ?? it["UNIT_PRICE"] ?? it["unit_price"] ?? 0
  );

  // ✅ amount는 세전 공급가 (단가 × 수량)
  const amount = Number(
    it.AMOUNT ?? it.amount ?? it["AMOUNT"] ?? it["amount"] ?? (qty * unitPrice)
  );

  const note = it.NOTE ?? it.note ?? it["NOTE"] ?? it["note"] ?? "";
  return { category, name, unit, qty, unitPrice, amount, note };
}

/** =========================
 *  GAS 연결 (단일 통로 / 충돌 제거)
 * ========================= */
async function gasCall<T = any>(fn: string, args: any[] = []): Promise<T> {
  const res: any = await gasRpcRaw(fn, args);

  if (res && res.ok === false) {
    throw new Error(res.message || "GAS error");
  }
  return res && typeof res === "object" && "value" in res ? (res.value as T) : (res as T);
}

function pickUrl(out: any) {
  return out?.url || out?.viewUrl || out?.fileUrl;
}

async function previewStatementPdfUrl(quoteId: string) {
  const out = await gasCall<any>("listPreviewStatementPdfUrl", [quoteId]);
  const url = pickUrl(out);
  if (!url) throw new Error("PDF URL이 비어있어. GAS(listPreviewStatementPdfUrl) 반환값을 확인해줘.");
  return { url, fileName: out?.fileName || "거래명세서 미리보기" };
}

async function sendQuoteEmailApi(quoteId: string, to: string, html?: string, bizcardImageUrl?: string) {
  await gasCall("listSendQuoteEmail", [quoteId, to, html, bizcardImageUrl]);
}

async function sendStatementEmailApi(quoteId: string, to: string, bizcardImageUrl?: string) {
  await gasCall("listSendStatementEmail", [quoteId, to, bizcardImageUrl]);
}

async function previewRentalContractPdfUrl(quoteId: string) {
  const out = await gasCall<any>("listPreviewRentalContractPdfUrl", [quoteId]);
  const url = pickUrl(out);
  if (!url) throw new Error("PDF URL이 비어있어. GAS(listPreviewRentalContractPdfUrl) 반환값을 확인해줘.");
  return { url, fileName: out?.fileName || "임대차계약서 미리보기" };
}

async function sendRentalContractEmailApi(quoteId: string, to: string, bizcardImageUrl?: string) {
  await gasCall("listSendRentalContractEmail", [quoteId, to, bizcardImageUrl]);
}

async function getRentalPrefill(quoteId: string) {
  return await gasCall<any>("listGetRentalContractPrefill", [quoteId]);
}

async function saveRentalDraft(quoteId: string, form: any) {
  return await gasCall<any>("listSaveRentalContract", [quoteId, form]);
}

async function saveJpgToDriveApi(quoteId: string, dataUrl: string) {
  return await gasCall<any>("listSaveJpgToDrive", [quoteId, dataUrl]);
}

export default function QuoteListPage({ onGoLive }: { onGoLive?: () => void }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState<QuoteRow | null>(null);

  // 모달들
  const [sendOpen, setSendOpen] = useState(false);
  const [stmtOpen, setStmtOpen] = useState(false);
  const [rentalOpen, setRentalOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfTitle, setPdfTitle] = useState("미리보기");
  const [pdfUrl, setPdfUrl] = useState<string>("about:blank");

  const [sendTo, setSendTo] = useState("");
  const [sendStatus, setSendStatus] = useState("");

  const [stmtTo, setStmtTo] = useState("");
  const [stmtStatus, setStmtStatus] = useState("");

  // 임대차
  const [rentalTo, setRentalTo] = useState("");
  const [rentalStatus, setRentalStatus] = useState("");
  const [rentalForm, setRentalForm] = useState<any>(null);

  // 견적 수정
  const [editForm, setEditForm] = useState<any>(null);
  const [options, setOptions] = useState<SupabaseOptionRow[]>([]);
  const [optQ, setOptQ] = useState("");

  // 명함
  const [bizcards, setBizcards] = useState<any[]>([]);
  const [selectedBizcardId, setSelectedBizcardId] = useState("");

  // 이미지 URL을 base64로 변환
  const imageUrlToBase64 = async (url: string): Promise<string> => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return url;
    }
  };

  const toastRef = useRef<HTMLDivElement | null>(null);
  const toastTimer = useRef<number | null>(null);

  // 2단계 전송 ARM (거래명세서, 임대차만 사용)
  const ARM_TTL_MS = 10 * 60 * 1000;
  const [armStmt, setArmStmt] = useState<{ quoteId: string; armedAt: number } | null>(null);
  const [armRental, setArmRental] = useState<{ quoteId: string; armedAt: number } | null>(null);

  function toast(msg: string) {
    const el = toastRef.current;
    if (!el) return;
    el.textContent = msg;
    el.style.display = "block";
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      el.style.display = "none";
    }, 2200);
  }

  function armExpired(armedAt: number) {
    return !armedAt || Date.now() - armedAt > ARM_TTL_MS;
  }

  function requireCurrent() {
    if (!current?.quote_id) {
      toast("먼저 견적을 선택해주세요.");
      throw new Error("no current quote");
    }
  }

  async function loadList(keyword = ""): Promise<void> {
    setLoading(true);

    try {
      const selectCols = [
        "quote_id",
        "version",
        "quote_title",
        "customer_name",
        "customer_phone",
        "customer_email",
        "site_name",
        "site_addr",
        "spec",
        "w",
        "l",
        "product",
        "qty",
        "memo",
        "contract_start",
        "supply_amount",
        "vat_amount",
        "total_amount",
        "pdf_url",
        "statement_url",
        "created_at",
        "updated_at",
        "items",
        "bizcard_id",
      ].join(",");

      let query = supabase
        .from("quotes")
        .select(selectCols)
        .order("created_at", { ascending: false })
        .limit(200);

      const kw = (keyword || "").trim();
      if (kw) {
        const like = `%${kw}%`;
        query = query.or(
          [
            `quote_id.ilike.${like}`,
            `customer_name.ilike.${like}`,
            `spec.ilike.${like}`,
            `quote_title.ilike.${like}`,
            `site_name.ilike.${like}`,
          ].join(",")
        );
      }

      const { data, error } = await query;
      if (error) throw error;

      setList(((data ?? []) as unknown) as QuoteRow[]);
    } catch (e: any) {
      console.error(e);
      toast("목록 로드 실패: " + (e?.message || String(e)));
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  const previewHtml = useMemo(() => {
    if (!current) return `<div class="a4Wrap"><div class="a4Sheet" style="display:flex;align-items:center;justify-content:center;color:#999;">왼쪽에서 견적을 선택하세요.</div></div>`;

    const p = (current as any).payload || {};
    const header = p.header || {};

    const customerName = header.customerName ?? current.customer_name ?? "(고객명)";
    const customerEmail = header.customerEmail ?? current.customer_email ?? "";
    const customerPhone = header.customerPhone ?? current.customer_phone ?? "";
    const siteName = header.siteName ?? current.site_name ?? "";
    const spec = header.spec ?? current.spec ?? "";
    
    const supplyAmount = header.supplyAmount ?? current.supply_amount ?? (Number(current.total_amount || 0) - Number(current.vat_amount || 0));
    const vatAmount = header.vatAmount ?? current.vat_amount ?? Math.round((Number(current.total_amount || 0) || 0) * 0.1);
    const totalAmount = header.totalAmount ?? current.total_amount ?? 0;

    const items = pickItems(current);
    const MIN_ROWS = 12;

    const today = new Date();
    const ymd = today.toISOString().slice(0, 10);

    const itemRows = items.map((raw, idx) => {
  const it = normItem(raw);
  const unitSupply = Number(it.unitPrice ?? 0);
  const qty = Number(it.qty ?? 0);
  const supply = unitSupply * qty;
  const vat = Math.round(supply * 0.1);

  // ✅ show_spec이 'y'인 경우만 규격 표시
  const showSpec = String((raw as any).showSpec || "").toLowerCase() === "y";
  const specText = showSpec ? escapeHtml(spec) : "";

  return `<tr style="display:table-row;"><td style="border:1px solid #333;padding:6px;text-align:center;">${idx + 1}</td><td style="border:1px solid #333;padding:6px;text-align:left;">${escapeHtml(it.name)}</td><td style="border:1px solid #333;padding:6px;text-align:center;">${specText}</td><td style="border:1px solid #333;padding:6px;text-align:center;">${qty}</td><td style="border:1px solid #333;padding:6px;text-align:right;">${money(unitSupply)}</td><td style="border:1px solid #333;padding:6px;text-align:right;">${money(supply)}</td><td style="border:1px solid #333;padding:6px;text-align:right;">${money(vat)}</td><td style="border:1px solid #333;padding:6px;"></td></tr>`;
});
    const blanks = Math.max(0, MIN_ROWS - items.length);
    for (let i = 0; i < blanks; i++) {
      itemRows.push(`<tr style="display:table-row;height:28px;"><td style="border:1px solid #333;padding:6px;">&nbsp;</td><td style="border:1px solid #333;padding:6px;"></td><td style="border:1px solid #333;padding:6px;"></td><td style="border:1px solid #333;padding:6px;"></td><td style="border:1px solid #333;padding:6px;"></td><td style="border:1px solid #333;padding:6px;"></td><td style="border:1px solid #333;padding:6px;"></td><td style="border:1px solid #333;padding:6px;"></td></tr>`);
    }

    const tbodyHtml = itemRows.join('');

    const fullHtml = `
      <div style="display:flex;justify-content:center;padding:14px 0;background:#f5f6f8;">
        <div style="width:794px;min-height:1123px;background:#fff;border:1px solid #cfd3d8;padding:16px;box-sizing:border-box;">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 2px 10px;border-bottom:2px solid #2e5b86;margin-bottom:10px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <img src="https://i.postimg.cc/VvsGvxFP/logo1.jpg" alt="logo" style="width:110px;height:auto;" />
            </div>

            <div style="flex:1;text-align:center;font-size:34px;font-weight:900;letter-spacing:6px;">견 적 서</div>

            <div style="width:140px;"></div>
          </div>

          <table style="width:100%;border-collapse:collapse;table-layout:fixed;border:1px solid #333;margin-top:8px;">
            <colgroup>
              <col style="width: 15%" />
              <col style="width: 18%" />
              <col style="width: 12%" />
              <col style="width: 18%" />
              <col style="width: 15%" />
              <col style="width: 22%" />
            </colgroup>
            <tbody style="display:table-row-group;">
              <tr style="display:table-row;">
                <th style="border:1px solid #333;padding:6px;font-weight:900;">NO.</th>
                <td style="border:1px solid #333;padding:6px;" colspan="3"></td>
                <th style="border:1px solid #333;padding:6px;font-weight:900;">견적일자 :</th>
                <td style="border:1px solid #333;padding:6px;">${ymd}</td>
              </tr>

              <tr style="display:table-row;">
                <th style="border:1px solid #333;padding:6px;font-weight:900;">고객명</th>
                <td style="border:1px solid #333;padding:6px;">${escapeHtml(customerName)}</td>
                <th style="border:1px solid #333;padding:6px;font-weight:900;text-align:center;">귀하</th>
                <td style="border:1px solid #333;padding:6px;"></td>
                <th style="border:1px solid #333;padding:6px;font-weight:900;">등록번호</th>
                <td style="border:1px solid #333;padding:6px;">130-41-38154</td>
              </tr>

              <tr style="display:table-row;">
                <th style="border:1px solid #333;padding:6px;font-weight:900;">이메일</th>
                <td style="border:1px solid #333;padding:6px;">${escapeHtml(customerEmail)}</td>
                <th style="border:1px solid #333;padding:6px;font-weight:900;text-align:center;">전화</th>
                <td style="border:1px solid #333;padding:6px;">${escapeHtml(customerPhone)}</td>
                <th style="border:1px solid #333;padding:6px;font-weight:900;">상호</th>
                <td style="border:1px solid #333;padding:6px;">현대컨테이너</td>
              </tr>

              <tr style="display:table-row;">
                <th style="border:1px solid #333;padding:6px;font-weight:900;">현장</th>
                <td style="border:1px solid #333;padding:6px;">${escapeHtml(siteName)}</td>
                <th style="border:1px solid #333;padding:6px;font-weight:900;text-align:center;">견적일</th>
                <td style="border:1px solid #333;padding:6px;">${today.toLocaleDateString("ko-KR")}</td>
                <th style="border:1px solid #333;padding:6px;font-weight:900;">주소</th>
                <td style="border:1px solid #333;padding:6px;">경기도 화성시<br />향남읍 구문천안길16</td>
              </tr>

              <tr style="display:table-row;">
                <td style="border:1px solid #333;padding:6px;font-weight:700;text-align:center;" colspan="4">
                  견적요청에 감사드리며 아래와 같이 견적합니다.
                </td>
                <th style="border:1px solid #333;padding:6px;font-weight:900;">전화</th>
                <td style="border:1px solid #333;padding:6px;">1688-1447</td>
              </tr>

              <tr style="display:table-row;">
                <td style="border:1px solid #333;padding:6px;font-weight:900;" colspan="6">
                  합계금액 : ₩${money(totalAmount)} (부가세 포함)
                </td>
              </tr>
            </tbody>
          </table>

          <table style="width:100%;border-collapse:collapse;table-layout:fixed;border:1px solid #333;margin-top:8px;">
            <colgroup>
              <col style="width: 5%" />
              <col style="width: 35%" />
              <col style="width: 10%" />
              <col style="width: 8%" />
              <col style="width: 13%" />
              <col style="width: 11%" />
              <col style="width: 9%" />
              <col style="width: 9%" />
            </colgroup>

            <thead>
              <tr style="display:table-row;">
                <th style="border:1px solid #333;padding:6px;background:#e6e6e6;font-weight:900;text-align:center;">순번</th>
                <th style="border:1px solid #333;padding:6px;background:#e6e6e6;font-weight:900;text-align:center;">품목</th>
                <th style="border:1px solid #333;padding:6px;background:#e6e6e6;font-weight:900;text-align:center;">규격</th>
                <th style="border:1px solid #333;padding:6px;background:#e6e6e6;font-weight:900;text-align:center;">수량</th>
                <th style="border:1px solid #333;padding:6px;background:#e6e6e6;font-weight:900;text-align:center;">단가</th>
                <th style="border:1px solid #333;padding:6px;background:#e6e6e6;font-weight:900;text-align:center;">공급가</th>
                <th style="border:1px solid #333;padding:6px;background:#e6e6e6;font-weight:900;text-align:center;">세액</th>
                <th style="border:1px solid #333;padding:6px;background:#e6e6e6;font-weight:900;text-align:center;">비고</th>
              </tr>
            </thead>

            <tbody style="display:table-row-group;">
              ${itemRows.join('')}
            </tbody>
          </table>

          <table style="width:100%;border-collapse:collapse;table-layout:fixed;border:1px solid #333;margin-top:8px;">
            <colgroup>
              <col style="width: 18%" />
              <col style="width: auto" />
              <col style="width: 15%" />
              <col style="width: 12%" />
              <col style="width: 13%" />
            </colgroup>
            <tbody style="display:table-row-group;">
              <tr style="display:table-row;">
                <td style="border:1px solid #333;padding:6px;background:#e6e6e6;font-weight:900;text-align:left;" colspan="2">
                  합계: ${money(totalAmount)}원 (총공급가액 ${money(supplyAmount)} / 총세액 ${money(vatAmount)})
                </td>
                <td style="border:1px solid #333;padding:6px;background:#e6e6e6;font-weight:900;text-align:right;">${money(supplyAmount)}</td>
                <td style="border:1px solid #333;padding:6px;background:#e6e6e6;font-weight:900;text-align:right;">${money(vatAmount)}</td>
                <td style="border:1px solid #333;padding:6px;background:#e6e6e6;font-weight:900;text-align:right;">${money(totalAmount)}</td>
              </tr>

              <tr style="display:table-row;">
                <th style="border:1px solid #333;padding:6px;background:#e6e6e6;font-weight:900;text-align:center;">결제조건</th>
                <td style="border:1px solid #333;padding:6px;font-size:12px;line-height:1.55;" colspan="4">
                  계약금 50%입금 후 도면제작 및 확인/착수, 선 완불 후 출고
                </td>
              </tr>

              <tr style="display:table-row;">
                <th style="border:1px solid #333;padding:6px;background:#e6e6e6;font-weight:900;text-align:center;">주의사항</th>
                <td style="border:1px solid #333;padding:6px;font-size:12px;line-height:1.55;" colspan="4">
                  *견적서는 견적일로 부터 2주간 유효합니다.
                  <br />
                  1. 하차비 별도(당 지역 지게차 혹은 크레인 이용)
                  <br />
                  2. 주문 제작시 50퍼센트 입금 후 제작, 완불 후 출고.
                  <br />
                  *출고 전날 오후 2시 이전 잔금 결제 조건*
                  <br />
                  3. 하차, 회수시 상차 별도(당 지역 지게차 혹은 크레인 이용)
                </td>
              </tr>

              <tr style="display:table-row;">
                <th style="border:1px solid #333;padding:6px;background:#e6e6e6;font-weight:900;text-align:center;">중요사항</th>
                <td style="border:1px solid #333;padding:6px;font-size:12px;line-height:1.55;" colspan="4">
                  *중요사항*
                  <br />
                  1. 인적사항 요구 현장시 운임비 3만원 추가금 발생합니다.
                  <br />
                  2. 기본 전기는 설치 되어 있으나 주택용도 전선관은 추가되어 있지 않습니다.
                  <br />
                  한전/전기안전공사 측에서 전기연결 예정이신 경우 전선관 옵션을 추가하여 주시길 바랍니다.
                  <br />
                  해당사항은 고지의무사항이 아니므로 상담을 통해 확인하시길 바랍니다.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    return fullHtml;
  }, [current]);

  async function downloadJpg() {
    requireCurrent();
    const el = document.getElementById("quotePreview");
    if (!el) return;

    toast("JPG 생성 중...");
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `QUOTE_${current!.quote_id}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    toast("다운로드 완료");
  }

  function handlePrint() {
    requireCurrent();
    window.print();
  }

  async function handleDelete() {
    requireCurrent();
    
    const confirmed = window.confirm(
      `정말 삭제하시겠습니까?\n\n견적번호: ${current!.quote_id}\n고객명: ${current!.customer_name || ""}\n\n이 작업은 되돌릴 수 없습니다.`
    );
    
    if (!confirmed) return;
    
    try {
      toast("삭제 중...");
      
      const { error } = await supabase
        .from("quotes")
        .delete()
        .eq("quote_id", current!.quote_id);
      
      if (error) throw error;
      
      toast("삭제 완료!");
      setCurrent(null);
      await loadList(q);
    } catch (e: any) {
      toast("삭제 실패: " + (e?.message || String(e)));
      console.error("handleDelete error:", e);
    }
  }

  function closePdfPreview() {
    setPdfOpen(false);
    setPdfUrl("about:blank");
  }

  async function openSendModal() {
    requireCurrent();
    setSendTo("");
    setSendStatus("");
    setSendOpen(true);
  }

  async function openStmtModal() {
    requireCurrent();
    setStmtTo("");
    setStmtStatus("");
    setArmStmt(null);
    setStmtOpen(true);
  }

  async function openRentalModal() {
    requireCurrent();
    setRentalTo("");
    setRentalStatus("");
    setArmRental(null);
    setRentalOpen(true);

    try {
      const pre = await getRentalPrefill(current!.quote_id);
      setRentalForm(pre);
      setRentalTo(String(pre?.email || current?.customer_email || "").trim());
    } catch (e: any) {
      setRentalForm(null);
      setRentalStatus("프리필 실패: " + (e?.message || String(e)));
    }
  }

  async function openEditModal() {
    requireCurrent();

    const items = pickItems(current).map((raw) => {
      const it = normItem(raw);
      return {
        category: it.category,
        name: it.name,
        unit: it.unit,
        qty: it.qty,
        unitPrice: it.unitPrice,
        amount: it.amount,
        note: it.note,
      };
    });

    setEditForm({
      quote_title: current!.quote_title || "",
      customer_name: current!.customer_name || "",
      customer_phone: current!.customer_phone || "",
      customer_email: current!.customer_email || "",
      site_name: current!.site_name || "",
      site_addr: current!.site_addr || "",
      spec: current!.spec || "",
      w: current!.w || 0,
      l: current!.l || 0,
      product: current!.product || "",
      qty: current!.qty || 1,
      memo: current!.memo || "",
      items: items,
    });

    setOptQ(""); // 옵션 검색 초기화
    setEditOpen(true);
  }

  // ✅ 견적서 바로 전송 (미리보기 없음, HTML 양식 포함)
  async function sendQuoteEmail() {
    requireCurrent();
    const quoteId = current!.quote_id;
    const to = sendTo.trim() || (current!.customer_email || "").trim();

    if (!to) {
      setSendStatus("수신 이메일이 비어있습니다.");
      return;
    }

    try {
      setSendStatus("PDF 준비 중...");
      
      // ✅ 로고 이미지를 base64로 변환
      const logoUrl = "https://i.postimg.cc/VvsGvxFP/logo1.jpg";
      const logoBase64 = await imageUrlToBase64(logoUrl);
      const processedHtml = previewHtml.replace(
        new RegExp(logoUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), 
        logoBase64
      );
      
      setSendStatus("메일 전송 중...");
      const selectedBizcard = bizcards.find((b: any) => b.id === selectedBizcardId);
      const bizcardImageUrl = selectedBizcard?.image_url || "";
      await sendQuoteEmailApi(quoteId, to, processedHtml, bizcardImageUrl);
      setSendStatus("전송 완료!");
      toast("견적서 메일 전송 완료");
      setSendOpen(false);
      loadList(q);
    } catch (e: any) {
      setSendStatus("전송 실패: " + (e?.message || String(e)));
      toast("메일 전송 실패");
    }
  }

  async function sendStatementEmail() {
    requireCurrent();
    const quoteId = current!.quote_id;
    const to = stmtTo.trim() || (current!.customer_email || "").trim();

    if (!to) {
      setStmtStatus("수신 이메일이 비어있어.");
      return;
    }

    // 2차 전송
    if (armStmt && armStmt.quoteId === quoteId && !armExpired(armStmt.armedAt)) {
      try {
        setStmtStatus("전송 중...");
        const selectedBizcard = bizcards.find((b: any) => b.id === selectedBizcardId);
        const bizcardImageUrl = selectedBizcard?.image_url || "";
        await sendStatementEmailApi(quoteId, to, bizcardImageUrl);
        setStmtStatus("완료!");
        setArmStmt(null);
        closePdfPreview();
        toast("거래명세서 전송 완료");
        loadList(q);
      } catch (e: any) {
        setStmtStatus("실패: " + (e?.message || String(e)));
        toast("거래명세서 전송 실패");
      }
      return;
    }

    // 1차 미리보기
    try {
      setStmtStatus("미리보기 생성 중...");
      const out = await previewStatementPdfUrl(quoteId);
      setPdfTitle(out.fileName || "거래명세서 미리보기");
      setPdfUrl(out.url);
      setPdfOpen(true);

      setArmStmt({ quoteId, armedAt: Date.now() });
      setStmtStatus("미리보기 확인 후 전송을 한 번 더 눌러주세요.");
      toast("미리보기 열림");
    } catch (e: any) {
      setStmtStatus("미리보기 실패: " + (e?.message || String(e)));
      toast("미리보기 실패");
    }
  }

  async function saveEdit() {
    if (!current || !editForm) return;

    try {
      toast("저장 중...");

      // items 필드명을 App.tsx와 동일하게 맞춤
      const itemsToSave = editForm.items.map((it: any, idx: number) => ({
        optionId: it.optionId || `ITEM_${idx + 1}`,
        optionName: it.name || "",
        itemName: it.name || "",
        unit: it.unit || "EA",
        qty: Number(it.qty) || 0,
        unitPrice: Number(it.unitPrice) || 0,
        amount: Number(it.amount) || 0,
        memo: it.note || "",
      }));

      // supply_amount, vat_amount, total_amount 재계산
      const supply_amount = itemsToSave.reduce((acc: number, it: any) => acc + Number(it.amount || 0), 0);
      const vat_amount = Math.round(supply_amount * 0.1);
      const total_amount = supply_amount + vat_amount;

      // update 사용
      const { error, data } = await supabase
        .from("quotes")
        .update({
          quote_title: editForm.quote_title,
          customer_name: editForm.customer_name,
          customer_phone: editForm.customer_phone,
          customer_email: editForm.customer_email,
          site_name: editForm.site_name,
          site_addr: editForm.site_addr,
          spec: editForm.spec,
          w: Number(editForm.w) || null,
          l: Number(editForm.l) || null,
          product: editForm.product,
          qty: Number(editForm.qty) || 1,
          memo: editForm.memo,
          items: itemsToSave,
          supply_amount,
          vat_amount,
          total_amount,
          updated_at: new Date().toISOString(),
        })
        .eq("quote_id", current.quote_id)
        .select();

      if (error) throw error;

      // 실제로 업데이트 되었는지 확인
      if (!data || data.length === 0) {
        // 다시 조회해서 확인
        const { data: checkData } = await supabase
          .from("quotes")
          .select("*")
          .eq("quote_id", current.quote_id)
          .single();
        
        if (checkData) {
          toast("저장 완료!");
          setOptQ("");
          setEditOpen(false);
          await loadList(q);
          setCurrent(checkData as QuoteRow);
          return;
        } else {
          throw new Error("업데이트가 반영되지 않았습니다.");
        }
      }

      toast("저장 완료!");
      setOptQ("");
      setEditOpen(false);
      
      // 목록 새로고침 후 현재 선택된 견적도 업데이트
      await loadList(q);
      setCurrent(data[0] as QuoteRow);
    } catch (e: any) {
      toast("저장 실패: " + (e?.message || String(e)));
      console.error("saveEdit error:", e);
    }
  }

  // 옵션 검색 결과 필터링
  const filteredOptions = useMemo(() => {
  const query = String(optQ || "").trim();
  if (!query) return [];

  const matched = options.filter((o: any) => {
    const name = String(o.option_name || "");
    return matchKorean(name, query);  // option_name만 검색
  });

  // ✅ 정렬: 검색어로 시작 > 검색어 포함 > 초성 매칭
  const qLower = query.toLowerCase();
  matched.sort((a: any, b: any) => {
    const nameA = String(a.option_name || "").toLowerCase();
    const nameB = String(b.option_name || "").toLowerCase();
    
    const startsA = nameA.startsWith(qLower) ? 0 : 1;
    const startsB = nameB.startsWith(qLower) ? 0 : 1;
    if (startsA !== startsB) return startsA - startsB;
    
    const includesA = nameA.includes(qLower) ? 0 : 1;
    const includesB = nameB.includes(qLower) ? 0 : 1;
    return includesA - includesB;
  });

  return matched.slice(0, 12);
}, [optQ, options]);
  // 옵션 검색에서 선택하여 추가 (App.tsx와 동일한 로직)
  function addOptionFromSearch(opt: any) {
  if (!editForm) return;
  
  const w = Number(editForm.w) || 3;
  const l = Number(editForm.l) || 6;
  const res = calculateOptionLine(opt, w, l);
  
  const rawName = String(opt.option_name || "(이름없음)");
  const rent = rawName.trim() === "임대";

  const baseQty = Number(res.qty || 1);
  const baseUnitPrice = Number(res.unitPrice || 0);
  const baseAmount = Number(res.amount || baseQty * baseUnitPrice);

  const displayQty = rent ? baseQty : 1;
  const customerUnitPrice = rent ? baseUnitPrice : baseAmount;
  const finalAmount = Math.round(displayQty * customerUnitPrice);

  // ✅ show_spec 저장
  const showSpec = String(opt.show_spec || "").toLowerCase();

  setEditForm((prev: any) => ({
    ...prev,
    items: [
      ...prev.items,
      {
        category: "",
        name: rawName,
        unit: rent ? "개월" : (res.unit || "EA"),
        qty: displayQty,
        unitPrice: customerUnitPrice,
        amount: finalAmount,
        note: res.memo || "",
        showSpec,  // ✅ 추가
      },
    ],
  }));
  
  setOptQ("");
}
  function addItem() {
    setEditForm((prev: any) => ({
      ...prev,
      items: [
        ...prev.items,
        { category: "", name: "", unit: "EA", qty: 1, unitPrice: 0, amount: 0, note: "" },
      ],
    }));
  }

  function removeItem(index: number) {
    setEditForm((prev: any) => ({
      ...prev,
      items: prev.items.filter((_: any, i: number) => i !== index),
    }));
  }

  function updateItem(index: number, field: string, value: any) {
    setEditForm((prev: any) => {
      const newItems = [...prev.items];
      newItems[index] = { ...newItems[index], [field]: value };

      // 금액 자동 계산
      if (field === "qty" || field === "unitPrice") {
        const qty = Number(newItems[index].qty) || 0;
        const unitPrice = Number(newItems[index].unitPrice) || 0;
        newItems[index].amount = qty * unitPrice;
      }

      return { ...prev, items: newItems };
    });
  }

  async function saveRental() {
    requireCurrent();
    try {
      setRentalStatus("저장 중...");
      await saveRentalDraft(current!.quote_id, rentalForm || {});
      setRentalStatus("저장 완료");
      toast("임대차 저장 완료");
    } catch (e: any) {
      setRentalStatus("저장 실패: " + (e?.message || String(e)));
    }
  }

  async function sendRentalEmail() {
    requireCurrent();
    const quoteId = current!.quote_id;
    const to = rentalTo.trim() || (current!.customer_email || "").trim();

    if (!to) {
      setRentalStatus("수신 이메일이 비어있어.");
      return;
    }

    // 2차 전송
    if (armRental && armRental.quoteId === quoteId && !armExpired(armRental.armedAt)) {
      try {
        setRentalStatus("전송 중...");
        const selectedBizcard = bizcards.find((b: any) => b.id === selectedBizcardId);
        const bizcardImageUrl = selectedBizcard?.image_url || "";
        await sendRentalContractEmailApi(quoteId, to, bizcardImageUrl);
        setRentalStatus("완료!");
        setArmRental(null);
        closePdfPreview();
        toast("임대차계약서 전송 완료");
      } catch (e: any) {
        setRentalStatus("실패: " + (e?.message || String(e)));
        toast("임대차 전송 실패");
      }
      return;
    }

    // 1차 미리보기
    try {
      setRentalStatus("미리보기 생성 중...");
      const out = await previewRentalContractPdfUrl(quoteId);
      setPdfTitle(out.fileName || "임대차계약서 미리보기");
      setPdfUrl(out.url);
      setPdfOpen(true);

      setArmRental({ quoteId, armedAt: Date.now() });
      setRentalStatus("미리보기 확인 후 전송을 한 번 더 눌러주세요.");
      toast("미리보기 열림");
    } catch (e: any) {
      setRentalStatus("미리보기 실패: " + (e?.message || String(e)));
      toast("미리보기 실패");
    }
  }

  useEffect(() => {
    loadList("");
    
    // 옵션 목록 로드
    supabase
      .from("options")
      .select("*")
      .then(({ data }) => setOptions((data || []) as any));
    
    // 명함 목록 로드
    supabase
      .from("bizcards")
      .select("*")
      .then(({ data }) => {
        const list = (data || []) as any[];
        setBizcards(list);
        // 기본값: 고은희 명함
        const goeunhee = list.find((x: any) => String(x.name || "").includes("고은희"));
        if (goeunhee?.id) setSelectedBizcardId(goeunhee.id);
        else if (list[0]?.id) setSelectedBizcardId(list[0].id);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => loadList(q), 200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div
      style={{
        margin: 0,
        background: "#f6f7fb",
        fontFamily: 'Arial,"Noto Sans KR",sans-serif',
        color: "#111",
      }}
    >
      <style>{css}</style>

      <div className="app">
        {/* LEFT */}
        <div className="panel">
          <div className="hdr">
            <h1>견적 목록</h1>
            <span className="spacer" />
            <span className="badge">{loading ? "..." : String(list.length)}</span>
          </div>

          <div className="search">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="견적 검색 (견적번호/고객/규격/제목/현장)"
            />
          </div>

          <div className="list">
            {!loading && list.length === 0 ? (
              <div style={{ padding: 12 }} className="muted">
                검색 결과 없음
              </div>
            ) : null}

            {list.map((it) => (
              <div
                key={it.quote_id}
                className="item"
                onClick={() => {
                  setCurrent(it);
                }}
              >
                <div className="top">
                  <div>
                    <span className="badge">{escapeHtml(it.quote_title || "")}</span>
                  </div>
                  <div className="muted">{escapeHtml(formatKoDate(it.created_at || ""))}</div>
                </div>
                <div className="mid">{escapeHtml(it.customer_name || it.quote_id || "")}</div>
                <div className="bot">
                  <div>{it.spec ? "· " + escapeHtml(it.spec) : ""}</div>
                  <div>
                    <b>{money(it.total_amount)}</b>원
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT */}
        <div className="right">
          <div className="actions" style={{ justifyContent: "center" }}>
            <button onClick={() => (window.location.href = "/?view=rt")}>실시간견적</button>

            <button onClick={openEditModal}>견적수정</button>

            <button className="primary" onClick={openSendModal}>
              견적서보내기(메일)
            </button>

            <button onClick={openStmtModal}>거래명세서전송(메일)</button>

            <button onClick={downloadJpg}>JPG저장(다운로드)</button>

            <button onClick={openRentalModal}>임대차계약서</button>

            <button onClick={handlePrint}>인쇄</button>

            <button style={{ background: "#fee", borderColor: "#f99", color: "#c00" }} onClick={handleDelete}>
              삭제
            </button>
          </div>

          <div className="content">
            <div className="previewWrap">
              <div
                className="previewInner"
                id="quotePreview"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ✅ 견적서 전송 모달 (미리보기 없음) */}
      {sendOpen && (
        <div className="modal" style={{ display: "flex" }} onMouseDown={() => setSendOpen(false)}>
          <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHdr">
              <div style={{ fontWeight: 800 }}>견적서 메일 전송</div>
              <span className="spacer" />
              <button onClick={() => setSendOpen(false)}>닫기</button>
            </div>
            <div className="modalBody">
              <div className="muted" style={{ marginBottom: 8 }}>
                비워두면 견적에 등록된 이메일로 전송합니다.
              </div>
              <div className="row" style={{ marginBottom: 10 }}>
                <input
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                  placeholder="수신 이메일"
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    border: "1px solid #d7dbe2",
                    borderRadius: 10,
                  }}
                />
              </div>
              
              {/* 명함 선택 */}
              <div style={{ marginBottom: 10 }}>
                <div className="muted" style={{ marginBottom: 4 }}>명함 선택</div>
                <select
                  value={selectedBizcardId}
                  onChange={(e) => setSelectedBizcardId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #d7dbe2",
                    borderRadius: 10,
                  }}
                >
                  {bizcards.length === 0 && <option value="">(명함 없음)</option>}
                  {bizcards.map((b: any) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              
              <div className="row">
                <span className="spacer" />
                <button className="primary" onClick={sendQuoteEmail}>
                  전송
                </button>
              </div>
              <div className="muted" style={{ marginTop: 10 }}>
                {sendStatus}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STATEMENT MODAL */}
      {stmtOpen && (
        <div className="modal" style={{ display: "flex" }} onMouseDown={() => setStmtOpen(false)}>
          <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHdr">
              <div style={{ fontWeight: 800 }}>거래명세서 메일 전송</div>
              <span className="spacer" />
              <button onClick={() => setStmtOpen(false)}>닫기</button>
            </div>
            <div className="modalBody">
              <div className="muted" style={{ marginBottom: 8 }}>
                비워두면 견적에 등록된 이메일로 전송합니다.
              </div>
              <div className="row">
                <input
                  value={stmtTo}
                  onChange={(e) => setStmtTo(e.target.value)}
                  placeholder="수신 이메일"
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    border: "1px solid #d7dbe2",
                    borderRadius: 10,
                  }}
                />
                <button className="primary" onClick={sendStatementEmail}>
                  {armStmt && armStmt.quoteId === current?.quote_id && !armExpired(armStmt.armedAt)
                    ? "미리보기 확인 후 전송"
                    : "전송"}
                </button>
              </div>
              <div className="muted" style={{ marginTop: 10 }}>
                {stmtStatus}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RENTAL MODAL */}
      {rentalOpen && (
        <div className="modal" style={{ display: "flex" }} onMouseDown={() => setRentalOpen(false)}>
          <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHdr">
              <div style={{ fontWeight: 800 }}>임대차계약서</div>
              <span className="spacer" />
              <button onClick={() => setRentalOpen(false)}>닫기</button>
            </div>

            <div className="modalBody">
              <div className="muted" style={{ marginBottom: 8 }}>
                "저장" 먼저 하고, 미리보기 확인 후 전송 2단계로 진행됩니다.
              </div>

              <div className="row" style={{ marginBottom: 10 }}>
                <input
                  value={rentalTo}
                  onChange={(e) => setRentalTo(e.target.value)}
                  placeholder="수신 이메일"
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    border: "1px solid #d7dbe2",
                    borderRadius: 10,
                  }}
                />
                <button onClick={saveRental}>저장</button>
                <button className="primary" onClick={sendRentalEmail}>
                  {armRental && armRental.quoteId === current?.quote_id && !armExpired(armRental.armedAt)
                    ? "미리보기 확인 후 전송"
                    : "전송"}
                </button>
              </div>

              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                <input
                  value={(rentalForm?.contractStart ?? "") as any}
                  onChange={(e) =>
                    setRentalForm((prev: any) => ({ ...(prev || {}), contractStart: e.target.value }))
                  }
                  placeholder="계약 시작일 (예: 25/01/01)"
                  style={{
                    flex: "1 1 220px",
                    padding: "10px 12px",
                    border: "1px solid #d7dbe2",
                    borderRadius: 10,
                  }}
                />
                <input
                  value={(rentalForm?.companyName ?? "") as any}
                  onChange={(e) =>
                    setRentalForm((prev: any) => ({ ...(prev || {}), companyName: e.target.value }))
                  }
                  placeholder="회사명"
                  style={{
                    flex: "1 1 220px",
                    padding: "10px 12px",
                    border: "1px solid #d7dbe2",
                    borderRadius: 10,
                  }}
                />
                <input
                  value={(rentalForm?.regNo ?? "") as any}
                  onChange={(e) =>
                    setRentalForm((prev: any) => ({ ...(prev || {}), regNo: e.target.value }))
                  }
                  placeholder="사업자번호"
                  style={{
                    flex: "1 1 220px",
                    padding: "10px 12px",
                    border: "1px solid #d7dbe2",
                    borderRadius: 10,
                  }}
                />
                <input
                  value={(rentalForm?.ceo ?? "") as any}
                  onChange={(e) =>
                    setRentalForm((prev: any) => ({ ...(prev || {}), ceo: e.target.value }))
                  }
                  placeholder="대표자"
                  style={{
                    flex: "1 1 220px",
                    padding: "10px 12px",
                    border: "1px solid #d7dbe2",
                    borderRadius: 10,
                  }}
                />
                <input
                  value={(rentalForm?.siteAddr ?? "") as any}
                  onChange={(e) =>
                    setRentalForm((prev: any) => ({ ...(prev || {}), siteAddr: e.target.value }))
                  }
                  placeholder="현장주소"
                  style={{
                    flex: "1 1 220px",
                    padding: "10px 12px",
                    border: "1px solid #d7dbe2",
                    borderRadius: 10,
                  }}
                />
                <input
                  value={(rentalForm?.phone ?? "") as any}
                  onChange={(e) =>
                    setRentalForm((prev: any) => ({ ...(prev || {}), phone: e.target.value }))
                  }
                  placeholder="연락처"
                  style={{
                    flex: "1 1 220px",
                    padding: "10px 12px",
                    border: "1px solid #d7dbe2",
                    borderRadius: 10,
                  }}
                />
                <input
                  value={(rentalForm?.officePhone ?? "") as any}
                  onChange={(e) =>
                    setRentalForm((prev: any) => ({ ...(prev || {}), officePhone: e.target.value }))
                  }
                  placeholder="사무실"
                  style={{
                    flex: "1 1 220px",
                    padding: "10px 12px",
                    border: "1px solid #d7dbe2",
                    borderRadius: 10,
                  }}
                />
                <input
                  value={(rentalForm?.email ?? "") as any}
                  onChange={(e) =>
                    setRentalForm((prev: any) => ({ ...(prev || {}), email: e.target.value }))
                  }
                  placeholder="이메일"
                  style={{
                    flex: "1 1 220px",
                    padding: "10px 12px",
                    border: "1px solid #d7dbe2",
                    borderRadius: 10,
                  }}
                />
                <input
                  value={(rentalForm?.fax ?? "") as any}
                  onChange={(e) =>
                    setRentalForm((prev: any) => ({ ...(prev || {}), fax: e.target.value }))
                  }
                  placeholder="팩스"
                  style={{
                    flex: "1 1 220px",
                    padding: "10px 12px",
                    border: "1px solid #d7dbe2",
                    borderRadius: 10,
                  }}
                />
              </div>

              <div className="muted" style={{ marginTop: 10 }}>
                {rentalStatus}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 견적 수정 모달 */}
      {editOpen && editForm && (
        <div className="modal" style={{ display: "flex" }} onMouseDown={() => { setOptQ(""); setEditOpen(false); }}>
          <div className="modalCard" style={{ maxWidth: "1200px" }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHdr">
              <div style={{ fontWeight: 800 }}>견적 수정</div>
              <span className="spacer" />
              <button onClick={() => { setOptQ(""); setEditOpen(false); }}>닫기</button>
            </div>
            <div className="modalBody" style={{ maxHeight: "80vh", overflow: "auto" }}>
              {/* 기본 정보 */}
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, marginBottom: 8 }}>기본 정보</h3>
                <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                  <input
                    value={editForm.quote_title}
                    onChange={(e) => setEditForm({ ...editForm, quote_title: e.target.value })}
                    placeholder="견적 제목"
                    style={{
                      flex: "1 1 300px",
                      padding: "10px 12px",
                      border: "1px solid #d7dbe2",
                      borderRadius: 10,
                    }}
                  />
                </div>
                <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                  <input
                    value={editForm.customer_name}
                    onChange={(e) => setEditForm({ ...editForm, customer_name: e.target.value })}
                    placeholder="고객명"
                    style={{
                      flex: "1 1 220px",
                      padding: "10px 12px",
                      border: "1px solid #d7dbe2",
                      borderRadius: 10,
                    }}
                  />
                  <input
                    value={editForm.customer_phone}
                    onChange={(e) => setEditForm({ ...editForm, customer_phone: e.target.value })}
                    placeholder="연락처"
                    style={{
                      flex: "1 1 220px",
                      padding: "10px 12px",
                      border: "1px solid #d7dbe2",
                      borderRadius: 10,
                    }}
                  />
                  <input
                    value={editForm.customer_email}
                    onChange={(e) => setEditForm({ ...editForm, customer_email: e.target.value })}
                    placeholder="이메일"
                    style={{
                      flex: "1 1 220px",
                      padding: "10px 12px",
                      border: "1px solid #d7dbe2",
                      borderRadius: 10,
                    }}
                  />
                </div>
                <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                  <input
                    value={editForm.site_name}
                    onChange={(e) => setEditForm({ ...editForm, site_name: e.target.value })}
                    placeholder="현장명"
                    style={{
                      flex: "1 1 220px",
                      padding: "10px 12px",
                      border: "1px solid #d7dbe2",
                      borderRadius: 10,
                    }}
                  />
                  <input
                    value={editForm.site_addr}
                    onChange={(e) => setEditForm({ ...editForm, site_addr: e.target.value })}
                    placeholder="현장 주소"
                    style={{
                      flex: "1 1 400px",
                      padding: "10px 12px",
                      border: "1px solid #d7dbe2",
                      borderRadius: 10,
                    }}
                  />
                </div>
                <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                  <input
                    value={editForm.spec}
                    onChange={(e) => setEditForm({ ...editForm, spec: e.target.value })}
                    placeholder="규격"
                    style={{
                      flex: "1 1 150px",
                      padding: "10px 12px",
                      border: "1px solid #d7dbe2",
                      borderRadius: 10,
                    }}
                  />
                  <input
                    type="number"
                    value={editForm.w}
                    onChange={(e) => setEditForm({ ...editForm, w: e.target.value })}
                    placeholder="폭 (W)"
                    style={{
                      flex: "0 0 100px",
                      padding: "10px 12px",
                      border: "1px solid #d7dbe2",
                      borderRadius: 10,
                    }}
                  />
                  <input
                    type="number"
                    value={editForm.l}
                    onChange={(e) => setEditForm({ ...editForm, l: e.target.value })}
                    placeholder="길이 (L)"
                    style={{
                      flex: "0 0 100px",
                      padding: "10px 12px",
                      border: "1px solid #d7dbe2",
                      borderRadius: 10,
                    }}
                  />
                  <input
                    value={editForm.product}
                    onChange={(e) => setEditForm({ ...editForm, product: e.target.value })}
                    placeholder="품목"
                    style={{
                      flex: "1 1 150px",
                      padding: "10px 12px",
                      border: "1px solid #d7dbe2",
                      borderRadius: 10,
                    }}
                  />
                  <input
                    type="number"
                    value={editForm.qty}
                    onChange={(e) => setEditForm({ ...editForm, qty: e.target.value })}
                    placeholder="수량"
                    style={{
                      flex: "0 0 100px",
                      padding: "10px 12px",
                      border: "1px solid #d7dbe2",
                      borderRadius: 10,
                    }}
                  />
                </div>
                <textarea
                  value={editForm.memo}
                  onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })}
                  placeholder="메모"
                  style={{
                    width: "100%",
                    minHeight: 60,
                    padding: "10px 12px",
                    border: "1px solid #d7dbe2",
                    borderRadius: 10,
                    resize: "vertical",
                  }}
                />
              </div>

              {/* 품목 리스트 */}
              <div>
                <div className="row" style={{ marginBottom: 8 }}>
                  <h3 style={{ fontSize: 14, margin: 0 }}>품목</h3>
                  <span className="spacer" />
                  <button onClick={addItem}>+ 빈 품목 추가</button>
                </div>

                {/* 옵션 검색 */}
                <div style={{ marginBottom: 12, position: "relative" }}>
                  <input
                    value={optQ}
                    onChange={(e) => setOptQ(e.target.value)}
                    placeholder="옵션 검색 (예: 모노륨, 단열, 도어... 초성검색 가능)"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: "1px solid #d7dbe2",
                      borderRadius: 10,
                    }}
                  />
                  {optQ.trim() && filteredOptions.length > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        background: "#fff",
                        border: "1px solid #d7dbe2",
                        borderRadius: 10,
                        maxHeight: 250,
                        overflow: "auto",
                        zIndex: 100,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                      }}
                    >
                      {filteredOptions.map((o: any) => (
                        <div
                          key={o.option_id}
                          onClick={() => addOptionFromSearch(o)}
                          style={{
                            padding: "10px 12px",
                            cursor: "pointer",
                            borderBottom: "1px solid #eef0f3",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#f7f8fd")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                        >
                          <div style={{ fontWeight: 700 }}>{o.option_name}</div>
                          <div style={{ fontSize: 12, color: "#666" }}>
                            {o.unit || "EA"} · {Number(o.unit_price || 0).toLocaleString()}원
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {optQ.trim() && filteredOptions.length === 0 && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        background: "#fff",
                        border: "1px solid #d7dbe2",
                        borderRadius: 10,
                        padding: "10px 12px",
                        color: "#999",
                        zIndex: 100,
                      }}
                    >
                      검색 결과 없음
                    </div>
                  )}
                </div>

                {editForm.items.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      marginBottom: 12,
                      padding: 12,
                      border: "1px solid #eef0f3",
                      borderRadius: 10,
                    }}
                  >
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <input
                        value={item.category}
                        onChange={(e) => updateItem(idx, "category", e.target.value)}
                        placeholder="구분"
                        style={{
                          flex: "0 0 100px",
                          padding: "8px 10px",
                          border: "1px solid #d7dbe2",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <input
                        value={item.name}
                        onChange={(e) => updateItem(idx, "name", e.target.value)}
                        placeholder="항목명"
                        style={{
                          flex: "1 1 200px",
                          padding: "8px 10px",
                          border: "1px solid #d7dbe2",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <input
                        value={item.unit}
                        onChange={(e) => updateItem(idx, "unit", e.target.value)}
                        placeholder="단위"
                        style={{
                          flex: "0 0 80px",
                          padding: "8px 10px",
                          border: "1px solid #d7dbe2",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <input
                        type="number"
                        value={item.qty}
                        onChange={(e) => updateItem(idx, "qty", e.target.value)}
                        placeholder="수량"
                        style={{
                          flex: "0 0 80px",
                          padding: "8px 10px",
                          border: "1px solid #d7dbe2",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <input
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(idx, "unitPrice", e.target.value)}
                        placeholder="단가"
                        style={{
                          flex: "0 0 120px",
                          padding: "8px 10px",
                          border: "1px solid #d7dbe2",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <input
                        type="number"
                        value={item.amount}
                        onChange={(e) => updateItem(idx, "amount", e.target.value)}
                        placeholder="금액"
                        style={{
                          flex: "0 0 120px",
                          padding: "8px 10px",
                          border: "1px solid #d7dbe2",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <button
                        onClick={() => removeItem(idx)}
                        style={{ flex: "0 0 auto", padding: "8px 12px", fontSize: 12 }}
                      >
                        삭제
                      </button>
                    </div>
                    <input
                      value={item.note}
                      onChange={(e) => updateItem(idx, "note", e.target.value)}
                      placeholder="비고"
                      style={{
                        width: "100%",
                        marginTop: 8,
                        padding: "8px 10px",
                        border: "1px solid #d7dbe2",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className="row" style={{ marginTop: 16, gap: 8 }}>
                <span className="spacer" />
                <button onClick={() => { setOptQ(""); setEditOpen(false); }}>취소</button>
                <button className="primary" onClick={saveEdit}>
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PDF PREVIEW MODAL */}
      {pdfOpen && (
        <div className="modal" style={{ display: "flex" }} onMouseDown={closePdfPreview}>
          <div
            className="modalCard"
            style={{ width: "min(980px,96vw)", height: "92vh", overflow: "hidden" }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modalHdr">
              <div style={{ fontWeight: 800 }}>{pdfTitle}</div>
              <span className="spacer" />
              <button onClick={closePdfPreview}>닫기</button>
            </div>
            <div className="modalBody" style={{ padding: 0, height: "calc(92vh - 54px)" }}>
              <iframe src={pdfUrl} style={{ width: "100%", height: "100%", border: 0 }} />
            </div>
          </div>
        </div>
      )}

      <div className="toast" ref={toastRef} />
    </div>
  );
}

const css = `
  .app{display:grid;grid-template-columns: 360px 1fr; height:100vh; gap:12px; padding:12px; box-sizing:border-box;}
  .panel{background:#fff;border:1px solid #e5e7eb;border-radius:14px; overflow:hidden; display:flex; flex-direction:column;}
  .hdr{padding:12px 12px; border-bottom:1px solid #eef0f3; display:flex; gap:10px; align-items:center;}
  .hdr h1{font-size:14px;margin:0;}
  .search{padding:10px 12px;border-bottom:1px solid #eef0f3;}
  .search input{width:100%; padding:10px 12px;border:1px solid #d7dbe2;border-radius:10px; outline:none;}
  .list{overflow:auto;}
  .item{padding:10px 12px;border-bottom:1px solid #f0f2f6; cursor:pointer;}
  .item:hover{background:#fafbff;}
  .item .top{display:flex;justify-content:space-between;gap:10px;font-size:12px;}
  .item .mid{margin-top:4px;font-size:13px;font-weight:700;}
  .item .bot{margin-top:4px;font-size:12px;color:#666;display:flex;justify-content:space-between;gap:10px;}
  .badge{font-size:11px;padding:2px 8px;border:1px solid #d7dbe2;border-radius:999px;color:#444;background:#fff;}
  .right{display:flex;flex-direction:column; gap:12px;}
  .actions{padding:10px 12px;border:1px solid #e5e7eb;border-radius:14px;background:#fff;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;}
  button{padding:9px 12px;border:1px solid #d7dbe2;border-radius:10px;background:#fff;cursor:pointer;font-weight:700;font-size:12px;}
  button:hover{background:#f7f8fd;}
  button.primary{background:#111;color:#fff;border-color:#111;}
  button.primary:hover{background:#222;}
  .content{flex:1; display:grid; grid-template-columns: 1fr; gap:12px;}
  .previewWrap{background:#fff;border:1px solid #e5e7eb;border-radius:14px; overflow:auto;}
  .previewInner{padding:14px; min-height:400px;}
  .muted{color:#666;font-size:12px;}
  .row{display:flex;gap:8px;align-items:center;}
  .spacer{flex:1;}
  .toast{position:fixed;right:16px;bottom:16px;background:#111;color:#fff;padding:10px 12px;border-radius:12px;font-size:12px;display:none;max-width:340px;z-index:9999;}
  .modal{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:12px;z-index:9998;}
  .modalCard{width:min(980px, 96vw); max-height:92vh; overflow:auto; background:#fff;border-radius:14px;border:1px solid #e5e7eb;}
  .modalHdr{padding:12px;border-bottom:1px solid #eef0f3;display:flex;gap:8px;align-items:center;}
  .modalBody{padding:12px;}

  /* A4 견적서 스타일 (App.tsx와 동일) */
  .a4Wrap{
    display:flex;
    justify-content:center;
    padding: 14px 0;
    background:#f5f6f8;
  }
  .a4Sheet{
    width: 794px;
    min-height: 1123px;
    background:#fff;
    border:1px solid #cfd3d8;
    padding: 16px;
    box-sizing:border-box;
  }

  .a4Header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding: 6px 2px 10px;
    border-bottom: 2px solid #2e5b86;
    margin-bottom: 10px;
  }
  .a4HeaderLeft{
    display:flex;
    align-items:center;
    gap: 10px;
  }
  .a4Logo{ width: 110px; height:auto; }
  .a4BrandEn{
    font-size: 12px;
    line-height:1.15;
    font-weight:700;
    letter-spacing:0.3px;
  }
  .a4HeaderCenter{
    flex:1;
    text-align:center;
    font-size: 34px;
    font-weight: 900;
    letter-spacing: 6px;
  }
  .a4HeaderRight{ width: 140px; }

  table{ width:100%; border-collapse: collapse; table-layout: fixed; }
  .a4Info, .a4Items, .a4Bottom{
    table-layout: fixed;
    border: 1px solid #333;
    margin-top: 8px;
  }
  .a4Info th, .a4Info td,
  .a4Items th, .a4Items td,
  .a4Bottom th, .a4Bottom td{
    border: 1px solid #333;
    padding: 6px 8px;
    font-size: 13px;
    vertical-align: middle;
  }

  .k{ background:#fff; font-weight: 900; }
  .v{ background:#fff; }
  .center{ text-align:center; }
  .right{ text-align:right; }

  .msg{
    font-size: 13px;
    font-weight: 700;
    text-align:center;
    background:#fff;
  }
  .sum{
    font-size: 14px;
    font-weight: 900;
    background:#fff;
  }

  .a4Items thead th{
    background:#e6e6e6;
    font-weight:900;
    text-align:center;
  }
  
  .h{
    background:#e6e6e6;
    font-weight:900;
    text-align:center;
  }

  .a4Items tbody td{ 
    background:#fff;
    padding: 6px 8px;
    vertical-align: middle;
    min-height: 28px;
  }
  
  .a4Items tbody td.c{
    /* 모든 셀 기본 스타일 */
  }
  
  .a4Items tbody td.wrap{
    /* 품목명 셀만 줄바꿈 허용 */
    white-space: normal;
    word-break: break-word;
    overflow-wrap: break-word;
    line-height: 1.3;
    vertical-align: top;
  }

  .a4Bottom .sumRow td{
    background:#e6e6e6;
    font-weight:900;
  }
  .a4Bottom .sumLeft{
    text-align:left;
  }
  .a4Bottom .sumNum{
    text-align:right;
  }
  .a4Bottom .label{
    background:#e6e6e6;
    font-weight:900;
    text-align:center;
  }
  .a4Bottom .text{
    font-size: 12px;
    line-height:1.55;
    white-space: normal;
    word-break: break-word;
    overflow-wrap:anywhere;
  }

  @media print{
    @page {
      size: A4;
      margin: 0;
    }
    
    html, body {
      margin: 0;
      padding: 0;
      height: auto;
    }
    
    .app { display: block !important; }
    .panel { display: none !important; }
    .actions { display: none !important; }
    button { display: none !important; }
    .right { display: block !important; }
    .previewWrap { border: none !important; }
    .previewInner { padding: 0 !important; }
    
    /* 인라인 스타일 A4 컨테이너 */
    .previewInner > div {
      background: #fff !important;
      padding: 0 !important;
      margin: 0 !important;
      zoom: 0.95 !important;
    }
    
    .previewInner > div > div {
      border: none !important;
      width: 210mm !important;
      min-height: auto !important;
      padding: 10mm !important;
      margin: 0 !important;
      box-shadow: none !important;
    }
    
    * {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }

  @media (max-width:520px){
    .app{grid-template-columns: 1fr; height:auto;}
    .a4Sheet{width:100%;min-height:auto;padding:12px;}
  }
`;
