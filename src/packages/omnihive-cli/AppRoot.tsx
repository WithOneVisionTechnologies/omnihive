import React from "react";
import { CommandLineModule } from "./enums/CommandLineModule";
import Header from "./components/common/Header";
import CreateInstanceModule from "./components/CreateInstanceModule";
import MainMenuModule from "./components/MainMenuModule";
import { useInput } from "ink";
import { useAtom } from "jotai";
import { currentModuleAtom, goBackOnePageAtom, moveToNewPageAtom } from "./stores/CommandLineStore";
import { CommandLinePage } from "./enums/CommandLinePage";

interface AppRootProps {
    selectedModule: CommandLineModule;
}

const AppRoot: React.FC<AppRootProps> = (props): React.ReactElement => {
    const [currentModule] = useAtom(currentModuleAtom);
    const [, goBackOnePage] = useAtom(goBackOnePageAtom);
    const [initialized, setInitialized] = React.useState<boolean>(false);
    const [, moveToNewPage] = useAtom(moveToNewPageAtom);

    useInput((_input, key) => {
        if (!key.escape) {
            return;
        }

        goBackOnePage();
    });

    React.useEffect(() => {
        switch (props.selectedModule) {
            case CommandLineModule.MainMenu:
                moveToNewPage({ module: CommandLineModule.MainMenu, page: CommandLinePage.MainMenu_Root });
                break;
            case CommandLineModule.CreateInstance:
                moveToNewPage({ module: CommandLineModule.CreateInstance, page: CommandLinePage.CreateInstance_Root });
                break;
        }

        setInitialized(true);
    }, []);

    return (
        <>
            {initialized && (
                <>
                    <Header />
                    {currentModule === CommandLineModule.MainMenu && <MainMenuModule />}
                    {currentModule === CommandLineModule.CreateInstance && <CreateInstanceModule />}
                </>
            )}
        </>
    );
};

export default AppRoot;
