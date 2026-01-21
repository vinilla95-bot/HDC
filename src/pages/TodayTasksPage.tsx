// src/pages/TodayTasksPage.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../QuoteService";

// 알림 허용 시간 체크 (컴퓨터 켠 후 1시간, 오후 3시)
const shouldShowNotification = (): boolean => {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  
  if (hour === 15 && minute < 5) {
    const notified = localStorage.getItem('afternoon_notified_' + now.toDateString());
    if (!notified) {
      localStorage.setItem('afternoon_notified_' + now.toDateString(), 'true');
      return true;
    }
    return false;
  }
  
  const bootTime = localStorage.getItem('app_boot_time');
  const now_ts = Date.now();
  
  if (!bootTime) {
    localStorage.setItem('app_boot_time', String(now_ts));
    return false;
  }
  
  const bootTimestamp = Number(bootTime);
  const oneHourLater = bootTimestamp + (60 * 60 * 1000);
  
  if (now_ts >= oneHourLater && now_ts < oneHourLater + (5 * 60 * 1000)) {
    const notified = localStorage.getItem('boot_notified');
    if (!notified) {
      localStorage.setItem('boot_notified', 'true');
      return true;
    }
  }
  
  return false;
};

const resetDailyFlags = () => {
  const today = new Date().toDateString();
  const lastReset = localStorage.getItem('last_reset_date');
  
  if (lastReset !== today) {
    localStorage.removeItem('app_boot_time');
    localStorage.removeItem('boot_notified');
    localStorage.setItem('last_reset_date', today);
  }
};

type PendingOrder = {
  id: number;
  quote_id: string;
  chat_room: string;
  message: string;
  order_date: string;
  delivery_date: string;
  status: string;
  sent_at?: string;
  error_message?: string;
};

type DeliveryTask = {
  quote_id: string;
  customer_name: string;
  customer_phone: string;
  spec: string;
  delivery_date: string;
  site_addr: string;
  memo: string;
  contract_type: string;
  items: any[];
  dispatch_status?: string;
};

export default function TodayTasksPage() {
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [deliveryTasks, setDeliveryTasks] = useState<DeliveryTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editMessage, setEditMessage] = useState("");

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    resetDailyFlags();
  }, []);

  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const pendingCount = pendingOrders.filter(o => o.status === "pending").length;
    const failedCount = pendingOrders.filter(o => o.status === "failed").length;
    const dispatchCount = deliveryTasks.filter(d => d.dispatch_status !== "완료").length;
    const totalTasks = pendingCount + failedCount + dispatchCount;
    
    if (!shouldShowNotification() || totalTasks === 0) return;
    
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(failedCount > 0 ? "⚠️ 전송 실패" : "📋 오늘 할 일", {
        body: failedCount > 0 ? `${failedCount}건 실패` : `${totalTasks}건 대기`,
        icon: "/favicon.ico"
      });
    }
  }, [pendingOrders, deliveryTasks]);

  const loadTasks = async () => {
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

    const { data: orders } = await supabase
      .from("pending_orders")
      .select("*")
      .eq("order_date", today)
      .order("created_at", { ascending: true });

    if (orders) setPendingOrders(orders);

    const { data: deliveries } = await supabase
      .from("quotes")
      .select("*")
      .eq("status", "confirmed")
      .eq("delivery_date", tomorrow)
      .neq("contract_type", "memo");

    if (deliveries) setDeliveryTasks(deliveries);
    setLoading(false);
  };

  const generateDispatchMessage = (task: DeliveryTask) => {
    const [, month, day] = task.delivery_date.split("-").map(Number);
    const dateStr = `${month}/${day}`;
    const qty = task.items?.find((i: any) => 
      (i.optionName || i.displayName || "").toLowerCase().includes("컨테이너")
    )?.qty || 1;

    let saleType = "신품판매";
    if (task.contract_type === "used") saleType = "중고판매";
    else if (task.contract_type === "rental") saleType = "임대";

    let text = `사장님 (${dateStr}) ${saleType} (${task.spec || ""})(${qty})-동 상차 현대`;
    text += ` 하차 ${task.site_addr || ""}`;
    if (task.memo) text += ` ${task.memo}`;
    text += ` ${task.customer_name || ""}`;
    text += ` 인수자${task.customer_phone || ""} 입니다~`;

    return text;
  };

  const updateOrderStatus = async (id: number, status: string) => {
    await supabase.from("pending_orders").update({ status }).eq("id", id);
    setPendingOrders(prev => prev.map(o => (o.id === id ? { ...o, status } : o)));
  };

  const updateDispatchStatus = async (quoteId: string, status: string) => {
    await supabase.from("quotes").update({ dispatch_status: status }).eq("quote_id", quoteId);
    setDeliveryTasks(prev => prev.map(d => (d.quote_id === quoteId ? { ...d, dispatch_status: status } : d)));
  };

  const saveEditMessage = async (id: number) => {
    await supabase.from("pending_orders").update({ message: editMessage }).eq("id", id);
    setPendingOrders(prev => prev.map(o => (o.id === id ? { ...o, message: editMessage } : o)));
    setEditingId(null);
    setEditMessage("");
  };

  const handleManualCopy = async (message: string, id: number | string, type: "order" | "dispatch", chatRoom: string) => {
    try {
      await navigator.clipboard.writeText(message);
      alert(`📋 복사됨! "${chatRoom}" 채팅방에 붙여넣기`);
      if (type === "order") await updateOrderStatus(id as number, "완료");
      else await updateDispatchStatus(id as string, "완료");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = message;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      alert("📋 복사됨!");
    }
  };

  const sendOrder = async (id: number) => {
    await supabase.from("pending_orders").update({ status: "ready" }).eq("id", id);
    setPendingOrders(prev => prev.map(o => (o.id === id ? { ...o, status: "ready" } : o)));
  };

  const renderStatusBadge = (status: string) => {
    const styles: Record<string, any> = {
      pending: { bg: "#fff3e0", color: "#e65100", text: "대기" },
      ready: { bg: "#e3f2fd", color: "#1565c0", text: "전송중..." },
      sent: { bg: "#e8f5e9", color: "#2e7d32", text: "완료" },
      failed: { bg: "#ffebee", color: "#c62828", text: "실패" },
      "완료": { bg: "#e8f5e9", color: "#2e7d32", text: "완료" },
    };
    const s = styles[status] || styles.pending;
    return (
      <span style={{ padding: "2px 6px", background: s.bg, color: s.color, borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
        {s.text}
      </span>
    );
  };

  const pendingCount = pendingOrders.filter(o => o.status === "pending").length;
  const dispatchCount = deliveryTasks.filter(d => d.dispatch_status !== "완료").length;

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "#888" }}>로딩 중...</div>;
  }

  return (
    <div style={{ padding: 16, background: "#f6f7fb", minHeight: "100vh", maxWidth: 900, margin: "0 auto" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
          📋 오늘 할 일
          {(pendingCount + dispatchCount) > 0 && (
            <span style={{ marginLeft: 8, padding: "3px 8px", background: "#e53935", color: "#fff", borderRadius: 10, fontSize: 12 }}>
              {pendingCount + dispatchCount}건
            </span>
          )}
        </h2>
        <button onClick={loadTasks} style={{ padding: "6px 12px", background: "#2e5b86", color: "#fff", border: "none", borderRadius: 6, fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
          🔄 새로고침
        </button>
      </div>

      {/* 안내 */}
      <div style={{ background: "#e3f2fd", borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 11, color: "#1565c0" }}>
        🤖 Python 대기 중 → "전송" 누르면 카카오톡 자동 전송
      </div>

      {/* 자재 주문 테이블 */}
      <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb", marginBottom: 12 }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #eee", background: "#fafbfc", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>📦 자재 주문</span>
          <span style={{ padding: "2px 8px", background: pendingCount > 0 ? "#fff3e0" : "#e8f5e9", color: pendingCount > 0 ? "#e65100" : "#2e7d32", borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
            {pendingCount > 0 ? `${pendingCount}건` : "✅"}
          </span>
        </div>

        {pendingOrders.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "#888", fontSize: 13 }}>오늘 주문할 자재가 없습니다</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f9f9f9" }}>
                <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #eee", width: 70 }}>채팅방</th>
                <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #eee" }}>메시지</th>
                <th style={{ padding: "8px", textAlign: "center", borderBottom: "1px solid #eee", width: 55 }}>출고일</th>
                <th style={{ padding: "8px", textAlign: "center", borderBottom: "1px solid #eee", width: 50 }}>상태</th>
                <th style={{ padding: "8px", textAlign: "center", borderBottom: "1px solid #eee", width: 90 }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {pendingOrders.map(order => (
                <tr key={order.id} style={{ background: order.status === "sent" || order.status === "완료" ? "#f9f9f9" : order.status === "failed" ? "#fff5f5" : "#fff", opacity: order.status === "sent" || order.status === "완료" ? 0.6 : 1 }}>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee", fontWeight: 600 }}>{order.chat_room}</td>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>
                    {editingId === order.id ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <input value={editMessage} onChange={(e) => setEditMessage(e.target.value)} style={{ flex: 1, padding: "4px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12 }} />
                        <button onClick={() => saveEditMessage(order.id)} style={{ padding: "4px 8px", background: "#2e5b86", color: "#fff", border: "none", borderRadius: 4, fontSize: 11 }}>저장</button>
                        <button onClick={() => setEditingId(null)} style={{ padding: "4px 8px", background: "#eee", border: "none", borderRadius: 4, fontSize: 11 }}>취소</button>
                      </div>
                    ) : (
                      <span onClick={() => { if (order.status === "pending") { setEditingId(order.id); setEditMessage(order.message); }}} style={{ cursor: order.status === "pending" ? "pointer" : "default" }} title={order.status === "pending" ? "클릭하여 수정" : ""}>
                        {order.message}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee", textAlign: "center", fontSize: 11 }}>{order.delivery_date?.slice(5)}</td>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee", textAlign: "center" }}>{renderStatusBadge(order.status)}</td>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                    {order.status === "pending" && editingId !== order.id && (
                      <button onClick={() => sendOrder(order.id)} style={{ padding: "4px 10px", background: "#4caf50", color: "#fff", border: "none", borderRadius: 4, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                        📤 전송
                      </button>
                    )}
                    {order.status === "ready" && <span style={{ color: "#1565c0", fontSize: 10 }}>⏳</span>}
                    {order.status === "failed" && (
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button onClick={() => updateOrderStatus(order.id, "pending")} style={{ padding: "3px 6px", background: "#fff3e0", border: "1px solid #ff9800", color: "#e65100", borderRadius: 4, fontSize: 10, cursor: "pointer" }}>재시도</button>
                        <button onClick={() => handleManualCopy(order.message, order.id, "order", order.chat_room)} style={{ padding: "3px 6px", background: "#2e5b86", color: "#fff", border: "none", borderRadius: 4, fontSize: 10, cursor: "pointer" }}>복사</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 배차 요청 테이블 */}
      <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb" }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #eee", background: "#fafbfc", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>🚚 배차 요청 (내일 출고)</span>
          <span style={{ padding: "2px 8px", background: dispatchCount > 0 ? "#fff3e0" : "#e8f5e9", color: dispatchCount > 0 ? "#e65100" : "#2e7d32", borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
            {dispatchCount > 0 ? `${dispatchCount}건` : "✅"}
          </span>
        </div>

        {deliveryTasks.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "#888", fontSize: 13 }}>내일 출고 건 없음</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f9f9f9" }}>
                <th style={{ padding: "8px", textAlign: "center", borderBottom: "1px solid #eee", width: 50 }}>유형</th>
                <th style={{ padding: "8px", textAlign: "center", borderBottom: "1px solid #eee", width: 50 }}>규격</th>
                <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #eee", width: 70 }}>고객</th>
                <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #eee" }}>메시지 미리보기</th>
                <th style={{ padding: "8px", textAlign: "center", borderBottom: "1px solid #eee", width: 70 }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {deliveryTasks.map(task => {
                const message = generateDispatchMessage(task);
                const isComplete = task.dispatch_status === "완료";
                return (
                  <tr key={task.quote_id} style={{ background: isComplete ? "#f9f9f9" : "#fff", opacity: isComplete ? 0.6 : 1 }}>
                    <td style={{ padding: "8px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                      <span style={{ padding: "2px 6px", background: task.contract_type === "rental" ? "#e3f2fd" : task.contract_type === "used" ? "#fff3e0" : "#e8f5e9", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                        {task.contract_type === "rental" ? "임대" : task.contract_type === "used" ? "중고" : "신품"}
                      </span>
                    </td>
                    <td style={{ padding: "8px", borderBottom: "1px solid #eee", textAlign: "center", fontWeight: 600 }}>{task.spec}</td>
                    <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>{task.customer_name}</td>
                    <td style={{ padding: "8px", borderBottom: "1px solid #eee", fontSize: 11, color: "#666" }}>{message.slice(0, 40)}...</td>
                    <td style={{ padding: "8px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                      {isComplete ? (
                        <span style={{ color: "#4caf50", fontSize: 10 }}>✅</span>
                      ) : (
                        <button onClick={() => handleManualCopy(message, task.quote_id, "dispatch", "배차기사")} style={{ padding: "4px 10px", background: "#2e5b86", color: "#fff", border: "none", borderRadius: 4, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                          📋 복사
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
