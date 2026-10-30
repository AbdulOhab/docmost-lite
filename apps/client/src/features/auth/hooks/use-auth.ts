import { useState } from "react";
import {
  login,
  logout,
  setupWorkspace,
} from "@/features/auth/services/auth-service";
import { useNavigate } from "react-router-dom";
import { useAtom } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import {
  ILogin,
  ISetupWorkspace,
} from "@/features/auth/types/auth.types";
import { notifications } from "@mantine/notifications";
import {
  createWorkspace,
} from "@/features/workspace/services/workspace-service.ts";
import APP_ROUTE, { getPostLoginRedirect } from "@/lib/app-route.ts";
import { RESET } from "jotai/utils";
import { useTranslation } from "react-i18next";
import { isCloud } from "@/lib/config.ts";
import { deleteLocalPageData } from "@/lib/local-page-data.ts";
import { exchangeTokenRedirectUrl, getHostnameUrl } from "@/ee/utils.ts";

export default function useAuth() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const [, setCurrentUser] = useAtom(currentUserAtom);

  const handleSignIn = async (data: ILogin) => {
    setIsLoading(true);

    try {
      const response = await login(data);
      setIsLoading(false);

      // Check if MFA is required
      if (response?.userHasMfa) {
        navigate(APP_ROUTE.AUTH.MFA_CHALLENGE + window.location.search);
      } else if (response?.requiresMfaSetup) {
        navigate(APP_ROUTE.AUTH.MFA_SETUP_REQUIRED + window.location.search);
      } else {
        navigate(getPostLoginRedirect());
      }
    } catch (err) {
      setIsLoading(false);

      const message = err.response?.data?.message;
      if (isCloud() && message?.includes("verify your email")) {
        const sig = err.response?.data?.emailSignature;
        navigate(
          `${APP_ROUTE.AUTH.VERIFY_EMAIL}?email=${encodeURIComponent(data.email)}${sig ? `&sig=${sig}` : ""}`,
        );
        return;
      }

      notifications.show({
        message,
        color: "red",
      });
    }
  };

  const handleSetupWorkspace = async (data: ISetupWorkspace) => {
    setIsLoading(true);

    try {
      if (isCloud()) {
        const res = await createWorkspace(data);

        if (res?.requiresEmailVerification) {
          const hostname = res?.workspace?.hostname;
          if (hostname) {
            window.location.href =
              getHostnameUrl(hostname) +
              `/verify-email?email=${encodeURIComponent(data.email)}&sig=${res.emailSignature}`;
          }
          return;
        }

        const hostname = res?.workspace?.hostname;
        const exchangeToken = res?.exchangeToken;
        if (hostname && exchangeToken) {
          window.location.href = exchangeTokenRedirectUrl(
            hostname,
            exchangeToken,
          );
        }
      } else {
        const res = await setupWorkspace(data);
        setIsLoading(false);
        navigate(APP_ROUTE.HOME);
      }
    } catch (err) {
      setIsLoading(false);
      notifications.show({
        message: err.response?.data.message,
        color: "red",
      });
    }
  };

  const handleLogout = async () => {
    setCurrentUser(RESET);
    await deleteLocalPageData();
    await logout();
    window.location.replace(`${APP_ROUTE.AUTH.LOGIN}?logout=1`);
  };

  return {
    signIn: handleSignIn,
    setupWorkspace: handleSetupWorkspace,
    logout: handleLogout,
    isLoading,
  };
}
