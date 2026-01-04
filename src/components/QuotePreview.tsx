import React, { useMemo } from "react";

type QuoteRow = {
  quote_id: string;
  version: string | number | null;

  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;

  site_name: string | null;
  spec: string | null;

  supply_amount: number | null;
  vat_amount: number | null;
  total_amount: number | null;

  created_at: string | null;

  items: any; // jsonb or payload
};

type QuoteItem = {
  LINE_NO?: any;
  ITEM_NAME?: any;
  SPEC?: any;
  QTY?: any;
  UNIT_PRICE?: any;
  AMOUNT?: any;
  VAT?: any;
  NOTE?: any;

  // snake
  line_no?: any;
  item_name?: any;
  spec?: any;
  qty?: any;
  unit_price?: any;
  amount?: any;
  vat?: any;
  note?: any;

  // front variants
  itemName?: any;
  optionName?: any;
  displayName?: any;
  unitPrice?: any;
};

function money(n: any) {
  const num = Number(n || 0);
  return num.toLocaleString("ko-KR");
}

function formatKoDate(v: any) {
  if (!v) return "";
  const d = new Date(String(v));
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return String(v);
}

function formatKoDateDots(v: any) {
  const s = formatKoDate(v);
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${y}. ${Number(m)}. ${Number(d)}`;
}

function pickItems(row: QuoteRow | null): QuoteItem[] {
  if (!row) return [];
  const p = (row as any).payload || {};
  const fromPayload = p.items || p.lineItems || p.rows;
  if (Array.isArray(fromPayload)) return fromPayload;

  const fromRow = (row as any).items;
  if (Array.isArray(fromRow)) return fromRow;

  if (typeof fromRow === "string") {
    try {
      const parsed = JSON.parse(fromRow);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.items)) return parsed.items;
    } catch {}
  }
  return [];
}

function normItem(it: QuoteItem, idx: number, defaultSpec: string) {
  const lineNo = Number(it.LINE_NO ?? it.line_no ?? idx + 1);

  const name = String(
    it.ITEM_NAME ??
      it.itemName ??
      it.optionName ??
      it.displayName ??
      it.item_name ??
      ""
  ).trim();

  const note = String(it.NOTE ?? it.note ?? "").trim();
  const itemName = note ? `${name}\n${note}` : name;

  const spec = String(it.SPEC ?? it.spec ?? defaultSpec ?? "").trim();
  const qty = Number(it.QTY ?? it.qty ?? 0);
  const unitPrice = Number(it.UNIT_PRICE ?? it.unitPrice ?? it.unit_price ?? 0);

  const amountRaw = it.AMOUNT ?? it.amount;
  const amount =
    amountRaw === "" || amountRaw == null ? qty * unitPrice : Number(amountRaw || 0);

  const vatRaw = it.VAT ?? it.vat;
  const vat =
    vatRaw === "" || vatRaw == null ? Math.round(amount * 0.1) : Number(vatRaw || 0);

  return { lineNo, itemName, spec, qty, unitPrice, amount, vat };
}

export default function QuotePreview({
  quote,
  logoUrl = "https://i.postimg.cc/C5hPvbMk/logodandog.png",
}: {
  quote: QuoteRow | null;
  logoUrl?: string;
}) {
  const vm = useMemo(() => {
    if (!quote) return null;

    const p = (quote as any).payload || {};
    const header = p.header || {};

    const customerName = String(header.customerName ?? quote.customer_name ?? "○");
    const phone = String(header.phone ?? quote.customer_phone ?? "○");
    const email = String(header.toEmail ?? quote.customer_email ?? "");
    const site = String(header.siteName ?? quote.site_name ?? "");
    const spec = String(header.spec ?? quote.spec ?? "");

    const quoteId = String(header.quoteId ?? quote.quote_id ?? "");
    const quoteDate = String(header.createdAt ?? quote.created_at ?? "");

    const total = Number(header.totalAmount ?? quote.total_amount ?? 0);
    const vat = Number(header.vatAmount ?? quote.vat_amount ?? Math.round(total * 0.1));
    const supply = Number(
      header.supplyAmount ?? quote.supply_amount ?? Math.max(0, total - vat)
    );

    const itemsRaw = pickItems(quote);
    const items = itemsRaw.map((it, idx) => normItem(it, idx, spec));

    // 표를 A4 꽉 채우게 빈 행 채움 (이미지처럼 길게)
    const MIN_ROWS = 18;
    const filled: any[] = [...items];
    while (filled.length < MIN_ROWS) {
      filled.push({
        _blank: true,
        lineNo: "",
        itemName: "",
        spec: "",
        qty: "",
        unitPrice: "",
        amount: "",
        vat: "",
      });
    }

    return {
      quoteId,
      quoteDate,
      customerName,
      phone,
      email,
      site,
      spec,
      supply,
      vat,
      total,
      items: filled,
    };
  }, [quote]);

  if (!vm) {
    return (
      <div style={{ padding: 12, color: "#666", fontSize: 12 }}>
        왼쪽에서 견적을 선택하세요.
      </div>
    );
  }

  return (
    <div className="hqa_root">
      <div className="hqa_a4" id="hqQuoteA4">
        {/* 상단 로고/제목 */}
        <div className="hqa_top">
          <div className="hqa_logoWrap">
            <img className="hqa_logo" src={logoUrl} alt="HDC" />
            <div className="hqa_brandTxt">
              <div>HYUNDAI</div>
              <div>CONTAINER</div>
              <div>HOUSING</div>
            </div>
          </div>
          <div className="hqa_title">견 적 서</div>
          <div className="hqa_date">견적일자 : {formatKoDate(vm.quoteDate)}</div>
        </div>

        {/* 메타 박스 (이미지처럼) */}
        <table className="hqa_meta">
          <tbody>
            <tr>
              <td className="k">NO.</td>
              <td className="v" colSpan={3}>
                {vm.quoteId}
              </td>
              <td className="k">공급자</td>
              <td className="v"></td>
            </tr>

            <tr>
              <td className="k">고객명</td>
              <td className="v">{vm.customerName || "○"}</td>
              <td className="k mid">귀하</td>
              <td className="v"></td>
              <td className="k">등록번호</td>
              <td className="v">130-41-38154</td>
            </tr>

            <tr>
              <td className="k">이메일</td>
              <td className="v">{vm.email}</td>
              <td className="k">전화</td>
              <td className="v">{vm.phone || "○"}</td>
              <td className="k">상호</td>
              <td className="v">현대컨테이너</td>
            </tr>

            <tr>
              <td className="k">현장</td>
              <td className="v">{vm.site || vm.spec}</td>
              <td className="k">견적일</td>
              <td className="v">{formatKoDateDots(vm.quoteDate)}</td>
              <td className="k">주소</td>
              <td className="v">경기도 화성시 향남읍 구문천안길16</td>
            </tr>

            <tr>
              <td className="k"></td>
              <td className="v" colSpan={3}>
                견적요청에 감사드리며 아래와 같이 견적합니다.
              </td>
              <td className="k">전화</td>
              <td className="v">1688-1447</td>
            </tr>
          </tbody>
        </table>

        {/* 합계 바 */}
        <div className="hqa_totalBar">
          <b>합계금액 : ₩{money(vm.total)}</b> (부가세 포함)
        </div>

        {/* 품목 표 */}
        <table className="hqa_items">
          <thead>
            <tr>
              <th style={{ width: 70 }}>순번</th>
              <th>품목</th>
              <th style={{ width: 90 }}>규격</th>
              <th style={{ width: 80 }}>수량</th>
              <th style={{ width: 110 }}>단가</th>
              <th style={{ width: 110 }}>공급가</th>
              <th style={{ width: 100 }}>세액</th>
            </tr>
          </thead>
          <tbody>
            {vm.items.map((r: any, i: number) => {
              const blank = !!r._blank;
              return (
                <tr key={i}>
                  <td className="c">{blank ? "" : r.lineNo}</td>
                  {/* ✅ 길면 줄바꿈 */}
                  <td className="itemCell">{blank ? "" : r.itemName}</td>
                  <td className="c">{blank ? "" : (r.spec || vm.spec || "")}</td>
                  <td className="c">{blank ? "" : (r.qty ? money(r.qty) : "")}</td>
                  <td className="r">{blank ? "" : (r.unitPrice ? money(r.unitPrice) : "")}</td>
                  <td className="r">{blank ? "" : (r.amount ? money(r.amount) : "")}</td>
                  <td className="r">{blank ? "" : (r.vat ? money(r.vat) : "")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* 하단 */}
        <table className="hqa_footer">
          <tbody>
            <tr>
              <td className="sumLeft">
                합계: <b>{money(vm.total)}원</b> (총공급가액 {money(vm.supply)} / 총세액 {money(vm.vat)})
              </td>
              <td className="sumNum r">{money(vm.supply)}</td>
              <td className="sumNum r">{money(vm.vat)}</td>
              <td className="sumNum r">
                <b>{money(vm.total)}</b>
              </td>
            </tr>

            <tr>
              <td className="kcell c b">결제조건</td>
              <td className="vcell" colSpan={3}>
                계약금 50%입금 후 도면제작 및 확인/착수, 선 완불 후 출고
                <div className="small">
                  *견적서는 견적일로 부터 2주간 유효합니다.<br />
                  1. 하차비 별도(당 지역 지게차 혹은 크레인 이용)<br />
                  2. 주문 제작시 50퍼센트 입금 후 제작, 완불 후 출고.<br />
                  *출고 전날 오후 2시 이전 잔금 결제 조건*<br />
                  3. 하차, 회수시 상차 별도(당 지역 지게차 혹은 크레인 이용)
                </div>
              </td>
            </tr>

            <tr>
              <td className="kcell c b">주의사항</td>
              <td className="vcell" colSpan={3}>
                <div className="small">
                  *중요사항*<br />
                  1. 인적사항 요구 현장시 운임비 3만원 추가금 발생합니다.<br />
                  2. 기본 전기는 설치 되어 있으나 주택용도 전선관은 추가되어 있지 않습니다.<br />
                  한전/전기안전공사 측에서 전기연결 예정이신 경우 전선관 옵션을 추가하여 주시길 바랍니다.<br />
                  해당사항은 고지의무사항이 아니므로 상담을 통해 확인하시길 바랍니다.
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <style>{css}</style>
    </div>
  );
}

const css = `
  /* ✅ A4 고정 (웹에서 A4처럼 보이게) */
  .hqa_root{display:flex;justify-content:center;padding:18px 0;background:#f5f6f8;}
  .hqa_a4{
    width:794px;
    min-height:1123px;
    background:#fff;
    border:1px solid #4b4b4b;
    box-sizing:border-box;
  }

  /* 상단 */
  .hqa_top{
    display:grid;
    grid-template-columns: 260px 1fr 260px;
    align-items:center;
    padding:14px 14px;
    border-bottom:2px solid #244b87;
  }
  .hqa_logoWrap{display:flex;align-items:center;gap:10px;}
  .hqa_logo{width:110px;height:auto;}
  .hqa_brandTxt{font-size:11px;font-weight:800;line-height:1.05;color:#1b2a45;}
  .hqa_title{text-align:center;font-size:34px;font-weight:900;letter-spacing:6px;}
  .hqa_date{text-align:right;font-size:12px;font-weight:800;}

  /* 메타 테이블 */
  .hqa_meta{
    width:100%;
    border-collapse:collapse;
    table-layout:fixed;
    font-size:12px;
  }
  .hqa_meta td{
    border:1px solid #4b4b4b;
    padding:4px 6px;
    vertical-align:middle;
  }
  .hqa_meta .k{background:#f2f2f2;font-weight:900;text-align:center;width:80px;}
  .hqa_meta .v{background:#fff;font-weight:800;}
  .hqa_meta .mid{background:#fff;font-weight:900;}

  /* 합계 바 */
  .hqa_totalBar{
    border-left:1px solid #4b4b4b;
    border-right:1px solid #4b4b4b;
    border-bottom:1px solid #4b4b4b;
    padding:6px 8px;
    font-size:13px;
    font-weight:900;
  }

  /* 품목 테이블 */
  .hqa_items{
    width:100%;
    border-collapse:collapse;
    table-layout:fixed;
    font-size:12px;
  }
  .hqa_items th, .hqa_items td{
    border:1px solid #4b4b4b;
    padding:4px 6px;
    vertical-align:top;
  }
  .hqa_items thead th{
    background:#d9d9d9;
    font-weight:900;
    text-align:center;
  }
  .hqa_items td.c{text-align:center;}
  .hqa_items td.r{text-align:right;}

  /* ✅ 품목 길면 자동 줄바꿈 */
  .hqa_items td.itemCell{
    white-space:pre-wrap;     /* \n 도 줄바꿈 */
    word-break:break-word;    /* 긴 단어도 끊기 */
    overflow-wrap:anywhere;   /* 최후 보루 */
    line-height:1.25;
    min-height:22px;
  }

  /* 하단 */
  .hqa_footer{
    width:100%;
    border-collapse:collapse;
    table-layout:fixed;
    font-size:12px;
  }
  .hqa_footer td{
    border:1px solid #4b4b4b;
    padding:6px 8px;
    vertical-align:top;
  }
  .sumLeft{background:#f2f2f2;font-weight:900;}
  .sumNum{background:#f2f2f2;font-weight:900;width:110px;}
  .kcell{background:#d9d9d9;width:110px;}
  .vcell{background:#fff;}
  .small{margin-top:6px;line-height:1.45;font-weight:800;}
  .b{font-weight:900;}
  .c{text-align:center;}
  .r{text-align:right;}

  @media (max-width:520px){
    .hqa_root{padding:8px 0;}
    .hqa_a4{width:94vw; min-height:auto;}
    .hqa_top{grid-template-columns:1fr;gap:10px;}
    .hqa_title{text-align:left;letter-spacing:2px;}
    .hqa_date{text-align:left;}
  }
`;
