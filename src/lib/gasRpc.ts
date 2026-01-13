// src/lib/gasRpc.ts
const GAS_URL = "https://script.google.com/macros/s/AKfycbyTGGQnxlfFpqP5zS0kf7m9kzSK29MGZbeW8GUMlAja04mRJHRszuRdpraPdmOWxNNr/exec";

export async function gasRpc(fn: string, args: any[] = []) {
  const payload = JSON.stringify({ fn, args });
  
  const isLarge = payload.length > 2000;
  
  let res: Response;
  
  if (isLarge) {
    res = await fetch(GAS_URL, {
      method: "POST",
      body: payload,
      redirect: "follow",
    });
  } else {
    const url = `${GAS_URL}?p=${encodeURIComponent(payload)}`;
    res = await fetch(url, {
      method: "GET",
      redirect: "follow",
    });
  }
  
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`GAS 응답이 JSON이 아님: ${text.slice(0, 200)}`);
  }
  return data;
}
