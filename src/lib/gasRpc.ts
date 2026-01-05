const GAS_URL = "https://script.google.com/macros/s/AKfycbyTGGQnxlfFpqP5zS0kf7m9kzSK29MGZbeW8GUMlAja04mRJHRszuRdpraPdmOWxNNr/exec";

export async function gasRpc(fn: string, args: any[] = []) {
  const payload = encodeURIComponent(JSON.stringify({ fn, args }));
  const url = `${GAS_URL}?p=${payload}`;
  
  const res = await fetch(url, {
    method: "GET",
    redirect: "follow",
  });
  
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`GAS 응답이 JSON이 아님: ${text.slice(0, 200)}`);
  }
  return data;
}
