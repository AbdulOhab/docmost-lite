import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Textarea,
  useComputedColorScheme,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconDeviceFloppy, IconDownload, IconScribble } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import mermaid from "mermaid";
import DOMPurify from "dompurify";
import DiagramHeader, { editorFrameStyle, SaveStatus, StatusBadge } from "./diagram-header";
import {
  createDiagram,
  ensureDiagramsSpace,
  getMermaidCode,
  loadDiagram,
  saveMermaid,
} from "@/features/diagrams/diagram-service";

const AUTOSAVE_MS = 2000;

export default function MermaidEditor({ pageId }: { pageId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const colorScheme = useComputedColorScheme();

  const { data: page } = useQuery({
    queryKey: ["diagram", pageId],
    queryFn: () => loadDiagram(pageId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const [code, setCode] = useState<string | null>(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [converting, setConverting] = useState(false);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  const codeRef = useRef("");

  useEffect(() => {
    if (page && code === null) {
      const initial = getMermaidCode(page);
      setCode(initial);
      codeRef.current = initial;
    }
  }, [page, code]);

  // live preview
  useEffect(() => {
    if (code === null) return;
    mermaid.initialize({
      startOnLoad: false,
      suppressErrorRendering: true,
      theme: colorScheme === "light" ? "default" : "dark",
    });
    const handle = window.setTimeout(async () => {
      if (!code.trim()) {
        setSvg("");
        setError("");
        return;
      }
      try {
        const out = await mermaid.render(`mmd-${Date.now()}`, code);
        setSvg(out.svg);
        setError("");
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
    }, 350);
    return () => window.clearTimeout(handle);
  }, [code, colorScheme]);

  const save = useCallback(async () => {
    window.clearTimeout(timerRef.current);
    setStatus("saving");
    try {
      await saveMermaid(pageId, codeRef.current);
      dirtyRef.current = false;
      setStatus("saved");
      queryClient.invalidateQueries({ queryKey: ["diagrams"] });
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  }, [pageId, queryClient]);

  const onCode = (value: string) => {
    setCode(value);
    codeRef.current = value;
    dirtyRef.current = true;
    setStatus("dirty");
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(save, AUTOSAVE_MS);
  };

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
      if (dirtyRef.current) saveMermaid(pageId, codeRef.current).catch(() => {});
    };
  }, [save, pageId]);

  const downloadSvg = () => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${page?.title || "diagram"}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // turn the Mermaid text into editable Excalidraw shapes, in a new Excalidraw diagram
  const convert = async () => {
    setConverting(true);
    try {
      const { parseMermaidToExcalidraw } = await import("@excalidraw/mermaid-to-excalidraw");
      const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
      const { elements, files } = await parseMermaidToExcalidraw(codeRef.current);
      const scene = { elements: convertToExcalidrawElements(elements), files: files ?? {} };

      const space = await ensureDiagramsSpace();
      const created = await createDiagram(space.id, "excalidraw", `${page?.title || "Diagram"} (Excalidraw)`);
      queryClient.invalidateQueries({ queryKey: ["diagrams"] });
      navigate(`/diagrams/${created.id}`, { state: { scene } });
    } catch (e: any) {
      notifications.show({
        message: t("Could not convert this Mermaid diagram: {{reason}}", { reason: String(e?.message ?? e).slice(0, 120) }),
        color: "red",
      });
    } finally {
      setConverting(false);
    }
  };

  return (
    <div style={editorFrameStyle}>
      {page && (
        <DiagramHeader pageId={pageId} initialTitle={page.title}>
          <StatusBadge status={status} />
          <Button size="xs" variant="default" leftSection={<IconScribble size={14} />} onClick={convert} loading={converting} disabled={!code?.trim() || !!error}>
            {t("Convert to Excalidraw")}
          </Button>
          <Button size="xs" variant="default" leftSection={<IconDownload size={14} />} onClick={downloadSvg} disabled={!svg || !!error}>SVG</Button>
          <Button size="xs" leftSection={<IconDeviceFloppy size={14} />} onClick={save} loading={status === "saving"}>
            {t("Save")}
          </Button>
        </DiagramHeader>
      )}

      {code === null ? (
        <Group justify="center" mt="xl"><Loader /></Group>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 12, padding: 12 }}>
          <Textarea
            value={code}
            onChange={(e) => onCode(e.currentTarget.value)}
            spellCheck={false}
            aria-label={t("Mermaid code")}
            styles={{
              root: { flex: "0 0 40%", display: "flex", flexDirection: "column" },
              wrapper: { flex: 1 },
              input: { height: "100%", fontFamily: "var(--mantine-font-family-monospace)", fontSize: 13 },
            }}
          />
          <Paper withBorder style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            {error && (
              <Alert color="red" variant="light" m="xs" title={t("Mermaid error")}>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12 }}>{error}</pre>
              </Alert>
            )}
            <ScrollArea style={{ flex: 1 }} p="md">
              <div
                aria-label={t("Preview")}
                style={{ display: "flex", justifyContent: "center", padding: 16 }}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ["foreignObject"] }) }}
              />
            </ScrollArea>
          </Paper>
        </div>
      )}
    </div>
  );
}
