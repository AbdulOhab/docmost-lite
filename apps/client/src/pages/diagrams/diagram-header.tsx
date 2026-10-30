import { ReactNode, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ActionIcon, Badge, Group, TextInput, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { IconArrowLeft } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { renameDiagram } from "@/features/diagrams/diagram-service";

export type SaveStatus = "saved" | "dirty" | "saving" | "error";

export function StatusBadge({ status }: { status: SaveStatus }) {
  const { t } = useTranslation();
  const map = {
    saved: <Badge color="teal" variant="light">{t("Saved")}</Badge>,
    dirty: <Badge color="yellow" variant="light">{t("Unsaved changes")}</Badge>,
    saving: <Badge color="blue" variant="light">{t("Saving…")}</Badge>,
    error: <Badge color="red" variant="light">{t("Save failed")}</Badge>,
  };
  return map[status];
}

/** Back button, editable name and a slot for per-editor actions. */
export default function DiagramHeader({
  pageId,
  initialTitle,
  onTitle,
  children,
  backTo = "/diagrams",
  backLabel = "All diagrams",
  invalidate = "diagrams",
  fallbackTitle = "Untitled diagram",
}: {
  pageId: string;
  initialTitle: string;
  onTitle?: (title: string) => void;
  children?: ReactNode;
  backTo?: string;
  backLabel?: string;
  invalidate?: string;
  fallbackTitle?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(initialTitle ?? "");
  const savedTitle = useRef(initialTitle ?? "");

  const commit = async () => {
    const next = title.trim() || fallbackTitle;
    setTitle(next);
    if (next === savedTitle.current) return;
    try {
      await renameDiagram(pageId, next);
      savedTitle.current = next;
      onTitle?.(next);
      queryClient.invalidateQueries({ queryKey: [invalidate] });
    } catch {
      notifications.show({ message: t("Could not rename"), color: "red" });
    }
  };

  return (
    <Group
      justify="space-between"
      wrap="nowrap"
      px="sm"
      py={6}
      style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}
    >
      <DocumentTitle title={title || t("Diagram")} />
      <Group wrap="nowrap" gap="xs" style={{ flex: 1, minWidth: 0 }}>
        <Tooltip label={t(backLabel)} withArrow>
          <ActionIcon variant="subtle" color="gray" aria-label={t(backLabel)} onClick={() => navigate(backTo)}>
            <IconArrowLeft size={18} />
          </ActionIcon>
        </Tooltip>
        <TextInput
          variant="unstyled"
          size="md"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          placeholder={t(fallbackTitle)}
          aria-label={t("Diagram name")}
          maxLength={200}
          style={{ flex: 1, minWidth: 0 }}
          styles={{ input: { fontWeight: 600 } }}
        />
      </Group>
      <Group gap="xs" wrap="nowrap">{children}</Group>
    </Group>
  );
}

export const editorFrameStyle = {
  height: "calc(100vh - 45px)",
  display: "flex",
  flexDirection: "column" as const,
};
