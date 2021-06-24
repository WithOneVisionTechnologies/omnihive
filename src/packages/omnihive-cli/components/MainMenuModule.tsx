import { Box, Text } from "ink";
import { useAtom } from "jotai";
import React from "react";
import SelectInput, { SelectInputItem } from "./ink-forked/select-input/SelectInput";
import { CommandLinePage } from "../enums/CommandLinePage";
import { CliColors, currentModuleAtom, moveToNewPageAtom } from "../stores/CommandLineStore";
import { CommandLineModule } from "../enums/CommandLineModule";
import CreateInstanceModule from "./CreateInstanceModule";

const MainMenuModule: React.FC = (): React.ReactElement => {
    const [, moveToNewPage] = useAtom(moveToNewPageAtom);
    const [currentModule] = useAtom(currentModuleAtom);

    const menuItems: SelectInputItem<string>[] = [
        {
            label: "Create New Instance",
            value: "create",
        },
        {
            label: "Edit Existing Instance",
            value: "edit",
        },
    ];

    const onSelectHandler = (item: SelectInputItem<any>) => {
        switch (item.value) {
            case "create":
                moveToNewPage({ module: CommandLineModule.CreateInstance, page: CommandLinePage.CreateInstance_Root });
                break;
        }
    };

    return (
        <>
            {currentModule === CommandLineModule.MainMenu && (
                <Box marginTop={1} flexDirection="column">
                    <Box marginBottom={1}>
                        <Text color={CliColors.lightYellow}>Which action you would like to take?</Text>
                    </Box>
                    <SelectInput items={menuItems} focusColor={CliColors.mediumYellow} onSelect={onSelectHandler} />
                </Box>
            )}
            {currentModule === CommandLineModule.CreateInstance && <CreateInstanceModule />}
        </>
    );
};

export default MainMenuModule;
