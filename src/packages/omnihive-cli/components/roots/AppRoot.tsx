import React from "react";
import { CommandLineModule } from "../../enums/CommandLineModule";
import Header from "../common/Header";
import CreateRoot from "./CreateRoot";
import SwitchboardRoot from "./SwitchboardRoot";
import { useInput } from "ink";
import { useAtom } from "jotai";
import { currentModuleAtom, goBackOnePageAtom, moveToNewPageAtom } from "../../stores/CommandLineStore";
import { CommandLinePage } from "../../enums/CommandLinePage";

interface AppProps {
    selectedModule: CommandLineModule;
}

const AppRoot: React.FC<AppProps> = (props): React.ReactElement => {
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
            case CommandLineModule.Switchboard:
                moveToNewPage({ module: CommandLineModule.Switchboard, page: CommandLinePage.Switchboard_Root });
                break;
            case CommandLineModule.Create:
                moveToNewPage({ module: CommandLineModule.Create, page: CommandLinePage.CreateInstance_Root });
                break;
        }

        setInitialized(true);
    }, []);

    return (
        <>
            {initialized && (
                <>
                    <Header />
                    {currentModule === CommandLineModule.Switchboard && <SwitchboardRoot />}
                    {currentModule === CommandLineModule.Create && <CreateRoot />}
                </>
            )}
        </>
    );
};

export default AppRoot;
