// src/pages/ContractListPage.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../QuoteService";

type ContractQuote = {
  id: string;
  quote_id: string;
  contract_date: string;
  drawing_no: string;
  spec: string;
  bank_account: string;
  tax_invoice: string;
  deposit_status: string;
  customer_name: string;
  items: any[];
  special_order: boolean;
  steel_paint: boolean;
  interior: string;
  depositor: string;
  delivery_date: string;
  total_amount: number;
};

export default function ContractListPage({ onBack }: { onBack: () => void }) {
  const [contracts, setContracts] = useState<ContractQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuote, setSelectedQuote] = useState<ContractQuote | null>(null);

  const loadContracts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("status", "confirmed")
      .order("contract_date", { ascending: false });

    if (!error && data) {
      setContracts(data as ContractQuote[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadContracts();
  }, []);

  const updateField = async (id: string, field: string, value: any) => {
    await supabase.from("quotes").update({ [field]: value }).eq("id", id);
    loadContracts();
  };

  const summarizeOptions = (items: any[]) => {
    if (!items || items.length === 0) return "-";
    const names = items.slice(0, 3).map((i: any) => i.optionName || i.displayName || "");
    const summary = names.join(", ");
    return items.length > 3 ? `${summary} 외 ${items.length - 3}건` : summary;
  };

  const fmt = (n: number) => (Number(n) || 0).toLocaleString("ko-KR");

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>계약견적</h2>
        <button 
          onClick={onBack}
          style={{
            padding: "8px 16px",
            background: "#111",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          ← 돌아가기
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#888" }}>로딩 중...</div>
      ) : contracts.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
          계약 확정된 견적이 없습니다.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#2e5b86", color: "#fff" }}>
                <th style={{ padding: 10, border: "1px solid #ddd", whiteSpace: "nowrap" }}>내린날짜</th>
                <th style={{ padding: 10, border: "1px solid #ddd", whiteSpace: "nowrap" }}>도면번호</th>
                <th style={{ padding: 10, border: "1px solid #ddd", whiteSpace: "nowrap" }}>규격</th>
                <th style={{ padding: 10, border: "1px solid #ddd", whiteSpace: "nowrap" }}>계좌</th>
                <th style={{ padding: 10, border: "1px solid #ddd", whiteSpace: "nowrap" }}>세발</th>
                <th style={{ padding: 10, border: "1px solid #ddd", whiteSpace: "nowrap" }}>입금</th>
                <th style={{ padding: 10, border: "1px solid #ddd", whiteSpace: "nowrap" }}>발주처</th>
                <th style={{ padding: 10, border: "1px solid #ddd", minWidth: 150 }}>옵션</th>
                <th style={{ padding: 10, border: "1px solid #ddd", whiteSpace: "nowrap" }}>특수주문</th>
                <th style={{ padding: 10, border: "1px solid #ddd", whiteSpace: "nowrap" }}>철&페</th>
                <th style={{ padding: 10, border: "1px solid #ddd", whiteSpace: "nowrap" }}>내장</th>
                <th style={{ padding: 10, border: "1px solid #ddd", whiteSpace: "nowrap" }}>입금자</th>
                <th style={{ padding: 10, border: "1px solid #ddd", whiteSpace: "nowrap" }}>출고일</th>
                <th style={{ padding: 10, border: "1px solid #ddd", whiteSpace: "nowrap" }}>보기</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr 
                  key={c.id} 
                  style={{ 
                    background: c.delivery_date ? "#fff0f0" : "#fff",
                    borderBottom: "1px solid #eee" 
                  }}
                >
                  <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                    {c.contract_date || "-"}
                  </td>
                  <td style={{ padding: 8, border: "1px solid #eee" }}>
                    <input
                      value={c.drawing_no || ""}
                      onChange={(e) => updateField(c.id, "drawing_no", e.target.value)}
                      style={{ width: 60, padding: 4, border: "1px solid #ddd", borderRadius: 4 }}
                      placeholder="번호"
                    />
                  </td>
                  <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                    {c.spec || "-"}
                  </td>
                  <td style={{ padding: 8, border: "1px solid #eee" }}>
                    <select
                      value={c.bank_account || ""}
                      onChange={(e) => updateField(c.id, "bank_account", e.target.value)}
                      style={{ padding: 4, border: "1px solid #ddd", borderRadius: 4 }}
                    >
                      <option value="">-</option>
                      <option value="현대">현대</option>
                      <option value="국민">국민</option>
                      <option value="기업">기업</option>
                    </select>
                  </td>
                  <td style={{ padding: 8, border: "1px solid #eee" }}>
                    <select
                      value={c.tax_invoice || ""}
                      onChange={(e) => updateField(c.id, "tax_invoice", e.target.value)}
                      style={{ padding: 4, border: "1px solid #ddd", borderRadius: 4 }}
                    >
                      <option value="">-</option>
                      <option value="완료">완료</option>
                      <option value="계약금만">계약금만</option>
                      <option value="대기">대기</option>
                    </select>
                  </td>
                  <td style={{ padding: 8, border: "1px solid #eee" }}>
                    <select
                      value={c.deposit_status || ""}
                      onChange={(e) => updateField(c.id, "deposit_status", e.target.value)}
                      style={{ padding: 4, border: "1px solid #ddd", borderRadius: 4 }}
                    >
                      <option value="">-</option>
                      <option value="완료">완료</option>
                      <option value="계약금">계약금</option>
                      <option value="미입금">미입금</option>
                    </select>
                  </td>
                  <td style={{ padding: 8, border: "1px solid #eee", fontWeight: 700 }}>
                    {c.customer_name || "-"}
                  </td>
                  <td style={{ padding: 8, border: "1px solid #eee", fontSize: 11 }}>
                    {summarizeOptions(c.items)}
                  </td>
                  <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={c.special_order || false}
                      onChange={(e) => updateField(c.id, "special_order", e.target.checked)}
                    />
                  </td>
                  <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={c.steel_paint || false}
                      onChange={(e) => updateField(c.id, "steel_paint", e.target.checked)}
                    />
                  </td>
                  <td style={{ padding: 8, border: "1px solid #eee" }}>
                    <input
                      value={c.interior || ""}
                      onChange={(e) => updateField(c.id, "interior", e.target.value)}
                      style={{ width: 40, padding: 4, border: "1px solid #ddd", borderRadius: 4, textAlign: "center" }}
                      placeholder="-"
                    />
                  </td>
                  <td style={{ padding: 8, border: "1px solid #eee" }}>
                    <input
                      value={c.depositor || ""}
                      onChange={(e) => updateField(c.id, "depositor", e.target.value)}
                      style={{ width: 60, padding: 4, border: "1px solid #ddd", borderRadius: 4 }}
                      placeholder="입금자"
                    />
                  </td>
                  <td style={{ padding: 8, border: "1px solid #eee" }}>
                    <input
                      type="date"
                      value={c.delivery_date || ""}
                      onChange={(e) => updateField(c.id, "delivery_date", e.target.value)}
                      style={{ padding: 4, border: "1px solid #ddd", borderRadius: 4 }}
                    />
                  </td>
                  <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                    <button
                      onClick={() => setSelectedQuote(c)}
                      style={{
                        padding: "4px 8px",
                        background: "#2e5b86",
                        color: "#fff",
                        border: "none",
                        borderRadius: 4,
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      보기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 견적서 팝업 */}
      {selectedQuote && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
          }}
          onClick={() => setSelectedQuote(null)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              width: "90%",
              maxWidth: 600,
              maxHeight: "80vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>견적 상세</h3>
              <button
                onClick={() => setSelectedQuote(null)}
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <strong>고객명:</strong> {selectedQuote.customer_name}
            </div>
            <div style={{ marginBottom: 12 }}>
              <strong>규격:</strong> {selectedQuote.spec}
            </div>
            <div style={{ marginBottom: 12 }}>
              <strong>금액:</strong> {fmt(selectedQuote.total_amount)}원
            </div>

            <div style={{ marginTop: 16 }}>
              <strong>품목:</strong>
              <table style={{ width: "100%", marginTop: 8, borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f5f5f5" }}>
                    <th style={{ padding: 6, border: "1px solid #ddd" }}>품명</th>
                    <th style={{ padding: 6, border: "1px solid #ddd" }}>수량</th>
                    <th style={{ padding: 6, border: "1px solid #ddd" }}>단가</th>
                    <th style={{ padding: 6, border: "1px solid #ddd" }}>금액</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedQuote.items || []).map((item: any, idx: number) => (
                    <tr key={idx}>
                      <td style={{ padding: 6, border: "1px solid #eee" }}>{item.displayName || item.optionName}</td>
                      <td style={{ padding: 6, border: "1px solid #eee", textAlign: "center" }}>{item.qty}</td>
                      <td style={{ padding: 6, border: "1px solid #eee", textAlign: "right" }}>{fmt(item.unitPrice)}</td>
                      <td style={{ padding: 6, border: "1px solid #eee", textAlign: "right" }}>{fmt(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
