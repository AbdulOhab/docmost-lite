import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button, Group, Loader, useComputedColorScheme } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconDeviceFloppy, IconDownload } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  Excalidraw,
  exportToBlob,
  exportToSvg,
  loadFromBlob,
  useHandleLibrary,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import DiagramHeader, { editorFrameStyle, SaveStatus, StatusBadge } from "./diagram-header";
import { getFileUrl } from "@/lib/config.ts";
import { svgStringToFile } from "@/lib";
import { localStorageLibraryAdapter } from "@/features/editor/components/excalidraw/excalidraw-utils.ts";
import { getEnabledLibraryItems } from "@/features/diagrams/library-service";
import {
  getDiagramAttrs,
  loadDiagram,
  saveDiagram,
} from "@/features/diagrams/diagram-service";

type Status = SaveStatus;
const AUTOSAVE_MS = 3000;

const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function ExcalidrawEditor({ pageId }: { pageId: string }) {
  const { t } = useTranslation();
  const location = useLocation();
  const queryClient = useQueryClient();
  const colorScheme = useComputedColorScheme();

  const { data: page, isError } = useQuery({
    queryKey: ["diagram", pageId],
    queryFn: () => loadDiagram(pageId),
    enabled: !!pageId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);

  // Personal shapes live in localStorage; the library packs enabled in Settings
  // are mixed in when the editor loads and are never written back to it.
  const serverIdsRef = useRef<Set<string>>(new Set());
  const libraryAdapter = useMemo(
    () => ({
      async load(meta: { source: "load" | "save" }) {
        const local: any = await localStorageLibraryAdapter.load(meta);
        let server: any[] = [];
        try {
          server = await queryClient.fetchQuery({
            queryKey: ["diagram-library-items"],
            queryFn: getEnabledLibraryItems,
            staleTime: 60_000,
          });
        } catch {
          /* offline or not allowed: personal shapes still load */
        }
        serverIdsRef.current = new Set(server.map((i) => i.id));
        const seen = new Set<string>();
        const items: any[] = [];
        for (const item of [...(local?.libraryItems ?? []), ...server]) {
          if (item?.id && !seen.has(item.id)) {
            seen.add(item.id);
            items.push(item);
          }
        }
        return { libraryItems: items };
      },
      save(data: { libraryItems: any[] }) {
        return localStorageLibraryAdapter.save({
          libraryItems: data.libraryItems.filter((i) => !serverIdsRef.current.has(i.id)),
        });
      },
    }),
    [queryClient],
  );
  useHandleLibrary({ excalidrawAPI: api, adapter: libraryAdapter });

  const [initialData, setInitialData] = useState<any>(undefined);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status>("saved");
  const [title, setTitle] = useState("");
  const incomingScene = (location.state as any)?.scene;

  const pageRef = useRef(page);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  const fingerprintRef = useRef<string | null>(null);
  const pendingImportRef = useRef(false);

  // load the stored drawing once
  useEffect(() => {
    if (!page || ready) return;
    pageRef.current = page;
    setTitle(page.title ?? "");

    const { src } = getDiagramAttrs(page);
    if (!src) {
      // a scene handed over by "Convert to Excalidraw" from a Mermaid diagram
      if (incomingScene) {
        setInitialData({ ...incomingScene, scrollToContent: true });
        pendingImportRef.current = true;
      }
      setReady(true);
      return;
    }
    (async () => {
      try {
        const res = await fetch(getFileUrl(src), {
          credentials: "include",
          cache: "no-store",
        });
        setInitialData({
          ...(await loadFromBlob(await res.blob(), null, null)),
          scrollToContent: true,
        });
      } catch (err) {
        console.error(err);
        notifications.show({ message: t("Could not load the drawing"), color: "red" });
      } finally {
        setReady(true);
      }
    })();
  }, [page, ready, t]);

  const save = useCallback(async () => {
    if (!api || !pageRef.current || savingRef.current) return;
    window.clearTimeout(timerRef.current);
    savingRef.current = true;
    setStatus("saving");
    try {
      const svg = await exportToSvg({
        elements: api.getSceneElements(),
        appState: { exportEmbedScene: true, exportWithDarkMode: false },
        files: api.getFiles(),
      });
      const svgString = new XMLSerializer()
        .serializeToString(svg)
        .replace(
          /https:\/\/unpkg\.com\/@excalidraw\/excalidraw@undefined/g,
          "https://unpkg.com/@excalidraw/excalidraw@latest",
        );
      const file = await svgStringToFile(svgString, "diagram.excalidraw.svg");

      const attrs = await saveDiagram(pageRef.current, file);
      // keep the attachment id so the next save overwrites the same file
      pageRef.current = {
        ...pageRef.current,
        content: {
          type: "doc",
          content: [{ type: "excalidraw", attrs }],
        } as any,
      };
      dirtyRef.current = false;
      setStatus("saved");
      queryClient.invalidateQueries({ queryKey: ["diagrams"] });
    } catch (err) {
      console.error(err);
      setStatus("error");
    } finally {
      savingRef.current = false;
    }
  }, [api, queryClient]);

  const schedule = useCallback(() => {
    dirtyRef.current = true;
    setStatus((s) => (s === "saving" ? s : "dirty"));
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => save(), AUTOSAVE_MS);
  }, [save]);

  const onChange = useCallback(
    (elements: readonly any[], _app: any, files: any) => {
      const fp = `${elements.length}:${elements.reduce((s, e) => s + (e.version || 0), 0)}:${Object.keys(files).length}`;
      if (fingerprintRef.current === null) {
        fingerprintRef.current = fp; // first call is the initial load
        return;
      }
      if (fp !== fingerprintRef.current) {
        fingerprintRef.current = fp;
        schedule();
      }
    },
    [schedule],
  );

  // Ctrl/Cmd+S, and a warning if the tab is closed with unsaved work
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
      window.clearTimeout(timerRef.current);
    };
  }, [save]);

  // leaving through the app: flush pending changes
  useEffect(
    () => () => {
      if (dirtyRef.current) save();
    },
    [save],
  );

  const exportPng = async () => {
    if (!api) return;
    const blob = await exportToBlob({
      elements: api.getSceneElements(),
      appState: { ...api.getAppState(), exportBackground: true },
      files: api.getFiles(),
      mimeType: "image/png",
    });
    download(blob, `${title || "diagram"}.png`);
  };

  const exportSvg = async () => {
    if (!api) return;
    const svg = await exportToSvg({
      elements: api.getSceneElements(),
      appState: { ...api.getAppState(), exportBackground: true, exportEmbedScene: true },
      files: api.getFiles(),
    });
    download(
      new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }),
      `${title || "diagram"}.excalidraw.svg`,
    );
  };

  if (isError) {
    return <div style={{ padding: 24 }}>{t("Diagram not found")}</div>;
  }

  // an imported scene is saved right away so the diagram is not left empty
  useEffect(() => {
    if (api && pendingImportRef.current) {
      pendingImportRef.current = false;
      schedule();
    }
  }, [api, schedule]);

  return (
    <div style={editorFrameStyle}>
      {page && (
        <DiagramHeader pageId={pageId} initialTitle={page.title} onTitle={setTitle}>
          <StatusBadge status={status} />
          <Button size="xs" variant="default" leftSection={<IconDownload size={14} />} onClick={exportPng} disabled={!api}>PNG</Button>
          <Button size="xs" variant="default" leftSection={<IconDownload size={14} />} onClick={exportSvg} disabled={!api}>SVG</Button>
          <Button size="xs" leftSection={<IconDeviceFloppy size={14} />} onClick={save} loading={status === "saving"} disabled={!api}>
            {t("Save")}
          </Button>
        </DiagramHeader>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>
        {!ready ? (
          <Group justify="center" mt="xl"><Loader /></Group>
        ) : (
          <Excalidraw
            excalidrawAPI={(a) => setApi(a)}
            initialData={initialData}
            onChange={onChange}
            theme={colorScheme}
            UIOptions={{ canvasActions: { loadScene: true, saveToActiveFile: false } }}
          />
        )}
      </div>
    </div>
  );
}
