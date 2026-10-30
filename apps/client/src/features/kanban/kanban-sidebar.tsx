import { Link, useLocation, useParams } from "react-router-dom";
import { ActionIcon, Group, ScrollArea, Skeleton, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconArrowLeft, IconLayoutGrid, IconLayoutKanban, IconPlus, IconTrash } from "@tabler/icons-react";
import { useAtom } from "jotai";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import classes from "@/features/space/components/sidebar/space-sidebar.module.css";
import { mobileSidebarAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { useToggleSidebar } from "@/components/layouts/global/hooks/hooks/use-toggle-sidebar.ts";
import { useBoardsQuery, useCreateBoardMutation } from "@/features/kanban/kanban-queries";

function MenuRow({ icon: Icon, label, to, active, onClick }: {
  icon: React.ElementType; label: string; to?: string; active?: boolean; onClick?: () => void;
}) {
  const inner = (
    <div className={classes.menuItemInner}>
      <Icon size={18} className={classes.menuItemIcon} stroke={2} />
      <span>{label}</span>
    </div>
  );
  const cls = clsx(classes.menu, active && classes.activeButton);
  return to ? (
    <UnstyledButton component={Link} to={to} className={cls} onClick={onClick}>{inner}</UnstyledButton>
  ) : (
    <UnstyledButton className={cls} onClick={onClick}>{inner}</UnstyledButton>
  );
}

export default function KanbanSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { pageId } = useParams();
  const [mobileOpened] = useAtom(mobileSidebarAtom);
  const toggleMobile = useToggleSidebar(mobileSidebarAtom);
  const { boards, isLoading } = useBoardsQuery();
  const create = useCreateBoardMutation();
  const closeMobile = () => mobileOpened && toggleMobile();

  return (
    <div className={classes.navbar}>
      <div className={classes.section} style={{ paddingTop: "var(--mantine-spacing-md)" }}>
        <Group gap="xs" px="md" pb="xs" wrap="nowrap">
          <IconLayoutKanban size={20} stroke={1.8} />
          <Text fw={600}>{t("Kanban")}</Text>
        </Group>
        <div className={classes.menuItems}>
          <MenuRow icon={IconArrowLeft} label={t("Home")} to="/home" onClick={closeMobile} />
          <MenuRow icon={IconLayoutGrid} label={t("All boards")} to="/kanban" active={location.pathname === "/kanban"} onClick={closeMobile} />
          <MenuRow icon={IconPlus} label={t("New board")} onClick={() => { closeMobile(); create.mutate(); }} />
          <MenuRow icon={IconTrash} label={t("Trash")} to="/s/kanban/trash" onClick={closeMobile} />
        </div>
      </div>

      <div className={clsx(classes.section, classes.sectionPages)}>
        <Group className={classes.pagesHeader} justify="space-between">
          <Text size="xs" fw={500} c="dimmed">{t("Boards")}</Text>
          <ActionIcon variant="default" size={18} aria-label={t("New board")} onClick={() => create.mutate()}>
            <IconPlus />
          </ActionIcon>
        </Group>
        <ScrollArea h="calc(100vh - 330px)" scrollbarSize={5} type="scroll">
          <div className={classes.pages}>
            {isLoading ? (
              <Stack gap={6} px="xs">{[0, 1, 2].map((i) => <Skeleton key={i} h={26} radius="sm" />)}</Stack>
            ) : !boards?.length ? (
              <Text size="xs" c="dimmed" px="xs" py={4}>{t("No boards yet")}</Text>
            ) : (
              boards.map((page) => (
                <Link
                  key={page.id}
                  to={`/kanban/${page.id}`}
                  onClick={closeMobile}
                  aria-current={page.id === pageId ? "page" : undefined}
                  className={clsx(classes.pageLink, page.id === pageId && classes.activeButton)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px var(--mantine-spacing-xs)", color: "inherit", textDecoration: "none" }}
                >
                  <IconLayoutKanban size={16} stroke={1.8} style={{ flexShrink: 0 }} />
                  <Text size="xs" fw={500} lineClamp={1}>{page.title || t("Untitled board")}</Text>
                </Link>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
