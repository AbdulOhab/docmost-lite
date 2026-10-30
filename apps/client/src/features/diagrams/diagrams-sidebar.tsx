import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ActionIcon,
  Button,
  Group,
  Menu,
  Modal,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconArrowLeft,
  IconBooks,
  IconDots,
  IconLayoutGrid,
  IconPencil,
  IconPlus,
  IconScribble,
  IconTrash,
} from "@tabler/icons-react";
import { useAtom } from "jotai";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import classes from "@/features/space/components/sidebar/space-sidebar.module.css";
import { mobileSidebarAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { useToggleSidebar } from "@/components/layouts/global/hooks/hooks/use-toggle-sidebar.ts";
import { IPage } from "@/features/page/types/page.types";
import { NewDiagramMenu } from "@/features/diagrams/new-diagram-menu";
import {
  useDeleteDiagramMutation,
  useDiagramsQuery,
  useRenameDiagramMutation,
} from "@/features/diagrams/diagram-queries";

function MenuRow({
  icon: Icon,
  label,
  active,
  onClick,
  to,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick?: () => void;
  to?: string;
}) {
  const inner = (
    <div className={classes.menuItemInner}>
      <Icon size={18} className={classes.menuItemIcon} stroke={2} />
      <span>{label}</span>
    </div>
  );
  const cls = clsx(classes.menu, active && classes.activeButton);
  return to ? (
    <UnstyledButton component={Link} to={to} className={cls} onClick={onClick}>
      {inner}
    </UnstyledButton>
  ) : (
    <UnstyledButton className={cls} onClick={onClick}>
      {inner}
    </UnstyledButton>
  );
}

export default function DiagramsSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { pageId } = useParams();
  const [mobileOpened] = useAtom(mobileSidebarAtom);
  const toggleMobile = useToggleSidebar(mobileSidebarAtom);

  const { diagrams, isLoading } = useDiagramsQuery();
  const remove = useDeleteDiagramMutation(pageId);

  const [renaming, setRenaming] = useState<IPage | null>(null);
  const [newName, setNewName] = useState("");
  const rename = useRenameDiagramMutation(() => setRenaming(null));

  const closeMobile = () => mobileOpened && toggleMobile();

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
    <div className={classes.navbar}>
      <div className={classes.section} style={{ paddingTop: "var(--mantine-spacing-md)" }}>
        <Group gap="xs" px="md" pb="xs" wrap="nowrap">
          <IconScribble size={20} stroke={1.8} />
          <Text fw={600}>{t("Diagrams")}</Text>
        </Group>

        <div className={classes.menuItems}>
          <MenuRow icon={IconArrowLeft} label={t("Home")} to="/home" onClick={closeMobile} />
          <MenuRow
            icon={IconLayoutGrid}
            label={t("All diagrams")}
            to="/diagrams"
            active={location.pathname === "/diagrams"}
            onClick={closeMobile}
          />
          <NewDiagramMenu position="right-start" onChosen={closeMobile}>
            <UnstyledButton className={classes.menu}>
              <div className={classes.menuItemInner}>
                <IconPlus size={18} className={classes.menuItemIcon} stroke={2} />
                <span>{t("New diagram")}</span>
              </div>
            </UnstyledButton>
          </NewDiagramMenu>
          <MenuRow icon={IconBooks} label={t("Libraries")} to="/settings/diagram-libraries" onClick={closeMobile} />
          <MenuRow icon={IconTrash} label={t("Trash")} to="/s/diagrams/trash" onClick={closeMobile} />
        </div>
      </div>

      <div className={clsx(classes.section, classes.sectionPages)}>
        <Group className={classes.pagesHeader} justify="space-between">
          <Text size="xs" fw={500} c="dimmed">
            {t("Diagrams")}
          </Text>
          <NewDiagramMenu position="right-start" onChosen={closeMobile}>
            <ActionIcon variant="default" size={18} aria-label={t("New diagram")}>
              <IconPlus />
            </ActionIcon>
          </NewDiagramMenu>
        </Group>

        <ScrollArea h="calc(100vh - 330px)" scrollbarSize={5} type="scroll">
          <div className={classes.pages}>
            {isLoading ? (
              <Stack gap={6} px="xs">
                {[0, 1, 2].map((i) => <Skeleton key={i} h={26} radius="sm" />)}
              </Stack>
            ) : !diagrams?.length ? (
              <Text size="xs" c="dimmed" px="xs" py={4}>
                {t("No diagrams yet")}
              </Text>
            ) : (
              diagrams.map((page) => {
                const active = page.id === pageId;
                return (
                  <Group
                    key={page.id}
                    gap={0}
                    wrap="nowrap"
                    className={clsx(classes.pageLink, active && classes.activeButton)}
                    style={{ padding: 0, display: "flex", alignItems: "center" }}
                  >
                    <Link
                      to={`/diagrams/${page.id}`}
                      onClick={closeMobile}
                      aria-current={active ? "page" : undefined}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px var(--mantine-spacing-xs)",
                        color: "inherit",
                        textDecoration: "none",
                      }}
                    >
                      <IconScribble size={16} stroke={1.8} style={{ flexShrink: 0 }} />
                      <Text size="xs" fw={500} lineClamp={1}>
                        {page.title || t("Untitled diagram")}
                      </Text>
                    </Link>
                    <Menu position="bottom-start" withinPortal>
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray" size="sm" mr={4} aria-label={t("Diagram actions")}>
                          <IconDots size={14} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconPencil size={14} />}
                          onClick={() => {
                            setRenaming(page);
                            setNewName(page.title ?? "");
                          }}
                        >
                          {t("Rename")}
                        </Menu.Item>
                        <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => confirmDelete(page)}>
                          {t("Delete")}
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>

      <Modal opened={!!renaming} onClose={() => setRenaming(null)} title={t("Rename diagram")} centered>
        <Stack>
          <TextInput
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
            data-autofocus
            maxLength={200}
            onKeyDown={(e) =>
              e.key === "Enter" && newName.trim() && rename.mutate({ id: renaming!.id, title: newName.trim() })
            }
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRenaming(null)}>{t("Cancel")}</Button>
            <Button
              onClick={() => rename.mutate({ id: renaming!.id, title: newName.trim() })}
              loading={rename.isPending}
              disabled={!newName.trim()}
            >
              {t("Rename")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
