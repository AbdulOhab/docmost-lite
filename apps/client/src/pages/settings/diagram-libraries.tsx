import { useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconDownload, IconInfoCircle, IconTrash, IconUpload } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import {
  deleteLibrary,
  getCatalog,
  installLibrary,
  LIBRARY_FILE_BASE,
  listLibraries,
  toggleLibrary,
  uploadLibrary,
} from "@/features/diagrams/library-service";

const KEY = ["diagram-libraries"];

export default function DiagramLibraries() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [browsing, setBrowsing] = useState(false);
  const [filter, setFilter] = useState("");

  const { data: libraries, isLoading } = useQuery({ queryKey: KEY, queryFn: listLibraries });
  const catalog = useQuery({ queryKey: ["diagram-library-catalog"], queryFn: getCatalog, enabled: browsing, staleTime: 3_600_000 });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: ["diagram-library-items"] });
  };
  const fail = (e: any) =>
    notifications.show({ message: e?.response?.data?.message ?? t("Something went wrong"), color: "red" });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const content = JSON.parse(await file.text());
      return uploadLibrary(file.name.replace(/\.excalidrawlib$|\.json$/i, ""), content);
    },
    onSuccess: () => { notifications.show({ message: t("Library added") }); refresh(); },
    onError: (e: any) => (e instanceof SyntaxError ? notifications.show({ message: t("That file is not valid JSON"), color: "red" }) : fail(e)),
  });
  const install = useMutation({
    mutationFn: (entry: { source: string; name: string }) => installLibrary(LIBRARY_FILE_BASE + entry.source, entry.name),
    onSuccess: () => { notifications.show({ message: t("Library installed") }); refresh(); },
    onError: fail,
  });
  const toggle = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => toggleLibrary(v.id, v.enabled),
    onSuccess: refresh,
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: deleteLibrary,
    onSuccess: () => { notifications.show({ message: t("Library removed") }); refresh(); },
    onError: fail,
  });

  const confirmRemove = (id: string, name: string) =>
    modals.openConfirmModal({
      title: t("Remove library"),
      centered: true,
      children: <Text size="sm">{t("“{{name}}” will be removed for everyone.", { name })}</Text>,
      labels: { confirm: t("Remove"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => remove.mutate(id),
    });

  if (!isAdmin) return null;

  const installedSources = new Set((libraries ?? []).map((l) => l.source));
  const entries = (catalog.data ?? []).filter((e) =>
    `${e.name} ${e.description} ${e.author}`.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <>
      <DocumentTitle title={t("Diagram libraries")} />
      <SettingsTitle title={t("Diagram libraries")} />

      <Stack gap="lg">
        <Alert variant="light" color="blue" icon={<IconInfoCircle />}>
          {t("Library packs add ready-made shapes to the Excalidraw editor in Diagrams. Enabled packs load for everyone, in any browser.")}
        </Alert>

        <Group>
          <input
            ref={fileInput}
            type="file"
            accept=".excalidrawlib,.json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              e.target.value = "";
            }}
          />
          <Button leftSection={<IconUpload size={16} />} onClick={() => fileInput.current?.click()} loading={upload.isPending}>
            {t("Upload .excalidrawlib")}
          </Button>
          <Button variant="default" leftSection={<IconDownload size={16} />} onClick={() => setBrowsing(true)}>
            {t("Browse libraries.excalidraw.com")}
          </Button>
        </Group>

        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("Name")}</Table.Th>
              <Table.Th>{t("Shapes")}</Table.Th>
              <Table.Th>{t("Source")}</Table.Th>
              <Table.Th>{t("Enabled")}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {libraries?.map((l) => (
              <Table.Tr key={l.id}>
                <Table.Td>{l.name}</Table.Td>
                <Table.Td>{l.itemCount}</Table.Td>
                <Table.Td><Badge variant="light" color={l.source ? "blue" : "gray"}>{l.source ? t("Catalogue") : t("Uploaded")}</Badge></Table.Td>
                <Table.Td>
                  <Switch
                    checked={l.enabled}
                    onChange={(e) => toggle.mutate({ id: l.id, enabled: e.currentTarget.checked })}
                    aria-label={t("Enabled")}
                  />
                </Table.Td>
                <Table.Td>
                  <Tooltip label={t("Remove")} withArrow>
                    <ActionIcon variant="subtle" color="red" aria-label={t("Remove")} onClick={() => confirmRemove(l.id, l.name)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Table.Td>
              </Table.Tr>
            ))}
            {!isLoading && !libraries?.length && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text size="sm" c="dimmed" ta="center">{t("No library packs yet.")}</Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Stack>

      <Modal opened={browsing} onClose={() => setBrowsing(false)} title={t("Excalidraw library catalogue")} size="lg" centered>
        <TextInput placeholder={t("Search libraries")} value={filter} onChange={(e) => setFilter(e.currentTarget.value)} mb="sm" data-autofocus />
        {catalog.isLoading ? (
          <Group justify="center" py="xl"><Loader /></Group>
        ) : catalog.isError ? (
          <Alert color="red" variant="light">{t("Could not load the catalogue. Check the server's internet access.")}</Alert>
        ) : (
          <ScrollArea h={420}>
            <Stack gap="xs">
              {entries.map((e) => (
                <Group key={e.source} justify="space-between" wrap="nowrap" p="xs" style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <Text fw={500} lineClamp={1}>{e.name}</Text>
                    <Text size="xs" c="dimmed" lineClamp={2}>{e.description}{e.author ? ` · ${e.author}` : ""}</Text>
                  </div>
                  <Button
                    size="xs"
                    variant="light"
                    disabled={installedSources.has(LIBRARY_FILE_BASE + e.source)}
                    loading={install.isPending && install.variables?.source === e.source}
                    onClick={() => install.mutate({ source: e.source, name: e.name })}
                  >
                    {installedSources.has(LIBRARY_FILE_BASE + e.source) ? t("Installed") : t("Install")}
                  </Button>
                </Group>
              ))}
              {!entries.length && <Text size="sm" c="dimmed" ta="center" py="md">{t("Nothing matches.")}</Text>}
            </Stack>
          </ScrollArea>
        )}
      </Modal>
    </>
  );
}
