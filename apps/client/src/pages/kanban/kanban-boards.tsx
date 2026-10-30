import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ActionIcon, Button, Card, Container, Group, Menu, Modal, SimpleGrid, Skeleton, Stack, Text, TextInput, Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { useQuery } from "@tanstack/react-query";
import { IconDots, IconLayoutKanban, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { IPage } from "@/features/page/types/page.types";
import { loadBoard, parseBoard } from "@/features/kanban/kanban-service";
import {
  useBoardsQuery, useCreateBoardMutation, useDeleteBoardMutation, useRenameBoardMutation,
} from "@/features/kanban/kanban-queries";

function Summary({ page }: { page: IPage }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["kanban-summary", page.id, page.updatedAt],
    queryFn: () => loadBoard(page.id),
    staleTime: 60_000,
  });
  if (!data) return <Skeleton h={14} w="60%" />;
  const cols = parseBoard(data).columns;
  const cards = cols.reduce((n, c) => n + c.cards.length, 0);
  return (
    <Text size="xs" c="dimmed">
      {t("{{cols}} columns · {{cards}} cards", { cols: cols.length, cards })}
    </Text>
  );
}

export function confirmDeleteBoard(t: (k: string, o?: any) => string, page: IPage, run: (id: string) => void) {
  modals.openConfirmModal({
    title: t("Delete board"),
    centered: true,
    children: (
      <Text size="sm">
        {t("“{{name}}” will be moved to the trash of the Kanban space.", { name: page.title || t("Untitled board") })}
      </Text>
    ),
    labels: { confirm: t("Delete"), cancel: t("Cancel") },
    confirmProps: { color: "red" },
    onConfirm: () => run(page.id),
  });
}

export default function KanbanBoards() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState<IPage | null>(null);
  const [newName, setNewName] = useState("");
  const { boards, isLoading } = useBoardsQuery();
  const create = useCreateBoardMutation();
  const rename = useRenameBoardMutation(() => setRenaming(null));
  const remove = useDeleteBoardMutation();

  return (
    <Container size="lg" py="xl">
      <DocumentTitle title={t("Kanban")} />
      <Group justify="space-between" mb="lg">
        <Title order={2}>{t("Kanban")}</Title>
        <Button leftSection={<IconPlus size={16} />} loading={create.isPending} onClick={() => create.mutate()}>
          {t("New board")}
        </Button>
      </Group>

      {isLoading ? (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} h={96} radius="md" />)}
        </SimpleGrid>
      ) : !boards?.length ? (
        <Stack align="center" py={80} gap="xs">
          <IconLayoutKanban size={56} stroke={1.2} color="var(--mantine-color-dimmed)" />
          <Text c="dimmed">{t("No boards yet. Create your first one.")}</Text>
        </Stack>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
          {boards.map((page) => (
            <Card key={page.id} withBorder radius="md" padding="md" style={{ cursor: "pointer" }} onClick={() => navigate(`/kanban/${page.id}`)}>
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                  <IconLayoutKanban size={26} stroke={1.5} style={{ flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <Text fw={500} lineClamp={1}>{page.title || t("Untitled board")}</Text>
                    <Summary page={page} />
                  </div>
                </Group>
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon variant="subtle" color="gray" aria-label={t("Board actions")} onClick={(e) => e.stopPropagation()}>
                      <IconDots size={18} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
                    <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => { setRenaming(page); setNewName(page.title ?? ""); }}>{t("Rename")}</Menu.Item>
                    <Menu.Divider />
                    <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => confirmDeleteBoard(t, page, remove.mutate)}>{t("Delete")}</Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
              <Text size="xs" c="dimmed" mt="sm">{t("Updated")} {new Date(page.updatedAt).toLocaleString()}</Text>
            </Card>
          ))}
        </SimpleGrid>
      )}

      <Modal opened={!!renaming} onClose={() => setRenaming(null)} title={t("Rename board")} centered>
        <Stack>
          <TextInput value={newName} onChange={(e) => setNewName(e.currentTarget.value)} data-autofocus maxLength={200}
            onKeyDown={(e) => e.key === "Enter" && newName.trim() && rename.mutate({ id: renaming!.id, title: newName.trim() })} />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRenaming(null)}>{t("Cancel")}</Button>
            <Button onClick={() => rename.mutate({ id: renaming!.id, title: newName.trim() })} loading={rename.isPending} disabled={!newName.trim()}>{t("Rename")}</Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
