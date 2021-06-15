import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";
import dayjs from "dayjs";
import React from "react";
import store2 from "store2";
import { ToastError } from "../components/ToastError";
import { ToastSuccess } from "../components/ToastSuccess";

type Props = {
    adminPassword: string;
    serverGroupId: string;
    loginComplete(isLoggedIn: boolean): void;
};

const pauseTimeout: number = 2000;

const WebAdminLogin: React.FC<Props> = (props): React.ReactElement => {
    const [adminPassword, setAdminPassword] = React.useState<string>("");
    const [serverGroupId, setServerGroupId] = React.useState<string>("");
    const [processing, setProcessing] = React.useState<boolean>(false);
    const [showToastSuccess, setShowToastSuccess] = React.useState<boolean>(false);
    const [showToastError, setShowToastError] = React.useState<boolean>(false);
    const [toastErrorMessage, setToastErrorMessage] = React.useState<string>("");
    const [adminPasswordError, setAdminPasswordError] = React.useState<string>("");
    const [serverGroupIdError, setServerGroupIdError] = React.useState<string>("");

    const checkServerGroupId = (value: string) => {
        if (IsHelper.isEmptyStringOrWhitespace(value)) {
            setServerGroupIdError("Server Group ID cannot be blank");
            return;
        }

        setServerGroupIdError("");
    };

    const checkAdminPassword = (value: string) => {
        if (IsHelper.isEmptyStringOrWhitespace(value)) {
            setAdminPasswordError("Admin password cannot be blank");
            return;
        }

        setAdminPasswordError("");
    };

    const disableSubmit = (): boolean => {
        if (processing) {
            return true;
        }

        if (adminPassword === "" || serverGroupId === "") {
            return true;
        }

        if (adminPasswordError !== "" || serverGroupIdError !== "") {
            return true;
        }

        return false;
    };

    const hideToast = () => {
        setToastErrorMessage("");
        setShowToastError(false);
        setShowToastSuccess(false);
    };

    const showError = (error: string) => {
        setToastErrorMessage(error);
        setShowToastError(true);
        setShowToastSuccess(false);

        setTimeout(() => {
            hideToast();
        }, pauseTimeout);
    };

    const showSuccess = () => {
        setToastErrorMessage("");
        setShowToastError(false);
        setShowToastSuccess(true);

        setTimeout(() => {
            hideToast();
        }, pauseTimeout);
    };

    const submit = async () => {
        setProcessing(true);

        if (serverGroupId === props.serverGroupId && adminPassword === props.adminPassword) {
            await store2("ohAdminLogin", { isLoggedIn: true, loggedInDate: dayjs().format() });
            showSuccess();
            setProcessing(false);
            setTimeout(() => {
                props.loginComplete(true);
            }, pauseTimeout);
            return;
        }

        showError("Admin password or server group ID is incorrect...");
        setTimeout(() => {
            props.loginComplete(true);
        }, pauseTimeout);
        return;
    };

    return (
        <>
            <ToastSuccess show={showToastSuccess} message={`Login Successful...Please Wait...`} />
            <ToastError show={showToastError} message={toastErrorMessage} />
            <div className="w-full flex flex-col items-center justify-center">
                <div className="w-1/2 mt-20">
                    <div className="mx-auto py-6">
                        <img className="mx-auto" alt="OmniHive Logo" src="/images/omnihive-bee-light.png" />
                    </div>
                    <div className="mx-auto text-center mb-6">
                        <div className="text-white text-3xl">OMNIHIVE</div>
                        <div className="text-2xl text-yellow-600">ADMIN LOGIN</div>
                    </div>
                    <div>
                        <div className="mb-6">
                            <label className="block text-gray-500 text-sm font-bold mb-2">Server Group ID</label>
                            <input
                                className="px-2 py-2 placeholder-gray-400 text-gray-700 relative bg-white rounded text-sm shadow outline-none focus:outline-none focus:shadow-outline w-full"
                                style={serverGroupIdError !== "" ? { border: "2px solid red" } : {}}
                                type="password"
                                name="serverGroupId"
                                value={serverGroupId}
                                onChange={(e) => {
                                    setServerGroupId(e.target.value);
                                    checkServerGroupId(e.target.value);
                                }}
                            />
                            {serverGroupIdError !== "" && <div className="pt-2 text-red-600">{serverGroupIdError}</div>}
                        </div>
                        <div className="mb-6">
                            <label className="block text-gray-500 text-sm font-bold mb-2">Admin Password</label>
                            <input
                                className="px-2 py-2 placeholder-gray-400 text-gray-700 relative bg-white rounded text-sm shadow outline-none focus:outline-none focus:shadow-outline w-full"
                                style={adminPasswordError !== "" ? { border: "2px solid red" } : {}}
                                type="password"
                                name="adminPassword"
                                value={adminPassword}
                                onChange={(e) => {
                                    setAdminPassword(e.target.value);
                                    checkAdminPassword(e.target.value);
                                }}
                            />
                            {adminPasswordError !== "" && <div className="pt-2 text-red-600">{adminPasswordError}</div>}
                        </div>
                        <div className="content-center mx-auto text-center pt-4">
                            {disableSubmit() && !processing && (
                                <button
                                    disabled={true}
                                    className="cursor-not-allowed disabled:opacity-50 mx-auto h-10 px-10 text-sm text-white transition-colors duration-150 bg-yellow-600 rounded-lg focus:shadow-outline hover:bg-yellow-700"
                                >
                                    <span>Login</span>
                                </button>
                            )}
                            {!disableSubmit() && !processing && (
                                <button
                                    onClick={submit}
                                    className="mx-auto h-10 px-10 text-sm text-white transition-colors duration-150 bg-yellow-600 rounded-lg focus:shadow-outline hover:bg-yellow-700"
                                >
                                    <span>Login</span>
                                </button>
                            )}
                            {processing && (
                                <button
                                    disabled={true}
                                    className="mx-auto h-10 px-10 text-sm text-white transition-colors duration-150 bg-yellow-600 rounded-lg focus:shadow-outline hover:bg-yellow-700"
                                >
                                    <svg
                                        className="animate-spin h-5 w-5 text-white"
                                        xmlns="http://www.w3.org/2000/svg"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                    >
                                        <circle
                                            className="opacity-25"
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            strokeWidth="4"
                                        ></circle>
                                        <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                        ></path>
                                    </svg>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default WebAdminLogin;
