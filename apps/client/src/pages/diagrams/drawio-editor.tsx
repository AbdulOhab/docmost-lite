import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Group, Loader, useComputedColorScheme } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconDeviceFloppy } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  DrawIoEmbed,
  DrawIoEmbedRef,
  EventExport,
} from "react-drawio";
import { getDrawioUrl, getFileUrl } from "@/lib/config.ts";
import { decodeBase64ToSvgString, svgStringToFile } from "@/lib/utils";
import DiagramHeader, { editorFrameStyle, SaveStatus, StatusBadge } from "./diagram-header";
import {
  getDiagramAttrs,
  loadDiagram,
  saveDiagram,
} from "@/features/diagrams/diagram-service";

const AUTOSAVE_MS = 4000;

export default function DrawioEditor({ pageId }: { pageId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const colorScheme = useComputedColorScheme();
  const embedRef = useRef<DrawIoEmbedRef>(null);

  const { data: page } = useQuery({
    queryKey: ["diagram", pageId],
    queryFn: () => loadDiagram(pageId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const pageRef = useRef(page);
  const [xml, setXml] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  const lastSvgRef = useRef<string>("");
  const quietUntilRef = useRef(0);

  // an existing drawing is handed to the embed as a data URL of its SVG
  useEffect(() => {
    if (!page || xml !== null) return;
    pageRef.current = page;
    const { src } = getDiagramAttrs(page);
    if (!src) {
      setXml("");
      return;
    }
    (async () => {
      try {
        const res = await fetch(getFileUrl(src), { credentials: "include", cache: "no-store" });
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onloadend = () => setXml(String(reader.result || ""));
        reader.readAsDataURL(blob);
      } catch (err) {
        console.error(err);
        notifications.show({ message: t("Could not load the drawing"), color: "red" });
        setXml("");
      }
    })();
  }, [page, xml, t]);

  const persist = useCallback(
    async (svgDataUrl: string) => {
      if (!pageRef.current || savingRef.current) return;
      // nothing changed since the last upload, so there is nothing to store
      if (svgDataUrl === lastSvgRef.current) {
        dirtyRef.current = false;
        setStatus("saved");
        return;
      }
      savingRef.current = true;
      setStatus("saving");
      try {
        const file = await svgStringToFile(decodeBase64ToSvgString(svgDataUrl), "diagram.drawio.svg");
        const attrs = await saveDiagram(pageRef.current, file, "drawio");
        pageRef.current = {
          ...pageRef.current,
          content: { type: "doc", content: [{ type: "drawio", attrs }] } as any,
        };
        lastSvgRef.current = svgDataUrl;
        dirtyRef.current = false;
        // draw.io reports changes while it handles our export; ignore those
        quietUntilRef.current = Date.now() + 3000;
        setStatus("saved");
        queryClient.invalidateQueries({ queryKey: ["diagrams"] });
      } catch (err) {
        console.error(err);
        setStatus("error");
      } finally {
        savingRef.current = false;
      }
    },
    [queryClient],
  );

  // ask the embed for an export; its answer arrives in onExport
  const requestSave = useCallback(() => {
    window.clearTimeout(timerRef.current);
    setStatus("saving");
    embedRef.current?.exportDiagram({ format: "xmlsvg" });
  }, []);

  const onChanged = () => {
    if (Date.now() < quietUntilRef.current) return;
    dirtyRef.current = true;
    setStatus((s) => (s === "saving" ? s : "dirty"));
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(requestSave, AUTOSAVE_MS);
  };

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div style={editorFrameStyle}>
      {page && (
        <DiagramHeader pageId={pageId} initialTitle={page.title}>
          <StatusBadge status={status} />
          <Button size="xs" leftSection={<IconDeviceFloppy size={14} />} onClick={requestSave} loading={status === "saving"}>
            {t("Save")}
          </Button>
        </DiagramHeader>
      )}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {xml === null ? (
          <Group justify="center" mt="xl"><Loader /></Group>
        ) : (
          <div style={{ position: "absolute", inset: 0 }}>
          <DrawIoEmbed
            ref={embedRef}
            xml={xml}
            baseUrl={getDrawioUrl()}
            autosave
            urlParameters={{
              ui: colorScheme === "light" ? "kennedy" : "dark",
              spin: true,
              libraries: true,
              noSaveBtn: true,
              noExitBtn: true,
              saveAndExit: false,
            }}
            onAutoSave={onChanged}
            onExport={(d: EventExport) => persist(d.data)}
          />
          </div>
        )}
      </div>
    </div>
  );
}
