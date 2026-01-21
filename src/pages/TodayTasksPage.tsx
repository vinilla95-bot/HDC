// src/pages/TodayTasksPage.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../QuoteService";

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
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const [dispatchMessages, setDispatchMessages] = useState<Record<string, string>>({});

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
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

    await generatePendingOrders();

    // ✅ 모든 대기중인 주문 표시 (견적 확정 즉시)
    const { data: orders } = await supabase
      .from("pending_orders")
      .select("*")
      .in("status", ["pending", "ready", "failed"])
      .order("order_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (orders) setPendingOrders(orders);

    const { data: deliveries } = await supabase
      .from("quotes")
      .select("*")
      .eq("status", "confirmed")
      .eq("delivery_date", tomorrow)
      .neq("contract_type", "memo");

    if (deliveries) {
      setDeliveryTasks(deliveries);
      const msgs: Record<string, string> = {};
      deliveries.forEach((task: DeliveryTask) => {
        msgs[task.quote_id] = generateDispatchMessage(task);
      });
      setDispatchMessages(msgs);
    }
    setLoading(false);
  };

  const generatePendingOrders = async () => {
    const { data: rules } = await supabase.from("order_rules").select("*");
    if (!rules || rules.length === 0) return;

    const today = new Date();
    const twoWeeksLater = new Date(today);
    twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);

    const { data: quotes } = await supabase
      .from("quotes")
      .select("*")
      .eq("status", "confirmed")
      .gte("delivery_date", today.toISOString().split("T")[0])
      .lte("delivery_date", twoWeeksLater.toISOString().split("T")[0]);

    if (!quotes || quotes.length === 0) return;

    const { data: existingOrders } = await supabase
      .from("pending_orders")
      .select("quote_id, rule_id");

    const existingSet = new Set(
      (existingOrders || []).map((o: any) => `${o.quote_id}_${o.rule_id}`)
    );

    for (const quote of quotes) {
      if (!quote.items || quote.items.length === 0) continue;

      for (const item of quote.items) {
        const optionName = (item.optionName || item.displayName || item.itemName || "").toLowerCase();

        for (const rule of rules) {
          const keywords = rule.keywords as string[];
          const matched = keywords.some((kw: string) => optionName.includes(kw.toLowerCase()));

          if (matched) {
            const key = `${quote.quote_id}_${rule.id}`;
            if (existingSet.has(key)) continue;

            const deliveryDate = new Date(quote.delivery_date);
            const orderDate = new Date(deliveryDate);
            orderDate.setDate(orderDate.getDate() - rule.lead_days);

            const message = buildMessage(rule.message_template, {
              month: deliveryDate.getMonth() + 1,
              day: deliveryDate.getDate(),
              qty: item.qty || 1,
              customer: quote.customer_name || "",
              option_name: item.optionName || item.displayName || "",
              spec: quote.spec || "",
              color: extractColor(optionName) || "색상미정"
            });

            await supabase.from("pending_orders").insert({
              quote_id: quote.quote_id,
              rule_id: rule.id,
              chat_room: rule.chat_room,
              message: message,
              order_date: orderDate.toISOString().split("T")[0],
              delivery_date: quote.delivery_date,
              status: "pending"
            });

            existingSet.add(key);
          }
        }
      }
    }
  };

  const buildMessage = (template: string, data: any) => {
    return template
      .replace("{month}", data.month)
      .replace("{day}", data.day)
      .replace("{qty}", data.qty)
      .replace("{customer}", data.customer)
      .replace("{option_name}", data.option_name)
      .replace("{spec}", data.spec)
      .replace("{color}", data.color);
  };

  const extractColor = (text: string) => {
    const colors = ["화이트", "흰색", "백색", "그레이", "회색", "베이지", "아이보리", "블랙", "검정", "우드", "나무", "브라운", "갈색"];
    for (const color of colors) {
      if (text.includes(color)) return color;
    }
    return null;
  };

  const generateDispatchMessage = (task: DeliveryTask) => {
    const [, month, day] = task.delivery_date.split("-").map(Number);
    
    const date = new Date(task.delivery_date);
    const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
    const dayOfWeek = dayNames[date.getDay()];
    
    const timeMatch = task.site_addr?.match(/^(오전|오후)?\s*(\d{1,2}시반?|\d{1,2}:\d{2})/);
    const timeStr = timeMatch ? timeMatch[0].trim() : "";
    
    const addrWithoutTime = task.site_addr?.replace(/^(오전|오후)?\s*(\d{1,2}시반?|\d{1,2}:\d{2})\s*/, "").trim() || "";
    
    const dateStr = `${month}/${day}(${dayOfWeek})${timeStr ? " " + timeStr : ""}`;
    
    const qty = task.items?.find((i: any) => 
      (i.optionName || i.displayName || "").toLowerCase().includes("컨테이너")
    )?.qty || 1;

    const optionNames = task.items?.map((i: any) => i.optionName || i.displayName || "").filter(Boolean).join("/") || "기본형";

    let saleType = "신품판매";
    if (task.contract_type === "used") saleType = "중고판매";
    else if (task.contract_type === "rental") saleType = "임대";

    let text = `사장님 ${dateStr} ${saleType} (${task.spec || ""})(${qty})동(${optionNames}) 상차 현대 하차 ${addrWithoutTime}`;
    text += ` ${task.customer_name || ""}`;
    text += ` 인수자 ${task.customer_phone || ""} 입니다~`;

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

  const saveDispatchMessage = (quoteId: string) => {
    setDispatchMessages(prev => ({ ...prev, [quoteId]: editMessage }));
    setEditingId(null);
    setEditMessage("");
  };

  const handleManualCopy = async (message: string, id: number | string, type: "order" | "dispatch", chatRoom: string) => {
    try {
      await navigator.clipboard.writeText(message);
      alert(`📋 복사됨!\n\n"${chatRoom}" 채팅방에 붙여넣기 하세요.`);
      if (type === "order") await updateOrderStatus(id as number, "sent");
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

  // ✅ 주문일 기준 긴급도 표시
  const getUrgencyBadge = (orderDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const order = new Date(orderDate);
    order.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((order.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { bg: "#ffebee", color: "#c62828", text: "⚠️ 지남" };
    } else if (diffDays === 0) {
      return { bg: "#fff3e0", color: "#e65100", text: "🔥 오늘" };
    } else if (diffDays === 1) {
      return { bg: "#fff8e1", color: "#f57f17", text: "내일" };
    } else if (diffDays <= 3) {
      return { bg: "#e3f2fd", color: "#1565c0", text: `D-${diffDays}` };
    } else {
      return { bg: "#f5f5f5", color: "#757575", text: `D-${diffDays}` };
    }
  };

  const renderStatusBadge = (status: string) => {
    const styles: Record<string, any> = {
      pending: { bg: "#fff3e0", color: "#e65100", text: "대기" },
      ready: { bg: "#e3f2fd", color: "#1565c0", text: "전송중" },
      sent: { bg: "#e8f5e9", color: "#2e7d32", text: "완료" },
      failed: { bg: "#ffebee", color: "#c62828", text: "실패" },
    };
    const s = styles[status] || styles.pending;
    return (
      <span style={{ padding: "4px 10px", background: s.bg, color: s.color, borderRadius: 6, fontSize: 13, fontWeight: 700 }}>
        {s.text}
      </span>
    );
  };

  const pendingCount = pendingOrders.filter(o => o.status === "pending").length;
  const dispatchCount = deliveryTasks.filter(d => d.dispatch_status !== "완료").length;

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 16 }}>로딩 중...</div>;
  }

  return (
    <div style={{ padding: 24, background: "#f6f7fb", minHeight: "100vh", maxWidth: 1000, margin: "0 auto" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>
          📋 오늘 할 일
          {(pendingCount + dispatchCount) > 0 && (
            <span style={{ marginLeft: 12, padding: "6px 14px", background: "#e53935", color: "#fff", borderRadius: 12, fontSize: 16 }}>
              {pendingCount + dispatchCount}건
            </span>
          )}
        </h2>
        <button onClick={loadTasks} style={{ padding: "10px 20px", background: "#2e5b86", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 15 }}>
          🔄 새로고침
        </button>
      </div>

      {/* 안내 */}
      <div style={{ background: "#e3f2fd", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 14, color: "#1565c0" }}>
        🤖 Python 봇 실행 중 → "전송" 누르면 카카오톡 자동 전송 | 🔥오늘/내일 = 주문 마감일
      </div>

      {/* 자재 주문 */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e0e0e0", marginBottom: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #eee", background: "#fafbfc", display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: "12px 12px 0 0" }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>📦 자재 주문</span>
          <span style={{ padding: "4px 12px", background: pendingCount > 0 ? "#fff3e0" : "#e8f5e9", color: pendingCount > 0 ? "#e65100" : "#2e7d32", borderRadius: 12, fontSize: 14, fontWeight: 700 }}>
            {pendingCount > 0 ? `${pendingCount}건 대기` : "✅ 완료"}
          </span>
        </div>

        {pendingOrders.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "#888", fontSize: 15 }}>주문할 자재가 없습니다</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                <th style={{ padding: "14px 12px", textAlign: "center", borderBottom: "2px solid #ddd", fontSize: 14, fontWeight: 800, width: 70 }}>주문일</th>
                <th style={{ padding: "14px 12px", textAlign: "left", borderBottom: "2px solid #ddd", fontSize: 14, fontWeight: 800, width: 90 }}>채팅방</th>
                <th style={{ padding: "14px 12px", textAlign: "left", borderBottom: "2px solid #ddd", fontSize: 14, fontWeight: 800 }}>메시지 (클릭하여 수정)</th>
                <th style={{ padding: "14px 12px", textAlign: "center", borderBottom: "2px solid #ddd", fontSize: 14, fontWeight: 800, width: 70 }}>출고일</th>
                <th style={{ padding: "14px 12px", textAlign: "center", borderBottom: "2px solid #ddd", fontSize: 14, fontWeight: 800, width: 70 }}>상태</th>
                <th style={{ padding: "14px 12px", textAlign: "center", borderBottom: "2px solid #ddd", fontSize: 14, fontWeight: 800, width: 120 }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {pendingOrders.map(order => {
                const urgency = getUrgencyBadge(order.order_date);
                return (
                  <tr key={order.id} style={{ background: order.status === "sent" ? "#fafafa" : order.status === "failed" ? "#fff5f5" : urgency.text === "⚠️ 지남" || urgency.text === "🔥 오늘" ? "#fffde7" : "#fff" }}>
                    <td style={{ padding: "14px 12px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                      <span style={{ padding: "4px 8px", background: urgency.bg, color: urgency.color, borderRadius: 6, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                        {urgency.text}
                      </span>
                    </td>
                    <td style={{ padding: "14px 12px", borderBottom: "1px solid #eee", fontWeight: 700, fontSize: 14 }}>{order.chat_room}</td>
                    <td style={{ padding: "14px 12px", borderBottom: "1px solid #eee", fontSize: 14 }}>
                      {String(editingId) === String(order.id) ? (
                        <div style={{ display: "flex", gap: 8 }}>
                          <input 
                            value={editMessage} 
                            onChange={(e) => setEditMessage(e.target.value)} 
                            style={{ flex: 1, padding: "10px", border: "2px solid #2e5b86", borderRadius: 8, fontSize: 14 }} 
                            autoFocus
                          />
                          <button onClick={() => saveEditMessage(order.id)} style={{ padding: "10px 16px", background: "#2e5b86", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700 }}>저장</button>
                          <button onClick={() => setEditingId(null)} style={{ padding: "10px 16px", background: "#eee", border: "none", borderRadius: 8, fontSize: 13 }}>취소</button>
                        </div>
                      ) : (
                        <div 
                          onClick={() => { 
                            if (order.status === "pending") { 
                              setEditingId(order.id); 
                              setEditMessage(order.message); 
                            }
                          }} 
                          style={{ 
                            cursor: order.status === "pending" ? "pointer" : "default",
                            padding: "8px 10px",
                            borderRadius: 6,
                            background: order.status === "pending" ? "#f9f9f9" : "transparent",
                            border: order.status === "pending" ? "1px dashed #ccc" : "none"
                          }} 
                          title={order.status === "pending" ? "클릭하여 수정" : ""}
                        >
                          {order.message}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "14px 12px", borderBottom: "1px solid #eee", textAlign: "center", fontSize: 13 }}>{order.delivery_date?.slice(5)}</td>
                    <td style={{ padding: "14px 12px", borderBottom: "1px solid #eee", textAlign: "center" }}>{renderStatusBadge(order.status)}</td>
                    <td style={{ padding: "14px 12px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                      {order.status === "pending" && String(editingId) !== String(order.id) && (
                        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                          <button onClick={() => sendOrder(order.id)} style={{ padding: "8px 14px", background: "#4caf50", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                            📤 전송
                          </button>
                          <button onClick={() => handleManualCopy(order.message, order.id, "order", order.chat_room)} style={{ padding: "8px 14px", background: "#2e5b86", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                            📋
                          </button>
                        </div>
                      )}
                      {order.status === "ready" && (
                        <button onClick={() => updateOrderStatus(order.id, "pending")} style={{ padding: "8px 14px", background: "#fff3e0", border: "1px solid #ff9800", color: "#e65100", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                          ❌ 취소
                        </button>
                      )}
                      {order.status === "failed" && (
                        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                          <button onClick={() => updateOrderStatus(order.id, "pending")} style={{ padding: "6px 12px", background: "#fff3e0", border: "1px solid #ff9800", color: "#e65100", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>재시도</button>
                          <button onClick={() => handleManualCopy(order.message, order.id, "order", order.chat_room)} style={{ padding: "6px 12px", background: "#2e5b86", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>복사</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 배차 요청 */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e0e0e0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #eee", background: "#fafbfc", display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: "12px 12px 0 0" }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>🚚 배차 요청 (내일 출고)</span>
          <span style={{ padding: "4px 12px", background: dispatchCount > 0 ? "#fff3e0" : "#e8f5e9", color: dispatchCount > 0 ? "#e65100" : "#2e7d32", borderRadius: 12, fontSize: 14, fontWeight: 700 }}>
            {dispatchCount > 0 ? `${dispatchCount}건 대기` : "✅ 완료"}
          </span>
        </div>

        {deliveryTasks.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "#888", fontSize: 15 }}>내일 출고 건 없음</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                <th style={{ padding: "14px 16px", textAlign: "center", borderBottom: "2px solid #ddd", fontSize: 15, fontWeight: 800, width: 70 }}>유형</th>
                <th style={{ padding: "14px 16px", textAlign: "center", borderBottom: "2px solid #ddd", fontSize: 15, fontWeight: 800, width: 70 }}>규격</th>
                <th style={{ padding: "14px 16px", textAlign: "left", borderBottom: "2px solid #ddd", fontSize: 15, fontWeight: 800, width: 90 }}>고객</th>
                <th style={{ padding: "14px 16px", textAlign: "left", borderBottom: "2px solid #ddd", fontSize: 15, fontWeight: 800 }}>메시지 (클릭하여 수정)</th>
                <th style={{ padding: "14px 16px", textAlign: "center", borderBottom: "2px solid #ddd", fontSize: 15, fontWeight: 800, width: 100 }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {deliveryTasks.map(task => {
                const message = dispatchMessages[task.quote_id] || generateDispatchMessage(task);
                const isComplete = task.dispatch_status === "완료";
                return (
                  <tr key={task.quote_id} style={{ background: isComplete ? "#fafafa" : "#fff" }}>
                    <td style={{ padding: "16px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                      <span style={{ padding: "6px 12px", background: task.contract_type === "rental" ? "#e3f2fd" : task.contract_type === "used" ? "#fff3e0" : "#e8f5e9", borderRadius: 6, fontSize: 13, fontWeight: 700 }}>
                        {task.contract_type === "rental" ? "임대" : task.contract_type === "used" ? "중고" : "신품"}
                      </span>
                    </td>
                    <td style={{ padding: "16px", borderBottom: "1px solid #eee", textAlign: "center", fontWeight: 700, fontSize: 15 }}>{task.spec}</td>
                    <td style={{ padding: "16px", borderBottom: "1px solid #eee", fontSize: 15 }}>{task.customer_name}</td>
                    <td style={{ padding: "16px", borderBottom: "1px solid #eee", fontSize: 14 }}>
                      {editingId === task.quote_id ? (
                        <div style={{ display: "flex", gap: 8 }}>
                          <input 
                            value={editMessage} 
                            onChange={(e) => setEditMessage(e.target.value)} 
                            style={{ flex: 1, padding: "12px", border: "2px solid #2e5b86", borderRadius: 8, fontSize: 14 }} 
                            autoFocus
                          />
                          <button onClick={() => saveDispatchMessage(task.quote_id)} style={{ padding: "12px 20px", background: "#2e5b86", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700 }}>확인</button>
                          <button onClick={() => setEditingId(null)} style={{ padding: "12px 20px", background: "#eee", border: "none", borderRadius: 8, fontSize: 14 }}>취소</button>
                        </div>
                      ) : (
                        <span 
                          onClick={() => { 
                            if (!isComplete) { 
                              setEditingId(task.quote_id); 
                              setEditMessage(message); 
                            }
                          }} 
                          style={{ 
                            cursor: isComplete ? "default" : "pointer",
                            padding: "8px 12px",
                            display: "block",
                            borderRadius: 6,
                            background: isComplete ? "transparent" : "#f9f9f9",
                            border: isComplete ? "none" : "1px dashed #ccc",
                            color: "#444"
                          }} 
                          title={isComplete ? "" : "클릭하여 수정"}
                        >
                          {message}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "16px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                      {isComplete ? (
                        <span style={{ color: "#4caf50", fontSize: 14, fontWeight: 600 }}>✅ 완료</span>
                      ) : (
                        <button 
                          onClick={() => handleManualCopy(dispatchMessages[task.quote_id] || message, task.quote_id, "dispatch", "배차기사")} 
                          style={{ padding: "10px 20px", background: "#2e5b86", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                        >
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
