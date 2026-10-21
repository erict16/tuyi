export async function api(path, options = {}) {
  const { json, ...rest } = options;
  const init = { ...rest };
  if (json !== undefined) {
    init.method = init.method || "POST";
    init.body = JSON.stringify(json);
  }
  if (!(init.body instanceof FormData)) {
    init.headers = { "Content-Type": "application/json", ...(init.headers || {}) };
  }
  let response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new Error("连不上图译后台，请重开图译。");
  }
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { detail: text };
  }
  if (!response.ok) {
    const detail = data.detail || data.message || `HTTP ${response.status}`;
    throw new Error(typeof detail === "string" ? detail : "请求失败");
  }
  return data;
}

export function uploadDrawings(fileList) {
  const form = new FormData();
  fileList.forEach((file) => form.append("files", file));
  return api("/api/drawings/open", { method: "POST", body: form });
}
