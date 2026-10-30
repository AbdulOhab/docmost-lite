import api from "@/lib/api-client";

export interface IDiagramLibrary {
  id: string;
  name: string;
  source: string | null;
  itemCount: number;
  enabled: boolean;
  createdAt: string;
}

export interface ICatalogEntry {
  name: string;
  description: string;
  author: string;
  source: string;
}

export const LIBRARY_FILE_BASE = "https://libraries.excalidraw.com/libraries/";

export async function listLibraries(): Promise<IDiagramLibrary[]> {
  return (await api.post("/diagram-libraries")).data;
}

export async function getEnabledLibraryItems(): Promise<any[]> {
  return (await api.post("/diagram-libraries/enabled")).data;
}

export async function getCatalog(): Promise<ICatalogEntry[]> {
  return (await api.post("/diagram-libraries/catalog")).data;
}

export async function uploadLibrary(name: string, content: object) {
  return (await api.post("/diagram-libraries/upload", { name, content })).data;
}

export async function installLibrary(url: string, name?: string) {
  return (await api.post("/diagram-libraries/install", { url, name })).data;
}

export async function toggleLibrary(id: string, enabled: boolean) {
  await api.post("/diagram-libraries/toggle", { id, enabled });
}

export async function deleteLibrary(id: string) {
  await api.post("/diagram-libraries/delete", { id });
}
