import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Image,
  Menu,
  Modal,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import {
  IconDots,
  IconEdit,
  IconPencil,
  IconPlus,
  IconScribble,
  IconTrash,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { getFileUrl } from "@/lib/config.ts";
import { IPage } from "@/features/page/types/page.types";
import {
  DIAGRAM_TYPES,
  getDiagramAttrs,
  getDiagramType,
  getMermaidCode,
  loadDiagram,
} from "@/features/diagrams/diagram-service";
import { NewDiagramMenu, TYPE_ICON } from "@/features/diagrams/new-diagram-menu";
import {
  useCreateDiagramMutation,
  useDeleteDiagramMutation,
  useDiagramsQuery,
  useRenameDiagramMutation,
} from "@/features/diagrams/diagram-queries";

function Thumbnail({ page }: { page: IPage }) {
  const { data } = useQuery({
    queryKey: ["diagram-thumb", page.id, page.updatedAt],
    queryFn: () => loadDiagram(page.id),
    staleTime: 60_000,
  });
  const type = data ? getDiagramType(data) : "excalidraw";
  const src = data ? getDiagramAttrs(data).src : undefined;
  const code = data && type === "mermaid" ? getMermaidCode(data) : "";
  const Icon = TYPE_ICON[type];

  return (
    <Card.Section
      h={150}
      bg="var(--mantine-color-gray-light)"
      style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}
    >
      {src ? (
        <Image src={getFileUrl(src)} h={150} fit="contain" alt={page.title} />
      ) : code ? (
        <Text component="pre" size="xs" c="dimmed" m={0} p="sm" pt={34} style={{ width: "100%", height: "100%", overflow: "hidden", fontFamily: "var(--mantine-font-family-monospace)" }}>
          {code}
        </Text>
      ) : (
        <Icon size={40} stroke={1.2} color="var(--mantine-color-dimmed)" />
      )}
      <Badge size="xs" variant="default" style={{ position: "absolute", top: 8, left: 8 }}>
        {DIAGRAM_TYPES.find((d) => d.value === type)?.label}
      </Badge>
    </Card.Section>
  );
}

export default function Diagrams() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState<IPage | null>(null);
  const [newName, setNewName] = useState("");

  const { diagrams, isLoading: busy } = useDiagramsQuery();
  const create = useCreateDiagramMutation();
  const rename = useRenameDiagramMutation(() => setRenaming(null));
  const remove = useDeleteDiagramMutation();

  const confirmDelete = (page: IPage) =>
    modals.openConfirmModal({
      title: t("Delete diagram"),
      centered: true,
      children: (
        <Text size="sm">
          {t("“{{name}}” will be moved to the trash of the Diagrams space.", {
            name: page.title || t("Untitled diagram"),
          })}
        </Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => remove.mutate(page.id),
    });

  return (
    <Container size="lg" py="xl">
      <DocumentTitle title={t("Diagrams")} />
      <Group justify="space-between" mb="lg">
        <Title order={2}>{t("Diagrams")}</Title>
        <NewDiagramMenu position="bottom-end">
          <Button leftSection={<IconPlus size={16} />} loading={create.isPending}>
            {t("New diagram")}
          </Button>
        </NewDiagramMenu>
      </Group>

      {busy ? (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} h={210} radius="md" />)}
        </SimpleGrid>
      ) : !diagrams?.length ? (
        <Stack align="center" py={80} gap="xs">
          <IconScribble size={56} stroke={1.2} color="var(--mantine-color-dimmed)" />
          <Text c="dimmed">{t("No diagrams yet. Create your first one.")}</Text>
        </Stack>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
          {diagrams.map((page) => (
            <Card key={page.id} withBorder radius="md" padding="sm" style={{ cursor: "pointer" }} onClick={() => navigate(`/diagrams/${page.id}`)}>
              <Thumbnail page={page} />
              <Group justify="space-between" mt="sm" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Text fw={500} lineClamp={1}>{page.title || t("Untitled diagram")}</Text>
                  <Text size="xs" c="dimmed">
                    {t("Updated")} {new Date(page.updatedAt).toLocaleString()}
                  </Text>
                </div>
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon variant="subtle" color="gray" aria-label={t("Diagram actions")} onClick={(e) => e.stopPropagation()}>
                      <IconDots size={18} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
                    <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => navigate(`/diagrams/${page.id}`)}>{t("Open")}</Menu.Item>
                    <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => { setRenaming(page); setNewName(page.title ?? ""); }}>{t("Rename")}</Menu.Item>
                    <Menu.Divider />
                    <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => confirmDelete(page)}>{t("Delete")}</Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      )}

      <Modal opened={!!renaming} onClose={() => setRenaming(null)} title={t("Rename diagram")} centered>
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
