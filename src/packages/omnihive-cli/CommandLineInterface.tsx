import React from "react";
import { Box } from "ink";

import Header from "./components/Header";
import MainMenu from "./components/MainMenu";
import { CommandLinePage } from "./enums/CommandLinePage";
import CreateChooseDataSource from "./components/create-instance/CreateChooseDataSource";
import { clearConsole, initializedAtom, currentPageAtom } from "./stores/CommandLineStore";
import { useAtom } from "jotai";

const CommandLineInterface: React.FC = (): React.ReactElement => {
    const [initialized, setInitialized] = useAtom(initializedAtom);
    const [currentPage] = useAtom(currentPageAtom);

    React.useEffect(() => {
        clearConsole();
        setInitialized(true);
    }, []);

    return (
        <>
            {initialized && (
                <Box flexDirection="column">
                    <Header />
                    {currentPage === CommandLinePage.MainMenu && <MainMenu />}
                    {currentPage === CommandLinePage.CreateInstance_DataSource && <CreateChooseDataSource />}
                </Box>
            )}
        </>
    );
};

export default CommandLineInterface;
