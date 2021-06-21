import { Box, Text } from "ink";
import { useAtom } from "jotai";
import React from "react";
import SelectInput, { SelectInputItem } from "../ink/select-input/SelectInput";
import { CommandLinePage } from "../../enums/CommandLinePage";
import { CliColors, currentModuleAtom, moveToNewPageAtom } from "../../stores/CommandLineStore";
import { CommandLineModule } from "../../enums/CommandLineModule";
import CreateRoot from "./CreateRoot";

const SwitchboardRoot: React.FC = (): React.ReactElement => {
    const [, moveToNewPage] = useAtom(moveToNewPageAtom);
    const [currentModule] = useAtom(currentModuleAtom);

    const menuItems: SelectInputItem<string>[] = [
        {
            label: "Create New Instance",
            value: "create",
        },
    ];

    const onSelectHandler = (item: SelectInputItem<any>) => {
        switch (item.value) {
            case "create":
                moveToNewPage({ module: CommandLineModule.Create, page: CommandLinePage.CreateInstance_Root });
                break;
        }
    };

    return (
        <>
            {currentModule === CommandLineModule.Switchboard && (
                <Box marginTop={1} flexDirection="column">
                    <Box marginBottom={1}>
                        <Text color={CliColors.darkYellow} underline={true}>
                            Select Option
                        </Text>
                    </Box>
                    <SelectInput items={menuItems} focusColor={CliColors.darkYellow} onSelect={onSelectHandler} />
                </Box>
            )}
            {currentModule === CommandLineModule.Create && <CreateRoot />}
        </>
    );
};

export default SwitchboardRoot;
