import React from "react";
import { SideBar } from "../components/SideBar";

const IndexPage: React.FC = (): React.ReactElement => {
    return (
        <div className="h-screen flex overflow-hidden bg-gray-900">
            <SideBar />
        </div>
    );
};

export default IndexPage;
