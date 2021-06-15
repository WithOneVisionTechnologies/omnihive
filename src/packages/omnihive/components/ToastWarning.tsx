import React from "react";
import { ToastContainer } from "./ToastContainer";

type ToastWarningProps = {
    show: boolean;
    message: string;
};

export const ToastWarning: React.FC<ToastWarningProps> = (props): React.ReactElement => {
    return (
        <>
            {props.show && (
                <ToastContainer>
                    <div className="flex items-center bg-yellow-700 border-l-4 border-yellow-800 py-2 px-3 shadow-md mb-2">
                        <div className="mr-3">
                            <img src="/images/warning.png" alt="warning" className="h-9" />
                        </div>
                        <div className="text-black max-w-xs ">{props.message}</div>
                    </div>
                </ToastContainer>
            )}
        </>
    );
};
