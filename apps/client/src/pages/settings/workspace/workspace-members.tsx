import SettingsTitle from "@/components/settings/settings-title.tsx";
import WorkspaceMembersTable from "@/features/workspace/components/members/components/workspace-members-table";
import { useTranslation } from "react-i18next";
import { DocumentTitle } from "@/components/ui/document-title.tsx";

export default function WorkspaceMembers() {
  const { t } = useTranslation();

  return (
    <>
      <DocumentTitle title={t("Members")} />
      <SettingsTitle title={t("Members")} />

      <WorkspaceMembersTable />
    </>
  );
}
