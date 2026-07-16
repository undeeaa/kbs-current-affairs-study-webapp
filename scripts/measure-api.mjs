const baseUrl = process.env.VITE_API_URL || process.argv[2];
const samples = Number(process.env.SAMPLES || 8);

if (!baseUrl) {
  process.stderr.write("VITE_API_URL 또는 첫 번째 인자로 Apps Script /exec URL을 지정해주세요.\n");
  process.exit(1);
}

const percentile = (values, ratio) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
};

const measure = async (action, params = {}) => {
  const values = [];
  let bytes = 0;
  for (let index = 0; index < samples; index += 1) {
    const url = new URL(baseUrl);
    url.searchParams.set("action", action);
    url.searchParams.set("ts", String(Date.now()));
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const startedAt = performance.now();
    const response = await fetch(url, { cache: "no-store", redirect: "follow" });
    const body = await response.text();
    if (!response.ok) throw new Error(`${action}: HTTP ${response.status}`);
    const envelope = JSON.parse(body);
    if (!envelope.ok) throw new Error(`${action}: ${envelope.error?.message || "요청 실패"}`);
    values.push(performance.now() - startedAt);
    bytes = new TextEncoder().encode(body).length;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  process.stdout.write(`${action.padEnd(11)} min=${Math.min(...values).toFixed(0)}ms median=${percentile(values, 0.5).toFixed(0)}ms p95=${percentile(values, 0.95).toFixed(0)}ms mean=${mean.toFixed(0)}ms bytes=${bytes}\n`);
};

await measure("status");
await measure("bootstrap");
await measure("history");
