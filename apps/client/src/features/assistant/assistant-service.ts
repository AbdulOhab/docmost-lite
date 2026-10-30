import api from "@/lib/api-client";

export type ModelOption = { ref: string; label: string; provider: string };

export type AssistantStatus =
  | { enabled: true; models: ModelOption[]; defaultModel: string }
  | { enabled: false; reason: string; models: [] };

export interface ModelEntry {
  id: string;
  label?: string;
}

export interface IAiProvider {
  id: string;
  name: string;
  baseUrl: string;
  models: ModelEntry[];
  enabled: boolean;
  source: "db" | "env";
  hasKey: boolean;
  keyUnreadable: boolean;
  keyHint: string | null;
}

export interface IAiSettings {
  defaultModel?: string;
  instructions: string;
  temperature: number;
  maxSteps: number;
}

export interface IAiAdminState {
  providers: IAiProvider[];
  settings: IAiSettings;
  models: ModelOption[];
}

export async function getAssistantStatus(): Promise<AssistantStatus> {
  return (await api.post("/ai/status")).data;
}

export async function getAiAdminState(): Promise<IAiAdminState> {
  return (await api.post("/ai/settings")).data;
}

export async function saveAiSettings(data: Partial<IAiSettings>): Promise<IAiSettings> {
  return (await api.post("/ai/settings/save", data)).data;
}

export async function saveProvider(data: {
  id?: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  models: ModelEntry[];
}): Promise<{ id: string }> {
  return (await api.post("/ai/providers/save", data)).data;
}

export async function toggleProvider(id: string, enabled: boolean) {
  await api.post("/ai/providers/toggle", { id, enabled });
}

export async function deleteProvider(id: string) {
  await api.post("/ai/providers/delete", { id });
}

export type TestResult = { ok: boolean; ms: number; reply?: string; error?: string };

export async function testProvider(data: {
  id?: string;
  baseUrl?: string;
  apiKey?: string;
  model: string;
}): Promise<TestResult> {
  return (await api.post("/ai/providers/test", data)).data;
}

export async function fetchProviderModels(data: {
  id?: string;
  baseUrl?: string;
  apiKey?: string;
}): Promise<{ ok: boolean; models: string[]; error?: string }> {
  return (await api.post("/ai/providers/models", data)).data;
}
