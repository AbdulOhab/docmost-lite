import { lazy, Suspense } from "react";
import { useParams } from "react-router-dom";
import { Group, Loader } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getDiagramType, loadDiagram } from "@/features/diagrams/diagram-service";

const ExcalidrawEditor = lazy(() => import("./excalidraw-editor"));
const DrawioEditor = lazy(() => import("./drawio-editor"));
const MermaidEditor = lazy(() => import("./mermaid-editor"));

/** Opens a diagram in the editor that matches what the page holds. */
export default function DiagramEditor() {
  const { t } = useTranslation();
  const { pageId } = useParams();
  const { data: page, isError } = useQuery({
    queryKey: ["diagram", pageId],
    queryFn: () => loadDiagram(pageId!),
    enabled: !!pageId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  if (isError) return <div style={{ padding: 24 }}>{t("Diagram not found")}</div>;

  const loading = (
    <Group justify="center" mt="xl"><Loader /></Group>
  );
  if (!page) return loading;

  const type = getDiagramType(page);
  return (
    <Suspense fallback={loading}>
      {type === "drawio" ? (
        <DrawioEditor key={pageId} pageId={pageId!} />
      ) : type === "mermaid" ? (
        <MermaidEditor key={pageId} pageId={pageId!} />
      ) : (
        <ExcalidrawEditor key={pageId} pageId={pageId!} />
      )}
    </Suspense>
  );
}
