const GAS_URL = "/gas/macros/s/AKfycbwnF6dHe0RubCtE2Zt_kPXBhqV-BzdnrgaP_Ll0X-B9y8aWx8ETnxJxfQPycNpnmRv-/exec";


export async function gasRpc(fn: string, args: any[] = []) {
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fn, args }),
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`GAS 응답이 JSON이 아님: ${text.slice(0, 200)}`);
  }

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  return data;
}
