export const MCP_SCOPES = ['read', 'write', 'delete'] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

export type McpToken = { token: string; scopes: Set<McpScope> };
