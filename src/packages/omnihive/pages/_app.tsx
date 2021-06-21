import dayjs from "dayjs";
import ms from "ms";
import App, { AppContext, AppProps } from "next/app";
import Head from "next/head";
import React from "react";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";
import store2 from "store2";
import WebAdminLogin from "../components/WebAdminLogin";
import "../public/styles/next.css";

const OmniHiveAdmin = ({ Component, pageProps }: AppProps): React.ReactElement => {
    const [initialized, setInitialized] = React.useState<boolean>(false);
    const [isLoggedIn, setIsLoggedIn] = React.useState<boolean>(pageProps.isLoggedIn);

    React.useEffect(() => {
        const ls = store2("ohAdminLogin");

        if (IsHelper.isNullOrUndefined(ls)) {
            setIsLoggedIn(false);
            setInitialized(true);
            return;
        }

        if (!ls.isLoggedIn) {
            setIsLoggedIn(false);
            setInitialized(true);
            return;
        }

        if (!IsHelper.isNullOrUndefined(ls.isLoggedIn) && ls.isLoggedIn === true && ls.loggedInDate) {
            const loggedInDate = dayjs(ls.loggedInDate as string);
            const timeoutMs = +ms(pageProps.loginTokenTimeout);
            const now = dayjs();

            if (now.diff(loggedInDate, "millisecond") > timeoutMs) {
                store2("ohAdminLogin", { isLoggedIn: false, loggedInDate: undefined });
                setIsLoggedIn(false);
            } else {
                store2("ohAdminLogin", { isLoggedIn: true, loggedInDate: dayjs().format() });
                setIsLoggedIn(true);
            }

            setInitialized(true);
        }
    });

    const loginComplete = (isLoggedIn: boolean) => {
        setIsLoggedIn(isLoggedIn);
    };

    return (
        <>
            <Head>
                <link rel="icon" type="image/png" href="/images/favicon.png" />
            </Head>
            {initialized && (
                <>
                    {isLoggedIn && <Component {...pageProps} />}
                    {!isLoggedIn && (
                        <WebAdminLogin
                            adminPassword={pageProps.adminPassword}
                            serverGroupId={pageProps.serverGroupId}
                            loginComplete={loginComplete}
                        />
                    )}
                </>
            )}
        </>
    );
};

OmniHiveAdmin.getInitialProps = async (appContext: AppContext) => {
    const appProps = await App.getInitialProps(appContext);

    appProps.pageProps = {
        adminPassword: process.env.OH_ADMIN_PASSWORD ?? "",
        adminSocketPortNumber: IsHelper.isNullOrUndefined(process.env.OH_ADMIN_SOCKET_PORT_NUMBER)
            ? 7205
            : +process.env.OH_ADMIN_SOCKET_PORT_NUMBER,
        loginTokenTimeout: process.env.OH_ADMIN_LOGIN_TOKEN_TIMEOUT ?? "30m",
        serverGroupId: process.env.OH_ADMIN_SERVER_GROUP_ID ?? "",
    };

    return { ...appProps };
};

export default OmniHiveAdmin;
