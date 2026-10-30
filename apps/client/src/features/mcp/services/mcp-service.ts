import api from "@/lib/api-client";

export type McpScope = "read" | "write" | "delete";

export interface IMcpToken {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: McpScope[];
  createdAt: string;
  lastUsedAt: string | null;
}

export interface IMcpInfo {
  endpoint: string;
  envTokens: { hint: string; scopes: McpScope[] }[];
  tokens: IMcpToken[];
}

export async function getMcpInfo(): Promise<IMcpInfo> {
  const req = await api.post<IMcpInfo>("/mcp-tokens/info");
  return req.data;
}

export async function createMcpToken(data: {
  name: string;
  scopes: McpScope[];
}): Promise<IMcpToken & { token: string }> {
  const req = await api.post("/mcp-tokens/create", data);
  return req.data;
}

export async function revokeMcpToken(id: string): Promise<void> {
  await api.post("/mcp-tokens/revoke", { id });
}
